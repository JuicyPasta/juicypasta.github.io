// Tests for latecup/hours.js (the "late" rules). Run: node _tools/latecup-pages/test.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const H = createRequire(import.meta.url)('../../latecup/hours.js');
const TZ = 'America/New_York', at = (isoUtc) => H.cityNow(TZ, new Date(isoUtc));
const week = (d) => [d, d, d, d, d, d, d];
let n = 0; const t = (name, fn) => { fn(); n++; };

t('service day: 01:30 Saturday is still Friday night', () => {
  const now = at('2026-11-28T06:30:00Z'); // Sat 01:30 EST
  assert.equal(now.serviceDate, '2026-11-27'); assert.equal(now.dow, 4); assert.equal(now.rel, 1530);
  const day = at('2026-11-28T15:00:00Z');   // Sat 10:00 EST
  assert.equal(day.serviceDate, '2026-11-28'); assert.equal(day.dow, 5); assert.equal(day.rel, 600);
});
t('city time in summer (EDT), whatever the machine clock', () => {
  const now = at('2026-07-04T01:15:00Z'); // Fri 21:15 EDT
  assert.equal(now.serviceDate, '2026-07-03'); assert.equal(now.dow, 4); assert.equal(now.rel, 1275);
});
t('a chain across midnight is one stretch', () => {
  const hours = [[[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1440]], [[0, 120], [540, 1380]], [[540, 1260]]];
  assert.deepEqual(H.tonight(hours, 4), { open: 480, close: 1560, allDay: false }); // Fri → 2 AM
  assert.deepEqual(H.tonight(hours, 5), { open: 540, close: 1380, allDay: false }); // Sat → 11 PM, not the 0–2 AM tail
  assert.equal(H.dayText(hours, 4), '8 AM – 2 AM'); assert.equal(H.dayText(hours, 5), '9 AM – 11 PM');
});
t('close past 1440 in one interval', () => {
  const hours = week([[480, 1500]]);
  assert.equal(H.tonight(hours, 0).close, 1500); assert.equal(H.pinLabel(H.tonight(hours, 0)), '1 AM');
  assert.ok(H.matches(hours, 0, H.THRESHOLDS[4])); assert.equal(H.matches(hours, 0, H.THRESHOLDS[5]), null);
});
t('24 hours', () => {
  const hours = week([[0, 1440]]);
  assert.equal(H.tonight(hours, 2).allDay, true); assert.equal(H.dayText(hours, 2), 'Open 24 hours');
  assert.ok(H.matches(hours, 2, H.THRESHOLDS[5])); assert.equal(H.pinLabel(H.tonight(hours, 2)), '24h');
  assert.equal(H.status(hours, at('2026-11-25T08:00:00Z')).allDay, true);
  assert.deepEqual(H.weekClosings(hours), [{ days: 'Nightly', text: '24 hours' }]);
});
t("tomorrow's 4:30 AM opening is not tonight's closing", () => {
  const hours = week([[270, 1350]]);
  assert.equal(H.tonight(hours, 0).close, 1350); assert.equal(H.pinLabel(H.tonight(hours, 0)), '10:30');
  assert.equal(H.matches(hours, 0, H.THRESHOLDS[2]).close, 1350); assert.equal(H.matches(hours, 0, H.THRESHOLDS[3]), null);
});
t('a place that closes at 10 PM is not open at 10 PM', () => {
  const hours = week([[420, 1320]]);
  assert.ok(H.matches(hours, 0, H.THRESHOLDS[1])); assert.equal(H.matches(hours, 0, H.THRESHOLDS[2]), null);
});
t('closed day and split day', () => {
  const hours = [[], [[600, 960], [1020, 1290]], [], [], [], [], []];
  assert.equal(H.tonight(hours, 0), null); assert.equal(H.tonight(hours, 1).close, 1290);
  assert.equal(H.dayText(hours, 0), 'Closed'); assert.equal(H.dayText(hours, 1), '10 AM – 4 PM, 5 PM – 9:30 PM');
  const st = H.status(hours, at('2026-11-23T20:00:00Z')); // Mon 15:00, closed all Monday
  assert.equal(st.kind, 'closed'); assert.equal(st.nextDow, 1); assert.equal(st.nextOpen, 600);
  assert.equal(H.status(hours, at('2026-11-24T21:30:00Z')).kind, 'later'); // Tue 16:30, reopens 5 PM
});
t('status: open, closing soon, later', () => {
  const hours = week([[480, 1380]]);
  let s = H.status(hours, at('2026-11-25T01:40:00Z')); // Tue 20:40 EST
  assert.equal(s.kind, 'open'); assert.equal(s.left, 140); assert.equal(H.pinState(s.left), 'plenty');
  s = H.status(hours, at('2026-11-25T02:40:00Z')); assert.equal(s.left, 80); assert.equal(H.pinState(s.left), 'under2');
  s = H.status(hours, at('2026-11-25T03:20:00Z')); assert.equal(s.kind, 'soon'); assert.equal(s.left, 40);
  assert.equal(H.leftText(80), '1 h 20 min left'); assert.equal(H.leftText(40), '40 min left'); assert.equal(H.leftText(120), '2 h left');
  s = H.status(hours, at('2026-11-25T11:00:00Z')); assert.equal(s.kind, 'later'); assert.equal(s.open, 480); // 06:00
  s = H.status(hours, at('2026-11-25T04:30:00Z')); assert.equal(s.kind, 'closed'); assert.equal(s.nextDow, 2); assert.equal(s.nextOpen, 480); // 23:30: opens Wed 8 AM
});
t('chips', () => {
  let c = H.chips(at('2026-11-24T19:00:00Z'), true); // 14:00
  assert.deepEqual(c.chips.map((x) => x.id), ['20', '21', '22', '23', '24', 'all']); assert.equal(c.def, '20');
  c = H.chips(at('2026-11-25T02:30:00Z'), true);     // 21:30
  assert.deepEqual(c.chips.map((x) => x.id), ['now', '22', '23', '24', 'all']); assert.equal(c.def, 'now');
  c = H.chips(at('2026-11-25T08:30:00Z'), true);     // 03:30, still Tuesday night
  assert.deepEqual(c.chips.map((x) => x.id), ['now']);
  c = H.chips(at('2026-11-25T02:30:00Z'), false);
  assert.equal(c.chips.length, 6); assert.equal(c.def, '20');
});
t('autumn clock change (2026-11-01): the 1 o\'clock hour happens twice', () => {
  const hours = week([[480, 1560]]); // closes 2 AM
  let s = H.status(hours, at('2026-11-01T05:30:00Z')); // 01:30 EDT, first time
  assert.equal(s.left, 90);
  s = H.status(hours, at('2026-11-01T06:30:00Z'));     // 01:30 EST, second time
  assert.equal(s.left, 30);
  assert.equal(at('2026-11-01T06:30:00Z').serviceDate, '2026-10-31');
});
t('spring clock change (2027-03-14): 2 AM does not exist', () => {
  const three = week([[480, 1620]]); // closes 3 AM
  assert.equal(H.status(three, at('2027-03-14T06:30:00Z')).left, 30); // 01:30 EST → 3:00 EDT is 30 min away
  const two = week([[480, 1560]]);   // closes "2 AM", which is skipped: the same instant as 3 AM EDT
  assert.equal(H.status(two, at('2027-03-14T06:30:00Z')).left, 30);
  assert.equal(at('2027-03-14T07:30:00Z').rel, 1650); // 03:30 EDT
});
t('week closings and source line', () => {
  const hours = [[[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1500]], [[540, 1500]], []];
  assert.deepEqual(H.weekClosings(hours), [{ days: 'Mon–Thu', text: '10 PM' }, { days: 'Fri–Sat', text: '1 AM' }, { days: 'Sun', text: 'closed' }]);
  assert.equal(H.latestClose(hours), 1500);
  assert.equal(H.sourceLine({ src: 'shop', checked: '2026-11-24' }).text, "Hours confirmed 2026-11-24 from the shop's website");
  assert.equal(H.sourceLine({ src: 'osm', checked: null }).text, 'Unconfirmed hours from OpenStreetMap: check before you go');
});
console.log(`ok: ${n} tests`);
