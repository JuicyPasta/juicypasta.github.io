// Pins the web port (../rotation.js) to the app's Dart rule.
// The first five tests repeat Rotinia/test/core/small_rules_test.dart
// ("site rotation"), case for case. Run: node --test rotinia/glp-1-injection-sites/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../rotation.js';

const t = Date.UTC(2026, 10, 1);
const day = 24 * 3600 * 1000;

test('default sites: four abdomen and both thighs', () => {
  assert.equal(R.DEFAULTS.size, 6);
  assert.equal(R.DEFAULTS.has('arm_l'), false);
  assert.equal(R.DEFAULTS.has('arm_r'), false);
});

test('never-used sites come first, in the listed order', () => {
  assert.equal(R.suggest(R.DEFAULTS, new Map()), 'abdomen_ul');
  assert.equal(
    R.suggest(R.DEFAULTS, new Map([['abdomen_ul', t], ['abdomen_ll', t]])),
    'abdomen_ur',
  );
});

test('then the enabled site used least recently', () => {
  const used = new Map(R.SITE_IDS.map((id, i) => [id, t + i * day]));
  used.set('thigh_r', t - 30 * day);
  assert.equal(R.suggest(R.DEFAULTS, used), 'thigh_r');
  // A disabled site is never suggested, however long ago it was used.
  used.set('arm_l', t - 300 * day);
  assert.equal(R.suggest(R.DEFAULTS, used), 'thigh_r');
  assert.equal(R.suggest(new Set(), used), null);
});

test('the suggestion is never simply the last-used site', () => {
  const uses = [];
  let last = null;
  for (let i = 0; i < 20; i++) {
    const suggestion = R.suggest(R.DEFAULTS, R.lastUsed(uses));
    assert.notEqual(suggestion, null);
    assert.notEqual(suggestion, last);
    uses.push([suggestion, t + 7 * i * day]);
    last = suggestion;
  }
  // Six sites, used in a cycle.
  assert.deepEqual(new Set(uses.slice(0, 6).map((u) => u[0])), R.DEFAULTS);
});

test('ids round-trip', () => {
  for (const site of R.SITES) assert.equal(R.fromId(site.id), site);
  assert.equal(R.fromId('elbow'), null);
  assert.equal(R.fromId(null), null);
  assert.equal(R.fromId(undefined), null);
});

// ---- the web page's own helpers ----

test('lastUsed keeps the latest time per site, in any order, with Dates too', () => {
  const m = R.lastUsed([
    ['thigh_l', new Date(t + 5 * day)],
    ['thigh_l', new Date(t + 2 * day)],
    ['arm_r', new Date(t)],
  ]);
  assert.equal(+m.get('thigh_l'), t + 5 * day);
  assert.equal(+m.get('arm_r'), t);
  assert.equal(m.size, 2);
});

test('a history (oldest first) gives the same answer as dated uses', () => {
  const history = ['abdomen_ul', 'abdomen_ur', 'abdomen_ll', 'abdomen_lr', 'thigh_l', 'thigh_r', 'abdomen_ul'];
  assert.equal(R.suggestAfter(R.DEFAULTS, history), 'abdomen_ur');
  const dated = history.map((id, i) => [id, new Date(t + 7 * i * day)]);
  assert.equal(R.suggest(R.DEFAULTS, R.lastUsed(dated)), 'abdomen_ur');
  // Only the last site known: the first never-used one in the listed order.
  assert.equal(R.suggestAfter(R.DEFAULTS, ['abdomen_ul']), 'abdomen_ur');
  assert.equal(R.suggestAfter(R.DEFAULTS, ['thigh_r']), 'abdomen_ul');
  assert.equal(R.suggestAfter(R.DEFAULTS, []), 'abdomen_ul');
});

test('all eight sites: the plan walks the listed order and repeats', () => {
  const all = new Set(R.SITE_IDS);
  assert.deepEqual(R.plan(all, [], 10), [...R.SITE_IDS, 'abdomen_ul', 'abdomen_ur']);
  // Starting after a used site continues from the least recently used.
  assert.deepEqual(R.plan(all, ['thigh_l'], 3), ['abdomen_ul', 'abdomen_ur', 'abdomen_ll']);
});

test('a plan never repeats the previous site when two or more are on', () => {
  const sets = [R.DEFAULTS, new Set(R.SITE_IDS), new Set(['thigh_l', 'thigh_r']), new Set(['abdomen_ul', 'arm_r', 'thigh_l'])];
  for (const enabled of sets) {
    const seq = R.plan(enabled, ['abdomen_lr', 'arm_l'], 30);
    assert.equal(seq.length, 30);
    for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
    for (const id of seq) assert.ok(enabled.has(id));
  }
  assert.deepEqual(R.plan(new Set(['thigh_l']), [], 3), ['thigh_l', 'thigh_l', 'thigh_l']);
  assert.deepEqual(R.plan(new Set(), [], 3), []);
});

test('shotsAgo counts back from the newest shot', () => {
  const ago = R.shotsAgo(['thigh_l', 'abdomen_ul', 'thigh_l', 'arm_r']);
  assert.equal(ago.get('arm_r'), 1);
  assert.equal(ago.get('thigh_l'), 2);
  assert.equal(ago.get('abdomen_ul'), 3);
  assert.equal(ago.has('thigh_r'), false);
});

test('stored state is cleaned', () => {
  assert.deepEqual(R.cleanHistory(null), []);
  assert.deepEqual(R.cleanHistory(['thigh_l', 'elbow', 3, 'arm_r']), ['thigh_l', 'arm_r']);
  assert.equal(R.cleanHistory(Array(60).fill('thigh_l')).length, 40);
  assert.deepEqual([...R.cleanEnabled(['arm_l', 'nope'])], ['arm_l']);
  assert.deepEqual(R.cleanEnabled([]), R.DEFAULTS);
  assert.deepEqual(R.cleanEnabled('x'), R.DEFAULTS);
});
