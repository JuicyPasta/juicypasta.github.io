// Pins the web port (../sun.js) to the Solei app's Dart maths.
// dart-reference.json is the output of dart_reference.dart, run against the
// app's own lib/core files (see the comment at its top).
// Run: node --test solei/uv-tanning-calculator/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../sun.js';

const ref = JSON.parse(readFileSync(new URL('./dart-reference.json', import.meta.url)));
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('constants match the app', () => {
  for (const [k, v] of Object.entries(ref.med)) assert.equal(S.MED[k], v, `MED ${k}`);
  assert.deepEqual(S.SPF_LEVELS, ref.spf);
  assert.equal(S.DARK_UVI, ref.dark_uvi);
  assert.equal(S.JOULES_PER_UVI_MINUTE, 0.025 * 60);
  assert.equal(S.doseRatePerMinute(8), 12);
  assert.equal(S.doseRatePerMinute(-1), 0);
  assert.equal(S.reapplyEvery(false), 120);
  assert.equal(S.reapplyEvery(true), 80);
});

test('safe dose is two thirds of the MED (sun_math_test)', () => {
  close(S.safeDose(3), 200, 1e-9, 'III');
  close(S.safeDose(1), 133.333, 1e-3, 'I');
  close(S.safeDose(6), 666.667, 1e-3, 'VI');
});

test('effective SPF is the square root of the label (sun_math_test)', () => {
  assert.equal(S.effectiveSpfFactor(0), 1);
  assert.equal(S.effectiveSpfFactor(1), 1);
  close(S.effectiveSpfFactor(15), 3.873, 1e-3, 'SPF 15');
  close(S.effectiveSpfFactor(30), 5.477, 1e-3, 'SPF 30');
  close(S.effectiveSpfFactor(50), 7.071, 1e-3, 'SPF 50');
  close(S.effectiveSpfFactor(S.SPF_LEVELS.spf50plus), Math.sqrt(60), 1e-12, 'SPF 50+');
});

test('WHO bands on the rounded index', () => {
  for (const [u, name] of Object.entries(ref.categories)) assert.equal(S.uvCategory(Number(u)), name, `UV ${u}`);
  assert.equal(S.uvCategory(-1), 'low');
  assert.equal(S.uvCategory(Number.NaN), 'low');
});

test('known values from session_math_test.dart', () => {
  // flat(8), type III: 200 J/m² at 12 J/m² per minute.
  close(S.safeTime(8, 3, 0).minutes, 16.67, 0.02, 'unprotected');
  // 16.67 min × 5.477 = 91.3 min, inside the 2 h window.
  const spf30 = S.safeTime(8, 3, 30);
  close(spf30.minutes, 91.29, 0.05, 'SPF 30');
  assert.equal(spf30.capped, false);
  // flat(3), type IV, SPF 50: capped at exactly 120 minutes.
  assert.deepEqual(S.safeTime(3, 4, 50), { minutes: 120, capped: true, sunDown: false });
  // Never more than the reapply interval, for every type and SPF.
  for (const spf of [15, 30, 60]) {
    for (let skin = 1; skin <= 6; skin++) {
      for (const swimming of [false, true]) {
        assert.ok(S.safeTime(3, skin, spf, swimming).minutes <= (swimming ? 80 : 120));
      }
    }
  }
});

test('safeTime, the reapply-on-time limit and tan-mode flips match the Dart code', () => {
  assert.ok(ref.safe.length > 1000);
  for (const r of ref.safe) {
    const label = `UV ${r.uvi} type ${r.skin} SPF ${r.spf} swim ${r.swimming}`;
    const got = S.safeTime(r.uvi, r.skin, r.spf, r.swimming);
    assert.equal(got.sunDown, r.uvi < S.DARK_UVI, `${label} sunDown`);
    if (r.minutes === null) {
      assert.equal(got.minutes, null, `${label} minutes`);
    } else {
      close(got.minutes, r.minutes, 1e-4, `${label} minutes`);
      // What the app would print (whole minutes, rounded down).
      assert.equal(Math.floor(got.minutes + 1e-9), r.whole_minutes, `${label} whole minutes`);
    }
    assert.equal(got.capped, r.capped, `${label} capped`);
    const onTime = S.limitReapplyingOnTime(r.uvi, r.skin, r.spf);
    if (r.on_time_minutes === null) assert.equal(onTime, null, `${label} on time`);
    else close(onTime, r.on_time_minutes, 1e-4, `${label} on time`);
    assert.equal(S.autoFlipMinutes(got.minutes), r.flip_minutes, `${label} flip`);
  }
});

test('the skin quiz maps answers like SkinQuiz.typeFor', () => {
  for (const [k, type] of Object.entries(ref.quiz)) {
    assert.equal(S.skinTypeFromQuiz(+k[0], +k[1], +k[2]), type, `answers ${k}`);
  }
  assert.equal(S.skinTypeFromQuiz(9, 9, 9), 6);
  assert.equal(S.skinTypeFromQuiz(-1, 0, 0), 1);
});

test('formatDuration like lib/utils/formatters.dart', () => {
  assert.equal(S.formatDuration(0.5), '< 1 min');
  assert.equal(S.formatDuration(16.67), '16 min');
  assert.equal(S.formatDuration(60), '1 h');
  assert.equal(S.formatDuration(91.29), '1 h 31 min');
  assert.equal(S.formatDuration(120), '2 h');
  assert.equal(S.formatDuration(119.99999999999999), '2 h');
});

test('more protection or darker skin never shortens the time', () => {
  // A capped time ("2 h, then reapply") can be shorter than the unprotected
  // one at low UV, as in the app: it continues after reapplying, so compare
  // the reapply-on-time limit there.
  for (let uvi = 1; uvi <= 15; uvi++) {
    for (let skin = 1; skin <= 6; skin++) {
      let last = 0;
      for (const spf of [0, 15, 30, 50, 60]) {
        const s = S.safeTime(uvi, skin, spf);
        const m = s.capped ? S.limitReapplyingOnTime(uvi, skin, spf) ?? Infinity : s.minutes;
        assert.ok(m >= last, `UV ${uvi} type ${skin} SPF ${spf}`);
        last = m;
      }
      if (skin > 1) assert.ok(S.safeTime(uvi, skin, 0).minutes > S.safeTime(uvi, skin - 1, 0).minutes);
    }
  }
});

// The page's table, sentences and FAQ markup: page.test.mjs.
