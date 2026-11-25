/* Latecup visitor confirmations and ratings (SPEC.md → "Visitor confirmations and ratings"),
   shared by the web map and the neighbourhood-page generator. No dependencies, no DOM.

   - Totals come from the feed's votes file: {"ok": [n, newest date, how many were on site],
     "bad": [n, newest date], "stars": [mean, n]}; any of the three may be missing.
   - Two kinds of "confirmed", never merged in wording: ours (src shop/brand) and visitors'.
     The mark and the "Confirmed hours only" filter accept ours, or 2 or more visitors.
   - A place with a newer "hours wrong" report than its newest visitor confirmation reads
     "Reported wrong on DATE: being checked" and loses the mark.
   - What this page sends: type attest → note "v=1;iid=<uuid>;hh=<hash>;onsite=0" (the web
     never knows whether you are there, so onsite is always 0); type rate → "v=1;iid=<uuid>;stars=<1-5>".
   - The visitor's own confirmations and stars are kept in the browser (localStorage) with a
     random install ID (made the first time the visitor confirms or rates, not before), shown at
     once, and limited to one confirmation per place per day. */
(function (root) {
  'use strict';
  var KEY = 'latecup.v1', VISITORS_FOR_MARK = 2;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function shortDate(iso) { // "2026-11-25" → "Nov 25"
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? MONTHS[+m[2] - 1] + ' ' + (+m[3]) : '';
  }
  function num(a, i) { return a && typeof a[i] === 'number' && isFinite(a[i]) ? a[i] : 0; }
  /* Everything the UI needs to say about one place's confirmations and rating. */
  function summary(place, vote) {
    vote = vote || {};
    var ok = num(vote.ok, 0) > 0 ? { n: Math.floor(num(vote.ok, 0)), date: String(vote.ok[1] || ''), onsite: Math.floor(num(vote.ok, 2)) } : null;
    var bad = num(vote.bad, 0) > 0 ? { n: Math.floor(num(vote.bad, 0)), date: String(vote.bad[1] || '') } : null;
    var stars = num(vote.stars, 1) > 0 && num(vote.stars, 0) >= 1 && num(vote.stars, 0) <= 5 ? { mean: Math.round(vote.stars[0] * 10) / 10, n: Math.floor(vote.stars[1]) } : null;
    var ours = place.src === 'shop' || place.src === 'brand';
    var flagged = !!bad && (!ok || bad.date > ok.date);
    return {
      ours: ours, ok: ok, bad: bad, stars: stars, flagged: flagged,
      byVisitors: !flagged && !!ok && ok.n >= VISITORS_FOR_MARK,
      marked: !flagged && (ours || (!!ok && ok.n >= VISITORS_FOR_MARK)),
      visitorLine: ok ? (ok.n === 1 ? '1 visitor confirmed these hours' + (ok.date ? ' · ' + shortDate(ok.date) : '')
        : ok.n + ' visitors confirmed these hours' + (ok.date ? ' · latest ' + shortDate(ok.date) : '')) : '',
      flaggedLine: flagged ? 'Reported wrong' + (bad.date ? ' on ' + shortDate(bad.date) : '') + ': being checked' : '',
      starsLine: stars ? stars.mean.toFixed(1) + ' · ' + stars.n + (stars.n === 1 ? ' rating' : ' ratings') : ''
    };
  }
  function attestNote(iid, hh) { return 'v=1;iid=' + iid + ';hh=' + hh + ';onsite=0'; }
  function rateNote(iid, stars) { return 'v=1;iid=' + iid + ';stars=' + stars; }
  function uuid(c) { // RFC 4122 version 4
    c = c || (typeof crypto !== 'undefined' ? crypto : null);
    if (c && c.randomUUID) return c.randomUUID();
    var b = [], i;
    if (c && c.getRandomValues) { var a = new Uint8Array(16); c.getRandomValues(a); for (i = 0; i < 16; i++) b.push(a[i]); }
    else for (i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /* The visitor's own record. `storage` is localStorage or anything with getItem/setItem;
     when it is missing or refuses (private mode) the record lives for this page view only. */
  function load(storage) { // reading never creates anything: the ID is made on the first confirmation or rating
    var s = null;
    try { s = JSON.parse((storage && storage.getItem(KEY)) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    return { iid: UUID.test(s.iid || '') ? s.iid : null, ok: s.ok && typeof s.ok === 'object' ? s.ok : {}, stars: s.stars && typeof s.stars === 'object' ? s.stars : {} };
  }
  function ensureId(state, c) { if (!state.iid) state.iid = uuid(c); return state.iid; }
  function save(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }
  /* The visitor's confirmation of the hours table now shown, or null (an old one for other hours doesn't count). */
  function myAttest(state, place) {
    var a = state.ok[place.id]; return a && place.hh && a.hh === place.hh ? a : null;
  }
  /* One confirmation per place per day; a changed hours table may be confirmed again at once. */
  function canAttest(state, place, today) {
    if (!place.hh) return false;
    var a = myAttest(state, place); return !(a && a.d === today);
  }
  function recordAttest(state, place, today) { state.ok[place.id] = { d: today, hh: place.hh }; return state; }
  function myStars(state, place) { var n = state.stars[place.id]; return n >= 1 && n <= 5 ? n : 0; }
  function recordStars(state, place, n) { state.stars[place.id] = n; return state; }
  function myAttestLine(a, today) { return a ? 'You confirmed these hours ' + (a.d === today ? 'today' : 'on ' + shortDate(a.d)) : ''; }
  var api = { KEY: KEY, VISITORS_FOR_MARK: VISITORS_FOR_MARK, shortDate: shortDate, summary: summary, attestNote: attestNote, rateNote: rateNote, uuid: uuid,
    load: load, ensureId: ensureId, save: save, myAttest: myAttest, canAttest: canAttest, recordAttest: recordAttest, myStars: myStars, recordStars: recordStars, myAttestLine: myAttestLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LatecupVotes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
