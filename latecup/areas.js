/* Latecup areas (SPEC.md → "1.1: every US city" → Areas), shared by the web map and the page
   builder (_tools/latecup-pages/). No dependencies, no DOM.

   - The manifest's `cities` are areas: a rectangle (`bbox`: west, south, east, north) with a
     time zone, a places file and a votes file. `center` is lat, lon.
   - Rectangles may overlap. The area a point is in: the containing rectangle whose center is
     nearest. Outside all of them: the nearest area by center.
   - The coverage line, one per area, from the manifest's optional `indie` and
     `indie_confirmed`: "Dallas-Fort Worth · 112 late independents · 9 confirmed".
   - A manifest is "1.1" when it lists more than one area or carries one of the 1.1 fields
     (`indie`, `help`, `visitors`). With a 1.0 manifest the web map is the page it was before areas.
   - Publishing visitors' hours is off unless an area says `"visitors": true`. Without it no
     place of that area shows "Hours from N visitors", whatever its `src` says. */
(function (root) {
  'use strict';
  var FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/; // a file beside the manifest: no folder in its name
  var ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  function num(x) { return typeof x === 'number' && isFinite(x); }
  function count(x) { return num(x) && x >= 0 && Math.floor(x) === x; }
  var zones = {};
  function zoneOk(tz) {
    if (!(tz in zones)) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); zones[tz] = true; } catch (e) { zones[tz] = false; } }
    return zones[tz];
  }
  /* An entry the map can use: an id, a name, a zone this browser knows, a rectangle and its center, a places file. */
  function usable(a) {
    return !!a && typeof a === 'object' && typeof a.id === 'string' && ID.test(a.id) && typeof a.name === 'string' && !!a.name
      && typeof a.tz === 'string' && zoneOk(a.tz) && typeof a.places === 'string' && FILE.test(a.places)
      && Array.isArray(a.bbox) && a.bbox.length === 4 && a.bbox.every(num) && a.bbox[0] < a.bbox[2] && a.bbox[1] < a.bbox[3]
      && Array.isArray(a.center) && a.center.length === 2 && a.center.every(num)
      && (a.votes == null || (typeof a.votes === 'string' && FILE.test(a.votes)));
  }
  /* The manifest's areas, in its order. An entry that cannot be used is left out; an id listed twice counts once. */
  function list(manifest) {
    var seen = {}, out = [];
    ((manifest && Array.isArray(manifest.cities) && manifest.cities) || []).forEach(function (a) {
      if (usable(a) && !seen[a.id]) { seen[a.id] = true; out.push(a); }
    });
    return out;
  }
  function contains(a, lat, lon) { return lon >= a.bbox[0] && lon <= a.bbox[2] && lat >= a.bbox[1] && lat <= a.bbox[3]; }
  function miles(lat1, lon1, lat2, lon2) {
    var R = 3958.8, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  /* The area whose center is nearest to a point, or null for an empty list. On a tie the earlier entry wins. */
  function nearest(areas, lat, lon) {
    var best = null, d = Infinity;
    areas.forEach(function (a) { var m = miles(lat, lon, a.center[0], a.center[1]); if (m < d) { d = m; best = a; } });
    return best;
  }
  /* "Which area is this point in": the containing rectangle whose center is nearest, or null outside all of them. */
  function at(areas, lat, lon) { return nearest(areas.filter(function (a) { return contains(a, lat, lon); }), lat, lon); }
  /* The areas a visible map touches. box: { west, south, east, north }. */
  function touching(areas, box) {
    return areas.filter(function (a) { return a.bbox[0] <= box.east && a.bbox[2] >= box.west && a.bbox[1] <= box.north && a.bbox[3] >= box.south; });
  }
  /* The area the header follows: the one under the middle of the map; with the middle outside all
     of them, the nearest of those the map still touches; null when it touches none. */
  function focus(areas, lat, lon, box) { return at(areas, lat, lon) || nearest(touching(areas, box), lat, lon); }
  /* "Dallas-Fort Worth · 112 late independents · 9 confirmed", or null when the manifest does not say. */
  function coverage(a) {
    if (!a || !count(a.indie) || !count(a.indie_confirmed) || a.indie_confirmed > a.indie) return null;
    var rest = a.indie.toLocaleString('en-US') + (a.indie === 1 ? ' late independent' : ' late independents') + ' · ' + a.indie_confirmed.toLocaleString('en-US') + ' confirmed';
    return { indie: a.indie, confirmed: a.indie_confirmed, rest: rest, text: a.name + ' · ' + rest };
  }
  /* Named on the front page and in posts only once at least half of its late independents are confirmed. The launch city is exempt. */
  function announced(a, isFirst) {
    var c = coverage(a);
    return !!isFirst || (!!c && c.confirmed * 2 >= c.indie);
  }
  /* The help file of an area ({ file, count }), or null. */
  function help(a) {
    var h = a && a.help;
    return h && typeof h === 'object' && typeof h.file === 'string' && FILE.test(h.file) ? { file: h.file, count: count(h.count) ? h.count : null } : null;
  }
  /* True only where two visitors who agree really do change the map: the area carries "visitors": true. */
  function visitors(a) { return !!a && a.visitors === true; }
  function v11(areas) { return areas.length > 1 || areas.some(function (a) { return count(a.indie) || !!help(a) || visitors(a); }); }
  /* "New York time", "Los Angeles time": the first name of the area, for the clock line. */
  function clockName(a) { var n = a.name.split(' + ')[0]; return n === 'New York City' ? 'New York' : n; }
  /* The name inside a sentence: "Los Angeles and Orange County", "Detroit, Dearborn and Ann Arbor", "the SF Bay Area". */
  var THE = /^(Eastside|Twin Cities|Triangle|Triad|Inland Empire|East Bay|South Bay|Peninsula|Bronx)$|(Bay Area|Valley)$/;
  function prose(name) {
    var parts = String(name).split(' + ').map(function (p) { return THE.test(p) ? 'the ' + p : p; });
    return parts.length < 2 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  }
  /* Where a place is, in a word: its neighborhood, or its city where it has none. */
  function locality(p) { return p.hood || p.city || ''; }
  /* The street address, with the city outside New York (New York's places say it with `boro`). */
  function address(p) { return p.addr ? p.addr + (p.city && !p.boro ? ', ' + p.city : '') : (p.city || ''); }
  var api = { usable: usable, list: list, contains: contains, miles: miles, nearest: nearest, at: at, touching: touching, focus: focus,
    coverage: coverage, announced: announced, help: help, visitors: visitors, v11: v11, clockName: clockName, prose: prose, locality: locality, address: address };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LatecupAreas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
