# Latecup pages tooling

Not published (the folder starts with `_`). Run from the repo root.

- `node _tools/latecup-pages/build.mjs` rebuilds `latecup/nyc/` (one page per neighbourhood with 3 or more late places, plus the index) from the live feed and rewrites the Latecup lines of `sitemap.xml`. Run it whenever the feed's places change. `--feed <folder or URL>` reads another copy of the feed.
- `node _tools/latecup-pages/test.mjs` tests `latecup/hours.js`, the "late" rules shared by the web map and these pages (service day, chains across midnight, chips, both clock changes).
- `og.html` is the source of `latecup/og.png`: serve the repo (`python3 -m http.server`), open the file at 1200×630 in a headless browser and screenshot it.
- `latecup/lib/` holds MapLibre GL JS, copied unmodified from npm (version in `latecup/lib/README.txt`).
- `latecup/config.js` holds the report form's address until the feed's manifest carries it (`Latecup/marketing/report-form.md`).
