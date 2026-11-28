// node --test _tools/jetcalm-accuracy/test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fill, numbers } from './fill.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const page = readFileSync(join(ROOT, 'jetcalm', 'turbulence-forecast', 'index.html'), 'utf8');
const summary = {
  first_report: '2026-11-23T22:30:00Z',
  all: {
    n: 9285, agree_rate: 0.529, within_range_rate: 0.695,
    moderate_or_greater: { hit_rate_expected: 0.509, hit_rate_could_reach: 0.798 },
    smooth_reports: { calm_rate: 0.36 },
  },
};

test('numbers are formatted as the page writes them', () => {
  assert.deepEqual(numbers(summary), {
    since: '2026-11-23', reports: '9,285', agree: '53%', inRange: '70%', modExpected: '51%', modCouldReach: '80%', calm: '36%',
  });
});

test('both copies of the sentence (visible FAQ and FAQPage markup) get the new numbers', () => {
  const out = fill(page, numbers(summary));
  assert.equal(out.split('scored against 9,285 pilot reports').length - 1, 2);
  assert.equal(out.split('said calm for only 36% of them').length - 1, 2);
  // nothing else on the page moves
  const strip = (s) => s.replace(/\d[\d,]*%?/g, '#');
  assert.equal(strip(out), strip(page));
});

test('the FAQPage markup still parses', () => {
  const out = fill(page, numbers(summary));
  for (const m of out.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
});

test('a page without the sentence is refused, not half-changed', () => {
  assert.throws(() => fill('<p>nothing here</p>', numbers(summary)), /found 0 times/);
});
