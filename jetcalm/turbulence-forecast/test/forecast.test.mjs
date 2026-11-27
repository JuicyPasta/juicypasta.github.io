// Pins the web port (../forecast.js) to the app's Dart forecast code.
// dart-reference.json is the output of dart_reference.dart, run against the
// app's own lib/forecast files and the fixture run of 2026-11-22 18Z.
// Run: node --test jetcalm/turbulence-forecast/test/*.test.mjs (Node 24 no longer takes the folder)
// The fixture tiles live in the app repo (JETCALM_APP, default ~/code/Projects/Jetcalm).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import * as F from '../forecast.js';

const ref = JSON.parse(readFileSync(new URL('./dart-reference.json', import.meta.url)));
const appDir = process.env.JETCALM_APP ?? `${homedir()}/code/Projects/Jetcalm`;
const tiles = `${appDir}/assets/fixtures/tiles`;
const extra = `${appDir}/test/fixtures/tiles_extra`;
const airports = Object.fromEntries(
  JSON.parse(readFileSync(new URL('../airports.json', import.meta.url))).a.map((r) => [r[0], { lat: r[4], lon: r[5], tz: r[6] }]),
);
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('great-circle distance, point count, estimate, midpoint', () => {
  for (const [key, want] of Object.entries(ref.distances)) {
    const [a, b] = key.split('-').map((c) => airports[c]);
    const km = F.distanceKm(a, b);
    close(km, want.km, 1e-6, `${key} km`);
    const pts = F.greatCircle(a, b);
    assert.equal(pts.length, want.points, `${key} points`);
    assert.equal(F.estimateMinutes(km), want.estimate_min, `${key} estimate`);
    const mid = pts[Math.trunc(pts.length / 2)];
    close(mid.lat, want.mid[0], 1e-9, `${key} mid lat`);
    close(mid.lon, want.mid[1], 1e-9, `${key} mid lon`);
    close(Math.max(...pts.map((p) => p.lat)), want.max_lat, 1e-9, `${key} max lat`);
  }
});

test('nearest cell (FORMAT.md formula, as GridSpec)', () => {
  const grid = F.GridSpec.fromJson({ rows: 301, cols: 720, lat0: 75, lon0: -180, dlat: -0.5, dlon: 0.5 });
  assert.equal(grid.step, 0.5);
  for (const c of ref.cells) {
    assert.equal(grid.rowOf(c.lat), c.row, `row ${c.lat}`);
    assert.equal(grid.colOf(c.lon), c.col, `col ${c.lon}`);
  }
});

test('level mapping', () => {
  for (const [v, name] of Object.entries(ref.levels)) {
    assert.equal(F.LEVELS[F.levelOf(Number(v))], name, `EDR ${v}`);
  }
});

test('local time to UTC', () => {
  for (const c of ref.toUtc) {
    const [zone, y, m, d, h, min] = c.in;
    assert.equal(new Date(F.zonedToUtc(zone, y, m, d, h, min)).toISOString(), c.utc, c.in.join(' '));
  }
});

