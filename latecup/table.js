/* The week of hours a visitor sends (SPEC.md → "1.1: every US city" → "What clients send,
   added"), and the model behind the week editor. No dependencies, no DOM.

   - <table>: seven day parts joined by ".", Monday first. A day part is "x" (closed) or one
     to four spans "open-close" joined by ",", in minutes from that day's midnight; close may
     pass 1440. "480-1380.480-1380.480-1380.480-1380.480-1500.480-1500.540-1320"
   - It must be a valid feed table: 0 ≤ open < 1440, open < close ≤ open + 1440, a day's
     spans sorted with a gap between them, and a span that runs past midnight over before the
     next day's first one opens.
   - fix: v=2;iid=<uuid>;hh=<hash, or 0 for a place with no hours>;t=<table>
     add: v=2;iid=<uuid>;ll=<lat>,<lon>;c=<coffee|tea|dessert>;t=<table>[;w=<link, percent-encoded>]
   - The report sheet passes a note on only when it matches its pattern exactly, and blanks
     it otherwise (Latecup/marketing/report-form.md). FIX and ADD below are those patterns:
     a note is built here, checked against them, and never sent in another shape. */
(function (root) {
  'use strict';
  var DAY = 1440, MAX_SPANS = 4, NOTE_MAX = 600, LINK_MAX = 300;
  var PART = '(?:x|[0-9]{1,4}-[0-9]{1,4}(?:,[0-9]{1,4}-[0-9]{1,4}){0,3})';
  var TABLE = '(?:' + PART + '\\.){6}' + PART;
  var TABLE_RE = new RegExp('^' + TABLE + '$');
  var FIX = new RegExp('^v=2;iid=[0-9A-Fa-f-]{36};hh=[0-9A-Za-z_-]{1,40};t=' + TABLE + '$');
  var ADD = new RegExp('^(v=2;iid=[0-9A-Fa-f-]{36};ll=-?[0-9]{1,2}\\.[0-9]{3,6},-?[0-9]{1,3}\\.[0-9]{3,6};c=(?:coffee|tea|dessert);t=' + TABLE + ')(?:;w=.{0,300})?$');
  var CATS = ['coffee', 'tea', 'dessert'];
  function whole(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x; }

  /* '' for a valid feed table, otherwise what is wrong with it: days | span | open | close | order | midnight. */
  function check(t) {
    var d, i, j;
    if (!Array.isArray(t) || t.length !== 7) return 'days';
    for (d = 0; d < 7; d++) {
      var day = t[d], prev = null;
      if (!Array.isArray(day)) return 'days';
      for (i = 0; i < day.length; i++) {
        var s = day[i];
        if (!Array.isArray(s) || s.length !== 2 || !whole(s[0]) || !whole(s[1])) return 'span';
        if (s[0] < 0 || s[0] >= DAY) return 'open';
        if (s[1] <= s[0] || s[1] > s[0] + DAY) return 'close';
        if (prev !== null && s[0] <= prev) return 'order'; // sorted, and neither touching nor overlapping
        prev = s[1];
      }
    }
    for (d = 0; d < 7; d++) { // a span that runs past midnight must not reach into the next day's spans
      var next = t[(d + 1) % 7];
      for (i = 0; i < t[d].length; i++) if (t[d][i][1] > DAY) for (j = 0; j < next.length; j++) if (next[j][0] < t[d][i][1] - DAY) return 'midnight';
    }
    return '';
  }
  /* A valid table with at most four spans a day → the string; anything else → null. */
  function encode(t) {
    if (check(t)) return null;
    for (var d = 0; d < 7; d++) if (t[d].length > MAX_SPANS) return null;
    return t.map(function (day) { return day.length ? day.map(function (s) { return s[0] + '-' + s[1]; }).join(',') : 'x'; }).join('.');
  }
  /* The string → the table, or null when it is not one or not a valid week. */
  function decode(text) {
    if (typeof text !== 'string' || !TABLE_RE.test(text)) return null;
    var t = text.split('.').map(function (part) {
      return part === 'x' ? [] : part.split(',').map(function (s) { var p = s.split('-'); return [+p[0], +p[1]]; });
    });
    return check(t) ? null : t;
  }
  /* ---------- the week editor's model ----------
     { same: bool, days: [7 × { state: 'open' | 'closed' | 'all', spans: [[open, close], …] }] }
     Times are clock minutes (0..1439), or null while a field is empty; a close at or before
     its open is the next morning. With `same`, the first day stands for the whole week.
     The model holds the feed's own days, span for span: nothing is merged, split or written
     another way, and an after-midnight tail such as [0, 120] stays on the day the feed has it
     on. So a day the visitor does not touch goes back out exactly as it came in. The pipeline
     counts on that: it compares which days are empty, and holds a whole table for review when
     an untouched day arrives re-written. */
  function blankDay() { return { state: 'open', spans: [[null, null]] }; }
  function copyDay(day) { return { state: day.state, spans: day.spans.map(function (s) { return [s[0], s[1]]; }) }; }
  function blank() { var days = []; for (var d = 0; d < 7; d++) days.push(blankDay()); return { same: true, days: days }; }
  function rows(table) { // the feed's table → the editor, day for day
    var days = table.map(function (day) {
      if (!day.length) return { state: 'closed', spans: [[null, null]] };
      if (day.length === 1 && day[0][0] === 0 && day[0][1] === DAY) return { state: 'all', spans: [[null, null]] };
      return { state: 'open', spans: day.map(function (s) { return [s[0], s[1] % DAY]; }) };
    });
    var first = JSON.stringify(days[0]);
    return { same: days.every(function (day) { return JSON.stringify(day) === first; }), days: days };
  }
  function setSame(model, on) { // "Same hours each day": the first day becomes the week, or the week opens up again
    if (!on && model.same) for (var d = 1; d < 7; d++) model.days[d] = copyDay(model.days[0]);
    model.same = !!on;
    return model;
  }
  function clockMin(x) { return whole(x) && x >= 0 && x < DAY; }
  function build(day) { // one day of the editor → its spans, or what is wrong with it
    var spans = [], out = [], i;
    if (day.state === 'closed') return { spans: [] };
    if (day.state === 'all') return { spans: [[0, DAY]] };
    for (i = 0; i < day.spans.length; i++) {
      var o = day.spans[i][0], c = day.spans[i][1];
      if (o === null && c === null && day.spans.length > 1) continue; // an extra line left empty
      if (!clockMin(o) || !clockMin(c)) return { error: 'blank' };
      spans.push([o, c > o ? c : c + DAY]);
    }
    if (!spans.length) return { error: 'blank' };
    spans.sort(function (a, b) { return a[0] - b[0]; });
    for (i = 0; i < spans.length; i++) {
      var last = out[out.length - 1];
      if (last && spans[i][0] < last[1]) return { error: 'overlap' };
      if (last && spans[i][0] === last[1]) { // touching: one opening, which may not be longer than a day
        if (spans[i][1] - last[0] > DAY) return { error: 'overlap' };
        last[1] = spans[i][1];
      } else out.push(spans[i]);
    }
    return { spans: out };
  }
  /* The editor → { table, touched } or { error, day }. `feed` is the table the editor was filled
     from (none for an empty editor): a day whose fields still say what the feed says is that
     day of the feed, untouched.
     error: blank (a time is missing) | overlap (two openings of one day run into each other) |
     midnight (a night runs on past the end of the next day's first opening).
     A night that only runs into the next day's first opening is kept: "Friday until 1:30 AM"
     with "Saturday 24 hours" are the same hours whichever day gives way. The day the visitor
     touched gives way, never a day they left alone. */
  function table(model, feed) {
    var t = [], touched = [], d;
    for (d = 0; d < 7; d++) {
      var r = build(model.days[model.same ? 0 : d]);
      if (r.error) return { error: r.error, day: d };
      touched.push(!feed || JSON.stringify(r.spans) !== JSON.stringify(feed[d]));
      t.push(r.spans);
    }
    for (d = 0; d < 7; d++) {
      var e = (d + 1) % 7, night = t[d][t[d].length - 1], first = t[e][0];
      if (!night || night[1] <= DAY || !first || first[0] >= night[1] - DAY) continue;
      if (first[1] < night[1] - DAY || (!touched[d] && !touched[e])) return { error: 'midnight', day: d }; // it runs on past that opening's end: the two cannot both be meant
      if (touched[d]) night[1] = DAY + first[0];            // the visitor's night stops where the next day takes over
      else if (first[1] === night[1] - DAY) t[e].shift();   // the visitor's opening lies inside a night the feed already has
      else first[0] = night[1] - DAY;                       // the visitor's opening starts where the feed's night ends
    }
    var bad = check(t);
    return bad ? { error: bad, day: -1 } : { table: t, touched: touched };
  }

  /* ---------- the notes ---------- */
  function fixNote(iid, hh, t) {
    var enc = encode(t); if (!enc) return null;
    var note = 'v=2;iid=' + iid + ';hh=' + (hh == null || hh === '' ? '0' : hh) + ';t=' + enc;
    return FIX.test(note) ? note : null;
  }
  function pct(s) { try { return encodeURIComponent(s); } catch (e) { return null; } } // null: half a character at the cut
  function linkPart(link, room) { // ";w=<link>", cut on a whole character so that it fits the sheet's pattern and the note's length
    var raw = String(link == null ? '' : link).replace(/\s+/g, ' ').trim(), max = Math.min(LINK_MAX, room - 3), enc = pct(raw);
    while (raw && (enc === null || enc.length > max)) { raw = raw.slice(0, -1); enc = pct(raw); }
    return raw ? ';w=' + enc : '';
  }
  function addNote(iid, lat, lon, cat, t, link) {
    var enc = encode(t);
    if (!enc || typeof lat !== 'number' || typeof lon !== 'number' || !isFinite(lat) || !isFinite(lon) || CATS.indexOf(cat) < 0) return null;
    var head = 'v=2;iid=' + iid + ';ll=' + lat.toFixed(5) + ',' + lon.toFixed(5) + ';c=' + cat + ';t=' + enc;
    var note = head + linkPart(link, NOTE_MAX - head.length);
    return ADD.test(note) ? note : null;
  }
  var api = { DAY: DAY, MAX_SPANS: MAX_SPANS, NOTE_MAX: NOTE_MAX, CATS: CATS, FIX: FIX, ADD: ADD, check: check, encode: encode, decode: decode,
    blank: blank, blankDay: blankDay, rows: rows, setSame: setSame, table: table, fixNote: fixNote, addNote: addNote };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LatecupTable = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
