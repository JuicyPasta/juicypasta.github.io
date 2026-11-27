/* Latecup "late" rules (SPEC.md → What "late" means), shared by the web map and the
   neighborhood-page generator (_tools/latecup-pages/). No dependencies.

   - City time: every calculation uses the city's time zone, never the visitor's clock.
   - Service day: a night belongs to the day it started on; it runs 05:00 → 05:00.
   - Hours table: 7 days, Monday first; each a list of [open, close] in minutes from that
     weekday's midnight; close may pass 1440. Intervals that touch across midnight are one
     stretch. A stretch reads "Open 24 hours" only when it is 24 h or longer AND runs at
     least to 05:00 the next morning; a long stretch that ends earlier tonight shows its
     closing time like any other (the last night of a 24-hour run closes at midnight).
   - Chips: looking at tonight, "Open now" is always first and thresholds already past are
     dropped; the default is 8 PM+ while it is still ahead, Open now after that.
   All "rel" values are minutes from the service day's own midnight (so 01:30 the next
   morning is 1530). */
(function (root) {
  'use strict';
  var DAY = 1440, SERVICE_START = 300, SERVICE_END = DAY + SERVICE_START;
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
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
  /* 24 hours: 24 h or longer and still running at 05:00 the next morning (s is in the service day's rel minutes). */
  function is24(s) { return s[1] - s[0] >= DAY && s[1] >= SERVICE_END; }
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
  /* A threshold chip: open at that clock time tonight, strictly (open ≤ T < close). All night is open at 03:00, nothing else. */
  function matches(hours, dow, threshold) { return openAt(hours, dow, threshold.rel); }
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
    for (var d = 1; d <= 7; d++) { // the next opening on a later day: a stretch that BEGINS that day, never the tail of the night before
      var dw = (now.dow + d) % 7, ds = stretches(hours, dw);
      for (var j = 0; j < ds.length; j++) if (ds[j][0] >= 0 && ds[j][0] < DAY && ds[j][0] + d * DAY > now.rel) return { kind: 'closed', nextDow: dw, nextOpen: ds[j][0], daysAhead: d };
    }
    return { kind: 'closed' };
  }
  /* What the list row and the place say about TONIGHT. The line and the large line never
     contradict the status, and they describe the stretch the pin shows (`shown`: {open, close,
     allDay}; null when the place is looked at without a pin):
     - open in that stretch            → "Open until T · time left"; large: T (or 24 hours)
     - open now, pin shows a later one → "Open until X · reopens A until B"; large: B
     - not open yet today              → "Opens A · open until B"; large: "Opens at A"
     - closed for the night            → "Closed · opens DAY at A"; large: "Closed at T"
     Returns { line, cls, big, caption, long, left }. */
  function tonightView(hours, now, shown) {
    var st = status(hours, now), open = st.kind === 'open' || st.kind === 'soon';
    if (open && (st.allDay || !shown || shown.close === st.close)) {
      if (st.allDay) return { line: 'Open 24 hours', cls: '', big: '24 hours', caption: 'open tonight', left: Infinity };
      var ps = pinState(st.left);
      return { line: 'Open until ' + clock(st.close) + ' · ' + leftText(st.left), cls: ps === 'plenty' ? '' : ps, big: clock(st.close), caption: 'closes tonight', left: st.left };
    }
    if (open) return { line: 'Open until ' + clock(st.close) + ' · reopens ' + clock(shown.open) + (shown.allDay ? ', then open 24 hours' : ' until ' + clock(shown.close)), cls: '',
      big: shown.allDay ? '24 hours' : clock(shown.close), caption: shown.allDay ? 'open tonight' : 'closes tonight' };
    if (st.kind === 'later') {
      var end = shown && shown.open > st.open ? shown : st; // a split day: the next opening, then the stretch the pin shows
      return { line: 'Opens ' + clock(st.open) + ' · ' + (end.allDay ? 'then open 24 hours' : (end === st ? 'open until ' : 'tonight until ') + clock(end.close)), cls: '',
        big: 'Opens at ' + clock(st.open), caption: '', long: true };
    }
    var t = tonight(hours, now.dow), next = st.nextDow != null ? ' · opens ' + DAYS[st.nextDow] + ' at ' + clock(st.nextOpen) : '';
    if (t && !t.allDay && t.close <= now.rel) return { line: 'Closed' + next, cls: 'off', big: 'Closed at ' + clock(t.close), caption: '', long: true };
    return { line: 'Closed' + next, cls: 'off', big: 'Closed', caption: 'not open tonight' };
  }
  /* The same for another night (the day picker): the stretch the pin shows, or that night's last one. */
  function nightView(hours, dow, shown, night) {
    var s = shown || tonight(hours, dow);
    if (!s) return { line: 'Closed that night', cls: 'off', big: 'Closed', caption: 'not open ' + night };
    if (s.allDay) return { line: 'Open 24 hours', cls: '', big: '24 hours', caption: 'open ' + night };
    return { line: s.open <= 0 ? 'Open until ' + clock(s.close) : 'Open ' + clock(s.open) + ' – ' + clock(s.close), cls: '', big: clock(s.close), caption: 'closes ' + night };
  }
  /* plenty | under2 | soon, from minutes left. */
  function pinState(left) { return left < 60 ? 'soon' : left < 120 ? 'under2' : 'plenty'; }
  /* The chips to offer. Looking at tonight: "Open now" first, then the thresholds still ahead;
     the default is 8 PM+ while it is ahead and Open now after that. Another day: all six, 8 PM+. */
  function chips(now, isToday) {
    if (!isToday) return { chips: THRESHOLDS.slice(), def: '20' };
    var future = THRESHOLDS.filter(function (t) { return t.rel > now.rel; });
    return { chips: [{ id: 'now', label: 'Open now', rel: null }].concat(future), def: future.length && future[0].id === '20' ? '20' : 'now' };
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
  /* What to print for one weekday row of the week table (the app's Night.display):
     - a stretch already running at this day's midnight and still open past 05:00: alone,
       "Open 24 hours", when it runs on through the night; otherwise "Open until T"
       (the last day of a 24-hour run);
     - stretches that begin later this day: "A – B", or "Open from A" when the stretch then
       runs round the clock (the opening is not hidden behind "24 hours").
     A tail that ends before 05:00 belongs to yesterday's row. */
  function dayText(hours, dow) {
    var ss = stretches(hours, dow), parts = [];
    for (var i = 0; i < ss.length; i++) {
      var s = ss[i];
      if (s[0] <= 0 && s[1] > SERVICE_START) { if (is24(s)) return 'Open 24 hours'; parts.push('Open until ' + clock(s[1])); }
      else if (s[0] > 0 && s[0] < DAY) parts.push(is24(s) ? 'Open from ' + clock(s[0]) : clock(s[0]) + ' – ' + clock(s[1]));
    }
    return parts.length ? parts.join(', ') : 'Closed';
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
  function sourceLine(p, visitorsOn) { // visitorsOn: the place's area publishes hours that visitors sent (its manifest entry says "visitors": true)
    if (p.src === 'shop') return { confirmed: true, text: 'Hours confirmed ' + p.checked + " from the shop's own site or page" }; // website, ordering page or official social account
    if (p.src === 'brand') return { confirmed: true, text: 'Hours confirmed ' + p.checked + " from the chain's store locator" };
    if (p.src === 'visitors' && visitorsOn !== true) return { confirmed: false, text: 'Unconfirmed hours: check before you go' }; // not published as visitors' hours here, so not shown as that
    if (p.src === 'visitors') { // sent by visitors who agree with each other (the feed's `visitors` is how many; `checked` is the day of the newest)
      var n = p.visitors >= 1 ? Math.floor(p.visitors) : 0, m = /^\d{4}-(\d\d)-(\d\d)$/.exec(p.checked || '');
      return { confirmed: true, text: 'Hours from ' + (n === 1 ? '1 visitor' : n ? n + ' visitors' : 'visitors') +
        (m ? (n === 1 ? ' · ' : ' · latest ') + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[1] - 1] + ' ' + (+m[2]) : '') };
    }
    return { confirmed: false, text: 'Unconfirmed hours from OpenStreetMap' + (p.checked ? ' (last checked there ' + p.checked + ')' : '') + ': check before you go' };
  }
  var api = { DAY: DAY, SERVICE_START: SERVICE_START, SERVICE_END: SERVICE_END, DOW: DOW, DAYS: DAYS, tonightView: tonightView, nightView: nightView, THRESHOLDS: THRESHOLDS,
    cityNow: cityNow, instantOf: instantOf, addDays: addDays, dowOf: dowOf, stretches: stretches, tonight: tonight, openAt: openAt,
    matches: matches, status: status, pinState: pinState, chips: chips, clock: clock, pinLabel: pinLabel, leftText: leftText,
    dayText: dayText, weekClosings: weekClosings, latestClose: latestClose, sourceLine: sourceLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LatecupHours = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