test('whole forecasts match the app on the fixture run', { skip: !existsSync(tiles) && 'no fixture tiles' }, () => {
  const manifest = F.parseManifest(JSON.parse(readFileSync(`${tiles}/manifest.json`)));
  const load = (info) => {
    for (const dir of [tiles, extra]) {
      const path = `${dir}/${info.file}`;
      if (existsSync(path)) return new F.StepGrid(info, manifest.grid, new Uint8Array(gunzipSync(readFileSync(path))));
    }
    return null;
  };
  for (const f of ref.flights) {
    const name = `${f.from}-${f.to} ${f.dep}`;
    const plan = F.FlightPlan.estimated(airports[f.from], airports[f.to], Date.parse(f.dep));
    assert.equal(new Date(plan.arrival).toISOString(), f.arr, `${name} arrival`);
    assert.equal(plan.durationMinutes, f.duration);
    close(plan.climbMinutes, f.climb, 1e-9, 'climb');
    close(plan.descentMinutes, f.descent, 1e-9, 'descent');
    const infos = F.stepsFor(manifest, plan.departure, plan.arrival);
    assert.deepEqual(infos.map((i) => i.file), f.steps_for, `${name} steps`);
    const steps = infos.map(load).filter(Boolean);
    assert.deepEqual(steps.map((s) => s.info.file), f.steps_loaded);
    const samples = F.sample(plan, steps);
    assert.equal(samples.length, f.samples.length, `${name} samples`);
    const phases = ['climb', 'cruise', 'descent'];
    samples.forEach((s, i) => {
      const w = f.samples[i];
      close(s.lat, w[0], 0.0006, `${name} #${i} lat`);
      close(s.lon, w[1], 0.0006, `${name} #${i} lon`);
      close(s.minutes, w[2], 0.06, `${name} #${i} minutes`);
      assert.equal(s.phase, phases[w[3]], `${name} #${i} phase`);
      assert.equal(s.expected, w[4], `${name} #${i} expected`);
      assert.equal(s.couldReach, w[5], `${name} #${i} could reach`);
      assert.equal(s.outlook ? 1 : 0, w[6], `${name} #${i} outlook`);
      assert.equal(s.storm ? 1 : 0, w[7], `${name} #${i} storm`);
    });
    const t = manifest.thresholds;
    const seg = (s) => s && { level: s.level === null ? null : F.LEVELS[s.level], start: s.start, end: s.end, peak: s.peak };
    const sameSegs = (got, want, what) => {
      assert.equal(got.length, want.length, `${name} ${what} count`);
      got.forEach((g, i) => {
        const a = seg(g);
        assert.equal(a.level, want[i].level, `${name} ${what} #${i} level`);
        close(a.start, want[i].start, 1e-9, `${name} ${what} #${i} start`);
        close(a.end, want[i].end, 1e-9, `${name} ${what} #${i} end`);
        assert.equal(a.peak, want[i].peak, `${name} ${what} #${i} peak`);
      });
    };
    const sum = F.summarize(samples, t, plan.durationMinutes);
    sameSegs(sum.expected, f.expected, 'expected');
    sameSegs(F.segmentsFromValues(samples.map((s) => s.couldReach), t, plan.durationMinutes), f.could, 'could reach');
    assert.equal(sum.headline === null ? null : F.LEVELS[sum.headline], f.summary.headline, `${name} headline`);
    close(sum.noDataShare, f.summary.gap, 1e-9, `${name} gap`);
    F.LEVELS.forEach((l, i) => close(sum.shares[i], f.summary.shares[l], 1e-9, `${name} share ${l}`));
    for (const k of ['worst', 'stronger']) {
      const w = f.summary[k];
      if (w === null) assert.equal(sum[k], null, `${name} ${k}`);
      else sameSegs([sum[k]], [w], k);
    }
    if (f.summary.storm === null) assert.equal(sum.stormAt, null);
    else close(sum.stormAt, f.summary.storm, 1e-9, `${name} storm`);
  }
});

test('durations read like the app', () => {
  assert.equal(F.formatDuration(45), '45 min');
  assert.equal(F.formatDuration(180), '3 h');
  assert.equal(F.formatDuration(130), '2 h 10 min');
  assert.equal(F.roundToFive(2), 5);
  assert.equal(F.roundToFive(237.4), 235);
});

// ForecastWindow + ForecastService for a free user (lib/forecast/forecast.dart,
// lib/services/forecast_service.dart): values worked out from the Dart.
test('free window: only flights departing within 48 hours', () => {
  const H = 3600e3;
  const now = Date.parse('2026-11-23T10:00:00Z');
  const step = (iso, kind = 'wafs') => ({ valid: Date.parse(iso), kind, file: iso, layers: ['cruise_mid'] });
  const manifest = {
    steps: [step('2026-11-23T06:00:00Z'), step('2026-11-25T00:00:00Z'), step('2026-11-28T00:00:00Z', 'outlook')],
  };
  const jfk = airports.JFK;
  const lhr = airports.LHR; // 430 min estimate
  const at = (iso) => F.freeOutcome(F.FlightPlan.estimated(jfk, lhr, Date.parse(iso)), manifest, now);
  assert.deepEqual(at('2026-11-24T18:00:00Z'), { kind: 'ready' });
  // Exactly 48 h ahead is still inside (the Dart test is lead > 48 h).
  assert.deepEqual(at('2026-11-25T10:00:00Z'), { kind: 'ready' });
  // Departs inside, lands outside: the whole flight is shown, like the app.
  assert.deepEqual(at('2026-11-25T09:00:00Z'), { kind: 'ready' });
  // One minute past the window: Pro outlook in the app; opens 48 h before.
  assert.deepEqual(at('2026-11-25T10:01:00Z'), { kind: 'needsPro', opensAt: Date.parse('2026-11-23T10:01:00Z') });
  assert.deepEqual(at('2026-11-27T18:00:00Z'), { kind: 'needsPro', opensAt: Date.parse('2026-11-25T18:00:00Z') });
  // Past the last step (+3 h): opens later, still at departure - 48 h.
  assert.deepEqual(at('2026-11-30T23:00:00Z'), { kind: 'opensLater', opensAt: Date.parse('2026-11-28T23:00:00Z') });
  // Landed before the first step - 3 h.
  assert.deepEqual(at('2026-11-22T12:00:00Z'), { kind: 'past' });
  // Inside the window but beyond the feed (a degraded feed): the app's
  // opensAt with the early-outlook window.
  const short = { steps: [step('2026-11-23T06:00:00Z')] };
  const p = F.FlightPlan.estimated(jfk, lhr, now + 20 * H);
  assert.deepEqual(F.freeOutcome(p, short, now), { kind: 'opensLater', opensAt: now + 20 * H - 114 * H });
});
