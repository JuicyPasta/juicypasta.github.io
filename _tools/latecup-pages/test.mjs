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

// ---------- visitor confirmations and ratings (latecup/votes.js) ----------
const V = createRequire(import.meta.url)('../../latecup/votes.js');
const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }; };
const osm = { id: 'n1', src: 'osm', hh: '9f2c41aa' }, shop = { id: 'n2', src: 'shop', checked: '2026-11-24', hh: 'aa11' };

t('two kinds of confirmed: ours, or 2 or more visitors', () => {
  assert.equal(V.summary(osm, undefined).marked, false);
  assert.equal(V.summary(shop, undefined).marked, true); assert.equal(V.summary(shop, undefined).ours, true);
  let s = V.summary(osm, { ok: [1, '2026-11-25', 0] });
  assert.equal(s.marked, false); assert.equal(s.visitorLine, '1 visitor confirmed these hours · Nov 25');
  s = V.summary(osm, { ok: [3, '2026-11-25', 2], stars: [4.3, 7] });
  assert.equal(s.marked, true); assert.equal(s.byVisitors, true); assert.equal(s.ours, false);
  assert.equal(s.visitorLine, '3 visitors confirmed these hours · latest Nov 25'); assert.equal(s.starsLine, '4.3 · 7 ratings');
  assert.equal(V.summary(osm, { stars: [5, 1] }).starsLine, '5.0 · 1 rating');
});
t('a newer "hours wrong" report takes the mark away, an older one does not', () => {
  let s = V.summary(osm, { ok: [3, '2026-11-25', 0], bad: [1, '2026-11-26'] });
  assert.equal(s.flagged, true); assert.equal(s.marked, false); assert.equal(s.flaggedLine, 'Reported wrong on Nov 26: being checked');
  s = V.summary(osm, { ok: [3, '2026-11-27', 0], bad: [1, '2026-11-26'] });
  assert.equal(s.flagged, false); assert.equal(s.marked, true); assert.equal(s.flaggedLine, '');
  s = V.summary(osm, { ok: [2, '2026-11-26', 0], bad: [1, '2026-11-26'] }); // the same day is not "newer"
  assert.equal(s.flagged, false);
  s = V.summary(shop, { bad: [2, '2026-11-26'] }); // the feed only counts reports newer than our own check
  assert.equal(s.flagged, true); assert.equal(s.marked, false);
});
t('bad or missing vote data never throws and never marks', () => {
  for (const v of [null, {}, { ok: [] }, { ok: ['x'] }, { ok: [0, '2026-11-25', 0] }, { stars: [9, 3] }, { stars: [4, 0] }, { bad: [0, ''] }]) {
    const s = V.summary(osm, v); assert.equal(s.marked, false); assert.equal(s.visitorLine, ''); assert.equal(s.starsLine, ''); assert.equal(s.flagged, false);
  }
});
t('what is sent: the note strings of the contract; onsite is always 0 on the web', () => {
  assert.equal(V.attestNote('0a1b2c3d-0000-4000-8000-000000000001', '9f2c41aa'), 'v=1;iid=0a1b2c3d-0000-4000-8000-000000000001;hh=9f2c41aa;onsite=0');
  assert.equal(V.rateNote('0a1b2c3d-0000-4000-8000-000000000001', 4), 'v=1;iid=0a1b2c3d-0000-4000-8000-000000000001;stars=4');
  const sheet = /^v=1;iid=[0-9A-Fa-f-]{36};(hh=[0-9A-Za-z_-]{1,40};onsite=[01]|stars=[1-5])$/; // the published tab passes only this shape
  const id = V.uuid();
  assert.match(V.attestNote(id, '9f2c41aa'), sheet); assert.match(V.rateNote(id, 1), sheet);
  assert.doesNotMatch(V.rateNote(id, 6), sheet); assert.doesNotMatch('closes at 9 now', sheet);
});
t('install ID: a random v4 UUID, made once and kept', () => {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(V.uuid(), re); assert.match(V.uuid({}), re); // also without crypto.randomUUID
  assert.match(V.uuid({ getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = i * 17; return a; } }), re);
  assert.notEqual(V.uuid(), V.uuid());
  const st = fakeStorage(), a = V.load(st);
  assert.equal(a.iid, null); assert.equal(st.map.size, 0, 'looking at a place stores nothing');
  const id = V.ensureId(a); V.save(st, a);
  assert.match(id, re); assert.equal(V.ensureId(a), id); assert.equal(V.load(st).iid, id);
});
t('one confirmation per place per day; a changed hours table can be confirmed again', () => {
  const st = fakeStorage(), me = V.load(st);
  assert.equal(V.canAttest(me, osm, '2026-11-24'), true); assert.equal(V.myAttest(me, osm), null);
  V.recordAttest(me, osm, '2026-11-24'); V.save(st, me);
  const again = V.load(st);
  assert.equal(V.canAttest(again, osm, '2026-11-24'), false); assert.equal(V.myAttestLine(V.myAttest(again, osm), '2026-11-24'), 'You confirmed these hours today');
  assert.equal(V.canAttest(again, osm, '2026-11-25'), true);  assert.equal(V.myAttestLine(V.myAttest(again, osm), '2026-11-25'), 'You confirmed these hours on Nov 24');
  const changed = { ...osm, hh: 'bbbb2222' };
  assert.equal(V.myAttest(again, changed), null); assert.equal(V.canAttest(again, changed, '2026-11-24'), true);
  assert.equal(V.canAttest(again, { id: 'n9', src: 'osm' }, '2026-11-24'), false); // no hash, nothing to confirm
  assert.equal(V.canAttest(again, shop, '2026-11-24'), true);                    // another place the same day
});
t('rating: one per place, sending again replaces it', () => {
  const st = fakeStorage(), me = V.load(st);
  assert.equal(V.myStars(me, osm), 0);
  V.recordStars(me, osm, 4); V.recordStars(me, osm, 2); V.save(st, me);
  assert.equal(V.myStars(V.load(st), osm), 2); assert.equal(Object.keys(V.load(st).stars).length, 1);
});
t('storage that is missing, broken or full: the page still works for this view', () => {
  const me = V.load(null); assert.equal(me.iid, null); assert.match(V.ensureId(me), /^[0-9a-f-]{36}$/);
  assert.equal(V.save(null, me), false);
  const junk = fakeStorage(); junk.setItem(V.KEY, '{not json'); assert.deepEqual(V.load(junk), { iid: null, ok: {}, stars: {} });
  const tampered = fakeStorage(); tampered.setItem(V.KEY, JSON.stringify({ iid: 'me@example.com', ok: 5 }));
  const fixed = V.load(tampered); assert.equal(fixed.iid, null, 'anything that is not a UUID is thrown away'); assert.deepEqual(fixed.ok, {});
  assert.equal(V.save({ setItem() { throw new Error('quota'); } }, me), false);
});

