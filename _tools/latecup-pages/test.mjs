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
t('chips: tonight, Open now is always first; past thresholds are dropped; 8 PM+ is the default while it is ahead', () => {
  const ids = (c) => c.chips.map((x) => x.id);
  let c = H.chips(at('2026-11-24T19:00:00Z'), true); // 14:00
  assert.deepEqual(ids(c), ['now', '20', '21', '22', '23', '24', 'all']); assert.equal(c.def, '20'); assert.equal(c.chips[0].label, 'Open now');
  c = H.chips(at('2026-11-25T00:59:00Z'), true);     // 19:59
  assert.deepEqual(ids(c), ['now', '20', '21', '22', '23', '24', 'all']); assert.equal(c.def, '20');
  c = H.chips(at('2026-11-25T01:00:00Z'), true);     // 20:00 exactly: 8 PM is no longer ahead
  assert.deepEqual(ids(c), ['now', '21', '22', '23', '24', 'all']); assert.equal(c.def, 'now');
  c = H.chips(at('2026-11-25T03:40:00Z'), true);     // 22:40
  assert.deepEqual(ids(c), ['now', '23', '24', 'all']); assert.equal(c.def, 'now');
  c = H.chips(at('2026-11-25T08:30:00Z'), true);     // 03:30, still Tuesday night
  assert.deepEqual(ids(c), ['now']); assert.equal(c.def, 'now');
  c = H.chips(at('2026-11-24T10:30:00Z'), true);     // 05:30 on the new service day
  assert.deepEqual(ids(c), ['now', '20', '21', '22', '23', '24', 'all']); assert.equal(c.def, '20');
  c = H.chips(at('2026-11-25T03:40:00Z'), false);    // another night: all six, no Open now
  assert.deepEqual(ids(c), ['20', '21', '22', '23', '24', 'all']); assert.equal(c.def, '20');
});
t('"Open 24 hours" needs 24 h or more AND to run at least to 05:00 the next morning', () => {
  const ALL = H.THRESHOLDS[5], MIDNIGHT = H.THRESHOLDS[4], P11 = H.THRESHOLDS[3];
  // A: open round the clock Monday to Friday, then 5 AM – 7 PM at the weekend (a live Dunkin', n7700401463)
  const A = [[[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[300, 1140]], [[300, 1140]]];
  assert.equal(H.tonight(A, 3).allDay, true);                                      // Thu: runs through the night
  assert.equal(H.pinLabel(H.tonight(A, 3)), '24h');
  const fri = H.tonight(A, 4);                                                    // Fri: the run ends at midnight
  assert.equal(fri.allDay, false); assert.equal(fri.close, 1440); assert.equal(H.pinLabel(fri), '12 AM');
  assert.ok(H.matches(A, 4, P11)); assert.equal(H.matches(A, 4, MIDNIGHT), null); assert.equal(H.matches(A, 4, ALL), null);
  assert.ok(H.matches(A, 3, ALL)); assert.equal(H.matches(A, 3, ALL).allDay, true);
  assert.equal(H.tonight(A, 5).close, 1140); assert.equal(H.tonight(A, 6).close, 1140); // Sat, Sun: 7 PM
  assert.equal(H.tonight(A, 0).allDay, true);                                          // Mon: starts 12 AM, runs on
  let s = H.status(A, at('2026-11-27T15:00:00Z')); // Fri 10:00: open, 14 h to midnight, not "24 hours"
  assert.equal(s.kind, 'open'); assert.equal(s.allDay, undefined); assert.equal(s.close, 1440); assert.equal(s.left, 840);
  s = H.status(A, at('2026-11-28T04:30:00Z'));     // Fri 23:30: closing soon
  assert.equal(s.kind, 'soon'); assert.equal(s.left, 30);
  s = H.status(A, at('2026-11-26T15:00:00Z'));     // Thu 10:00: 24 hours
  assert.equal(s.allDay, true); assert.equal(s.left, Infinity);
  assert.deepEqual(H.weekClosings(A), [{ days: 'Mon–Thu', text: '24 hours' }, { days: 'Fri', text: '12 AM' }, { days: 'Sat–Sun', text: '7 PM' }]);
  assert.equal(H.latestClose(A), Infinity);
  assert.deepEqual([0, 3, 4, 5, 6].map((d) => H.dayText(A, d)), ['Open 24 hours', 'Open 24 hours', 'Open until 12 AM', '5 AM – 7 PM', '5 AM – 7 PM']);
  // B: 6 AM – 4 PM on weekdays, round the clock Saturday and Sunday (n5296489068)
  const B = [[[360, 960]], [[360, 960]], [[360, 960]], [[360, 960]], [[360, 960]], [[0, 1440]], [[0, 1440]]];
  assert.equal(H.tonight(B, 5).allDay, true); assert.ok(H.matches(B, 5, ALL));           // Sat
  assert.equal(H.tonight(B, 6).allDay, false); assert.equal(H.tonight(B, 6).close, 1440); // Sun: closes at midnight
  assert.equal(H.matches(B, 6, ALL), null); assert.equal(H.pinLabel(H.tonight(B, 6)), '12 AM');
  assert.equal(H.tonight(B, 4).close, 960);                                              // Fri: 4 PM; Saturday's opening is tomorrow's
  assert.deepEqual([4, 5, 6].map((d) => H.dayText(B, d)), ['6 AM – 4 PM', 'Open 24 hours', 'Open until 12 AM']);
  // C: one lone full day, closed around it: closes at midnight, not "24 hours"
  const C = [[], [], [[0, 1440]], [], [], [], []];
  assert.deepEqual(H.tonight(C, 2), { open: 0, close: 1440, allDay: false }); assert.equal(H.dayText(C, 2), 'Open until 12 AM'); assert.equal(H.latestClose(C), 1440);
  // D: Thursday 8 AM straight through to Saturday 2 AM
  const D = [[], [], [], [[480, 1440]], [[0, 1440]], [[0, 120]], []];
  assert.equal(H.tonight(D, 3).allDay, true);                                            // Thu: 24 h+ and past 5 AM Friday
  assert.equal(H.tonight(D, 4).allDay, false); assert.equal(H.tonight(D, 4).close, 1560); // Fri: ends 2 AM
  assert.equal(H.pinLabel(H.tonight(D, 4)), '2 AM'); assert.ok(H.matches(D, 4, MIDNIGHT)); assert.equal(H.matches(D, 4, ALL), null);
  assert.equal(H.tonight(D, 5), null); assert.deepEqual([3, 4, 5].map((d) => H.dayText(D, d)), ['Open from 8 AM', 'Open until 2 AM', 'Closed']);
  // F: round the clock Monday to Thursday midnight, 6 AM – midnight Friday, then from 6 AM Saturday round the clock (a live Dunkin', n10294003833)
  const F = [[[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[360, 1440]], [[360, 1440]], [[0, 1440]]];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((d) => H.dayText(F, d)),
    ['Open 24 hours', 'Open 24 hours', 'Open 24 hours', 'Open until 12 AM', '6 AM – 12 AM', 'Open from 6 AM', 'Open 24 hours']);
  assert.equal(H.tonight(F, 5).allDay, true); assert.equal(H.pinLabel(H.tonight(F, 5)), '24h'); // Saturday night itself is a 24-hour night
  assert.deepEqual(H.weekClosings(F), [{ days: 'Mon–Wed', text: '24 hours' }, { days: 'Thu–Fri', text: '12 AM' }, { days: 'Sat–Sun', text: '24 hours' }]);
  // E: round the clock, the whole week: unchanged
  const E = week([[0, 1440]]);
  for (let d = 0; d < 7; d++) { assert.equal(H.tonight(E, d).allDay, true); assert.ok(H.matches(E, d, ALL)); assert.equal(H.dayText(E, d), 'Open 24 hours'); }
});
t('"All night" is open at 03:00 tonight, nothing else', () => {
  const ALL = H.THRESHOLDS[5];
  assert.equal(ALL.rel, 1620);
  assert.equal(H.matches(week([[480, 1620]]), 0, ALL), null);       // closes at 3 AM: not open at 3 AM
  assert.equal(H.matches(week([[480, 1650]]), 0, ALL).close, 1650); // closes 3:30 AM
  assert.equal(H.matches(week([[1200, 1500]]), 0, ALL), null);      // 8 PM – 1 AM
  assert.equal(H.matches(week([[180, 600]]), 0, ALL).close, 2040);  // a 3 AM – 10 AM bakery is open at 3 AM tonight
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
  assert.equal(H.sourceLine({ src: 'shop', checked: '2026-11-24' }).text, "Hours confirmed 2026-11-24 from the shop's own site or page");
  assert.equal(H.sourceLine({ src: 'brand', checked: '2026-11-24' }).text, "Hours confirmed 2026-11-24 from the chain's store locator");
  assert.equal(H.sourceLine({ src: 'osm', checked: null }).text, 'Unconfirmed hours from OpenStreetMap: check before you go');
});

// ---------- QA of tf-1: the next opening, and lines that never contradict the status ----------
t('the next opening is a stretch that begins that day, never the tail of the night before (QA m10)', () => {
  // Friday 8 AM – 1 AM, Saturday 8 AM – midnight: Saturday's table starts with the tail [0, 60] (Sunrise Sunset, n4046748105)
  const S = [[[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1440]], [[0, 60], [480, 1440]], [[480, 1320]]];
  const now = at('2026-11-28T09:40:00Z'); // Saturday 4:40 AM, still Friday night
  assert.equal(now.dow, 4); assert.equal(now.rel, 1720);
  const st = H.status(S, now);
  assert.equal(st.kind, 'closed'); assert.equal(st.nextDow, 5); assert.equal(st.nextOpen, 480); assert.equal(st.daysAhead, 1);
  const v = H.tonightView(S, now, null);
  assert.equal(v.line, 'Closed · opens Saturday at 8 AM'); assert.equal(v.big, 'Closed at 1 AM');
  // a week with one opening: found six days ahead
  const once = [[], [], [[600, 900]], [], [], [], []];
  const far = H.status(once, at('2026-11-26T20:00:00Z')); // Thursday 3 PM
  assert.equal(far.kind, 'closed'); assert.equal(far.nextDow, 2); assert.equal(far.nextOpen, 600); assert.equal(far.daysAhead, 6);
  assert.equal(H.status(week([]), at('2026-11-26T20:00:00Z')).nextDow, undefined); // never open
});
t('the large tonight line follows the status (QA M1, m1)', () => {
  // M1: 6:30 AM – 9:30 PM Mon–Thu; Friday opens 6:30 AM and runs round the clock to Sunday midnight (n6925129153)
  const L = [[[390, 1290]], [[390, 1290]], [[390, 1290]], [[390, 1290]], [[390, 1440]], [[0, 1440]], [[0, 1440]]];
  let now = at('2026-11-27T10:10:00Z'); // Friday 5:10 AM: the new service day, closed until 6:30
  assert.equal(now.dow, 4); assert.equal(now.rel, 310);
  let v = H.tonightView(L, now, null);
  assert.equal(v.big, 'Opens at 6:30 AM'); assert.equal(v.line, 'Opens 6:30 AM · then open 24 hours');
  v = H.tonightView(L, now, H.matches(L, 4, H.THRESHOLDS[0])); // the same under 8 PM+, whose pin reads 24h
  assert.equal(v.big, 'Opens at 6:30 AM'); assert.equal(v.line, 'Opens 6:30 AM · then open 24 hours'); assert.equal(v.left, undefined);
  assert.equal(H.dayText(L, 4), 'Open from 6:30 AM'); assert.equal(H.dayText(L, 5), 'Open 24 hours'); assert.equal(H.dayText(L, 6), 'Open until 12 AM');
  v = H.tonightView(L, at('2026-11-27T17:00:00Z'), null); // Friday noon: open, in a 24-hour run
  assert.equal(v.big, '24 hours'); assert.equal(v.line, 'Open 24 hours'); assert.equal(v.caption, 'open tonight');
  // m1: closes at 9 PM, looked at 9:52 PM on a Tuesday
  const N = week([[480, 1260]]);
  v = H.tonightView(N, at('2026-11-25T02:52:00Z'), null);
  assert.equal(v.big, 'Closed at 9 PM'); assert.equal(v.line, 'Closed · opens Wednesday at 8 AM'); assert.equal(v.cls, 'off');
  v = H.tonightView(N, at('2026-11-25T00:52:00Z'), null); // 7:52 PM: open, 68 minutes left
  assert.equal(v.big, '9 PM'); assert.equal(v.caption, 'closes tonight'); assert.equal(v.line, 'Open until 9 PM · 1 h 8 min left'); assert.equal(v.cls, 'under2');
  v = H.tonightView(N, at('2026-11-25T01:30:00Z'), null); // 8:30 PM
  assert.equal(v.cls, 'soon'); assert.equal(v.left, 30);
  v = H.tonightView(N, at('2026-11-24T11:00:00Z'), null); // 6 AM: not open yet
  assert.equal(v.big, 'Opens at 8 AM'); assert.equal(v.line, 'Opens 8 AM · open until 9 PM');
  // closed all day
  const C = [[], [[480, 1260]], [], [], [], [], []];
  v = H.tonightView(C, at('2026-11-23T20:00:00Z'), null); // Monday 3 PM
  assert.equal(v.big, 'Closed'); assert.equal(v.caption, 'not open tonight'); assert.equal(v.line, 'Closed · opens Tuesday at 8 AM');
});
t('pin, row and place describe the same stretch (QA m4: a split-shift day)', () => {
  // Wednesday 7 AM – 5 PM, then 6 PM – 11 PM (Bad Therapy)
  const B = [[[420, 1380]], [[420, 1380]], [[420, 1020], [1080, 1380]], [[420, 1380]], [[420, 1380]], [[420, 1380]], [[420, 1380]]];
  const P8 = H.THRESHOLDS[0], shown = H.matches(B, 2, P8);
  assert.equal(shown.open, 1080); assert.equal(shown.close, 1380); assert.equal(H.pinLabel(shown), '11');
  let now = at('2026-11-25T20:00:00Z'); // Wednesday 3 PM: open for the day shift, the pin shows the evening
  let v = H.tonightView(B, now, shown);
  assert.equal(v.line, 'Open until 5 PM · reopens 6 PM until 11 PM'); assert.equal(v.big, '11 PM'); assert.equal(v.caption, 'closes tonight'); assert.equal(v.left, undefined);
  v = H.tonightView(B, now, H.openAt(B, now.dow, now.rel)); // the same minute under "Open now": the pin shows 5
  assert.equal(v.line, 'Open until 5 PM · 2 h left'); assert.equal(v.big, '5 PM'); assert.equal(v.left, 120);
  v = H.tonightView(B, at('2026-11-25T22:30:00Z'), shown); // 5:30 PM, between the two
  assert.equal(v.line, 'Opens 6 PM · open until 11 PM'); assert.equal(v.big, 'Opens at 6 PM');
  v = H.tonightView(B, at('2026-11-25T11:00:00Z'), shown); // 6 AM: the next opening is 7 AM, the pin still shows the evening
  assert.equal(v.line, 'Opens 7 AM · tonight until 11 PM'); assert.equal(v.big, 'Opens at 7 AM');
  v = H.tonightView(B, at('2026-11-26T00:30:00Z'), shown); // 7:30 PM: in the evening stretch
  assert.equal(v.line, 'Open until 11 PM · 3 h 30 min left'); assert.equal(v.big, '11 PM'); assert.equal(v.left, 210);
  // another night: the stretch the pin shows
  let n = H.nightView(B, 2, shown, 'Wednesday night');
  assert.equal(n.line, 'Open 6 PM – 11 PM'); assert.equal(n.big, '11 PM'); assert.equal(n.caption, 'closes Wednesday night');
  n = H.nightView(week([[0, 1440]]), 2, null, 'Wednesday night'); assert.equal(n.big, '24 hours'); assert.equal(n.line, 'Open 24 hours');
  n = H.nightView([[], [], [], [], [], [], []], 2, null, 'Wednesday night'); assert.equal(n.big, 'Closed'); assert.equal(n.caption, 'not open Wednesday night');
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
  s = V.summary(osm, { ok: [3, '2026-11-25', 2], stars: [4.3, 7] }); // a third element (the old on-site count) is ignored
  assert.deepEqual(s.ok, { n: 3, date: '2026-11-25' }); assert.deepEqual(V.summary(osm, { ok: [3, '2026-11-25'] }).ok, s.ok);
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
t('what is sent: the note strings of the contract, with nothing about where the visitor is', () => {
  assert.equal(V.attestNote('0a1b2c3d-0000-4000-8000-000000000001', '9f2c41aa'), 'v=1;iid=0a1b2c3d-0000-4000-8000-000000000001;hh=9f2c41aa');
  assert.doesNotMatch(V.attestNote(V.uuid(), '9f2c41aa') + V.rateNote(V.uuid(), 3), /onsite|lat|lon/);
  assert.equal(V.rateNote('0a1b2c3d-0000-4000-8000-000000000001', 4), 'v=1;iid=0a1b2c3d-0000-4000-8000-000000000001;stars=4');
  const sheet = /^v=1;iid=[0-9A-Fa-f-]{36};(hh=[0-9A-Za-z_-]{1,40}(;onsite=[01])?|stars=[1-5])$/; // the published tab passes only this shape
  assert.match('v=1;iid=0a1b2c3d-0000-4000-8000-000000000001;hh=9f2c41aa;onsite=1', sheet, 'the earlier form with the flag is still let through');
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
import { createHash } from 'node:crypto';
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

// ---------- areas (latecup/areas.js): which area a point is in, the coverage line, the two feeds ----------
const A = createRequire(import.meta.url)('../../latecup/areas.js');
const area = (id, name, tz, center, bbox, more) => ({ id, name, tz, center, zoom: 12, bbox, places: `${id}.json`, votes: `${id}-votes.json`, sha256: '0'.repeat(64), count: 100, updated: '2026-11-27T10:00:00Z', ...more });
const NYC = area('nyc', 'New York City', 'America/New_York', [40.7359, -73.9911], [-74.26, 40.49, -73.69, 40.92]);
const PHL = area('philly', 'Philadelphia', 'America/New_York', [39.9526, -75.1652], [-75.4, 39.85, -74.95, 40.15]);
const CHI = area('chicago', 'Chicago', 'America/Chicago', [41.8781, -87.6298], [-88.05, 41.6, -87.5, 42.15]);
const NJ = area('jersey', 'North Jersey', 'America/New_York', [40.8, -74.4], [-75.0, 40.3, -73.9, 41.3]); // overlaps New York's rectangle

t('the area a point is in: the containing rectangle whose center is nearest', () => {
  const all = [NYC, PHL, CHI, NJ], id = (a) => a && a.id;
  assert.equal(id(A.at(all, 40.758, -73.985)), 'nyc');     // Times Square: inside both rectangles, New York's center is a mile away
  assert.equal(id(A.at(all, 40.7357, -74.1724)), 'nyc');   // Newark: inside both, still nearer New York's center
  assert.equal(id(A.at(all, 40.8, -74.25)), 'jersey');     // inside both, nearer the other center: containing is not enough
  assert.equal(id(A.at(all, 40.797, -74.481)), 'jersey');  // Morristown: inside one only
  assert.equal(id(A.at([NJ, CHI, PHL, NYC], 40.758, -73.985)), 'nyc', 'the order of the manifest does not decide');
  assert.equal(id(A.at([NJ, CHI, PHL, NYC], 40.8, -74.25)), 'jersey');
  assert.equal(A.at(all, 39.1, -94.58), null);             // Kansas City: in none
  assert.equal(id(A.nearest(all, 39.1, -94.58)), 'chicago'); // outside all of them: the nearest by center
  assert.equal(id(A.nearest(all, 40.0, -75.0)), 'philly');
  assert.equal(A.nearest([], 40, -75), null);
  assert.equal(id(A.at(all, 40.92, -73.69)), 'nyc');       // the edge of a rectangle is inside it
  const twin = { ...NJ, id: 'twin' };
  assert.equal(id(A.at([NJ, twin], 40.8, -74.4)), 'jersey', 'two centers the same distance away: the earlier entry');
});
t('the areas a map touches, and the one its header follows', () => {
  const all = [NYC, PHL, CHI, NJ], ids = (l) => l.map((a) => a.id).join();
  const trenton = { west: -75.5, south: 39.9, east: -74.0, north: 40.6 }; // a wide map between Philadelphia and New York
  assert.equal(ids(A.touching(all, trenton)), 'nyc,philly,jersey');
  assert.equal(ids(A.touching(all, { west: -74.1, south: 40.6, east: -73.9, north: 40.8 })), 'nyc,jersey');
  assert.equal(ids(A.touching(all, { west: -73.68, south: 40.6, east: -73.5, north: 40.8 })), '', 'just east of New York');
  assert.equal(ids(A.touching(all, { west: -73.69, south: 40.92, east: -73.5, north: 41 })), 'nyc', 'a corner that only touches');
  assert.equal(A.focus(all, 40.758, -73.985, trenton).id, 'nyc');      // the middle is inside an area: that one
  assert.equal(A.focus(all, 40.25, -74.75, trenton).id, 'philly');     // the middle is in none: the nearest of those the map touches
  assert.equal(A.focus(all, 39.1, -94.58, { west: -95, south: 38.8, east: -94.2, north: 39.4 }), null); // the map touches none: Latecup isn't here
});
t('the manifest: entries that cannot be used are left out, the order stays', () => {
  const m = { cities: [NYC, { ...CHI, id: 'mars', tz: 'Mars/Olympus' }, { ...PHL, id: 'short', bbox: [1, 2, 3] }, CHI, { ...NYC, name: 'again' },
    { ...PHL, id: 'folder', places: '../x.json' }, { ...PHL, id: 'Caps' }, { ...PHL, id: 'flat', bbox: [-75, 40, -75, 41] }, { ...PHL, id: 'nocenter', center: null }, null, 'x', PHL] };
  assert.deepEqual(A.list(m).map((a) => a.id), ['nyc', 'chicago', 'philly']);
  assert.equal(A.list(m)[0], NYC);
  assert.deepEqual(A.list(null), []); assert.deepEqual(A.list({}), []); assert.deepEqual(A.list({ cities: 'nyc' }), []);
});
t('the coverage line, from the manifest', () => {
  const dfw = area('dfw', 'Dallas-Fort Worth', 'America/Chicago', [32.7767, -96.797], [-97.5, 32.55, -96.5, 33.25], { indie: 112, indie_confirmed: 9 });
  assert.equal(A.coverage(dfw).text, 'Dallas-Fort Worth · 112 late independents · 9 confirmed'); // the contract's own example
  assert.equal(A.coverage({ ...dfw, indie: 1, indie_confirmed: 0 }).text, 'Dallas-Fort Worth · 1 late independent · 0 confirmed');
  assert.equal(A.coverage({ ...dfw, indie: 1204, indie_confirmed: 1001 }).rest, '1,204 late independents · 1,001 confirmed');
  assert.equal(A.coverage({ ...dfw, indie: 0, indie_confirmed: 0 }).text, 'Dallas-Fort Worth · 0 late independents · 0 confirmed');
  for (const bad of [NYC, { ...dfw, indie_confirmed: undefined }, { ...dfw, indie: '112' }, { ...dfw, indie: 11.5 }, { ...dfw, indie: -1 }, { ...dfw, indie: 5, indie_confirmed: 6 }, null])
    assert.equal(A.coverage(bad), null, 'a line is printed only from numbers that make one');
  // announced: at least half of the late independents confirmed; the launch city is exempt
  assert.equal(A.announced(dfw, false), false); assert.equal(A.announced({ ...dfw, indie_confirmed: 56 }, false), true); assert.equal(A.announced({ ...dfw, indie_confirmed: 55 }, false), false);
  assert.equal(A.announced(NYC, true), true); assert.equal(A.announced(NYC, false), false);
});
t('a 1.0 manifest and a 1.1 manifest', () => {
  assert.equal(A.v11([NYC]), false, 'one area and none of the new fields: the page stays as it was');
  assert.equal(A.v11([{ ...NYC, indie: 334, indie_confirmed: 123 }]), true);
  assert.equal(A.v11([{ ...NYC, help: { file: 'nyc-help.json', sha256: 'x', bytes: 1, count: 780 } }]), true);
  assert.equal(A.v11([NYC, CHI]), true); assert.equal(A.v11([{ ...NYC, visitors: true }]), true);
  // hours that visitors sent are published only where the area says so, in so many words
  assert.equal(A.visitors({ ...CHI, visitors: true }), true);
  for (const off of [CHI, { ...CHI, visitors: false }, { ...CHI, visitors: 'true' }, { ...CHI, visitors: 1 }, null]) assert.equal(A.visitors(off), false);
  assert.deepEqual(A.help({ ...NYC, help: { file: 'nyc-help.json', sha256: 'x', bytes: 1, count: 780 } }), { file: 'nyc-help.json', count: 780 });
  assert.deepEqual(A.help({ ...NYC, help: { file: 'nyc-help.json' } }), { file: 'nyc-help.json', count: null });
  for (const bad of [NYC, { ...NYC, help: null }, { ...NYC, help: 'nyc-help.json' }, { ...NYC, help: { file: '../nyc-help.json' } }, { ...NYC, help: { file: 'https://example.com/x.json' } }, { ...NYC, help: {} }])
    assert.equal(A.help(bad), null);
});
t('names: the clock line, the name in a sentence, where a place is', () => {
  assert.equal(A.clockName(NYC), 'New York'); assert.equal(A.clockName(CHI), 'Chicago');
  assert.equal(A.clockName({ name: 'Los Angeles + Orange County' }), 'Los Angeles'); assert.equal(A.clockName({ name: 'Salt Lake City' }), 'Salt Lake City');
  assert.equal(A.prose('Chicago'), 'Chicago'); assert.equal(A.prose('Los Angeles + Orange County'), 'Los Angeles and Orange County');
  assert.equal(A.prose('Detroit + Dearborn + Ann Arbor'), 'Detroit, Dearborn and Ann Arbor'); assert.equal(A.prose('SF Bay Area'), 'the SF Bay Area'); assert.equal(A.prose('Seattle + Eastside'), 'Seattle and the Eastside');
  const ny = { addr: '13 Carmine St', hood: 'West Village', boro: 'Manhattan' }, oak = { addr: '4000 Telegraph Ave', city: 'Oakland' }, bare = { addr: '1 Main St' };
  assert.equal(A.locality(ny), 'West Village'); assert.equal(A.address(ny), '13 Carmine St');
  assert.equal(A.locality(oak), 'Oakland', 'the city shows where a place has no neighborhood'); assert.equal(A.address(oak), '4000 Telegraph Ave, Oakland');
  assert.equal(A.locality({ ...oak, hood: 'Temescal' }), 'Temescal'); assert.equal(A.locality(bare), ''); assert.equal(A.address(bare), '1 Main St');
});
t('the list on a tie: accepted hours first, then independents before chains, then by name', () => {
  const p = (name, close, marked, chain) => ({ name, close, marked: !!marked, chain: !!chain });
  const order = (list) => [...list].sort(A.latestFirst).map((x) => x.name).join(' ');
  // Chicago's first screen: round-the-clock Dunkin' with unconfirmed hours no longer sit above everything else
  assert.equal(order([p("Dunkin' b", Infinity, 0, 1), p("Dunkin' a", Infinity, 0, 1), p('Qamaria', Infinity, 0, 0), p('Starbucks', Infinity, 1, 1), p('Corner', Infinity, 1, 0), p('Late', 1560, 0, 0)]),
    "Corner Starbucks Qamaria Dunkin' a Dunkin' b Late");
  assert.equal(order([p('B', 1380, 0, 0), p('A', 1380, 0, 0), p('C', 1500, 0, 1), p('D', 1380, 1, 1), p('E', 1380, 1, 0)]), 'C E D A B', 'the closing time comes first; the rest only breaks a tie');
  assert.equal(order([p('b', 1380), p('a', 1380), p('c', 1320, 1)]), 'a b c'); assert.equal(order([]), '');
  assert.equal(A.latestFirst(p('x', Infinity), p('x', Infinity)), 0); assert.ok(A.latestFirst(p('x', Infinity), p('x', 1620)) < 0); assert.ok(A.latestFirst(p('x', 1200), p('x', 1260)) > 0);
});
t('each area on its own clock: the same instant is a different night in each zone', () => {
  const when = new Date('2026-11-28T10:30:00Z'), on = (tz) => H.cityNow(tz, when);
  const ny = on('America/New_York'), chi = on('America/Chicago'), den = on('America/Denver'), phx = on('America/Phoenix'), la = on('America/Los_Angeles'), hnl = on('Pacific/Honolulu');
  assert.deepEqual([ny.serviceDate, ny.dow, ny.rel], ['2026-11-28', 5, 330]);    // New York 5:30 AM Saturday: the new day
  assert.deepEqual([chi.serviceDate, chi.dow, chi.rel], ['2026-11-27', 4, 1710]); // Chicago 4:30 AM: still Friday night
  assert.deepEqual([den.rel, phx.rel, la.rel, hnl.rel], [1650, 1650, 1590, 1470]); // 3:30, 3:30, 2:30 and 12:30 AM, all still Friday night
  const late = week([[420, 1560]]); // 7 AM to 2 AM
  assert.equal(H.status(late, ny).kind, 'later');   // New York: not open yet today
  assert.equal(H.status(late, chi).kind, 'closed'); // Chicago: closed for the night two and a half hours ago
  const h = H.status(late, hnl);                    // Honolulu: open, an hour and a half left
  assert.equal(h.kind, 'open'); assert.equal(h.left, 90); assert.equal(H.pinState(h.left), 'under2');
  assert.equal(H.tonightView(late, hnl, null).line, 'Open until 2 AM · 1 h 30 min left'); assert.equal(H.tonightView(late, ny, null).line, 'Opens 7 AM · open until 2 AM');
  // the chips follow the clock of the area under the middle of the map
  const chips = (now) => H.chips(now, true).chips.map((c) => c.id).join();
  assert.equal(chips(ny), 'now,20,21,22,23,24,all'); assert.equal(chips(hnl), 'now,all'); assert.equal(chips(chi), 'now');
  // 8:40 PM in New York is 5:40 PM in Los Angeles: a 9 PM closing is 20 minutes away in one and 3 h 20 in the other
  const eve = new Date('2026-11-28T01:40:00Z'), nine = week([[420, 1260]]);
  assert.equal(H.status(nine, H.cityNow('America/New_York', eve)).left, 20); assert.equal(H.status(nine, H.cityNow('America/Los_Angeles', eve)).left, 200);
  // summer: Phoenix does not change its clocks, Denver does
  const july = new Date('2026-07-04T05:00:00Z');
  assert.equal(H.cityNow('America/Phoenix', july).minutes, 22 * 60); assert.equal(H.cityNow('America/Denver', july).minutes, 23 * 60); assert.equal(H.cityNow('America/Los_Angeles', july).minutes, 22 * 60);
});
t('the pin says how sure we are: solid where the list has its mark, an outline elsewhere', () => {
  const p = (src) => ({ id: 'n1', src, hh: 'aa11' }), ON = true; // ON: the place's area publishes hours that visitors sent
  assert.equal(V.pin(p('shop')), 'solid'); assert.equal(V.pin(p('brand')), 'solid'); assert.equal(V.pin(p('visitors'), undefined, ON), 'solid');
  assert.equal(V.pin(p('osm')), 'outline'); assert.equal(V.pin(p('osm'), { ok: [1, '2026-12-01'] }), 'outline');
  assert.equal(V.pin(p('osm'), { ok: [2, '2026-12-01'] }), 'solid', 'unconfirmed hours that two visitors confirmed');
  assert.equal(V.pin(p('osm'), { ok: [3, '2026-12-01'], bad: [1, '2026-12-02'] }), 'outline', 'a newer wrong-hours report');
  assert.equal(V.pin(p('osm'), { ok: [3, '2026-12-02'], bad: [1, '2026-12-01'] }), 'solid', 'an older one');
  for (const src of ['shop', 'brand', 'visitors']) assert.equal(V.pin(p(src), { bad: [1, '2026-12-02'] }, ON), 'outline', `${src}: reported wrong, nobody has confirmed since`);
  assert.equal(V.pin(p('somethingnew')), 'outline', 'a source this page does not know is not a confirmation');
  assert.equal(V.pin(p('osm'), { ok: [1, '2026-12-01'], prop: { hours: [], n: 1, date: '2026-12-01' } }), 'outline', 'a proposed table changes nothing here');
  // off by default: where the area does not publish visitors' hours, a place that carries them anyway is unconfirmed
  for (const off of [undefined, false, 'true', 1]) { assert.equal(V.pin(p('visitors'), undefined, off), 'outline'); assert.equal(V.summary(p('visitors'), undefined, off).marked, false); }
  assert.equal(V.pin(p('visitors'), { ok: [2, '2026-12-01'] }), 'solid', 'two confirmations still count there, as for any place');
  // the mark of the list and the pin are one rule
  for (const [src, vote, on] of [['shop', undefined], ['osm', { ok: [2, '2026-12-01'] }], ['visitors', { bad: [1, '2026-12-02'] }, ON], ['visitors', undefined, ON], ['visitors', undefined], ['osm', undefined]])
    assert.equal(V.pin(p(src), vote, on) === 'solid', V.summary(p(src), vote, on).marked);
  assert.equal(V.summary(p('visitors'), undefined, ON).ours, false, "visitors' hours are never worded as ours"); assert.equal(V.summary(p('visitors'), undefined, ON).theirs, true);
});
t('the visitors source line, beside the three others, only where the area publishes those hours', () => {
  const ON = true;
  assert.equal(H.sourceLine({ src: 'visitors', visitors: 2, checked: '2026-12-03' }, ON).text, 'Hours from 2 visitors · latest Dec 3');
  assert.equal(H.sourceLine({ src: 'visitors', visitors: 3, checked: '2026-12-31' }, ON).text, 'Hours from 3 visitors · latest Dec 31');
  assert.equal(H.sourceLine({ src: 'visitors', visitors: 2, checked: '2026-12-03' }, ON).confirmed, true);
  assert.equal(H.sourceLine({ src: 'visitors', checked: '2026-12-03' }, ON).text, 'Hours from visitors · latest Dec 3'); // a count that is missing is not made up
  assert.equal(H.sourceLine({ src: 'visitors', visitors: 2, checked: null }, ON).text, 'Hours from 2 visitors');
  assert.doesNotMatch(H.sourceLine({ src: 'visitors', visitors: 2, checked: '2026-12-03' }, ON).text, /confirm|OpenStreetMap/);
  // off by default: without the area's flag no place says "Hours from N visitors", and it is not credited to OpenStreetMap either
  for (const off of [undefined, false, 'true', 1]) assert.deepEqual(H.sourceLine({ src: 'visitors', visitors: 2, checked: '2026-12-03' }, off), { confirmed: false, text: 'Unconfirmed hours: check before you go' });
  assert.equal(H.sourceLine({ src: 'shop', checked: '2026-11-24' }).text, "Hours confirmed 2026-11-24 from the shop's own site or page");
  assert.equal(H.sourceLine({ src: 'brand', checked: '2026-11-24' }, ON).text, "Hours confirmed 2026-11-24 from the chain's store locator");
  assert.equal(H.sourceLine({ src: 'osm', checked: '2026-10-24' }).text, 'Unconfirmed hours from OpenStreetMap (last checked there 2026-10-24): check before you go');
  assert.equal(H.sourceLine({ src: 'somethingnew', checked: null }).confirmed, false);
});

// ---------- the week a visitor sends (latecup/table.js) ----------
const T = createRequire(import.meta.url)('../../latecup/table.js');
// The report sheet's own patterns, copied from Latecup/marketing/report-form.md ("Fixes and new cafés"). A note that does not match arrives blank.
const SHEET_TABLE = '(?:(?:x|[0-9]{1,4}-[0-9]{1,4}(?:,[0-9]{1,4}-[0-9]{1,4}){0,3})\\.){6}(?:x|[0-9]{1,4}-[0-9]{1,4}(?:,[0-9]{1,4}-[0-9]{1,4}){0,3})';
const SHEET_FIX = new RegExp('^v=2;iid=[0-9A-Fa-f-]{36};hh=[0-9A-Za-z_-]{1,40};t=' + SHEET_TABLE + '$');
const SHEET_ADD = new RegExp('^(v=2;iid=[0-9A-Fa-f-]{36};ll=-?[0-9]{1,2}\\.[0-9]{3,6},-?[0-9]{1,3}\\.[0-9]{3,6};c=(?:coffee|tea|dessert);t=' + SHEET_TABLE + ')(?:;w=.{0,300})?$');
const IID = '0a1b2c3d-0000-4000-8000-000000000001';
const SPEC_TABLE = [[[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1500]], [[480, 1500]], [[540, 1320]]];
const SPEC_TEXT = '480-1380.480-1380.480-1380.480-1380.480-1500.480-1500.540-1320';
const TABLES = [SPEC_TABLE, week([[0, 1440]]), week([]), [[], [[600, 960], [1020, 1290]], [], [], [], [], []],
  [[[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[300, 1140]], [[300, 1140]]],  // a 24-hour run that ends at midnight on Friday
  [[[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1440]], [[0, 60], [480, 1440]], [[480, 1320]]], // a night split at midnight
  [[], [], [], [[480, 1440]], [[0, 1440]], [[0, 120]], []], week([[270, 1350]]), week([[1320, 1620]]), week([[480, 1920]]),
  [[[360, 600], [660, 840], [900, 1080], [1140, 1500]], [], [[0, 1]], [[1439, 1440]], [[1439, 2879]], [[1439, 1500]], [[60, 120]]]];

t('the table a visitor sends: the exact string of the contract, both ways', () => {
  assert.equal(T.encode(SPEC_TABLE), SPEC_TEXT); assert.deepEqual(T.decode(SPEC_TEXT), SPEC_TABLE);
  assert.equal(T.encode(week([])), 'x.x.x.x.x.x.x'); assert.equal(T.encode(week([[0, 1440]])), Array(7).fill('0-1440').join('.'));
  assert.equal(T.encode([[], [[600, 960], [1020, 1290]], [], [], [], [], []]), 'x.600-960,1020-1290.x.x.x.x.x');
  for (const tb of TABLES) { // round trip
    assert.equal(T.check(tb), '', JSON.stringify(tb));
    const text = T.encode(tb); assert.match(text, new RegExp('^' + SHEET_TABLE + '$')); assert.deepEqual(T.decode(text), tb); assert.equal(T.encode(T.decode(text)), text);
  }
  assert.deepEqual(T.decode('0480-1380.x.x.x.x.x.x'), [[[480, 1380]], [], [], [], [], [], []]); // a leading zero reads as the same minute
});
t('only a valid feed table is sent or read', () => {
  const bad = (tb, why) => { assert.equal(T.check(tb), why, JSON.stringify(tb)); assert.equal(T.encode(tb), null); };
  bad([[], [], [], [], [], []], 'days'); bad([[], [], [], [], [], [], [], []], 'days'); bad(null, 'days'); bad([[], [], [], [], [], [], 'x'], 'days');
  bad(week([[480]]), 'span'); bad(week([[480.5, 600]]), 'span'); bad(week([['480', '600']]), 'span');
  bad(week([[1440, 1500]]), 'open'); bad(week([[-1, 60]]), 'open');
  bad(week([[600, 600]]), 'close'); bad(week([[600, 540]]), 'close'); bad(week([[600, 2041]]), 'close'); // more than 24 hours
  bad(week([[600, 700], [500, 550]]), 'order'); bad(week([[480, 720], [700, 900]]), 'order');
  bad(week([[480, 720], [720, 900]]), 'order');                                  // touching spans are one span: the feed does not write them as two
  bad([[[1320, 1560]], [[60, 300]], [], [], [], [], []], 'midnight');            // Monday to 2 AM, Tuesday from 1 AM
  bad([[[300, 600]], [], [], [], [], [], [[1320, 1800]]], 'midnight');           // Sunday night runs into Monday morning: the week wraps
  assert.equal(T.check([[[1320, 1560]], [[120, 300]], [], [], [], [], []]), ''); // Tuesday opens as Monday night ends: allowed
  assert.equal(T.encode(week([[60, 120], [180, 240], [300, 360], [420, 480], [540, 600]])), null, 'at most four spans a day fit the pattern');
  assert.notEqual(T.encode(week([[60, 120], [180, 240], [300, 360], [420, 480]])), null);
  for (const text of ['', 'x.x.x.x.x.x', 'x.x.x.x.x.x.x.x', '480-1380', 'x.x.x.x.x.x.y', '480-1380.x.x.x.x.x.x ', ' 480-1380.x.x.x.x.x.x', '480–1380.x.x.x.x.x.x', '4.8e2-1380.x.x.x.x.x.x',
    '600-540.x.x.x.x.x.x', '1440-1500.x.x.x.x.x.x', '480-720,720-900.x.x.x.x.x.x', '1320-1560.60-300.x.x.x.x.x', '480-99999.x.x.x.x.x.x', '1-2,3-4,5-6,7-8,9-10.x.x.x.x.x.x', null, 480])
    assert.equal(T.decode(text), null, JSON.stringify(text));
});
t('what a fix sends: the note of the contract, and nothing the sheet would blank', () => {
  assert.equal(T.fixNote(IID, '9f2c41aa', SPEC_TABLE), `v=2;iid=${IID};hh=9f2c41aa;t=${SPEC_TEXT}`);
  assert.equal(T.fixNote(IID, '0', week([])), `v=2;iid=${IID};hh=0;t=x.x.x.x.x.x.x`);
  assert.equal(T.fixNote(IID, undefined, SPEC_TABLE), `v=2;iid=${IID};hh=0;t=${SPEC_TEXT}`, 'a place with no hours has no hash: 0');
  assert.equal(T.fixNote(IID, '', SPEC_TABLE), `v=2;iid=${IID};hh=0;t=${SPEC_TEXT}`);
  for (const tb of TABLES) { const note = T.fixNote(V.uuid(), 'e616052c', tb); assert.match(note, SHEET_FIX); assert.ok(note.length <= T.NOTE_MAX); assert.doesNotMatch(note, /lat|lon|ll=/); }
  assert.equal(T.fixNote(IID, '9f2c41aa', week([[600, 540]])), null, 'a week that is not valid is not sent');
  assert.equal(T.fixNote('me@example.com', '9f2c41aa', SPEC_TABLE), null); assert.equal(T.fixNote(IID, 'no spaces allowed', SPEC_TABLE), null);
  assert.equal(String(T.FIX), String(SHEET_FIX), 'table.js checks against the pattern the sheet uses'); assert.equal(String(T.ADD), String(SHEET_ADD));
  assert.doesNotMatch(`v=2;iid=${IID};hh=9f2c41aa;t=${SPEC_TEXT} closes at 9 now`, SHEET_FIX);
});
t('what an add sends: the pin with 5 decimals, the kind, the week, and the link percent-encoded', () => {
  assert.equal(T.addNote(IID, 41.88012345, -87.63245678, 'coffee', SPEC_TABLE), `v=2;iid=${IID};ll=41.88012,-87.63246;c=coffee;t=${SPEC_TEXT}`);
  assert.equal(T.addNote(IID, 21.3, -157.85, 'tea', week([]), ''), `v=2;iid=${IID};ll=21.30000,-157.85000;c=tea;t=x.x.x.x.x.x.x`);
  assert.equal(T.addNote(IID, 40.73012, -73.99555, 'dessert', SPEC_TABLE, ' https://example.com/visit us?x=1&y=é '),
    `v=2;iid=${IID};ll=40.73012,-73.99555;c=dessert;t=${SPEC_TEXT};w=https%3A%2F%2Fexample.com%2Fvisit%20us%3Fx%3D1%26y%3D%C3%A9`);
  assert.equal(T.addNote(IID, 40.73012, -73.99555, 'coffee', SPEC_TABLE, '@example.coffee').slice(-20), ';w=%40example.coffee');
  for (const tb of TABLES) for (const link of [undefined, 'example.com', 'x'.repeat(500), 'é'.repeat(200), 'a;w=b\nc', '😀'.repeat(60)]) {
    const note = T.addNote(V.uuid(), 34.0522, -118.2437, 'coffee', tb, link), m = SHEET_ADD.exec(note);
    assert.ok(m, note); assert.ok(note.length <= T.NOTE_MAX, 'the page cuts a field at 600 characters: the note must fit whole');
    assert.equal(m[1], note.split(';w=')[0], 'what the sheet publishes stops at the table: no link, and the name is not in the note at all');
    const w = note.split(';w=')[1]; if (w !== undefined) { assert.ok(w.length <= 300); assert.doesNotThrow(() => decodeURIComponent(w), 'cut on a whole character'); }
  }
  assert.equal(decodeURIComponent(T.addNote(IID, 40.7, -73.9, 'coffee', SPEC_TABLE, 'x'.repeat(500)).split(';w=')[1]), 'x'.repeat(300));
  for (const bad of [['bar', SPEC_TABLE], ['coffee', week([[600, 540]])], ['', SPEC_TABLE]]) assert.equal(T.addNote(IID, 40.7, -73.9, bad[0], bad[1]), null);
  assert.equal(T.addNote(IID, NaN, -73.9, 'coffee', SPEC_TABLE), null); assert.equal(T.addNote(IID, '40.7', -73.9, 'coffee', SPEC_TABLE), null);
  assert.equal(T.addNote(IID, 140.7, -73.9, 'coffee', SPEC_TABLE), null, 'three digits of latitude are not a place');
});
t('the week editor holds the feed\'s days as they are: an untouched day goes out span for span', () => {
  for (const tb of TABLES) { // nothing is merged, split or written another way
    const r = T.table(T.rows(tb), tb);
    assert.equal(r.error, undefined, JSON.stringify(tb)); assert.deepEqual(r.table, tb); assert.deepEqual(r.touched, [false, false, false, false, false, false, false]);
    assert.equal(T.encode(r.table), T.encode(tb));
  }
  const m = T.rows(SPEC_TABLE);
  assert.equal(m.same, false); assert.deepEqual(m.days[4], { state: 'open', spans: [[480, 60]] }, 'Friday 8 AM to 1 AM: the closing is a clock time');
  assert.equal(T.rows(week([[480, 1380]])).same, true); assert.equal(T.rows(week([])).days[0].state, 'closed'); assert.equal(T.rows(week([[0, 1440]])).days[0].state, 'all');
  // a night the feed writes as two halves: Friday to midnight, and the tail on Saturday
  const SPLIT = [[[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1320]], [[480, 1440]], [[0, 60], [480, 1440]], [[480, 1320]]];
  const split = T.rows(SPLIT);
  assert.deepEqual(split.days[4].spans, [[480, 0]]); assert.deepEqual(split.days[5].spans, [[0, 60], [480, 0]], 'the tail stays on the day the feed has it on');
  split.days[6].spans[0][1] = 1380; // the visitor changes Sunday only
  let r = T.table(split, SPLIT);
  assert.equal(T.encode(r.table), '480-1320.480-1320.480-1320.480-1320.480-1440.0-60,480-1440.480-1380'); assert.deepEqual(r.touched, [false, false, false, false, false, false, true]);
  split.days[5].spans[0][1] = 120; // and then Friday night's end, which the feed keeps on Saturday
  r = T.table(split, SPLIT);
  assert.equal(T.encode(r.table), '480-1320.480-1320.480-1320.480-1320.480-1440.0-120,480-1440.480-1380'); assert.deepEqual(r.touched, [false, false, false, false, false, true, true]);
  // one day changed in each table: the other six are the feed's own arrays, whatever shape they have
  for (const tb of TABLES) for (let d = 0; d < 7; d++) {
    const model = T.rows(tb); T.setSame(model, false); model.days[d] = { state: tb[d].length ? 'closed' : 'all', spans: [[null, null]] };
    const out = T.table(model, tb); if (out.error) continue; // a day opened round the clock beside a night that runs past it: refused, nothing sent
    for (let k = 0; k < 7; k++) if (!out.touched[k]) assert.deepEqual(out.table[k], tb[k]);
    assert.equal(out.touched[d], true);
    assert.ok(out.touched.filter(Boolean).length <= 2, 'at most the day itself and, when it is opened into a night, nothing of the days left alone');
  }
});
t('the week editor: same hours each day, closed, 24 hours', () => {
  const m = T.blank();
  assert.equal(m.same, true); assert.deepEqual(T.table(m), { error: 'blank', day: 0 }, 'an empty week is not sent');
  m.days[0].spans = [[420, 1380]];
  assert.equal(T.encode(T.table(m).table), Array(7).fill('420-1380').join('.'));     // one line for the week
  T.setSame(m, false); assert.deepEqual(m.days[6], { state: 'open', spans: [[420, 1380]] }); // the week opens up with the same hours on each day
  m.days[5].spans = [[480, 60]]; m.days[6].state = 'closed'; m.days[2].state = 'all';
  assert.equal(T.encode(T.table(m).table), '420-1380.420-1380.0-1440.420-1380.420-1380.480-1500.x');
  m.days[2].state = 'open'; m.days[2].spans = [[0, 0]];                                // midnight to midnight is 24 hours too
  assert.equal(T.encode(T.table(m).table).split('.')[2], '0-1440');
  T.setSame(m, true); assert.equal(T.encode(T.table(m).table), Array(7).fill('420-1380').join('.'), 'ticked again: the first day stands for the week');
  const all = T.blank(); all.days[0].state = 'all'; assert.equal(T.encode(T.table(all).table), Array(7).fill('0-1440').join('.'));
  const none = T.blank(); none.days[0].state = 'closed'; assert.equal(T.encode(T.table(none).table), 'x.x.x.x.x.x.x');
});
t('the week editor: what it refuses, and what it tidies', () => {
  const one = (d, spans, state) => { const m = T.rows(week([[480, 1020]])); T.setSame(m, false); m.days[d] = { state: state || 'open', spans }; return m; };
  assert.deepEqual(T.table(one(2, [[480, null]])), { error: 'blank', day: 2 });
  assert.deepEqual(T.table(one(2, [[null, null]])), { error: 'blank', day: 2 });
  assert.deepEqual(T.table(one(3, [[480, 720], [660, 900]])), { error: 'overlap', day: 3 });
  assert.equal(T.encode(T.table(one(0, [[1320, 180]])).table).split('.')[0], '1320-1620', '10 PM to 3 AM is fine: Tuesday opens at 8');
  // a night that runs into the next day's opening: the same hours, written so that the night stops where the day takes over
  assert.equal(T.encode(T.table(one(0, [[1320, 600]])).table).slice(0, 18), '1320-1920.480-1020', 'Monday 10 PM to 10 AM, Tuesday 8 AM to 5 PM: open straight through');
  assert.equal(T.encode(T.table(one(6, [[1320, 600]])).table).slice(-9), '1320-1920', 'and Sunday night into Monday');
  const fri = one(4, [[660, 90]]); fri.days[5] = { state: 'all', spans: [[null, null]] };
  assert.equal(T.encode(T.table(fri).table).split('.').slice(4, 6).join('.'), '660-1440.0-1440', 'Friday until 1:30 AM and Saturday 24 hours');
  const minutes = (tb) => { const on = new Uint8Array(10080); tb.forEach((day, d) => day.forEach(([a, b]) => { for (let m = a; m < b; m++) on[(d * 1440 + m) % 10080] = 1; })); return on.join(''); };
  assert.equal(minutes(T.table(fri).table), minutes([[[480, 1020]], [[480, 1020]], [[480, 1020]], [[480, 1020]], [[660, 1530]], [[0, 1440]], [[480, 1020]]]), 'no minute is added or lost');
  const clash = one(0, [[1320, 600]]); clash.days[1] = { state: 'open', spans: [[480, 540]] };
  assert.deepEqual(T.table(clash), { error: 'midnight', day: 0 }, 'Monday until 10 AM, Tuesday 8 to 9 AM: one of the two is wrong');
  assert.equal(T.encode(T.table(one(1, [[1020, 1260], [480, 960]])).table).split('.')[1], '480-960,1020-1260', 'put in the wrong order: sorted');
  assert.equal(T.encode(T.table(one(1, [[480, 720], [720, 900]])).table).split('.')[1], '480-900', 'two openings that touch are one');
  assert.equal(T.encode(T.table(one(1, [[480, 720], [null, null]])).table).split('.')[1], '480-720', 'an extra line left empty is ignored');
  assert.equal(T.encode(T.table(one(4, [[480, 0]])).table).split('.')[4], '480-1440', 'closing at 12:00 AM is midnight');
  const night = T.rows(week([[480, 1020]])); T.setSame(night, false); night.days[4].spans = [[480, 0]]; night.days[5].spans = [[0, 60], [480, 1020]];
  assert.equal(T.encode(T.table(night).table), '480-1020.480-1020.480-1020.480-1020.480-1440.0-60,480-1020.480-1020', 'typed as two halves of one night: sent as typed');
  // the day the visitor touched gives way, never a day they left alone
  const FEED = [[[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1380]], [[660, 1560]], [[660, 1560]], [[660, 1320]]]; // Friday and Saturday until 2 AM
  let mm = T.rows(FEED); mm.days[5] = { state: 'all', spans: [[null, null]] };        // Saturday becomes 24 hours; Friday is left alone
  let rr = T.table(mm, FEED);
  assert.equal(T.encode(rr.table).split('.').slice(4, 6).join('.'), '660-1560.120-1440', 'Friday as the feed has it; Saturday starts where Friday night ends');
  assert.deepEqual(rr.touched, [false, false, false, false, false, true, false]); assert.equal(minutes(rr.table), minutes([FEED[0], FEED[1], FEED[2], FEED[3], FEED[4], [[0, 1440]], FEED[6]]));
  mm = T.rows(FEED); mm.days[4].spans[0][1] = 180; mm.days[5].spans = [[120, 1380]];    // Friday now until 3 AM, Saturday now 2 AM to 11 PM: both touched
  rr = T.table(mm, FEED); assert.equal(T.encode(rr.table).split('.').slice(4, 6).join('.'), '660-1560.120-1380', 'both touched: the night stops where the day takes over');
  assert.deepEqual(rr.touched, [false, false, false, false, true, true, false]);
  mm = T.rows(FEED); mm.days[6].spans[0][0] = 60;                                       // Sunday now opens at 1 AM, inside Saturday night, which is left alone
  rr = T.table(mm, FEED); assert.equal(T.encode(rr.table).split('.').slice(5).join('.'), '660-1560.120-1320'); assert.deepEqual(rr.touched.slice(5), [false, true]);
  mm = T.rows(FEED); mm.days[6].spans = [[30, 120], [660, 1320]];                       // an opening that lies wholly inside the night the feed already has
  rr = T.table(mm, FEED); assert.equal(T.encode(rr.table), T.encode(FEED));
  for (const tb of TABLES) for (const day of T.table(T.rows(tb), tb).table) assert.ok(day.length <= T.MAX_SPANS);
});

// ---------- wording: what the page and the builder say never promises ----------
import { readFileSync, readdirSync as ls, mkdirSync as mk } from 'node:fs';
const SITE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'latecup');
const BANNED = /\b(accurate|accuracy|guarantee\w*|verified|every|always open)\b/i;
const words = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
const plain = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const added = (html) => (html.match(/<[a-z0-9]+[^>]* data-more="[^"]*"[^>]*>/g) || []).map((tag) => { // the sentences the script puts into a paragraph on some manifests
  const attr = (name) => plain(new RegExp(` ${name}="([^"]*)"`).exec(tag)[1]), name = /^<([a-z0-9]+)/.exec(tag)[1], rest = html.slice(html.indexOf(tag) + tag.length);
  return { when: attr('data-more'), after: attr('data-after'), say: attr('data-say'), runs: rest.slice(0, rest.indexOf(`</${name}>`)).split(/<[^>]+>/).map(plain) };
});
t('wording never says accurate, guaranteed, verified, every or always open', () => {
  const html = readFileSync(join(SITE_DIR, 'index.html'), 'utf8'), page = words(html) + added(html).map((m) => m.say).join(' ');
  assert.doesNotMatch(page, BANNED); assert.doesNotMatch(page, /[—]/, 'no em dashes');
  // the privacy policy is the released app's: one sentence of it predates this rule and stays as it was written
  const privacy = words(readFileSync(join(SITE_DIR, 'privacy.html'), 'utf8')).replace('The files are identical for every user.', '');
  assert.doesNotMatch(privacy, BANNED);
  // scripts: comments and method calls aside, what is left includes each string a visitor can read
  for (const f of ['map.js', 'areas.js', 'table.js', 'votes.js', 'hours.js']) {
    const code = readFileSync(join(SITE_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1').replace(/\.every\(/g, '.all(');
    const hit = BANNED.exec(code); assert.equal(hit, null, `${f}: "${hit && code.slice(Math.max(0, hit.index - 40), hit.index + 40)}"`);
    assert.doesNotMatch(code, /—/, f);
  }
});

t('a sentence that only some manifests add to a paragraph has one place to go, and the paragraph as written does not change', () => {
  const html = readFileSync(join(SITE_DIR, 'index.html'), 'utf8'), more = added(html);
  assert.equal(more.length, 5);
  for (const m of more) {
    assert.ok(['v11', 'vis'].includes(m.when), m.when);
    const runs = m.runs.filter((run) => run.includes(m.after));
    assert.equal(runs.length, 1, `"${m.after}" is in one run of the paragraph's text`); assert.equal(runs[0].split(m.after).length, 2, `"${m.after}" is there once`);
    assert.match(m.after, /\.$/, 'it goes after a whole sentence'); assert.match(m.say, /^ \S.*\.$/, 'and is a sentence of its own, with the space before it');
  }
  // nothing inside a paragraph that is always shown is switched on or off: only whole paragraphs, list items and headings are (an element inside one changes how its letters are drawn)
  for (const tag of html.match(/<[a-z0-9]+[^>]* data-if="[^"]*"[^>]*>/g)) assert.match(tag, /^<(p|li|h3) /, tag);
  for (const tag of html.match(/<[a-z0-9]+[^>]* data-fill="[^"]*"[^>]*>/g)) {
    const before = html.slice(0, html.indexOf(tag)), open = before.slice(Math.max(before.lastIndexOf('<p'), before.lastIndexOf('<li'), before.lastIndexOf('<h3')));
    assert.match(open, /^<(p|li|h3) data-if="many" hidden>/, `${tag} is filled in only inside text that one area never shows`);
  }
});

// ---------- build.mjs follows the manifest: one area, or a page for each ----------
const HOURS = [[[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1380]], [[480, 1500]], [[480, 1500]], [[540, 1320]]];
const sha = (text) => createHash('sha256').update(text).digest('hex');
const fakeFeed = (dir, { areas = [], breakSha = [], drop = [] } = {}) => { // New York with 11 neighborhoods of 20, plus the areas asked for
  mk(dir, { recursive: true });
  const man = { format: 1, generated: '2026-12-06T10:00:00Z', cities: [] };
  const put = (a, places, votes) => {
    const text = JSON.stringify({ format: 1, city: a.id, generated: man.generated, places });
    if (!drop.includes(a.id)) writeFileSync(join(dir, a.places), text);
    writeFileSync(join(dir, a.votes), JSON.stringify({ format: 1, city: a.id, generated: man.generated, votes: votes || {} }));
    man.cities.push({ ...a, sha256: breakSha.includes(a.id) ? '0'.repeat(64) : sha(text), count: places.length, updated: '2026-12-06T09:00:00Z' });
  };
  const ny = [];
  for (let h = 0; h < 11; h++) for (let i = 0; i < 20; i++) ny.push({ id: `n${1000 + h * 20 + i}`, name: `NY Cafe ${h}-${i}`, lat: 40.7 + h / 100, lon: -73.99 + i / 1000, addr: `${i + 1} Test St`, hood: `Hood ${h}`, boro: 'Manhattan',
    cat: 'coffee', chain: null, hours: HOURS, src: i % 2 ? 'osm' : 'shop', checked: i % 2 ? null : '2026-11-24', hh: 'aa11' });
  put({ ...NYC, ...(areas.length ? { indie: 220, indie_confirmed: 110 } : {}) }, ny);
  for (const [id, n] of areas) {
    const a = { ...(id === 'chicago' ? CHI : area(id, id === 'la' ? 'Los Angeles + Orange County' : 'Town ' + id, 'America/Chicago', [35, -90], [-91, 34, -89, 36])) }, ps = [];
    for (let i = 0; i < n; i++) ps.push({ id: `n${id.length}${5000 + i}`, name: i < 10 ? `Indie ${i}` : 'Starbucks', lat: a.center[0] + i / 1000, lon: a.center[1], addr: `${i + 1} Main St`, city: i % 3 ? 'Evanston' : 'Chicago',
      cat: i === 3 ? 'tea' : 'coffee', chain: i < 10 ? null : 'starbucks', hours: i === 0 ? [[[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]], [[0, 1440]]] : HOURS,
      src: i < 2 ? 'shop' : i === 2 ? 'visitors' : i < 10 ? 'osm' : 'brand', checked: i < 2 ? '2026-12-01' : i === 2 ? '2026-12-03' : i < 10 ? null : '2026-11-30', hh: 'bb22', ...(i === 2 ? { visitors: 2 } : {}) });
    // Chicago publishes hours that visitors sent ("visitors": true); the others carry such a place too, and must not show it as that
    put({ ...a, indie: Math.min(n, 10), indie_confirmed: Math.min(n, id === 'chicago' ? 3 : 2), ...(id === 'chicago' ? { visitors: true } : {}) }, ps, { [`n${id.length}5004`]: { ok: [2, '2026-12-02'], stars: [4.5, 2] }, [`n${id.length}5005`]: { ok: [3, '2026-12-01'], bad: [1, '2026-12-02'] } });
  }
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(man));
  return dir;
};
const build = (feed, out, ...flags) => spawnSync(process.execPath, [BUILD, '--feed', feed + '/', '--out', out, ...flags], { encoding: 'utf8' });
const page = (out, ...path) => readFileSync(join(out, 'latecup', ...path, 'index.html'), 'utf8');
const scratch = mkdtempSync(join(tmpdir(), 'latecup-pages-'));

t('one area in the manifest: New York\'s pages and nothing else', () => {
  const out = join(scratch, 'one'), r = build(fakeFeed(join(scratch, 'feed-one')), out);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /^11 neighborhood pages \+ index from 220 places \(feed updated 2026-12-06\); sitemap has 14 Latecup URLs\n$/);
  assert.deepEqual(ls(join(out, 'latecup')), ['nyc']); assert.equal(ls(join(out, 'latecup', 'nyc')).length, 12);
  const hub = page(out, 'nyc');
  assert.doesNotMatch(hub, /card note|cities\/|late independents/, 'nothing about areas on a page built from a 1.0 manifest');
  assert.doesNotMatch(readFileSync(join(out, 'sitemap.xml'), 'utf8'), /cities/);
});
t('more areas: a page for each, the coverage line at the top, the same source labels as the map', () => {
  const out = join(scratch, 'many'), feed = fakeFeed(join(scratch, 'feed-many'), { areas: [['chicago', 30], ['la', 25], ['tiny', 5], ['broken', 30], ['gone', 30], ['lib', 30]], breakSha: ['broken'], drop: ['gone'] });
  const r = build(feed, out);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(ls(join(out, 'latecup')), ['chicago', 'cities', 'la', 'nyc'], 'an area whose file is small, missing or does not match its checksum gets no page, and stops nothing');
  assert.match(r.stderr, /tiny: only 5 places/); assert.match(r.stderr, /broken: broken\.json does not match the manifest's sha256/); assert.match(r.stderr, /gone: could not read gone\.json/); assert.match(r.stderr, /lib: latecup\/lib\/ is taken/);
  const chi = page(out, 'chicago');
  assert.match(chi, /<title>Coffee shops open late in Chicago \| Latecup<\/title>/); assert.match(chi, /<h1>Coffee shops open late in Chicago<\/h1>/);
  assert.match(chi, /<link rel="canonical" href="https:\/\/juicypasta\.github\.io\/latecup\/chicago\/">/);
  const line = chi.indexOf('<strong>Chicago · 10 late independents · 3 confirmed</strong>');
  assert.ok(line > 0 && line < chi.indexOf('<table'), 'the coverage line comes before the list'); assert.ok(line < chi.indexOf('<p>Latecup lists'));
  assert.match(chi, /The hours of 3 of the 10 independent shops here are confirmed \(marked ✓\): 2 from the shop's own site or page and 1 sent by visitors who agree with each other\. The other 7 come from OpenStreetMap and are marked unconfirmed/);
  assert.match(chi, /<h2>Independent shops \(10\)<\/h2>/); assert.equal(chi.split('<a class="name"').length - 1, 10, 'the number in the heading is the length of the list under it');
  assert.deepEqual([...chi.matchAll(/<a class="name"[^>]*>([^<]+)</g)].map((m) => m[1]), ['Indie 0', 'Indie 1', 'Indie 2', 'Indie 4', 'Indie 3', 'Indie 5', 'Indie 6', 'Indie 7', 'Indie 8', 'Indie 9'],
    'latest closing first; among those that close together, the ones with a ✓ come first (4: two visitors confirmed it; 5 lost its mark to a newer report)');
  assert.match(chi, /<h2>Chain stores \(20\)<\/h2>/); assert.match(chi, /<tr><td>Starbucks<\/td><td>20<\/td><td>20<\/td><td>1 AM<\/td><\/tr>/);
  assert.match(chi, /<span class="tag ok">✓ Shop's own site or page, 2026-12-01<\/span>/); assert.match(chi, /<span class="tag ok">✓ Hours from 2 visitors · latest Dec 3<\/span>/);
  assert.equal(chi.split('<span class="tag">Unconfirmed</span>').length - 1, 7, 'unconfirmed hours are labeled as that, one for one');
  assert.match(chi, /<span class="tag ok">2 visitors confirmed these hours · latest Dec 2<\/span><span class="tag star">★ 4\.5 · 2 ratings<\/span>/); assert.match(chi, /<span class="tag warn">Reported wrong on Dec 2: being checked<\/span>/);
  assert.match(chi, /href="\.\.\/#p=n75002&amp;a=chicago"/); assert.match(chi, /href="\.\.\/#a=chicago"/); assert.match(chi, /1 Main St, Chicago · Coffee/);
  assert.doesNotMatch(chi, /<a[^>]+href="(?:https:\/\/juicypasta\.github\.io|\/)/, 'links inside the site are relative');
  assert.match(chi, /"Hours from 2 visitors" means that many people sent the same hours from the app/);
  const la = page(out, 'la');
  assert.match(la, /<h1>Coffee shops open late in Los Angeles and Orange County<\/h1>/);
  // Los Angeles does not publish visitors' hours: the place that carries them is unconfirmed there, and nothing says otherwise
  assert.doesNotMatch(la, /Hours from|sent by visitors|sent the same hours/); assert.equal(la.split('<span class="tag">Unconfirmed</span>').length - 1, 8);
  assert.match(la, /<strong>Los Angeles \+ Orange County · 10 late independents · 2 confirmed<\/strong><br>The hours of 2 of the 10 independent shops here are confirmed \(marked ✓\): 2 from the shop's own site or page\. The other 8 come from OpenStreetMap/);
  assert.match(la, /put the right hours in\. That puts the place on the list we check against the shop's own page\./);
  const cities = page(out, 'cities');
  assert.match(cities, /<tr><td><a href="\.\.\/nyc\/">New York City<\/a><\/td><td>220<\/td><td>110<\/td><td>220<\/td><\/tr>\n<tr><td><a href="\.\.\/chicago\/">Chicago<\/a><\/td><td>10<\/td><td>3<\/td><td>30<\/td><\/tr>/);
  const hub = page(out, 'nyc');
  assert.match(hub, /<div class="card note"><strong>New York City · 220 late independents · 110 confirmed<\/strong><\/div>/); assert.match(hub, /<a href="\.\.\/cities\/">/);
  const map = readFileSync(join(out, 'sitemap.xml'), 'utf8');
  for (const u of ['cities/', 'chicago/', 'la/', 'nyc/', 'nyc/hood-0/']) assert.ok(map.includes(`<loc>https://juicypasta.github.io/latecup/${u}</loc><lastmod>2026-12-06</lastmod>`), u);
  assert.doesNotMatch(map, /tiny|broken|gone/);
  assert.match(cities, /in the cities where we show those, that visitors of the app sent the same hours/);
  for (const html of [chi, cities, hub, la]) { assert.doesNotMatch(words(html), BANNED); assert.doesNotMatch(words(html), /—|!/); }

  // the next run: Chicago's file is half published. Its page stays as it is, the others are built again.
  const before = chi, feed2 = fakeFeed(join(scratch, 'feed-many-2'), { areas: [['chicago', 30], ['la', 50]], breakSha: ['chicago'] });
  const r2 = build(feed2, out);
  assert.equal(r2.status, 0, r2.stderr); assert.match(r2.stderr, /chicago: chicago\.json does not match the manifest's sha256; its page is left as it is/);
  assert.equal(page(out, 'chicago'), before); assert.match(page(out, 'la'), /<!-- area: la · places: 50 -->/); assert.match(page(out, 'cities'), /Chicago/);
  assert.match(r2.stdout, /1 city page built, 1 left as they were, and the list of cities/);
  // an area that shrinks to under half is not believed without --force
  const r3 = build(fakeFeed(join(scratch, 'feed-many-3'), { areas: [['chicago', 30], ['la', 21]] }), out);
  assert.equal(r3.status, 0); assert.match(r3.stderr, /la: 21 places, under half of the 50 its page was built from; its page is left as it is/); assert.match(page(out, 'la'), /places: 50 -->/);
  // a manifest that suddenly lists one area is refused whole; with --force the city pages go, and New York's stay
  const r4 = build(join(scratch, 'feed-one'), out);
  assert.equal(r4.status, 3); assert.match(r4.stderr, /the manifest lists 0 other areas, under half of the 2 that have pages/); assert.deepEqual(ls(join(out, 'latecup')), ['chicago', 'cities', 'la', 'nyc']);
  const r5 = build(join(scratch, 'feed-one'), out, '--force');
  assert.equal(r5.status, 0, r5.stderr); assert.deepEqual(ls(join(out, 'latecup')), ['nyc']); assert.doesNotMatch(readFileSync(join(out, 'sitemap.xml'), 'utf8'), /cities|chicago/);
  assert.equal(page(out, 'nyc'), page(join(scratch, 'one'), 'nyc'), 'and New York\'s hub is again what a one-area feed builds');
  // no area publishes visitors' hours: the list of cities does not mention them
  const out2 = join(scratch, 'quiet'), r6 = build(fakeFeed(join(scratch, 'feed-quiet'), { areas: [['la', 25]] }), out2);
  assert.equal(r6.status, 0, r6.stderr); assert.doesNotMatch(page(out2, 'cities') + page(out2, 'la') + page(out2, 'nyc'), /visitors of the app|Hours from \d+ visitors|sent by visitors/);
});
rmSync(scratch, { recursive: true });
console.log(`ok: ${n} tests`);
