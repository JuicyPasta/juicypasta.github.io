/* Latecup "late" rules (SPEC.md → What "late" means), shared by the web map and the
   neighbourhood-page generator (_tools/latecup-pages/). No dependencies.

   - City time: every calculation uses the city's time zone, never the visitor's clock.
   - Service day: a night belongs to the day it started on; it runs 05:00 → 05:00.
   - Hours table: 7 days, Monday first; each a list of [open, close] in minutes from that
     weekday's midnight; close may pass 1440. Intervals that touch across midnight are one
     stretch. A stretch of 24 h or more reads "Open 24 hours".
   All "rel" values are minutes from the service day's own midnight (so 01:30 the next
   morning is 1530). */
(function (root) {
  'use strict';
  var DAY = 1440, SERVICE_START = 300, SERVICE_END = DAY + SERVICE_START;
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var THRESHOLDS = [
    { id: '20', label: '8 PM+', rel: 1200 }, { id: '21', label: '9 PM+', rel: 1260 },
    { id: '22', label: '10 PM+', rel: 1320 }, { id: '23', label: '11 PM+', rel: 1380 },
    { id: '24', label: 'Midnight+', rel: 1440 }, { id: 'all', label: 'All night', rel: 1620 }
  ];
  var fmtCache = {};
  function partsIn(tz, date) {
    var f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    }));
    var o = {};
    f.formatToParts(date).forEach(function (p) { if (p.type !== 'literal') o[p.type] = +p.value; });
    if (o.hour === 24) o.hour = 0;
    return o;
  }
  function iso(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10); }
  function addDays(dateStr, n) {
    var p = dateStr.split('-'); return iso(+p[0], +p[1], +p[2] + n);
  }
  function dowOf(dateStr) { // 0 = Monday
    var p = dateStr.split('-'); return (new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay() + 6) % 7;
  }
  /* The city's wall clock right now, and the service day it belongs to. */
  function cityNow(tz, date) {
    date = date || new Date();
    var p = partsIn(tz, date), minutes = p.hour * 60 + p.minute, cal = iso(p.year, p.month, p.day);
    var service = minutes < SERVICE_START ? addDays(cal, -1) : cal;
    return { tz: tz, instant: date, calendarDate: cal, minutes: minutes, serviceDate: service,
             dow: dowOf(service), rel: minutes < SERVICE_START ? minutes + DAY : minutes };
  }
  /* The instant of a wall-clock time (service date + rel minutes) in the city. On the
     autumn night an hour repeats: take the first occurrence that is not before `notBefore`. */
  function instantOf(tz, serviceDate, rel, notBefore) {
    var p = serviceDate.split('-'), wall = Date.UTC(+p[0], +p[1] - 1, +p[2]) + rel * 60000, found = [];
    [-12, 0, 12].forEach(function (h) {
      var probe = new Date(wall + h * 3600000), q = partsIn(tz, probe);
      var off = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute) - Math.floor(probe.getTime() / 60000) * 60000;
      var cand = wall - off, c = partsIn(tz, new Date(cand));
      if (Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute) === wall && found.indexOf(cand) < 0) found.push(cand);
    });
    if (!found.length) { // a time the spring change skips: an hour later on the clock
      var q0 = partsIn(tz, new Date(wall)), off0 = Date.UTC(q0.year, q0.month - 1, q0.day, q0.hour, q0.minute) - wall;
      return new Date(wall - off0);
    }
    found.sort(function (a, b) { return a - b; });
    if (notBefore) for (var i = 0; i < found.length; i++) if (found[i] >= notBefore.getTime()) return new Date(found[i]);
    return new Date(found[found.length - 1]);
  }
  /* Merged stretches around a weekday, in rel minutes: yesterday through two days ahead. */
  function stretches(hours, dow) {
    var all = [];
    for (var k = -1; k <= 2; k++) {
      var day = hours[((dow + k) % 7 + 7) % 7] || [];
      for (var i = 0; i < day.length; i++) all.push([day[i][0] + k * DAY, day[i][1] + k * DAY]);
    }
    all.sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    all.forEach(function (iv) {
      var last = out[out.length - 1];
      if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]); else out.push([iv[0], iv[1]]);
    });
    return out;
  }
  function is24(s) { return s[1] - s[0] >= DAY; }
  /* Tomorrow's early opening (starts after midnight, runs past 05:00) is tomorrow's, not tonight's. */
  function isTomorrows(s) { return s[0] >= DAY && s[1] > SERVICE_END; }
  /* The stretch that decides "closes tonight" for a service day: the last one that starts
     before 05:00 the next morning and is still running after 05:00 this morning. */
  function tonight(hours, dow) {
    var ss = stretches(hours, dow), pick = null;
    ss.forEach(function (s) { if (s[0] < SERVICE_END && s[1] > SERVICE_START && !isTomorrows(s)) pick = s; });
    if (!pick) return null;
    return { open: pick[0], close: pick[1], allDay: is24(pick) };
  }
  /* The stretch open at a clock time (rel) on that service day, or null. */
  function openAt(hours, dow, rel) {
    var ss = stretches(hours, dow);
    for (var i = 0; i < ss.length; i++) if (ss[i][0] <= rel && rel < ss[i][1]) return { open: ss[i][0], close: ss[i][1], allDay: is24(ss[i]) };
    return null;
  }
  function matches(hours, dow, threshold) {
    if (threshold.id !== 'all') return openAt(hours, dow, threshold.rel);
    var late = openAt(hours, dow, threshold.rel), t = tonight(hours, dow); // all night: open at 03:00, or 24 hours
    return late || (t && t.allDay ? t : null);
  }
  /* Status right now. kind: open | soon | later | closed. */
  function status(hours, now) {
    var cur = openAt(hours, now.dow, now.rel);
    if (cur) {
      if (cur.allDay) return { kind: 'open', allDay: true, close: cur.close, left: Infinity };
      var left = Math.round((instantOf(now.tz, now.serviceDate, cur.close, now.instant) - now.instant) / 60000);
      return { kind: left < 60 ? 'soon' : 'open', close: cur.close, left: left };
    }
    var ss = stretches(hours, now.dow);
    for (var i = 0; i < ss.length; i++) if (ss[i][0] > now.rel && ss[i][0] < SERVICE_END) return { kind: 'later', open: ss[i][0], close: ss[i][1], allDay: is24(ss[i]) };
    for (var d = 1; d <= 7; d++) { // next opening on a later service day
      var day = hours[(now.dow + d) % 7] || [];
      if (day.length) return { kind: 'closed', nextDow: (now.dow + d) % 7, nextOpen: day[0][0], daysAhead: d };
    }
    return { kind: 'closed' };
  }
  /* plenty | under2 | soon, from minutes left. */
  function pinState(left) { return left < 60 ? 'soon' : left < 120 ? 'under2' : 'plenty'; }
  /* The chips to offer. Thresholds already past collapse into "Open now"; it is the default
     once the city clock passes 8 PM, and before that the default is 8 PM+. Another day: all six. */
  function chips(now, isToday) {
    if (!isToday) return { chips: THRESHOLDS.slice(), def: '20' };
    var future = THRESHOLDS.filter(function (t) { return t.rel > now.rel; });
    if (future.length === THRESHOLDS.length) return { chips: future, def: '20' };
    return { chips: [{ id: 'now', label: 'Open now', rel: null }].concat(future), def: 'now' };
  }
  function clock(rel) { // 1380 → "11 PM", 1500 → "1 AM", 1290 → "9:30 PM"
    var m = ((rel % DAY) + DAY) % DAY, h = Math.floor(m / 60), mm = m % 60, h12 = h % 12 || 12, ap = h < 12 ? 'AM' : 'PM';
    return h12 + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + ' ' + ap;
  }
  function pinLabel(st) { // short: "11", "9:30", "12 AM", "1 AM", "24h"
    if (st.allDay) return '24h';
    var m = ((st.close % DAY) + DAY) % DAY, h = Math.floor(m / 60), mm = m % 60, h12 = h % 12 || 12, t = h12 + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '');
    return h >= 12 ? t : t + ' AM';
  }
  function leftText(min) {
    if (min === Infinity) return '';
    if (min < 60) return min + ' min left';
    var h = Math.floor(min / 60), m = min % 60; return h + ' h' + (m ? ' ' + m + ' min' : '') + ' left';
  }
  /* What to print for one weekday row of the week table. */
  function dayText(hours, dow) {
    var ss = stretches(hours, dow), parts = [], full = false;
    ss.forEach(function (s) {
      if (s[0] <= 0 && s[1] >= DAY) full = true;
      else if (s[0] >= 0 && s[0] < DAY) { if (is24(s)) full = true; else parts.push(clock(s[0]) + ' – ' + clock(s[1])); }
    });
    return full ? 'Open 24 hours' : parts.length ? parts.join(', ') : 'Closed';
  }
  /* "Mon–Thu 10 PM · Fri–Sat 1 AM · Sun closed": usual closing time per night, grouped. */
  function weekClosings(hours) {
    var vals = [];
    for (var d = 0; d < 7; d++) { var t = tonight(hours, d); vals.push(!t ? 'closed' : t.allDay ? '24 hours' : clock(t.close)); }
    var groups = [], i = 0;
    while (i < 7) { var j = i; while (j + 1 < 7 && vals[j + 1] === vals[i]) j++; groups.push({ from: i, to: j, text: vals[i] }); i = j + 1; }
    if (groups.length === 1) return [{ days: 'Nightly', text: groups[0].text }];
    return groups.map(function (g) { return { days: g.from === g.to ? DOW[g.from] : DOW[g.from] + '–' + DOW[g.to], text: g.text }; });
  }
  /* Latest closing across the week, as rel minutes (24 h places = Infinity); for sorting. */
  function latestClose(hours) {
    var best = -1;
    for (var d = 0; d < 7; d++) { var t = tonight(hours, d); if (t) best = Math.max(best, t.allDay ? Infinity : t.close); }
    return best;
  }
  function sourceLine(p) {
    if (p.src === 'shop') return { confirmed: true, text: 'Hours confirmed ' + p.checked + " from the shop's website" };
    if (p.src === 'brand') return { confirmed: true, text: 'Hours confirmed ' + p.checked + " from the chain's store locator" };
    return { confirmed: false, text: 'Unconfirmed hours from OpenStreetMap' + (p.checked ? ' (last checked there ' + p.checked + ')' : '') + ': check before you go' };
  }
  var api = { DAY: DAY, SERVICE_START: SERVICE_START, SERVICE_END: SERVICE_END, DOW: DOW, THRESHOLDS: THRESHOLDS,
    cityNow: cityNow, instantOf: instantOf, addDays: addDays, dowOf: dowOf, stretches: stretches, tonight: tonight, openAt: openAt,
    matches: matches, status: status, pinState: pinState, chips: chips, clock: clock, pinLabel: pinLabel, leftText: leftText,
    dayText: dayText, weekClosings: weekClosings, latestClose: latestClose, sourceLine: sourceLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LatecupHours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
