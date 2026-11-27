/* Latecup web map. Static: loads the public feed (manifest.json + one places file per area),
   draws it with MapLibre GL JS, and applies the same "late" rules as the app (hours.js).
   Network: the feed (the files of the areas on screen), the map style/tiles, and a report, a
   confirmation, a rating or hours only when the visitor sends one.
   Location is asked only on "Near me", used in the page, and never sent anywhere.

   One page for both feeds (areas.js). With a 1.0 manifest (one area, none of the 1.1 fields)
   this is the page it was before areas: same pins, counts, words and links. What the manifest
   carries switches the rest on:
   - more than one area: bubbles when zoomed out, the places of each area the map touches,
     each place on its own area's clock, the header following the area under the middle of the
     map, the Cities list, "Latecup isn't here yet";
   - `indie` / `indie_confirmed`: the coverage line;
   - `help`: the Help switch, Add hours, and Add a café when a search finds nothing;
   - any of these (S.v11): outline pins for unconfirmed hours, Fix the hours, `app` = "web 2";
   - `"visitors": true` on an area: its places may show "Hours from N visitors". Without it none does. */
(function () {
  'use strict';
  var H = window.LatecupHours, V = window.LatecupVotes, A = window.LatecupAreas, T = window.LatecupTable;
  var HERE = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');
  var FEED = 'https://juicypasta.github.io/latecup-data/v1/';
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (local && new URLSearchParams(location.search).get('feed')) FEED = new URLSearchParams(location.search).get('feed'); // tests only
  var FALLBACK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
  /* The report form (Latecup/marketing/report-form.md). The manifest's `report` block wins when set. */
  var REPORT_FALLBACK = window.LATECUP_REPORT || null;
  var C = { plenty: '#F5B14C', under2: '#F0873A', soon: '#F2604A', closed: '#3A404A', halo: '#0E1116', onPin: '#1A1408', onClosed: '#B4AEA3', surface: '#171B22', raised: '#20252E', ink: '#F3EEE6', faint: '#8A8F99' };
  var CAT = { coffee: 'Coffee', tea: 'Tea & boba', dessert: 'Dessert café' };
  var TAG = { wifi: 'Wi-Fi', outdoor: 'Outdoor seating', seating: 'Seating', laptop: 'Laptop-friendly' };
  var KINDS = [['hours', 'The hours are wrong'], ['closed', 'It has closed for good'], ['notcafe', "It isn't a café"], ['other', 'Something else']];
  var PAGE = 30;
  var Z_AREAS = 8; // more than one area: below this zoom, one bubble per area and no places
  var Z_PIN = 15;  // Add a café: the pin can be set from this zoom, where the street shows

  var $ = function (id) { return document.getElementById(id); };
  /* An element that came with areas. A copy of the page cached from before them lacks it and gets
     a stand-in, so the newer script still runs on the older page for the minutes that copy lives. */
  var spare = {}, opt = function (id) { return $(id) || spare[id] || (spare[id] = document.createElement('div')); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var S = { manifest: null, areas: [], multi: false, v11: false, focus: null, loaded: {}, all: [], byId: {}, now: null, nows: {}, day: 0, chip: null, chipTouched: false,
            q: '', indie: false, confirmed: false, user: null, userArea: null, hood: null, hoodArea: null, shown: PAGE, selected: null, matched: [], map: null, ready: false,
            lastChips: '', mine: null, thanks: {}, overview: false, outside: false, away: null, rowsHtml: null,
            cities: false, helpOn: false, help: {}, helpById: {}, helpShown: PAGE, ed: null, add: null };

  function testNow() { // ?now=2026-11-27T02:30:00Z on localhost, for tests
    var v = local && new URLSearchParams(location.search).get('now'); return v ? new Date(v) : new Date();
  }
  var store = null; try { store = window.localStorage; store.getItem('x'); } catch (e) { store = null; }
  function mine() { return S.mine || (S.mine = V.load(store)); } // the visitor's own confirmations, stars and random ID
  /* What this page calls itself in what it sends: "web 2" once the feed is the 1.1 feed. Until then it does only what "web 1" did. */
  function app() { return S.v11 ? 'web 2' : 'web 1'; }
  function areaById(id) { for (var i = 0; i < S.areas.length; i++) if (S.areas[i].id === id) return S.areas[i]; return null; }
  function placeById(id) { return S.byId[id] || S.helpById[id] || null; }
  function sum(p) { var st = !p._help && S.loaded[p._a.id]; return V.summary(p, st ? st.votes[p.id] : undefined, A.visitors(p._a)); }
  /* A page opened on this machine never posts to the real form: _tools/latecup-pages/serve.mjs answers /__report. */
  function form(r) { return r && local ? { kind: r.kind, url: location.origin + '/__report', fields: r.fields } : r; }
  /* Confirmations and ratings go only to the feed's own endpoint, and only for a place whose hours table has a hash. */
  function voteTarget(p) { var r = S.manifest && S.manifest.report; return r && r.kind === 'google_form' && r.url && r.fields && p.hh ? form(r) : null; }
  /* The clock. A place is always worked out in its own area's zone; S.now is the clock of the area the header follows. */
  function nowOf(a) { return S.nows[a.id] || (S.nows[a.id] = H.cityNow(a.tz, testNow())); }
  function dayOf(now) { // the service day being looked at, on that clock
    var date = H.addDays(now.serviceDate, S.day);
    return { date: date, dow: H.dowOf(date), isToday: S.day === 0 };
  }
  function dayInfo() { return dayOf(S.now); }
  function chipSet() { return H.chips(S.now, S.day === 0); }
  function currentChip() {
    var set = chipSet(), ids = set.chips.map(function (c) { return c.id; });
    if (!S.chipTouched) S.chip = set.def;
    else if (ids.indexOf(S.chip) < 0) S.chip = ids.indexOf('now') >= 0 ? 'now' : set.def; // a chosen time that has passed collapses into Open now
    return set.chips.filter(function (c) { return c.id === S.chip; })[0];
  }
  /* One place against the current chip and night → the stretch its pin shows and what the row
     and the place say about it (hours.js: the three always agree), or null when it doesn't match. */
  function evaluate(p, chip) {
    var now = nowOf(p._a), di = dayOf(now);
    var shown = chip.id === 'now' ? H.openAt(p.hours, now.dow, now.rel) : H.matches(p.hours, di.dow, chip);
    if (!shown) return null;
    var view = di.isToday ? H.tonightView(p.hours, now, shown) : H.nightView(p.hours, di.dow, shown, nightName(di));
    return { shown: shown, view: view, close: shown.close, allDay: shown.allDay, state: view.left != null && view.left !== Infinity ? H.pinState(view.left) : 'plenty' };
  }
  /* The place panel: the pin's stretch when the place is on the map under this chip, otherwise what it is doing now (or that night). */
  function placeView(p) {
    var now = nowOf(p._a), di = dayOf(now), ev = evaluate(p, currentChip());
    return ev ? ev.view : di.isToday ? H.tonightView(p.hours, now, null) : H.nightView(p.hours, di.dow, null, nightName(di));
  }
  function miles(a, b) { return A.miles(a.lat, a.lon, b.lat, b.lon); }
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
  function hay(p) { return [p.name, p.addr, p.hood, p.boro, p.city].filter(Boolean).join(' ').toLowerCase(); } // what a search looks through
  function whereLine(p) { return [A.locality(p), CAT[p.cat] || p.cat].filter(Boolean).map(esc).join(' · '); }

  /* ---------- the feed, by area ---------- */
  function loadArea(a) { // one places file, once; a failed one may be asked for again after a pause
    var st = S.loaded[a.id];
    if (st && !(st.state === 'failed' && Date.now() - st.at > 15000)) return st.promise;
    st = S.loaded[a.id] = { state: 'loading', places: [], votes: {}, at: Date.now() };
    st.promise = fetch(FEED + a.places).then(function (r) { if (!r.ok) throw new Error('places ' + r.status); return r.json(); }).then(function (d) {
      st.places = d.places.filter(function (p) { return p && p.id && Array.isArray(p.hours) && p.hours.length === 7 && isFinite(p.lat) && isFinite(p.lon) && !S.byId[p.id]; });
      st.places.forEach(function (p) { p._a = a; S.byId[p.id] = p; });
      S.all = S.all.concat(st.places); st.state = 'ok';
      loadVotes(a);
    });
    st.promise.catch(function () { st.state = 'failed'; st.at = Date.now(); });
    return st.promise;
  }
  function want(a) { // an area the map has reached: fetch it if it is not here yet, and redraw when it is
    var st = S.loaded[a.id];
    if (st && !(st.state === 'failed' && Date.now() - st.at > 15000)) return;
    loadArea(a).then(function () { if (a === S.focus) renderArea(); refresh(); }, function () { refresh({ listOnly: true, keepPanel: true }); });
  }
  function loadVotes(a) { // optional file: totals of visitor confirmations and ratings, rebuilt about hourly
    if (!a.votes) return;
    fetch(FEED + a.votes).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.votes && typeof d.votes === 'object') { S.loaded[a.id].votes = d.votes; refresh(); }
    }).catch(function () {});
  }
  function loadHelp(a) { // cafés with no late hours on file: fetched only when the Help switch is on or a search found nothing
    var h = A.help(a);
    if (!h || (S.help[a.id] && S.help[a.id].state !== 'failed')) return;
    var st = S.help[a.id] = { state: 'loading', places: [] };
    fetch(FEED + h.file).then(function (r) { if (!r.ok) throw new Error('help ' + r.status); return r.json(); }).then(function (d) {
      st.places = d.places.filter(function (p) { return p && p.id && p.name && isFinite(p.lat) && isFinite(p.lon) && !S.byId[p.id] && !S.helpById[p.id]; });
      st.places.forEach(function (p) { p._a = a; p._help = true; S.helpById[p.id] = p; });
      st.state = 'ok';
    }).catch(function () { st.state = 'failed'; }).then(function () { helpData(); refresh({ listOnly: true, keepPanel: true }); });
  }

  /* ---------- filter + draw ---------- */
  function compute() {
    var chip = currentChip(), q = S.q.trim().toLowerCase(), out = [];
    S.all.forEach(function (p) {
      if (S.indie && p.chain) return;
      if (S.confirmed && !sum(p).marked) return;
      if (S.hood && !(p._a === S.hoodArea && p.hood === S.hood)) return; // a neighborhood page's link: exactly that neighborhood
      if (q && hay(p).indexOf(q) < 0) return;
      var ev = evaluate(p, chip);
      if (ev) out.push({ p: p, ev: ev });
    });
    S.matched = out;
    return { chip: chip, di: dayInfo() };
  }
  function geojson() {
    return { type: 'FeatureCollection', features: S.matched.map(function (m) {
      var props = { id: m.p.id, label: H.pinLabel(m.ev.shown), state: m.ev.state, chain: m.p.chain ? 1 : 0, sort: m.ev.allDay ? -9999 : -m.ev.close };
      if (S.v11) props.solid = sum(m.p).marked ? 1 : 0; // the pin says how sure we are: solid where the list has its mark, an outline elsewhere
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [m.p.lon, m.p.lat] }, properties: props };
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
    var text = A.clockName(S.focus) + ' time: ' + cal + ' ' + H.clock(t.minutes);
    if (t.calendarDate !== t.serviceDate) text += ' · still ' + new Date(t.serviceDate + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) + ' night';
    $('clock').textContent = text;
    var hol = holidayFor(ctx.di.date), b = $('holiday');
    if (hol) { b.hidden = false; b.textContent = hol.name + (ctx.di.isToday ? ' today' : ' that day') + ': hours may differ. Check with the shop before you go.'; } else b.hidden = true;
  }
  /* The header follows the area under the middle of the map: its name, its coverage line, its nights, its feed date. */
  function renderArea() {
    var a = S.focus, st = S.loaded[a.id], cov = A.coverage(a), h = A.help(a);
    S.now = nowOf(a);
    if (S.multi) { // the heading and the title follow the area; with one area both stay as the page has them
      document.querySelector('#controls h1').textContent = 'Coffee shops open late in ' + A.prose(a.name);
      document.title = 'Coffee shops open late in ' + A.prose(a.name) + ' | Latecup';
    }
    opt('cover').hidden = !cov; if (cov) opt('cover').textContent = cov.text;
    opt('helprow').hidden = !h || !reportTarget(); // with nowhere to send hours to, the switch is not offered
    if (st && st.state === 'ok') {
      var up = new Date(a.updated);
      $('data').textContent = st.places.length.toLocaleString('en-US') + ' places in the feed · updated ' + up.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: a.tz });
    }
    dayOptions();
  }
  function inFocus(m) { return m.p._a === S.focus; }
  function inView() {
    if (!S.ready || S.q.trim() || S.hood) return S.multi ? S.matched.filter(inFocus) : S.matched; // a search or a neighborhood: the area's whole list
    var b = S.map.getBounds();
    return S.matched.filter(function (m) { return b.contains([m.p.lon, m.p.lat]); });
  }
  /* "Show more". On the page as it has been, the button's own style keeps it on screen even when there is nothing more
     (map.css gives it display:block, which beats the hidden attribute). That page is left as it is; with the 1.1 feed,
     where short lists are the rule, the button really goes away. */
  function more(on) { $('more').hidden = !on; if (S.v11) $('more').style.display = on ? '' : 'none'; }
  function setRows(html) { if (S.rowsHtml !== html) { S.rowsHtml = html; $('rows').innerHTML = html; } } // untouched while it says the same, so a form inside it keeps what was typed
  function rowHtml(m, near) {
    var st = { cls: m.ev.view.cls, text: m.ev.view.line }, v = sum(m.p);
    return '<li><button type="button" class="row" data-id="' + esc(m.p.id) + '"><span class="top"><span class="nm">' + esc(m.p.name) + '</span>' +
      (near ? '<span class="dist">' + distText(m.d) + '</span>' : '') + '</span>' +
      '<span class="hood">' + whereLine(m.p) + '</span>' +
      '<span class="st ' + st.cls + '">' + (v.marked ? '<span class="ck" title="' + (v.ours ? 'Hours confirmed from the shop' : v.theirs ? 'Hours from visitors' : 'Hours confirmed by visitors') + '">✓</span>' : '') + esc(st.text) +
      (v.marked ? '' : v.flagged ? ' · reported wrong' : ' · unconfirmed') + (v.stars ? ' · ★ ' + v.stars.mean.toFixed(1) : '') + '</span></button></li>';
  }
  function renderList(ctx) {
    helpList();
    if (S.multi && (S.overview || S.cities)) return citiesList();
    if (S.multi && (S.outside || S.away)) return outsideList();
    var st = S.loaded[S.focus.id];
    if (!st || st.state !== 'ok') { // an area the map has just reached
      $('count').textContent = st && st.state === 'failed' ? '' : 'Loading places…';
      setRows(st && st.state === 'failed' ? '<li class="empty">The list of places could not be loaded. Check your connection and reload the page.</li>' : '');
      more(false); return;
    }
    var q = S.q.trim(), near = !!S.user && (!S.multi || S.userArea === S.focus);
    var rows = inView().slice(), total = S.multi ? S.matched.filter(inFocus).length : S.matched.length;
    if (near) rows.forEach(function (m) { m.d = miles(S.user, m.p); });
    if (S.v11 && !near) rows.forEach(function (m) { m.k = { close: m.ev.allDay ? Infinity : m.ev.close, marked: sum(m.p).marked, chain: !!m.p.chain, name: m.p.name }; });
    rows.sort(near ? function (a, b) { return a.d - b.d; }
      : S.v11 ? function (a, b) { return A.latestFirst(a.k, b.k); } // places that close together: accepted hours first, then independents, then by name
      : function (a, b) { return (b.ev.allDay ? 1e6 : b.ev.close) - (a.ev.allDay ? 1e6 : a.ev.close) || (a.p.chain ? 1 : 0) - (b.p.chain ? 1 : 0) || a.p.name.localeCompare(b.p.name); });
    var what = ctx.chip.id === 'now' ? 'open now' : ctx.chip.id === 'all' ? 'open all night' : 'open at ' + ctx.chip.label.replace('+', '').replace('Midnight', 'midnight');
    var when = ctx.chip.id === 'now' ? '' : ' ' + nightName(ctx.di);
    // every number here is the length of a list: the one below, or the neighborhood's own page
    if (S.hood) {
      var all = S.loaded[S.hoodArea.id].places.filter(function (p) { return p.hood === S.hood; }).length;
      $('count').innerHTML = esc(S.hood) + ': ' + total + ' of its ' + all + (all === 1 ? ' place ' : ' places ') + esc(what + when) + (q ? ' matching "' + esc(q) + '"' : '') +
        (S.indie || S.confirmed ? ' with these filters' : '') + ' <button type="button" id="clearhood">Whole city</button>';
    } else {
      $('count').textContent = q ? total + (total === 1 ? ' place ' : ' places ') + what + when + ' matching "' + q + '"'
        : rows.length + ' in view · ' + total + (S.multi ? ' across ' + A.prose(S.focus.name) + ' ' : ' across the city ') + what + when + (near ? ' · nearest first' : ' · latest closing first');
      if (S.multi) $('count').insertAdjacentHTML('beforeend', ' <button type="button" id="showcities">Cities</button>'); // every area by name, one tap away
    }
    var html = rows.slice(0, S.shown).map(function (m) { return rowHtml(m, near); }).join('');
    setRows(cityMatches(q) + (html || '<li class="empty">' + (total ? 'Nothing in this part of the map. Zoom out or move the map.' : 'No places match. Try an earlier time or clear the filters.') + '</li>') +
      (total ? '' : searchMore(q, what + when)));
    more(rows.length > S.shown);
  }
  function refresh(opts) {
    if (!S.all.length) return;
    S.nows = {}; S.now = nowOf(S.focus);
    var ctx = compute();
    renderChips(ctx); renderClock(ctx);
    if (S.ready && !(opts && opts.listOnly)) S.map.getSource('places').setData(geojson());
    renderList(ctx);
    if (S.selected && !(opts && opts.keepPanel)) renderPlace(placeById(S.selected), true);
  }

  /* ---------- more than one area: the Cities list, and where Latecup isn't yet ---------- */
  function cityRow(a) {
    var cov = A.coverage(a), n = typeof a.count === 'number' && isFinite(a.count) ? a.count : null;
    return '<li><button type="button" class="row city" data-area="' + esc(a.id) + '"><span class="top"><span class="nm">' + esc(a.name) + '</span>' +
      (n === null ? '' : '<span class="dist">' + n.toLocaleString('en-US') + (n === 1 ? ' place' : ' places') + '</span>') + '</span>' +
      (cov ? '<span class="hood">' + esc(cov.rest) + '</span>' : '') + '</button></li>';
  }
  function citiesNamed(q) { // every area by name, or those a search names
    q = q.trim().toLowerCase();
    return S.areas.filter(function (a) { return !q || a.name.toLowerCase().indexOf(q) >= 0 || A.prose(a.name).toLowerCase().indexOf(q) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function cityMatches(q) { // in a search: the cities it names, above the places
    if (!S.multi || q.trim().length < 2) return '';
    var list = citiesNamed(q).filter(function (a) { return a !== S.focus; });
    return list.length ? '<li class="sub">Cities</li>' + list.map(cityRow).join('') + '<li class="sub">Places in ' + esc(A.prose(S.focus.name)) + '</li>' : '';
  }
  function askHtml() { // the city request, where the map has nothing to show
    if (!reportTarget()) return '';
    return '<p class="q">Want Latecup in your city?</p><form class="ask cityask"><input type="text" name="city" maxlength="80" placeholder="Your city" aria-label="Your city" required><button class="btn" type="submit">Ask for it</button></form>' +
      '<p class="fine">Sends the city name you type and this page\'s version ("' + app() + '"), nothing else.</p>';
  }
  function citiesList() { // zoomed out, or asked for: where Latecup is
    var list = citiesNamed(S.q);
    $('count').textContent = S.areas.length + ' cities on the map. Pick one, or zoom in on one.';
    if (!S.overview) $('count').insertAdjacentHTML('beforeend', ' <button type="button" id="hidecities">Back to ' + esc(S.focus.name) + '</button>');
    setRows(list.length ? list.map(cityRow).join('') : '<li class="empty out"><p>No city by that name on the map yet.</p>' + askHtml() + '</li>');
    more(false);
  }
  function outsideList() { // the map shows a part of the world no area covers, or the visitor is in one
    var c = S.ready ? S.map.getCenter() : null, near = S.away || (c && A.nearest(S.areas, c.lat, c.lng)) || S.areas[0];
    $('count').textContent = S.away ? "Latecup isn't where you are yet." : "Latecup isn't here yet.";
    setRows('<li class="empty out"><p>The nearest city on the map is ' + esc(near.name) + '.</p>' +
      '<p><button type="button" class="btn" data-area="' + esc(near.id) + '">Show ' + esc(near.name) + '</button> <button type="button" class="linkbtn" id="allcities">All cities</button></p>' + askHtml() + '</li>');
    more(false);
  }
  function goTo(a) { // a tap on a city: the map moves to its center and zoom, and the rest follows the map
    if (S.selected || S.add) closePlace(); // an open place belongs to the area being left
    S.away = null; S.hood = null; S.cities = false; S.shown = PAGE;
    if (S.ready) { var v = startView(a); S.map.jumpTo({ center: v.center, zoom: v.zoom }); return; }
    S.focus = a; S.overview = S.outside = false; S.lastChips = ''; // no map in this browser: the list alone moves
    renderArea(); want(a); refresh(); setHash();
  }
  /* Which area the header follows, from where the map is; asks for the files of the areas it touches. True when something changed. */
  function locate() {
    var z = S.map.getZoom(), c = S.map.getCenter(), b = S.map.getBounds(), was = [S.focus, S.overview, S.outside];
    S.overview = z < Z_AREAS;
    if (S.overview) S.outside = false;
    else {
      var box = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, touched = A.touching(S.areas, box);
      touched.forEach(want);
      if (S.helpOn) touched.forEach(loadHelp);
      var f = A.focus(S.areas, c.lat, c.lng, box); // under the middle of the map, or the nearest of those it still touches
      S.outside = !f;
      if (f) S.focus = f;
    }
    return was[0] !== S.focus || was[1] !== S.overview || was[2] !== S.outside;
  }
  function onMove(e) {
    S.shown = PAGE; S.helpShown = PAGE;
    if (S.add && !S.add.ll) { if (e && e.originalEvent) S.add.moved = true; pinState(); }
    if (e && e.originalEvent) { S.away = null; S.cities = false; } // the visitor moved the map: the list is about the map again
    if (S.multi && locate()) {
      var open = S.selected && placeById(S.selected);
      if (open && open._a !== S.focus && !S.overview) closePlace(); // the map is in another area now, however it got there: its place does not stay open over this one
      if (S.hood && S.hoodArea !== S.focus) S.hood = null;
      S.lastChips = ''; renderArea(); refresh(); setHash();
    } else refresh({ listOnly: true, keepPanel: true });
  }

  /* ---------- the Help switch: cafés with no late hours on file ---------- */
  function helpIn(a) { var st = S.help[a.id]; return st && st.state === 'ok' ? st.places : []; }
  function helpAll() { var out = []; S.areas.forEach(function (a) { out = out.concat(helpIn(a)); }); return out; }
  function helpData() {
    if (!S.ready || !S.map.getSource('help')) return;
    S.map.getSource('help').setData({ type: 'FeatureCollection', features: (S.helpOn ? helpAll() : []).map(function (p) {
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id } };
    }) });
  }
  function helpRow(p) {
    return '<li><button type="button" class="row" data-id="' + esc(p.id) + '"><span class="top"><span class="nm">' + esc(p.name) + '</span></span>' +
      '<span class="hood">' + whereLine(p) + '</span><span class="st off">' + (p.why === 'early' ? 'Unconfirmed hours, none of them late · fix them' : 'No hours yet · add them') + '</span></button></li>';
  }
  function helpName(text) { opt('helptext').textContent = text; opt('helpsw').setAttribute('aria-label', text); } // what the switch says is also its name, for a reader that takes names from aria-label alone
  function helpList() { // the switch's own line and list: a number here is the length of the list under it
    var h = A.help(S.focus), box = opt('helplist');
    if (!h || !reportTarget()) { box.hidden = true; return; }
    var st = S.help[S.focus.id], n = h.count;
    if (!S.helpOn || S.overview || S.outside) {
      box.hidden = true;
      helpName(n === null ? 'Help: show the cafés with no hours yet' : 'Help: ' + n.toLocaleString('en-US') + (n === 1 ? ' café here has' : ' cafés here have') + ' no hours yet');
      return;
    }
    var b = S.ready ? S.map.getBounds() : null, seen = helpAll().filter(function (p) { return !b || b.contains([p.lon, p.lat]); });
    seen.sort(function (x, y) { return x.name.localeCompare(y.name); });
    var line = !st || st.state === 'loading' ? 'Looking for cafés with no hours yet…' : st.state === 'failed' ? 'The cafés with no hours could not be loaded. Check your connection.'
      : seen.length + (seen.length === 1 ? ' café in view has' : ' cafés in view have') + ' no hours yet';
    helpName('Help: ' + (st && st.state === 'ok' ? line : 'cafés with no hours yet'));
    opt('helpcount').textContent = line + (seen.length ? '. They are the gray dots. Tap one to add its hours.' : st && st.state === 'ok' ? '. Move the map to look elsewhere.' : '');
    opt('helprows').innerHTML = seen.slice(0, S.helpShown).map(helpRow).join('');
    opt('helpmore').hidden = seen.length <= S.helpShown;
    box.hidden = false;
  }
  /* A search that finds nothing on the map looks further: the rest of the area's feed (places not
     open at the chosen time), then the cafés with no late hours on file. Only when both have
     nothing is "Add a café" offered, so nobody adds a café we already have. */
  function searchMore(q, when) {
    var a = S.focus, h = A.help(a), ql = q.toLowerCase();
    if (!h || q.length < 2 || S.hood || !reportTarget()) return '';
    var rest = S.loaded[a.id].places.filter(function (p) { return hay(p).indexOf(ql) >= 0; });
    var html = rest.length ? '<li class="sub">On Latecup, but not ' + esc(when) + (S.indie || S.confirmed ? ' with these filters' : '') + '</li>' + rest.slice(0, PAGE).map(function (p) {
      return '<li><button type="button" class="row" data-id="' + esc(p.id) + '"><span class="top"><span class="nm">' + esc(p.name) + '</span></span><span class="hood">' + whereLine(p) + '</span>' +
        '<span class="st off">' + esc(placeView(p).line) + '</span></button></li>';
    }).join('') : '';
    var st = S.help[a.id];
    if (!st) { loadHelp(a); st = S.help[a.id]; }
    if (st.state === 'loading') return html + '<li class="empty">Looking through the cafés with no hours yet…</li>';
    if (st.state === 'failed') return html + '<li class="empty">The cafés with no hours could not be loaded, so we can\'t tell whether this one is known. Check your connection.</li>';
    var known = st.places.filter(function (p) { return hay(p).indexOf(ql) >= 0; });
    if (known.length) html += '<li class="sub">Known, with no late hours on file. Tap one to add its hours.</li>' + known.slice(0, PAGE).map(helpRow).join('');
    if (!rest.length && !known.length && q.length >= 3) html += '<li class="empty out"><p>Nothing called "' + esc(q) + '" in ' + esc(A.prose(a.name)) + ', on the map or among the cafés with no hours yet.</p>' +
      '<p><button type="button" class="btn" id="addcafe">Add it</button></p><p class="fine">For a coffee shop, tea house or dessert café that is open until 8 PM or later on some night.</p></li>';
    return html;
  }

  /* ---------- place panel ---------- */
  function linksHtml(p, directions) {
    var apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
    var dir = apple ? 'https://maps.apple.com/?daddr=' + p.lat + ',' + p.lon + '&dirflg=w' : 'https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon;
    var acts = directions ? '<a class="go" href="' + dir + '" target="_blank" rel="noopener">Directions</a>' : '';
    if (p.web && /^https?:\/\//i.test(p.web)) acts += '<a href="' + esc(p.web) + '" target="_blank" rel="noopener nofollow">Website</a>';
    if (p.phone && /^\+?[\d ]+$/.test(p.phone)) acts += '<a href="tel:' + esc(p.phone) + '">Call</a>';
    if (p.ig && /^[\w.]+$/.test(p.ig)) acts += '<a href="https://www.instagram.com/' + esc(p.ig) + '/" target="_blank" rel="noopener nofollow">Instagram</a>';
    return acts;
  }
  function renderPlace(p, quiet) {
    if (!p) return;
    if (p._help) { if (!quiet) renderHelpPlace(p); return; } // nothing in it follows the clock
    var di = dayOf(nowOf(p._a)), view = placeView(p), st = { cls: view.cls, text: view.line }, src = H.sourceLine(p, A.visitors(p._a)), hol = holidayFor(di.date);
    var big = view.big, bigsub = view.caption, flagged = sum(p).flagged; // the large line follows the status; a reported-wrong place loses its mark
    var rows = H.DOW.map(function (d, i) { return '<tr' + (i === di.dow ? ' class="today"' : '') + '><td>' + d + '</td><td>' + esc(H.dayText(p.hours, i)) + '</td></tr>'; }).join('');
    var acts = linksHtml(p, true) + '<button type="button" id="share">Copy link</button>';
    var tags = (p.tags || []).map(function (x) { return TAG[x]; }).filter(Boolean).join(' · ');
    var prev = quiet && document.querySelector('#place details.wrong');
    if (prev && (prev.open || prev.dataset.sent)) { // don't wipe a report being written
      document.querySelector('#place .st').className = 'st ' + st.cls; document.querySelector('#place .st').textContent = st.text;
      document.querySelector('#place .big').className = 'big' + (view.long ? ' long' : ''); document.querySelector('#place .big').textContent = big; document.querySelector('#place .bigsub').textContent = bigsub;
      var vb = document.querySelector('#place .votebox'); if (vb) vb.outerHTML = voteHtml(p);
      return;
    }
    $('place').innerHTML = '<button type="button" class="x" id="closeplace">Close</button>' +
      '<p class="meta">' + [A.locality(p), p.boro, CAT[p.cat] || p.cat].filter(Boolean).map(esc).join(' · ') + '</p><h2>' + esc(p.name) + '</h2>' +
      '<p class="st ' + st.cls + '">' + esc(st.text) + '</p>' +
      '<p class="big' + (view.long ? ' long' : '') + '">' + esc(big) + '</p><p class="bigsub">' + esc(bigsub) + '</p>' +
      '<p class="src' + (src.confirmed && !flagged ? ' ok' : '') + '">' + (src.confirmed && !flagged ? '✓ ' : '') + esc(src.text) + '</p>' + voteHtml(p) +
      (hol ? '<p class="banner">' + esc(hol.name) + ': hours may differ. Check with the shop before you go.</p>' : '') +
      '<table>' + rows + '</table>' +
      '<p class="addr">' + esc(A.address(p)) + '</p>' + (tags ? '<p class="tags">' + esc(tags) + '</p>' : '<p class="tags"></p>') +
      '<div class="actions">' + acts + '</div>' + reportHtml(p);
    $('place').hidden = false;
    if (!quiet) { $('place').scrollTop = 0; $('closeplace').focus({ preventScroll: true }); }
  }
  /* The visitors' side of a place: their confirmations, an open "wrong" report, the stars, and this visitor's own answers. */
  function voteHtml(p) {
    var v = sum(p), t = voteTarget(p), me = mine(), today = nowOf(p._a).calendarDate, a = V.myAttest(me, p), my = V.myStars(me, p), th = S.thanks[p.id] || {}, h = '<div class="votebox">';
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
    var f = { type: kind, place_id: p.id, place_name: p.name, note: note, app: app() };
    Object.keys(t.fields).forEach(function (k) { body.append(t.fields[k], f[k] == null ? '' : String(f[k]).slice(0, 600)); });
    var redraw = function () { var vb = document.querySelector('#place .votebox'); if (vb && S.selected === p.id) vb.outerHTML = voteHtml(p); };
    // shown at once, counted later: record first, take it back only if the request never left
    if (kind === 'attest') { V.recordAttest(me, p, nowOf(p._a).calendarDate); th.ok = true; th.okErr = false; } else { V.recordStars(me, p, stars); th.star = true; th.starErr = false; }
    V.save(store, me); redraw();
    fetch(t.url, { method: 'POST', mode: 'no-cors', body: body }).catch(function () {
      S.mine = JSON.parse(before); V.save(store, S.mine);
      if (kind === 'attest') { th.ok = false; th.okErr = true; } else { th.star = false; th.starErr = true; }
      redraw();
    });
  }
  function reportTarget() { return form((S.manifest && S.manifest.report && S.manifest.report.kind === 'google_form' && S.manifest.report) || REPORT_FALLBACK); }
  function fineReport() { return 'Sends this place, your choice, your note and this page\'s version ("' + app() + '"). No location, no name, no email.'; }
  function fineHours() { return 'Sends this place, the hours above, a random ID so that one person counts once, and this page\'s version ("' + app() + '"). No location, no name, no email.'; }
  function reportHtml(p) {
    if (!reportTarget()) return '<details class="wrong"><summary>Hours wrong?</summary><p class="fine" style="margin-top:8px">Email <a href="mailto:dangochains@googlegroups.com?subject=' +
      encodeURIComponent('Latecup hours: ' + p.name + ' (' + p.id + ')') + '">dangochains@googlegroups.com</a> with the right hours and where you saw them.</p></details>';
    var kinds = '<select name="type" aria-label="What is wrong">' + KINDS.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + '</option>'; }).join('') + '</select>';
    if (!S.v11) return '<details class="wrong"><summary>Hours wrong?</summary><form id="report">' + kinds +
      '<textarea name="note" maxlength="500" placeholder="Optional: the right hours, and where you saw them" aria-label="Note"></textarea>' +
      '<button type="submit" class="btn">Send</button>' +
      '<p class="fine">' + fineReport() + '</p></form></details>';
    /* Fix the hours: the week filled in with what we show, changed in place and sent as a table. The other reasons stay as they are. */
    var good = !T.check(p.hours);
    S.ed = { model: good ? T.rows(p.hours) : T.blank(), feed: good ? p.hours : null }; // the feed's own days: one the visitor leaves alone is sent exactly as the feed has it
    return '<details class="wrong"><summary>Hours wrong?</summary><form id="report">' + kinds +
      '<div class="fixbox"><p class="fine">Change this week to the right hours, then send.</p>' + editorHtml(S.ed.model) + '</div>' +
      '<textarea name="note" maxlength="500" placeholder="Optional: what you saw, and where" aria-label="Note" hidden></textarea>' +
      '<p class="ederr" role="alert" hidden></p><button type="submit" class="btn">Send</button>' +
      '<p class="fine what">' + fineHours() + '</p>' +
      '<button type="button" class="linkbtn" id="flagonly">I don\'t know the right hours. Just report them as wrong.</button></form></details>';
  }
  function sendReport(fields) { // form-encoded POST; the answer is opaque (no-cors), so a network error is the only failure seen
    var r = reportTarget(), body = new URLSearchParams();
    Object.keys(r.fields).forEach(function (k) { body.append(r.fields[k], fields[k] == null ? '' : String(fields[k]).slice(0, 600)); });
    return fetch(r.url, { method: 'POST', mode: 'no-cors', body: body });
  }
  window.LatecupReport = { target: reportTarget, send: sendReport, app: app };
  function setHash() { // the address names the open place; with more than one area, also the city when it isn't the first
    var p = S.selected && S.byId[S.selected], parts = [];
    if (p) parts.push('p=' + encodeURIComponent(p.id));
    if (S.multi) {
      if (!p && S.hood) parts.push('hood=' + encodeURIComponent(S.hood));
      var a = p ? p._a : S.hood ? S.hoodArea : S.overview || S.outside ? null : S.focus;
      if (a && a !== S.areas[0]) parts.push('a=' + a.id);
    }
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search);
  }
  function openPlace(id, fly) {
    var p = placeById(id); if (!p) return;
    endAdd();
    S.selected = id; renderPlace(p);
    if (S.ready && S.map) {
      S.map.setFilter('selected', ['==', ['get', 'id'], p._help ? '' : id]);
      var need = fly || !S.map.getBounds().contains([p.lon, p.lat]);
      if (need) S.map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(S.map.getZoom(), 15), duration: 600 });
    }
    if (!p._help) setHash();
  }
  function closePlace() {
    endAdd();
    S.selected = null; S.ed = null; $('place').hidden = true; $('place').innerHTML = '';
    if (S.ready) S.map.setFilter('selected', ['==', ['get', 'id'], '']);
    setHash();
  }

  /* ---------- the week editor (table.js holds its model and its rules) ---------- */
  function hhmm(min) { return min === null || min === undefined ? '' : ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + min % 60).slice(-2); }
  function clockOf(text) { // "20:30" from a time field; "8:30 pm" or "8 pm" where a browser gives a plain text field in its place
    var m = /^\s*(\d{1,2})(?::(\d\d))?(?::\d\d)?\s*(?:([ap])\.?\s*m?\.?)?\s*$/i.exec(text || ''); if (!m) return null;
    var h = +m[1], mm = +(m[2] || 0), ap = (m[3] || '').toLowerCase();
    if (ap) { if (h < 1 || h > 12) return null; h = h % 12 + (ap === 'p' ? 12 : 0); }
    return h > 23 || mm > 59 ? null : h * 60 + mm;
  }
  function editorHtml(m) {
    var h = '<div class="ed' + (m.same ? ' same' : '') + '"><label class="edsame"><input type="checkbox" data-ed="same" aria-label="Same hours each day"' + (m.same ? ' checked' : '') + '> Same hours each day</label>';
    (m.same ? [0] : [0, 1, 2, 3, 4, 5, 6]).forEach(function (d) {
      var day = m.days[d], name = m.same ? 'Each day' : H.DAYS[d], open = day.state === 'open';
      var span = function (s, i) {
        return '<span class="sp" data-span="' + i + '"><input type="time" data-ed="open" value="' + hhmm(s[0]) + '" aria-label="' + name + ', opens"><span class="to">to</span>' +
          '<input type="time" data-ed="close" value="' + hhmm(s[1]) + '" aria-label="' + name + ', closes">' +
          (i ? '<button type="button" class="edx" data-ed="del" aria-label="' + name + ': remove these hours">×</button>' : '') + '</span>';
      };
      h += '<div class="edrow" data-day="' + d + '"><span class="d">' + (m.same ? 'Each day' : H.DOW[d]) + '</span><div class="v">' + (open ? span(day.spans[0], 0) : '') +
        '<select data-ed="state" aria-label="' + name + '">' + [['open', 'Open'], ['closed', 'Closed'], ['all', '24 hours']].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === day.state ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
        (open ? day.spans.slice(1).map(function (s, i) { return span(s, i + 1); }).join('') : '') +
        (open && day.spans.length < T.MAX_SPANS ? '<button type="button" class="edadd" data-ed="add" aria-label="' + name + ': add another opening">+ hours</button>' : '') + '</div></div>';
    });
    return h + '</div>';
  }
  function readEditor(root) { // what is typed → the model
    var m = S.ed.model;
    root.querySelectorAll('.edrow').forEach(function (row) {
      var day = m.days[+row.dataset.day];
      day.state = row.querySelector('[data-ed=state]').value;
      row.querySelectorAll('.sp').forEach(function (sp) { day.spans[+sp.dataset.span] = [clockOf(sp.querySelector('[data-ed=open]').value), clockOf(sp.querySelector('[data-ed=close]').value)]; });
    });
    return m;
  }
  function redrawEditor(root, focus) { // drawn again from the model; the control that was used keeps the focus
    var ed = root.querySelector('.ed'); if (!ed) return;
    ed.outerHTML = editorHtml(S.ed.model);
    var el = focus && root.querySelector(focus); if (el) el.focus({ preventScroll: true });
  }
  var ED_ERR = { blank: ' has a time missing. Fill in both, or mark the day closed.', overlap: ' has two openings that run into each other.', midnight: ' runs past midnight and on past the next day\'s first opening. Check both days.' };
  function edError(f, r) {
    var el = f.querySelector('.ederr'), day = r.day >= 0 && !S.ed.model.same ? H.DAYS[r.day] : 'The week';
    el.textContent = r.error === 'same' ? 'These are the hours already shown. Change what is wrong first.'
      : r.error === 'net' ? "That didn't send. Check your connection and try again."
      : r.error === 'name' ? 'Give the café\'s name.'
      : ED_ERR[r.error] ? day + ED_ERR[r.error] : 'These hours don\'t make a week we can read. Check them and try again.';
    el.hidden = false;
  }
  /* Hours and new cafés carry the visitor's random ID, made here if this browser has none yet, so that one person counts once. */
  function sendWithId(f, build, done) {
    var me = mine(), before = JSON.stringify(me), fields = build(V.ensureId(me)), btn = f.querySelector('button[type=submit]');
    if (!fields.note) { S.mine = JSON.parse(before); return edError(f, { error: 'days', day: -1 }); }
    V.save(store, me); btn.disabled = true;
    sendReport(fields).then(function () { var d = f.closest('details'); if (d) d.dataset.sent = '1'; S.ed = null; f.outerHTML = done; },
      function () { S.mine = JSON.parse(before); V.save(store, S.mine); btn.disabled = false; edError(f, { error: 'net', day: -1 }); });
  }
  function sendHours(p, f, done) { // a `fix`: the week as a table, for a place of the feed or of the help file
    var r = T.table(readEditor(f), S.ed.feed);
    if (r.error) return edError(f, r);
    if (S.ed.feed && r.touched.indexOf(true) < 0) return edError(f, { error: 'same', day: -1 });
    sendWithId(f, function (iid) { return { type: 'fix', place_id: p.id, place_name: p.name, note: T.fixNote(iid, p.hh || '0', r.table), app: app() }; }, done);
  }
  /* What the visitor is told after sending, truthfully. From this page hours are a report: they put the place on our list and change nothing by themselves. */
  var SENT = '<p class="sent" style="margin-top:10px">Sent. Thank you.</p>';
  var SENT_FIX = SENT + '<p class="fine">Hours sent from this page are a report, not a change. The place goes on the list we check, and the map changes once we have read the shop\'s own page.</p>';
  var SENT_HOURS = SENT + '<p class="fine">Hours sent from this page are a report. We check them against the café\'s own page, and if it is open until 8 PM or later on some night it then goes on the map.</p>';
  var SENT_CAFE = SENT + '<p class="fine">It shows up on the map after we have found the café\'s own page.</p>';

  /* A café of the help file: what we lack, and the same editor, empty or filled with its early hours. */
  function renderHelpPlace(p) {
    var early = p.why === 'early' && !T.check(p.hours), acts = linksHtml(p, false);
    S.ed = { model: early ? T.rows(p.hours) : T.blank(), feed: early ? p.hours : null };
    $('place').innerHTML = '<button type="button" class="x" id="closeplace">Close</button>' +
      '<p class="meta">' + [A.locality(p), p.boro, CAT[p.cat] || p.cat].filter(Boolean).map(esc).join(' · ') + '</p><h2>' + esc(p.name) + '</h2>' +
      '<p class="st off">' + (early ? 'Not on the late map' : 'No hours yet') + '</p>' +
      '<p class="src">' + (early ? 'Unconfirmed hours from OpenStreetMap have it closing before 8 PM each night. If that is wrong, put in the right hours.'
        : 'We have no hours for this café. If you know them, put them in.') + '</p>' +
      (A.address(p) ? '<p class="addr">' + esc(A.address(p)) + '</p>' : '') + (acts ? '<div class="actions">' + acts + '</div>' : '') +
      '<form id="addhours"><h3>' + (early ? 'Fix the hours' : 'Add hours') + '</h3>' + editorHtml(S.ed.model) +
      '<p class="ederr" role="alert" hidden></p><button type="submit" class="btn">Send</button><p class="fine">' + fineHours() + '</p></form>';
    $('place').hidden = false; $('place').scrollTop = 0; $('closeplace').focus({ preventScroll: true });
  }

  /* ---------- Add a café: a pin placed by hand, then the form ---------- */
  function startAdd(name) {
    if (!S.ready) { message('Adding a café needs the map, which this browser could not draw.', 6000); return; }
    closePlace();
    S.add = { name: name, cat: 'coffee', link: '', model: T.blank(), ll: null, moved: false, mark: null };
    pinStep();
  }
  function pinStep() { // the pin sits at the middle of the visible map and the visitor moves the map under it
    var a = S.add;
    a.ll = null; a.moved = false; if (a.mark) { a.mark.remove(); a.mark = null; }
    $('place').hidden = true; $('place').innerHTML = '';
    opt('pinmark').hidden = false; opt('pinbar').hidden = false;
    pinState();
    if (opt('mapwrap').scrollIntoView && window.innerWidth <= 820) opt('mapwrap').scrollIntoView({ block: 'start' });
  }
  function pinState() {
    var c = S.map.getCenter(), z = S.map.getZoom(), area = A.at(S.areas, c.lat, c.lng);
    var own = !!S.user && !S.add.moved && A.miles(S.user.lat, S.user.lon, c.lat, c.lng) < 0.06; // the pin never starts on the visitor
    opt('pintext').textContent = !area ? 'That spot is outside the cities on Latecup.'
      : own ? 'The pin is on your own position. Move the map until the pin is on the café.'
      : z < Z_PIN ? 'Zoom in until you can see the street, then move the map until the pin is on the café.'
      : 'Move the map until the pin is on the café.';
    opt('pinok').disabled = !area || own || z < Z_PIN;
  }
  function pinDone() {
    var c = S.map.getCenter(), a = S.add;
    a.ll = { lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5) };
    opt('pinmark').hidden = true; opt('pinbar').hidden = true;
    a.mark = new maplibregl.Marker({ color: C.plenty }).setLngLat([a.ll.lon, a.ll.lat]).addTo(S.map);
    addForm();
  }
  function addForm() {
    var a = S.add, area = A.at(S.areas, a.ll.lat, a.ll.lon) || S.focus;
    S.ed = { model: a.model, feed: null };
    $('place').innerHTML = '<button type="button" class="x" id="closeplace">Close</button><p class="meta">' + esc(area.name) + '</p><h2>Add a café</h2>' +
      '<p class="src">For a coffee shop, tea house or dessert café that is open until 8 PM or later on some night and is not on the map.</p>' +
      '<form id="newcafe"><label class="fld">Name<input type="text" name="name" maxlength="80" required value="' + esc(a.name) + '"></label>' +
      '<p class="pinline">Pin placed at ' + a.ll.lat.toFixed(5) + ', ' + a.ll.lon.toFixed(5) + '. <button type="button" class="linkbtn" id="movepin">Move it</button></p>' +
      '<label class="fld">Kind<select name="cat">' + T.CATS.map(function (c) { return '<option value="' + c + '"' + (c === a.cat ? ' selected' : '') + '>' + CAT[c] + '</option>'; }).join('') + '</select></label>' +
      '<h3>Hours</h3>' + editorHtml(a.model) +
      '<label class="fld">Its website or Instagram, if you know it<input type="text" name="link" maxlength="200" placeholder="example.com or @name" value="' + esc(a.link) + '" autocapitalize="off" autocomplete="off"></label>' +
      '<p class="ederr" role="alert" hidden></p><button type="submit" class="btn">Send</button>' +
      '<p class="fine">Sends the name, the spot where you put the pin, the kind of place, the hours, the link if you gave one, a random ID so that one person counts once, and this page\'s version ("' + app() + '"). The pin is where you put it, not where you are. No email.</p></form>';
    $('place').hidden = false; $('place').scrollTop = 0;
  }
  function keepAdd(f) { var a = S.add; a.name = f.name.value; a.cat = f.cat.value; a.link = f.link.value; readEditor(f); }
  function endAdd() {
    if (!S.add) return;
    if (S.add.mark) S.add.mark.remove();
    opt('pinmark').hidden = true; opt('pinbar').hidden = true; S.add = null;
  }
  function sendCafe(f) {
    var a = S.add; keepAdd(f);
    var name = a.name.trim(), r = T.table(a.model);
    if (!name) return edError(f, { error: 'name', day: -1 });
    if (r.error) return edError(f, r);
    sendWithId(f, function (iid) { return { type: 'add', place_id: '', place_name: name, note: T.addNote(iid, a.ll.lat, a.ll.lon, a.cat, r.table, a.link), app: app() }; }, SENT_CAFE);
  }

  /* ---------- map ---------- */
  function pill(fill, stroke) { // a stretchable rounded pin, drawn at 2x
    var w = 44, h = 36, c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), r = 15, x = 3, y = 3, ww = w - 6, hh = h - 6;
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath();
    g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = stroke; g.stroke();
    return [g.getImageData(0, 0, w, h), { pixelRatio: 2, stretchX: [[19, 25]], stretchY: [[17, 19]], content: [12, 7, 32, 29] }];
  }
  function startView(a) { // where the map opens on an area: the first one as it has opened since 1.0, another at its own zoom
    var z = isFinite(a.zoom) ? a.zoom : 12;
    return { center: [a.center[1], a.center[0]], zoom: a === S.areas[0] ? Math.max(12.05, z - (window.innerWidth < 820 ? 0.4 : 0)) : Math.max(Z_AREAS + 1.5, z) };
  }
  function everything() { // a rectangle around all the areas
    var b = [180, 90, -180, -90];
    S.areas.forEach(function (a) { b = [Math.min(b[0], a.bbox[0]), Math.min(b[1], a.bbox[1]), Math.max(b[2], a.bbox[2]), Math.max(b[3], a.bbox[3])]; });
    return b;
  }
  function initMap() {
    var c = S.focus, view = startView(c), style = (S.manifest.map && S.manifest.map.style_dark) || FALLBACK_STYLE;
    var o = { container: 'map', style: style, center: view.center, zoom: view.zoom,
      minZoom: 9, maxZoom: 18, attributionControl: false, dragRotate: false, pitchWithRotate: false,
      maxBounds: [[c.bbox[0] - 0.6, c.bbox[1] - 0.4], [c.bbox[2] + 0.6, c.bbox[3] + 0.4]] };
    if (S.multi) { var e = everything(); o.minZoom = 2; o.maxBounds = [[Math.max(-179, e[0] - 10), Math.max(-80, e[1] - 8)], [Math.min(179, e[2] + 10), Math.min(80, e[3] + 8)]]; }
    var map = S.map = new maplibregl.Map(o);
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Places © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    var failed = false;
    map.on('error', function (e) {
      if (!S.ready && !failed && style !== FALLBACK_STYLE && e && e.error && /style|fetch|load/i.test(String(e.error.message))) { failed = true; map.setStyle(FALLBACK_STYLE); }
    });
    map.on('load', function () {
      var from = S.multi ? { minzoom: Z_AREAS } : {}; // with more than one area, places show from the zoom where the bubbles stop
      var layer = function (def) { for (var k in from) def[k] = Math.max(def[k] || 0, from[k]); map.addLayer(def); };
      ['plenty', 'under2', 'soon'].forEach(function (k) {
        var im = pill(C[k], C.halo); map.addImage('pill-' + k, im[0], im[1]);
        if (S.v11) { im = pill(C.surface, C[k]); map.addImage('pill-o-' + k, im[0], im[1]); }
      });
      if (S.v11) { // gray dots of the Help switch, under everything else
        map.addSource('help', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        layer({ id: 'help', type: 'circle', source: 'help', paint: { 'circle-color': C.closed, 'circle-stroke-color': C.faint, 'circle-stroke-width': 1.2,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2.5, 13, 5, 16, 7] } });
      }
      map.addSource('places', { type: 'geojson', data: geojson(), cluster: true, clusterRadius: 40, clusterMaxZoom: 11 });
      layer({ id: 'clusters', type: 'circle', source: 'places', filter: ['has', 'point_count'],
        paint: { 'circle-color': '#20252E', 'circle-stroke-color': C.plenty, 'circle-stroke-width': 1.5, 'circle-radius': ['step', ['get', 'point_count'], 15, 10, 18, 40, 22, 120, 26] } });
      layer({ id: 'cluster-count', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true }, paint: { 'text-color': C.plenty } });
      var state = ['match', ['get', 'state'], 'under2', C.under2, 'soon', C.soon, C.plenty], solid = ['==', ['get', 'solid'], 1];
      layer({ id: 'dots', type: 'circle', source: 'places', filter: ['!', ['has', 'point_count']],
        paint: { 'circle-color': S.v11 ? ['case', solid, state, C.surface] : state, 'circle-radius': ['case', ['==', ['get', 'chain'], 1], 4, 5.5],
          'circle-stroke-color': S.v11 ? ['case', solid, C.halo, state] : C.halo, 'circle-stroke-width': 1.5 } });
      var pin = function (id, filter, minzoom, size) {
        layer({ id: id, type: 'symbol', source: 'places', minzoom: minzoom, filter: filter,
          layout: { 'icon-image': S.v11 ? ['concat', 'pill-', ['case', solid, '', 'o-'], ['get', 'state']] : ['concat', 'pill-', ['get', 'state']], 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 6, 2, 6], 'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Bold'], 'text-size': size, 'text-letter-spacing': 0.01, 'symbol-sort-key': ['get', 'sort'], 'text-padding': 3, 'icon-padding': 3 },
          paint: { 'text-color': S.v11 ? ['case', solid, C.onPin, state] : C.onPin } });
      };
      pin('pins-chain', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'chain'], 1]], 14.2, 11);
      pin('pins', ['all', ['!', ['has', 'point_count']], ['==', ['get', 'chain'], 0]], 0, 13);
      layer({ id: 'selected', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], S.selected || ''],
        paint: { 'circle-radius': 21, 'circle-color': 'rgba(245,177,76,0)', 'circle-stroke-color': '#FFE2A8', 'circle-stroke-width': 2.5 } });
      var hand = function (id) {
        map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
      };
      var placing = function () { return !!S.add && !S.add.ll; }; // while the pin of a new café is being placed, a tap on the map opens nothing
      ['pins', 'pins-chain', 'dots'].forEach(function (id) {
        map.on('click', id, function (e) { if (placing()) return; if (e.features && e.features[0]) { e.originalEvent.cancelBubble = true; openPlace(e.features[0].properties.id); } });
        hand(id);
      });
      if (S.v11) { // a gray dot answers a tap only when no place under the finger did
        map.on('click', 'help', function (e) { if (placing() || e.originalEvent.cancelBubble) return; if (e.features && e.features[0]) openPlace(e.features[0].properties.id); });
        hand('help');
      }
      map.on('click', 'clusters', function (e) {
        var f = e.features[0];
        Promise.resolve(map.getSource('places').getClusterExpansionZoom(f.properties.cluster_id)).then(function (z) { map.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3 }); });
      });
      hand('clusters');
      if (S.multi) { // zoomed out: one bubble per area at its center, with its count
        map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: S.areas.map(function (a) {
          var n = typeof a.count === 'number' && isFinite(a.count) ? a.count : 0;
          return { type: 'Feature', geometry: { type: 'Point', coordinates: [a.center[1], a.center[0]] }, properties: { id: a.id, name: a.name, label: !n ? '' : n < 1000 ? String(n) : (n / 1000).toFixed(1) + 'k', sort: -n } };
        }) } });
        map.addLayer({ id: 'areas', type: 'circle', source: 'areas', maxzoom: Z_AREAS,
          paint: { 'circle-color': C.raised, 'circle-stroke-color': C.plenty, 'circle-stroke-width': 1.5, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 6, 3.5, 12, 6, 20, Z_AREAS, 25] } });
        // the names first, then the counts above them: a count is never hidden by a neighbor's name
        map.addLayer({ id: 'area-name', type: 'symbol', source: 'areas', minzoom: 3.2, maxzoom: Z_AREAS,
          layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12.5, 'text-anchor': 'top', 'text-max-width': 8, 'symbol-sort-key': ['get', 'sort'],
            'text-offset': ['interpolate', ['linear'], ['zoom'], 3.2, ['literal', [0, 1.0]], 6, ['literal', [0, 1.75]], Z_AREAS, ['literal', [0, 2.15]]] },
          paint: { 'text-color': C.ink, 'text-halo-color': C.halo, 'text-halo-width': 1.4 } });
        map.addLayer({ id: 'area-count', type: 'symbol', source: 'areas', minzoom: 3, maxzoom: Z_AREAS,
          layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 6, 13], 'text-allow-overlap': true, 'text-padding': 1 }, paint: { 'text-color': C.plenty } });
        map.on('click', 'areas', function (e) { var a = e.features && e.features[0] && areaById(e.features[0].properties.id); if (a) goTo(a); });
        hand('areas');
      }
      S.ready = true;
      if (S.multi) { locate(); renderArea(); }
      refresh();
      applyHash();
    });
    map.on('moveend', function (e) { if (S.ready) onMove(e); });
    map.on('move', function () { if (S.ready && S.add && !S.add.ll) pinState(); });
  }
  function applyHash() {
    var h = new URLSearchParams(location.hash.slice(1)), named = S.multi ? areaById(h.get('a')) : null, a = named || S.areas[0];
    var then = function (fn) { loadArea(a).then(function () { if (a === S.focus) renderArea(); fn(); }, function () {}); }; // the place or neighborhood is in that area's file
    if (h.get('p') && (S.byId[h.get('p')] || (named && !isLoaded(named)))) {
      then(function () { if (S.byId[h.get('p')]) openPlace(h.get('p'), true); else goTo(a); });
      return;
    }
    if (h.get('hood')) {
      then(function () {
        var name = h.get('hood'), pts = S.loaded[a.id].places.filter(function (p) { return p.hood === name; });
        if (!pts.length) return;
        S.hood = name; S.hoodArea = a; S.q = ''; $('q').value = ''; S.shown = PAGE;
        if (S.selected) { S.selected = null; $('place').hidden = true; $('place').innerHTML = ''; S.map.setFilter('selected', ['==', ['get', 'id'], '']); }
        var b = new maplibregl.LngLatBounds(); pts.forEach(function (p) { b.extend([p.lon, p.lat]); });
        S.map.fitBounds(b, { padding: 60, maxZoom: 15.5, duration: 0 });
        refresh();
      });
      return;
    }
    if (named) { // an area link: that area, and no place of another one left open over it
      if (S.selected || S.add) closePlace();
      if (named !== S.focus || S.overview || S.outside) goTo(named);
    }
  }
  function isLoaded(a) { return !!S.loaded[a.id] && S.loaded[a.id].state === 'ok'; }
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
    opt('helpsw').addEventListener('change', function () { // the Help switch: its file is fetched now, not before
      S.helpOn = this.checked; S.helpShown = PAGE;
      if (S.helpOn) { if (S.ready && S.multi && !S.overview) locate(); else loadHelp(S.focus); }
      helpData(); refresh({ listOnly: true, keepPanel: true });
    });
    opt('helpmore').addEventListener('click', function () { S.helpShown += PAGE; refresh({ listOnly: true, keepPanel: true }); });
    opt('helprows').addEventListener('click', function (e) { var b = e.target.closest('[data-id]'); if (b) openPlace(b.dataset.id, true); });
    $('count').addEventListener('click', function (e) {
      if (e.target.id === 'showcities' || e.target.id === 'hidecities') { S.cities = e.target.id === 'showcities'; refresh({ listOnly: true, keepPanel: true }); return; }
      if (e.target.id !== 'clearhood') return;
      S.hood = null; S.shown = PAGE; setHash(); refresh();
    });
    $('more').addEventListener('click', function () { S.shown += PAGE; refresh({ listOnly: true, keepPanel: true }); });
    $('rows').addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]'); if (b) return openPlace(b.dataset.id, true);
      var city = e.target.closest('[data-area]'); if (city && areaById(city.dataset.area)) { S.q = ''; $('q').value = ''; return goTo(areaById(city.dataset.area)); }
      if (e.target.id === 'allcities' && S.ready) { var all = everything(); S.away = null; S.map.fitBounds([[all[0], all[1]], [all[2], all[3]]], { padding: 30, duration: 0 }); }
      if (e.target.id === 'addcafe') startAdd(S.q.trim());
    });
    $('near').addEventListener('click', function () {
      var btn = this;
      if (S.user) { S.user = null; S.userArea = null; if (S.userMarker) S.userMarker.remove(); btn.setAttribute('aria-pressed', 'false'); btn.textContent = 'Near me'; refresh(); return; }
      if (!navigator.geolocation) { message('This browser has no location. The list stays sorted by latest closing.', 5000); return; }
      btn.textContent = 'Locating…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        var u = { lat: pos.coords.latitude, lon: pos.coords.longitude }, here = S.multi ? A.at(S.areas, u.lat, u.lon) : A.contains(S.areas[0], u.lat, u.lon) ? S.areas[0] : null;
        btn.textContent = 'Near me';
        if (!here && !S.multi) { message('You are outside New York City. Latecup covers the five boroughs for now.', 7000); return; }
        if (!here) { // the nearest city is worked out here in the page; the map does not move to where the visitor is
          S.away = A.nearest(S.areas, u.lat, u.lon);
          message("Latecup isn't where you are yet. The nearest city on the map is " + S.away.name + '.', 7000);
          refresh({ listOnly: true, keepPanel: true }); return;
        }
        S.user = u; S.userArea = here; btn.setAttribute('aria-pressed', 'true'); btn.textContent = 'Near me ✓';
        var el = document.createElement('div'); el.className = 'userdot';
        if (S.userMarker) S.userMarker.remove();
        S.userMarker = new maplibregl.Marker({ element: el }).setLngLat([u.lon, u.lat]).addTo(S.map);
        var to = { center: [u.lon, u.lat], zoom: Math.max(S.map.getZoom(), 14.5) };
        if (S.multi && (here !== S.focus || S.overview)) S.map.jumpTo(to); else S.map.easeTo(to);
        refresh();
      }, function () { btn.textContent = 'Near me'; message('Location is off for this page. The list stays sorted by latest closing.', 6000); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 120000 });
    });
    $('place').addEventListener('click', function (e) {
      if (e.target.id === 'closeplace') closePlace();
      if (e.target.id === 'attest' && S.selected) { e.target.disabled = true; sendVote(S.byId[S.selected], 'attest'); }
      var star = e.target.closest && e.target.closest('[data-star]');
      if (star && S.selected) sendVote(S.byId[S.selected], 'rate', +star.dataset.star);
      if (e.target.id === 'share') {
        var sp = S.byId[S.selected], url = location.origin + location.pathname + '#p=' + encodeURIComponent(S.selected) + (S.multi && sp && sp._a !== S.areas[0] ? '&a=' + sp._a.id : ''), b = e.target;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { b.textContent = 'Link copied'; }, function () { prompt('Copy this link', url); });
      }
      var ed = e.target.closest && e.target.closest('[data-ed]'), f = e.target.closest && e.target.closest('form');
      if (ed && f && S.ed && (ed.dataset.ed === 'add' || ed.dataset.ed === 'del')) { // one more opening on a day, or one fewer
        var dn = ed.closest('.edrow').dataset.day, day = readEditor(f).days[+dn];
        if (ed.dataset.ed === 'add') day.spans.push([null, null]); else day.spans.splice(+ed.closest('.sp').dataset.span, 1);
        redrawEditor(f, ed.dataset.ed === 'add' ? '.edrow[data-day="' + dn + '"] .sp:last-of-type [data-ed=open]' : '.edrow[data-day="' + dn + '"] [data-ed=state]');
      }
      if (e.target.id === 'flagonly' && S.selected) { // no table: the report it has always been
        var p = S.byId[S.selected], rf = e.target.closest('form'), d = rf.closest('details');
        e.target.disabled = true;
        sendReport({ type: 'hours', place_id: p.id, place_name: p.name, note: '', app: app() }).then(function () {
          d.dataset.sent = '1'; rf.outerHTML = '<p class="sent" style="margin-top:10px">Sent. Thank you. Reports are checked against the shop\'s own site or page, or the chain\'s store locator.</p>';
        }, function () { e.target.disabled = false; edError(rf, { error: 'net', day: -1 }); });
      }
      if (e.target.id === 'movepin' && S.add) { keepAdd(e.target.closest('form')); pinStep(); }
    });
    $('place').addEventListener('change', function (e) {
      var f = e.target.closest('form'); if (!f) return;
      if (e.target.name === 'type' && f.id === 'report' && S.v11) { // the table is for wrong hours; the other reasons keep their note
        var hours = e.target.value === 'hours';
        f.querySelector('.fixbox').hidden = !hours; f.querySelector('#flagonly').hidden = !hours; f.querySelector('textarea').hidden = hours;
        f.querySelector('.what').textContent = hours ? fineHours() : fineReport(); f.querySelector('.ederr').hidden = true;
      }
      var k = e.target.dataset && e.target.dataset.ed;
      if (!k || !S.ed) return;
      var m = readEditor(f);
      if (k === 'same') T.setSame(m, e.target.checked);
      if (k === 'state') { var day = m.days[+e.target.closest('.edrow').dataset.day]; if (day.state === 'open' && !day.spans.length) day.spans = [[null, null]]; }
      if (k === 'same') redrawEditor(f, '[data-ed=same]');
      if (k === 'state') redrawEditor(f, '.edrow[data-day="' + e.target.closest('.edrow').dataset.day + '"] [data-ed=state]');
      f.querySelector('.ederr').hidden = true;
    });
    $('place').addEventListener('submit', function (e) {
      var f = e.target;
      if (f.id === 'addhours') { e.preventDefault(); return sendHours(S.helpById[S.selected], f, SENT_HOURS); }
      if (f.id === 'newcafe') { e.preventDefault(); return sendCafe(f); }
      if (f.id !== 'report') return;
      e.preventDefault();
      var p = S.byId[S.selected], d = f.closest('details');
      if (S.v11 && f.type.value === 'hours') return sendHours(p, f, SENT_FIX);
      var send = f.querySelector('button[type=submit]');
      send.disabled = true;
      sendReport({ type: f.type.value, place_id: p.id, place_name: p.name, note: f.note.value, app: app() }).then(function () {
        d.dataset.sent = '1'; f.outerHTML = '<p class="sent" style="margin-top:10px">Sent. Thank you. Reports are checked against the shop\'s own site or page, or the chain\'s store locator.</p>';
      }, function () { send.disabled = false; (f.querySelector('.what') || f.querySelector('.fine')).textContent = "That didn't send. Check your connection and try again."; });
    });
    opt('pinok').addEventListener('click', function () { if (S.add && !S.add.ll) pinDone(); });
    opt('pincancel').addEventListener('click', endAdd);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (S.selected || S.add)) closePlace(); });
    window.addEventListener('hashchange', function () { if (S.ready) applyHash(); });
    var showid = $('showid'), forgetid = $('forgetid'); // "Delete your data": the visitor can see or remove what this browser keeps
    if (showid) showid.addEventListener('click', function () { $('myid').textContent = mine().iid || (S.v11 ? 'No ID yet: this browser has not sent a confirmation, a rating or hours.' : 'No ID yet: this browser has not sent a confirmation or rating.'); });
    if (forgetid) forgetid.addEventListener('click', function () {
      try { if (store) store.removeItem(V.KEY); } catch (e) { /* nothing kept */ }
      S.mine = null; S.thanks = {}; $('myid').textContent = 'Removed from this browser.';
      if (S.selected) renderPlace(placeById(S.selected), true);
    });
    document.addEventListener('submit', function (e) { // "Want Latecup in your city?", at the foot of the page and where the map has nothing
      var f = e.target;
      if (!f || (f.id !== 'cityform' && !(f.classList && f.classList.contains('cityask')))) return;
      e.preventDefault();
      var v = f.city.value.trim(); if (!v) return;
      if (!reportTarget()) { location.href = 'mailto:dangochains@googlegroups.com?subject=' + encodeURIComponent('Latecup in ' + v); return; }
      var fine = f.id === 'cityform' ? $('cityfine') : f.parentNode.querySelector('.fine');
      sendReport({ type: 'city', place_id: '', place_name: '', note: v, app: app() }).then(function () { f.outerHTML = '<p class="sent">Sent. Thank you.</p>'; },
        function () { if (fine) fine.textContent = "That didn't send. Check your connection and try again."; });
    });
  }
  function dayOptions() {
    var html = '';
    for (var i = 0; i < 7; i++) {
      var d = H.addDays(S.now.serviceDate, i), dt = new Date(d + 'T12:00:00Z');
      html += '<option value="' + i + '">' + (i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow night' : dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })) + '</option>';
    }
    if ($('day').innerHTML !== html) { $('day').innerHTML = html; $('day').value = String(S.day); }
  }
  /* The page's own words follow the feed: a paragraph marked data-if="one" is for a feed with one
     area and "many" for more; "v10" and "v11" likewise for the 1.1 fields. As written, the page is
     the one-area page. */
  function adapt() {
    var on = { one: !S.multi, many: S.multi, v10: !S.v11, v11: S.v11, vis: S.areas.some(A.visitors) }; // vis: somewhere, hours that visitors sent are published
    Array.prototype.forEach.call(document.querySelectorAll('[data-if]'), function (el) { el.hidden = !on[el.getAttribute('data-if')]; });
    /* A sentence more inside a paragraph that stays (data-more): it goes in here, after the words named in data-after. The paragraph as written
       is the one the page always had, down to its runs of text, so with one area it is drawn exactly as before. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-more]'), function (el) {
      if (!on[el.getAttribute('data-more')]) return;
      var after = el.getAttribute('data-after') || '', say = el.getAttribute('data-say') || '', walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), node, at;
      el.removeAttribute('data-more'); // once
      while (after && (node = walk.nextNode())) {
        at = node.nodeValue.indexOf(after);
        if (at >= 0) { at += after.length; node.nodeValue = node.nodeValue.slice(0, at) + say + node.nodeValue.slice(at); break; }
      }
    });
    if (S.v11 && $('cityfine')) $('cityfine').textContent = 'Sends the city name you type and this page\'s version ("' + app() + '"), nothing else.';
    if (S.v11) { $('indie').setAttribute('aria-label', 'Independent shops only'); $('confirmed').setAttribute('aria-label', 'Confirmed hours only'); } // a name that does not depend on how a reader works out a label
    if (!S.multi) return;
    var others = S.areas.slice(1), named = others.filter(function (a) { return A.announced(a, false); }).map(function (a) { return a.name; });
    /* What the page says of itself to a search engine or a link preview stops saying New York alone. The title follows the area (renderArea). */
    var where = 'New York City and ' + others.length + ' more US metro ' + (others.length === 1 ? 'area' : 'areas'), set = function (sel, text) { var el = document.querySelector(sel); if (el) el.setAttribute('content', text); };
    set('meta[name="description"]', 'A free map of coffee shops, tea houses and dessert cafés that are open late, in ' + where + '. Pick 8 PM, 10 PM, midnight or all night and see the closing time on each pin, with where the hours come from.');
    set('meta[property="og:title"]', 'Coffee shops open late, with closing times on the map');
    set('meta[property="og:description"]', 'Pick how late you need (8 PM, 10 PM, midnight, all night) and see which coffee shops are still open and until when, in ' + where + '. Free, no ads, no account.');
    var ld = document.querySelector('script[type="application/ld+json"]');
    try { var about = JSON.parse(ld.textContent); about.description = 'A map of coffee shops that are open late in ' + where + ', with the closing time on each pin.'; ld.textContent = JSON.stringify(about); } catch (e) { /* left as it is */ }
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill=others]'), function (el) { el.textContent = String(others.length); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill=hoods]'), function (el) { el.innerHTML = '<a href="nyc/">' + esc(el.textContent) + '</a>'; }); // New York's neighborhood pages
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill=announced]'), function (el) { // a city is named in the page's own text once half its independents are confirmed
      el.textContent = named.length ? ' At least half are confirmed so far in ' + (named.length < 2 ? named[0] : named.slice(0, -1).join(', ') + ' and ' + named[named.length - 1]) + '.' : '';
    });
    fetch(HERE + 'cities/', { method: 'HEAD' }).then(function (r) { // the list of city pages, once it has been built
      var nav = document.querySelector('.bar nav a[href="nyc/"]');
      if (r.ok && nav) { nav.setAttribute('href', 'cities/'); nav.textContent = 'Cities'; }
      if (r.ok) Array.prototype.forEach.call(document.querySelectorAll('[data-fill=pages]'), function (el) { el.innerHTML = ' <a href="cities/">The list of cities</a> has a page for each.'; });
    }).catch(function () {});
  }
  function start() {
    wire();
    fetch(FEED + 'manifest.json').then(function (r) { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); }).then(function (m) {
      S.manifest = m; S.areas = A.list(m);
      if (!S.areas.length || S.areas[0] !== m.cities[0]) throw new Error('manifest: the first city cannot be used');
      S.multi = S.areas.length > 1; S.v11 = A.v11(S.areas);
      S.focus = (S.multi && areaById(new URLSearchParams(location.hash.slice(1)).get('a'))) || S.areas[0]; // an area link opens on that area; otherwise the first one, as before
      adapt();
      return loadArea(S.focus);
    }).then(function () {
      S.now = nowOf(S.focus);
      renderArea();
      refresh();
      setInterval(function () { S.areas.forEach(function (a) { if (isLoaded(a)) loadVotes(a); }); }, 30 * 60000);
      try { if (!window.maplibregl) throw new Error('no maplibre'); initMap(); }
      catch (e) { S.ready = false; S.map = null; message('The map could not be drawn in this browser. The list still works.'); }
      setInterval(function () { refresh({ keepPanel: false }); }, 30000);
    }).catch(function (e) {
      if (window.console) console.error('Latecup:', e);
      $('rows').innerHTML = '<li class="empty">The list of places could not be loaded. Check your connection and reload the page.</li>'; $('count').textContent = '';
    });
  }
  /* areas.js and table.js came with areas. A copy of the page from before them (cached for a few minutes after an update) does not load them: fetch them here. */
  function boot() {
    var missing = [['areas.js', 'LatecupAreas'], ['table.js', 'LatecupTable']].filter(function (x) { return !window[x[1]]; }), left = missing.length;
    var go = function () { A = window.LatecupAreas; T = window.LatecupTable; start(); };
    if (!left) return go();
    missing.forEach(function (x) { var s = document.createElement('script'); s.src = HERE + x[0]; s.onload = s.onerror = function () { if (!--left) go(); }; document.head.appendChild(s); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
