/* Latecup web map. Static: loads the public feed (manifest.json + nyc.json), draws it with
   MapLibre GL JS, and applies the same "late" rules as the app (hours.js).
   Network: the feed, the map style/tiles, and a report only when the visitor sends one.
   Location is asked only on "Near me", used in the page, and never sent anywhere. */
(function () {
  'use strict';
  var H = window.LatecupHours, V = window.LatecupVotes;
  var FEED = 'https://juicypasta.github.io/latecup-data/v1/';
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (local && new URLSearchParams(location.search).get('feed')) FEED = new URLSearchParams(location.search).get('feed'); // tests only
  var FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
  /* The report form (Latecup/marketing/report-form.md). The manifest's `report` block wins when set. */
  var REPORT_FALLBACK = window.LATECUP_REPORT || null;
  var APP = 'web 1';
  var C = { plenty: '#F5B14C', under2: '#F0873A', soon: '#F2604A', closed: '#3A404A', halo: '#0E1116', onPin: '#1A1408', onClosed: '#B4AEA3' };
  var CAT = { coffee: 'Coffee', tea: 'Tea & boba', dessert: 'Dessert café' };
  var TAG = { wifi: 'Wi-Fi', outdoor: 'Outdoor seating', seating: 'Seating', laptop: 'Laptop-friendly' };
  var KINDS = [['hours', 'The hours are wrong'], ['closed', 'It has closed for good'], ['notcafe', "It isn't a café"], ['other', 'Something else']];
  var PAGE = 30;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = { manifest: null, city: null, places: [], byId: {}, now: null, day: 0, chip: null, chipTouched: false, q: '', indie: false, confirmed: false,
            user: null, hood: null, shown: PAGE, selected: null, matched: [], map: null, ready: false, lastChips: '', votes: {}, mine: null, thanks: {} };

  function testNow() { // ?now=2026-11-27T02:30:00Z on localhost, for tests
    var v = local && new URLSearchParams(location.search).get('now'); return v ? new Date(v) : new Date();
  }
  var store = null; try { store = window.localStorage; store.getItem('x'); } catch (e) { store = null; }
  function mine() { return S.mine || (S.mine = V.load(store)); } // the visitor's own confirmations, stars and random ID
  function sum(p) { return V.summary(p, S.votes[p.id]); }
  /* Confirmations and ratings go only to the feed's own endpoint, and only for a place whose hours table has a hash. */
  function voteTarget(p) { var r = S.manifest && S.manifest.report; return r && r.kind === 'google_form' && r.url && r.fields && p.hh ? r : null; }
  function dayInfo() { // the service day being looked at
    var date = H.addDays(S.now.serviceDate, S.day);
    return { date: date, dow: H.dowOf(date), isToday: S.day === 0 };
  }
  function chipSet() { return H.chips(S.now, S.day === 0); }
  function currentChip() {
    var set = chipSet(), ids = set.chips.map(function (c) { return c.id; });
    if (!S.chipTouched) S.chip = set.def;
    else if (ids.indexOf(S.chip) < 0) S.chip = ids.indexOf('now') >= 0 ? 'now' : set.def; // a chosen time that has passed collapses into Open now
    return set.chips.filter(function (c) { return c.id === S.chip; })[0];
  }
  /* One place against the current chip and night → the stretch its pin shows and what the row
     and the place say about it (hours.js: the three always agree), or null when it doesn't match. */
  function evaluate(p, chip, di) {
    var shown = chip.id === 'now' ? H.openAt(p.hours, S.now.dow, S.now.rel) : H.matches(p.hours, di.dow, chip);
    if (!shown) return null;
    var view = di.isToday ? H.tonightView(p.hours, S.now, shown) : H.nightView(p.hours, di.dow, shown, nightName(di));
    return { shown: shown, view: view, close: shown.close, allDay: shown.allDay, state: view.left != null && view.left !== Infinity ? H.pinState(view.left) : 'plenty' };
  }
  /* The place panel: the pin's stretch when the place is on the map under this chip, otherwise what it is doing now (or that night). */
  function placeView(p, di) {
    var ev = evaluate(p, currentChip(), di);
    return ev ? ev.view : di.isToday ? H.tonightView(p.hours, S.now, null) : H.nightView(p.hours, di.dow, null, nightName(di));
  }
  function miles(a, b) {
    var R = 3958.8, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function distText(mi) { return (mi < 0.1 ? '< 0.1' : mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' mi · ' + Math.max(1, Math.round(mi * 20)) + ' min walk'; }
  function holidayFor(date) {
    var hs = (S.manifest && S.manifest.holidays) || [];
    for (var i = 0; i < hs.length; i++) if (hs[i].date === date) return hs[i];
    return null;
  }
  function nightName(di) {
    if (di.isToday) return 'tonight';
    return new Date(di.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) + ' night';
  }

  /* ---------- filter + draw ---------- */
  function compute() {
    var chip = currentChip(), di = dayInfo(), q = S.q.trim().toLowerCase(), out = [];
    S.places.forEach(function (p) {
      if (S.indie && p.chain) return;
      if (S.confirmed && !sum(p).marked) return;
      if (S.hood && p.hood !== S.hood) return; // a neighborhood page's link: exactly that neighborhood
      if (q && (p.name + ' ' + p.addr + ' ' + p.hood + ' ' + p.boro).toLowerCase().indexOf(q) < 0) return;
      var ev = evaluate(p, chip, di);
      if (ev) out.push({ p: p, ev: ev });
    });
    S.matched = out;
    return { chip: chip, di: di };
  }
  function geojson() {
    return { type: 'FeatureCollection', features: S.matched.map(function (m) {
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [m.p.lon, m.p.lat] },
        properties: { id: m.p.id, label: H.pinLabel(m.ev.shown), state: m.ev.state, chain: m.p.chain ? 1 : 0, sort: m.ev.allDay ? -9999 : -m.ev.close } };
    }) };
  }
  function renderChips(ctx) {
    var set = chipSet(), key = set.chips.map(function (c) { return c.id; }).join() + '|' + S.chip;
    if (key !== S.lastChips) {
      S.lastChips = key;
      $('chips').innerHTML = set.chips.map(function (c) {
        return '<button type="button" class="chip" data-chip="' + c.id + '" aria-pressed="' + (c.id === ctx.chip.id) + '">' + esc(c.label) + '</button>';
      }).join('');
    }
  }
  function renderClock(ctx) {
    var t = S.now, cal = new Date(t.calendarDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    var text = 'New York time: ' + cal + ' ' + H.clock(t.minutes);
    if (t.calendarDate !== t.serviceDate) text += ' · still ' + new Date(t.serviceDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) + ' night';
    $('clock').textContent = text;
    var hol = holidayFor(ctx.di.date), b = $('holiday');
    if (hol) { b.hidden = false; b.textContent = hol.name + (ctx.di.isToday ? ' today' : ' that day') + ': hours may differ. Check with the shop before you go.'; } else b.hidden = true;
  }
  function inView() {
    if (!S.ready || S.q.trim() || S.hood) return S.matched;
    var b = S.map.getBounds();
    return S.matched.filter(function (m) { return b.contains([m.p.lon, m.p.lat]); });
  }
  function renderList(ctx) {
    var rows = inView().slice(), total = S.matched.length;
    if (S.user) rows.forEach(function (m) { m.d = miles(S.user, m.p); });
    rows.sort(S.user ? function (a, b) { return a.d - b.d; }
      : function (a, b) { return (b.ev.allDay ? 1e6 : b.ev.close) - (a.ev.allDay ? 1e6 : a.ev.close) || (a.p.chain ? 1 : 0) - (b.p.chain ? 1 : 0) || a.p.name.localeCompare(b.p.name); });
    var what = ctx.chip.id === 'now' ? 'open now' : ctx.chip.id === 'all' ? 'open all night' : 'open at ' + ctx.chip.label.replace('+', '').replace('Midnight', 'midnight');
    var when = ctx.chip.id === 'now' ? '' : ' ' + nightName(ctx.di);
    // every number here is the length of a list: the one below, or the neighborhood's own page
    if (S.hood) {
      var all = S.places.filter(function (p) { return p.hood === S.hood; }).length;
      $('count').innerHTML = esc(S.hood) + ': ' + total + ' of its ' + all + (all === 1 ? ' place ' : ' places ') + esc(what + when) + (S.q.trim() ? ' matching "' + esc(S.q.trim()) + '"' : '') +
        (S.indie || S.confirmed ? ' with these filters' : '') + ' <button type="button" id="clearhood">Whole city</button>';
    } else $('count').textContent = S.q.trim() ? total + (total === 1 ? ' place ' : ' places ') + what + when + ' matching "' + S.q.trim() + '"'
      : rows.length + ' in view · ' + total + ' across the city ' + what + when + (S.user ? ' · nearest first' : ' · latest closing first');
    var html = rows.slice(0, S.shown).map(function (m) {
      var st = { cls: m.ev.view.cls, text: m.ev.view.line }, v = sum(m.p);
      return '<li><button type="button" class="row" data-id="' + esc(m.p.id) + '"><span class="top"><span class="nm">' + esc(m.p.name) + '</span>' +
        (S.user ? '<span class="dist">' + distText(m.d) + '</span>' : '') + '</span>' +
        '<span class="hood">' + esc(m.p.hood) + ' · ' + esc(CAT[m.p.cat] || m.p.cat) + '</span>' +
        '<span class="st ' + st.cls + '">' + (v.marked ? '<span class="ck" title="' + (v.ours ? 'Hours confirmed from the shop' : 'Hours confirmed by visitors') + '">✓</span>' : '') + esc(st.text) +
        (v.marked ? '' : v.flagged ? ' · reported wrong' : ' · unconfirmed') + (v.stars ? ' · ★ ' + v.stars.mean.toFixed(1) : '') + '</span></button></li>';
    }).join('');
    $('rows').innerHTML = html || '<li class="empty">' + (total ? 'Nothing in this part of the map. Zoom out or move the map.' : 'No places match. Try an earlier time or clear the filters.') + '</li>';
    $('more').hidden = rows.length <= S.shown;
  }
  function refresh(opts) {
    if (!S.places.length) return;
    S.now = H.cityNow(S.city.tz, testNow());
    var ctx = compute();
    renderChips(ctx); renderClock(ctx);
    if (S.ready && !(opts && opts.listOnly)) S.map.getSource('places').setData(geojson());
    renderList(ctx);
    if (S.selected && !(opts && opts.keepPanel)) renderPlace(S.byId[S.selected], true);
  }

  /* ---------- place panel ---------- */
  function renderPlace(p, quiet) {
    if (!p) return;
    var di = dayInfo(), view = placeView(p, di), st = { cls: view.cls, text: view.line }, src = H.sourceLine(p), hol = holidayFor(di.date);
    var big = view.big, bigsub = view.caption, flagged = sum(p).flagged; // the large line follows the status; a reported-wrong place loses its mark
    var rows = H.DOW.map(function (d, i) { return '<tr' + (i === di.dow ? ' class="today"' : '') + '><td>' + d + '</td><td>' + esc(H.dayText(p.hours, i)) + '</td></tr>'; }).join('');
    var apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
    var dir = apple ? 'https://maps.apple.com/?daddr=' + p.lat + ',' + p.lon + '&dirflg=w' : 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon;
    var acts = '<a class="go" href="' + dir + '" target="_blank" rel="noopener">Directions</a>';
    if (p.web && /^https?:\/\//i.test(p.web)) acts += '<a href="' + esc(p.web) + '" target="_blank" rel="noopener nofollow">Website</a>';
    if (p.phone && /^\+?[\d ]+$/.test(p.phone)) acts += '<a href="tel:' + esc(p.phone) + '">Call</a>';
    if (p.ig && /^[\w.]+$/.test(p.ig)) acts += '<a href="https://www.instagram.com/' + esc(p.ig) + '/" target="_blank" rel="noopener nofollow">Instagram</a>';
    acts += '<button type="button" id="share">Copy link</button>';
    var tags = (p.tags || []).map(function (x) { return TAG[x]; }).filter(Boolean).join(' · ');
    var prev = quiet && document.querySelector('#place details.wrong');
    if (prev && (prev.open || prev.dataset.sent)) { // don't wipe a report being written
      document.querySelector('#place .st').className = 'st ' + st.cls; document.querySelector('#place .st').textContent = st.text;
      document.querySelector('#place .big').className = 'big' + (view.long ? ' long' : ''); document.querySelector('#place .big').textContent = big; document.querySelector('#place .bigsub').textContent = bigsub;
      var vb = document.querySelector('#place .votebox'); if (vb) vb.outerHTML = voteHtml(p);
      return;
    }
    $('place').innerHTML = '<button type="button" class="x" id="closeplace">Close</button>' +
      '<p class="meta">' + esc(p.hood) + ' · ' + esc(p.boro) + ' · ' + esc(CAT[p.cat] || p.cat) + '</p><h2>' + esc(p.name) + '</h2>' +
      '<p class="st ' + st.cls + '">' + esc(st.text) + '</p>' +
      '<p class="big' + (view.long ? ' long' : '') + '">' + esc(big) + '</p><p class="bigsub">' + esc(bigsub) + '</p>' +
      '<p class="src' + (src.confirmed && !flagged ? ' ok' : '') + '">' + (src.confirmed && !flagged ? '✓ ' : '') + esc(src.text) + '</p>' + voteHtml(p) +
      (hol ? '<p class="banner">' + esc(hol.name) + ': hours may differ. Check with the shop before you go.</p>' : '') +
      '<table>' + rows + '</table>' +
      '<p class="addr">' + esc(p.addr) + '</p>' + (tags ? '<p class="tags">' + esc(tags) + '</p>' : '<p class="tags"></p>') +
      '<div class="actions">' + acts + '</div>' + reportHtml(p);
    $('place').hidden = false;
    if (!quiet) { $('place').scrollTop = 0; $('closeplace').focus({ preventScroll: true }); }
  }
  /* The visitors' side of a place: their confirmations, an open "wrong" report, the stars, and this visitor's own answers. */
  function voteHtml(p) {
    var v = sum(p), t = voteTarget(p), me = mine(), today = S.now.calendarDate, a = V.myAttest(me, p), my = V.myStars(me, p), th = S.thanks[p.id] || {}, h = '<div class="votebox">';
    if (v.flaggedLine) h += '<p class="flag">' + esc(v.flaggedLine) + '</p>';
    if (v.visitorLine) h += '<p class="vis">' + esc(v.visitorLine) + '</p>';
    if (a) h += '<p class="minev">' + esc(V.myAttestLine(a, today)) + (th.ok ? '. Thank you: the count updates about hourly.' : '') + '</p>';
    if (t && V.canAttest(me, p, today)) h += '<button type="button" class="okbtn" id="attest">' + (a ? 'Hours are still right' : 'Hours are right') + '</button>';
    if (th.okErr) h += '<p class="fine err">That didn\'t send. Check your connection and try again.</p>';
    if (v.stars || t) {
      h += '<div class="rate"><span class="avg">' + (v.stars ? '<b>★ ' + v.stars.mean.toFixed(1) + '</b> · ' + v.stars.n + (v.stars.n === 1 ? ' rating' : ' ratings') : 'No ratings yet') + '</span>';
      if (t) {
        h += '<span class="stars" role="group" aria-label="Rate this café, 1 to 5 stars">';
        for (var i = 1; i <= 5; i++) h += '<button type="button" data-star="' + i + '" aria-label="' + i + (i === 1 ? ' star' : ' stars') + '" aria-pressed="' + (my === i) + '" class="' + (i <= my ? 'on' : '') + '">' + (i <= my ? '★' : '☆') + '</button>';
        h += '</span>';
      }
      h += '</div>';
      if (t) h += '<p class="fine' + (th.starErr ? ' err' : '') + '">' + (th.starErr ? "That didn't send. Check your connection and try again."
        : my ? 'Your rating: ' + my + (my === 1 ? ' star' : ' stars') + (th.star ? '. Saved: the average updates about hourly.' : '. Tap a star to change it.')
        : 'Rate it as a place to be late. Stars only.') + '</p>';
    }
    return h === '<div class="votebox">' ? '<div class="votebox empty"></div>' : h + '</div>';
  }
  function sendVote(p, kind, stars) {
    var t = voteTarget(p), me = mine(), th = S.thanks[p.id] || (S.thanks[p.id] = {}); if (!t) return;
    var before = JSON.stringify(me), iid = V.ensureId(me); // the random ID is made here, on the first confirmation or rating
    var note = kind === 'attest' ? V.attestNote(iid, p.hh) : V.rateNote(iid, stars), body = new URLSearchParams();
    var f = { type: kind, place_id: p.id, place_name: p.name, note: note, app: APP };
    Object.keys(t.fields).forEach(function (k) { body.append(t.fields[k], f[k] == null ? '' : String(f[k]).slice(0, 600)); });
    var redraw = function () { var vb = document.querySelector('#place .votebox'); if (vb && S.selected === p.id) vb.outerHTML = voteHtml(p); };
    // shown at once, counted later: record first, take it back only if the request never left
    if (kind === 'attest') { V.recordAttest(me, p, S.now.calendarDate); th.ok = true; th.okErr = false; } else { V.recordStars(me, p, stars); th.star = true; th.starErr = false; }
    V.save(store, me); redraw();
    fetch(t.url, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {
      S.mine = JSON.parse(before); V.save(store, S.mine);
      if (kind === 'attest') { th.ok = false; th.okErr = true; } else { th.star = false; th.starErr = true; }
      redraw();
    });
  }
  function reportTarget() { return (S.manifest && S.manifest.report && S.manifest.report.kind === 'google_form' && S.manifest.report) || REPORT_FALLBACK; }
  function reportHtml(p) {
    if (!reportTarget()) return '<details class="wrong"><summary>Hours wrong?</summary><p class="fine" style="margin-top:8px">Email <a href="mailto:dangochains@googlegroups.com?subject=' +
      encodeURIComponent('Latecup hours: ' + p.name + ' (' + p.id + ')') + '">dangochains@googlegroups.com</a> with the right hours and where you saw them.</p></details>';
    return '<details class="wrong"><summary>Hours wrong?</summary><form id="report"><select name="type" aria-label="What is wrong">' +
      KINDS.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('') + '</select>' +
      '<textarea name="note" maxlength="500" placeholder="Optional: the right hours, and where you saw them" aria-label="Note"></textarea>' +
      '<button type="submit" class="btn">Send</button>' +
      '<p class="fine">Sends this place, your choice, your note and this page\'s version ("web 1"). No location, no name, no email.</p></form></details>';
  }
  function sendReport(fields) { // form-encoded POST; the answer is opaque (no-cors), so a network error is the only failure seen
    var r = reportTarget(), body = new URLSearchParams();
    Object.keys(r.fields).forEach(function (k) { body.append(r.fields[k], fields[k] == null ? '' : String(fields[k]).slice(0, 600)); });
    return fetch(r.url, { method: 'POST', mode: 'no-cors', body: body });
  }
  window.LatecupReport = { target: reportTarget, send: sendReport, app: APP };
  function openPlace(id, fly) {
    var p = S.byId[id]; if (!p) return;
    S.selected = id; renderPlace(p);
    if (S.ready && S.map) {
      S.map.setFilter('selected', ['==', ['get', 'id'], id]);
      var need = fly || !S.map.getBounds().contains([p.lon, p.lat]);
      if (need) S.map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(S.map.getZoom(), 15), duration: 600 });
    }
    history.replaceState(null, '', '#p=' + encodeURIComponent(id));
  }
  function closePlace() {
    S.selected = null; $('place').hidden = true; $('place').innerHTML = '';
    if (S.ready) S.map.setFilter('selected', ['==', ['get', 'id'], '']);
    history.replaceState(null, '', location.pathname + location.search);
  }

  /* ---------- map ---------- */
  function pill(fill, stroke) { // a stretchable rounded pin, drawn at 2x
    var w = 44, h = 36, c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), r = 15, x = 3, y = 3, ww = w - 6, hh = h - 6;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath();
    g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = stroke; g.stroke();
    return [g.getImageData(0, 0, w, h), { pixelRatio: 2, stretchX: [[19, 25]], stretchY: [[17, 19]], content: [12, 7, 32, 29] }];
  }
  function initMap() {
    var c = S.city, style = (S.manifest.map && S.manifest.map.style_dark) || FALLBACK_STYLE;
    var map = S.map = new maplibregl.Map({ container: 'map', style: style, center: [c.center[1], c.center[0]], zoom: Math.max(12.05, c.zoom - (window.innerWidth < 820 ? 0.4 : 0)),
      minZoom: 9, maxZoom: 18, attributionControl: false, dragRotate: false, pitchWithRotate: false,
      maxBounds: [[c.bbox[0] - 0.6, c.bbox[1] - 0.4], [c.bbox[2] + 0.6, c.bbox[3] + 0.4]] });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Places © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    var failed = false;
    map.on('error', function (e) {
      if (!S.ready && !failed && style !== FALLBACK_STYLE && e && e.error && /style|fetch|load/i.test(String(e.error.message))) { failed = true; map.setStyle(FALLBACK_STYLE); }
    });
    map.on('load', function () {
      ['plenty', 'under2', 'soon'].forEach(function (k) { var im = pill(C[k], C.halo); map.addImage('pill-' + k, im[0], im[1]); });
      map.addSource('places', { type: 'geojson', data: geojson(), cluster: true, clusterRadius: 40, clusterMaxZoom: 11 });
      map.addLayer({ id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#20252E', 'circle-stroke-color': C.plenty, 'circle-stroke-width': 1.5, 'circle-radius': ['step', ['get', 'point_count'], 15, 10, 18, 40, 22, 120, 26] } });
      map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true }, paint: { 'text-color': C.plenty } });
      var state = ['match', ['get', 'state'], 'under2', C.under2, 'soon', C.soon, C.plenty];
      map.addLayer({ id: 'dots', type: 'circle', source: 'places', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': state, 'circle-radius': ['case', ['==', ['get', 'chain'], 1], 4, 5.5], 'circle-stroke-color': C.halo, 'circle-stroke-width': 1.5 } });
      var pin = function (id, filter, minzoom, size) {
        map.addLayer({ id: id, type: 'symbol', source: 'places', minzoom: minzoom, filter: filter,
          layout: { 'icon-image': ['concat', 'pill-', ['get', 'state']], 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 6, 2, 6], 'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Bold'], 'text-size': size, 'text-letter-spacing': 0.01, 'symbol-sort-key': ['get', 'sort'], 'text-padding': 3, 'icon-padding': 3 },
          paint: { 'text-color': C.onPin } });
      };
      pin('pins-chain', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'chain'], 1]], 14.2, 11);
      pin('pins', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'chain'], 0]], 0, 13);
      map.addLayer({ id: 'selected', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], S.selected || ''],
        paint: { 'circle-radius': 21, 'circle-color': 'rgba(245,177,76,0)', 'circle-stroke-color': '#FFE2A8', 'circle-stroke-width': 2.5 } });
      ['pins', 'pins-chain', 'dots'].forEach(function (layer) {
        map.on('click', layer, function (e) { if (e.features && e.features[0]) { e.originalEvent.cancelBubble = true; openPlace(e.features[0].properties.id); } });
        map.on('mouseenter', layer, function () { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, function () { map.getCanvas().style.cursor = ''; });
      });
      map.on('click', 'clusters', function (e) {
        var f = e.features[0];
        Promise.resolve(map.getSource('places').getClusterExpansionZoom(f.properties.cluster_id)).then(function (z) { map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3 }); });
      });
      map.on('mouseenter', 'clusters', function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'clusters', function () { map.getCanvas().style.cursor = ''; });
      S.ready = true;
      refresh();
      applyHash();
    });
    map.on('moveend', function () { if (S.ready) { S.shown = PAGE; refresh({ listOnly: true, keepPanel: true }); } });
  }
  function applyHash() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (h.get('p') && S.byId[h.get('p')]) { openPlace(h.get('p'), true); return; }
    if (h.get('hood')) {
      var name = h.get('hood'), pts = S.places.filter(function (p) { return p.hood === name; });
      if (!pts.length) return;
      S.hood = name; S.q = ''; $('q').value = ''; S.shown = PAGE;
      if (S.selected) { S.selected = null; $('place').hidden = true; $('place').innerHTML = ''; S.map.setFilter('selected', ['==', ['get', 'id'], '']); }
      var b = new maplibregl.LngLatBounds(); pts.forEach(function (p) { b.extend([p.lon, p.lat]); });
      S.map.fitBounds(b, { padding: 60, maxZoom: 15.5, duration: 0 });
      refresh();
    }
  }
  function message(text, ms) {
    var m = $('msg'); m.textContent = text; m.hidden = false;
    clearTimeout(message.t); if (ms) message.t = setTimeout(function () { m.hidden = true; }, ms);
  }

  /* ---------- events ---------- */
  function wire() {
    $('chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-chip]'); if (!b) return;
      S.chip = b.dataset.chip; S.chipTouched = true; S.shown = PAGE; S.lastChips = ''; refresh();
    });
    $('day').addEventListener('change', function () { S.day = +this.value; S.shown = PAGE; S.lastChips = ''; if (S.chip === 'now') S.chipTouched = false; refresh(); });
    var qt; $('q').addEventListener('input', function () { var v = this.value; clearTimeout(qt); qt = setTimeout(function () { S.q = v; S.shown = PAGE; refresh(); }, 160); });
    $('indie').addEventListener('change', function () { S.indie = this.checked; S.shown = PAGE; refresh(); });
    $('confirmed').addEventListener('change', function () { S.confirmed = this.checked; S.shown = PAGE; refresh(); });
    $('count').addEventListener('click', function (e) {
      if (e.target.id !== 'clearhood') return;
      S.hood = null; S.shown = PAGE; history.replaceState(null, '', location.pathname + location.search); refresh();
    });
    $('more').addEventListener('click', function () { S.shown += PAGE; refresh({ listOnly: true, keepPanel: true }); });
    $('rows').addEventListener('click', function (e) { var b = e.target.closest('[data-id]'); if (b) openPlace(b.dataset.id, true); });
    $('near').addEventListener('click', function () {
      var btn = this;
      if (S.user) { S.user = null; if (S.userMarker) S.userMarker.remove(); btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Near me'; refresh(); return; }
      if (!navigator.geolocation) { message('This browser has no location. The list stays sorted by latest closing.', 5000); return; }
      btn.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var u = { lat: pos.coords.latitude, lon: pos.coords.longitude }, b = S.city.bbox;
        btn.textContent = 'Near me';
        if (u.lon < b[0] || u.lon > b[2] || u.lat < b[1] || u.lat > b[3]) { message('You are outside New York City. Latecup covers the five boroughs for now.', 7000); return; }
        S.user = u; btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Near me ✓';
        var el = document.createElement('div'); el.className = 'userdot';
        if (S.userMarker) S.userMarker.remove();
        S.userMarker = new maplibregl.Marker({ element: el }).setLngLat([u.lon, u.lat]).addTo(S.map);
        S.map.easeTo({ center: [u.lon, u.lat], zoom: Math.max(S.map.getZoom(), 14.5) });
        refresh();
      }, function () { btn.textContent = 'Near me'; message('Location is off for this page. The list stays sorted by latest closing.', 6000); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
    });
    $('place').addEventListener('click', function (e) {
      if (e.target.id === 'closeplace') closePlace();
      if (e.target.id === 'attest' && S.selected) { e.target.disabled = true; sendVote(S.byId[S.selected], 'attest'); }
      var star = e.target.closest && e.target.closest('[data-star]');
      if (star && S.selected) sendVote(S.byId[S.selected], 'rate', +star.dataset.star);
      if (e.target.id === 'share') {
        var url = location.origin + location.pathname + '#p=' + encodeURIComponent(S.selected), b = e.target;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = 'Link copied'; }, function () { prompt('Copy this link', url); });
      }
    });
    $('place').addEventListener('submit', function (e) {
      if (e.target.id !== 'report') return;
      e.preventDefault();
      var p = S.byId[S.selected], f = e.target, d = f.closest('details');
      f.querySelector('button').disabled = true;
      sendReport({ type: f.type.value, place_id: p.id, place_name: p.name, note: f.note.value, app: APP }).then(function () {
        d.dataset.sent = '1'; f.outerHTML = '<p class="sent" style="margin-top:10px">Sent. Thank you. Reports are checked against the shop\'s own site or page, or the chain\'s store locator.</p>';
      }, function () { f.querySelector('button').disabled = false; f.querySelector('.fine').textContent = "That didn't send. Check your connection and try again."; });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.selected) closePlace(); });
    window.addEventListener('hashchange', function () { if (S.ready) applyHash(); });
    var showid = $('showid'), forgetid = $('forgetid'); // "Delete your data": the visitor can see or remove what this browser keeps
    if (showid) showid.addEventListener('click', function () { $('myid').textContent = mine().iid || 'No ID yet: this browser has not sent a confirmation or rating.'; });
    if (forgetid) forgetid.addEventListener('click', function () {
      try { if (store) store.removeItem(V.KEY); } catch (e) { /* nothing kept */ }
      S.mine = null; S.thanks = {}; $('myid').textContent = 'Removed from this browser.';
      if (S.selected) renderPlace(S.byId[S.selected], true);
    });
    var city = $('cityform');
    if (city) city.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = city.city.value.trim(); if (!v) return;
      if (!reportTarget()) { location.href = 'mailto:dangochains@googlegroups.com?subject=' + encodeURIComponent('Latecup in ' + v); return; }
      sendReport({ type: 'city', place_id: '', place_name: '', note: v, app: APP }).then(function () { city.outerHTML = '<p class="sent">Sent. Thank you.</p>'; },
        function () { $('cityfine').textContent = "That didn't send. Check your connection and try again."; });
    });
  }
  function loadVotes() { // optional file: totals of visitor confirmations and ratings, rebuilt about hourly
    if (!S.city.votes) return;
    fetch(FEED + S.city.votes).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.votes && typeof d.votes === 'object') { S.votes = d.votes; refresh(); }
    }).catch(function () {});
  }
  function dayOptions() {
    var html = '';
    for (var i = 0; i < 7; i++) {
      var d = H.addDays(S.now.serviceDate, i), dt = new Date(d + 'T12:00:00Z');
      html += '<option value="' + i + '">' + (i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow night' : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })) + '</option>';
    }
    $('day').innerHTML = html;
  }
  function start() {
    wire();
    fetch(FEED + 'manifest.json').then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); }).then(function (m) {
      S.manifest = m; S.city = m.cities[0];
      return fetch(FEED + S.city.places).then(function (r) { if (!r.ok) throw new Error('places ' + r.status); return r.json(); });
    }).then(function (d) {
      S.places = d.places.filter(function (p) { return p && p.id && Array.isArray(p.hours) && p.hours.length === 7 && isFinite(p.lat) && isFinite(p.lon); });
      S.places.forEach(function (p) { S.byId[p.id] = p; });
      S.now = H.cityNow(S.city.tz, testNow());
      dayOptions();
      var up = new Date(S.city.updated);
      $('data').textContent = S.places.length.toLocaleString('en-US') + ' places in the feed · updated ' + up.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: S.city.tz });
      refresh();
      loadVotes(); setInterval(loadVotes, 30 * 60000);
      try { if (!window.maplibregl) throw new Error('no maplibre'); initMap(); }
      catch (e) { S.ready = false; S.map = null; message('The map could not be drawn in this browser. The list still works.'); }
      setInterval(function () { refresh({ keepPanel: false }); }, 30000);
    }).catch(function (e) {
      if (window.console) console.error('Latecup:', e);
      $('rows').innerHTML = '<li class="empty">The list of places could not be loaded. Check your connection and reload the page.</li>'; $('count').textContent = '';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