// ---------- build.mjs refuses a bad feed before it writes anything (exit code 3) ----------
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const BUILD = join(dirname(fileURLToPath(import.meta.url)), 'build.mjs');
const refuse = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'latecup-feed-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  const r = spawnSync(process.execPath, [BUILD, '--feed', dir + '/'], { encoding: 'utf8' });
  rmSync(dir, { recursive: true });
  return r;
};
t('a feed that is missing, not JSON, the wrong format or nearly empty changes nothing', () => {
  const place = { id: 'n1', name: 'A', lat: 40.7, lon: -73.9, addr: '1 A St', hood: 'East Village', boro: 'Manhattan', cat: 'coffee', chain: null, hours: [[[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1380]]], src: 'osm', checked: null };
  const man = (extra) => JSON.stringify({ format: 1, cities: [{ id: 'nyc', tz: 'America/New_York', places: 'nyc.json', updated: '2026-11-25T01:00:00Z', ...extra }] });
  for (const [why, files] of [
    ['no files', {}],
    ['an error page instead of JSON', { 'manifest.json': '<html>503</html>' }],
    ['format 2', { 'manifest.json': JSON.stringify({ format: 2, cities: [] }) }],
    ['three places', { 'manifest.json': man({}), 'nyc.json': JSON.stringify({ format: 1, places: [place, { ...place, id: 'n2' }, { ...place, id: 'n3' }] }) }],
    ['a places file that does not match its hash', { 'manifest.json': man({ sha256: '0'.repeat(64) }), 'nyc.json': JSON.stringify({ format: 1, places: [place] }) }],
  ]) {
    const r = refuse(files);
    assert.equal(r.status, 3, `${why}: exit ${r.status} ${r.stderr}`); assert.match(r.stderr, /FEED NOT USABLE, nothing written/);
  }
});
console.log(`ok: ${n} tests`);
