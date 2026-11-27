// The page of this checkout against the page of a git ref (origin/main unless told otherwise),
// side by side on the LIVE feed. This is the check behind "with a one-area manifest the map is
// the page it was": each state below is put on both pages, and what they show, draw, link to,
// fetch and send is compared. Not published (the folder starts with _), and not run by the
// workflow: it needs Playwright, which this repo does not install.
//
//   NODE_PATH=$(npm root -g) node _tools/latecup-pages/compare.cjs [--ref origin/main] [--quick] [--shots <folder>]
//   CHROME=/path/to/chrome ...      when the Playwright that is installed and the browser it has cached do not match
//                                   (on the Mac: Playwright 1.58.2 wants build 1208 and the cache holds 1255, so
//                                   CHROME=~/Library/Caches/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-mac-arm64/chrome-headless-shell).
//                                   Point it at what is there; do not download a browser for this.
//   --quick                         one clock, the places and one window size; about five minutes, not eleven
//
// Both pages run on localhost, each on its own port, from serve.mjs. Nothing reaches the real
// report form: the newer page sends to the stand-in by itself, the older one knows none, so
// requests to docs.google.com are answered here and never leave, and the browser is started
// unable to resolve that name at all.
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const { execFileSync, spawn } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright is not here. Run it as: NODE_PATH=$(npm root -g) node _tools/latecup-pages/compare.cjs'); process.exit(2); }
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const ROOT = path.join(__dirname, '..', '..'), REF = arg('--ref') || 'origin/main', QUICK = process.argv.includes('--quick');
const OUT = arg('--shots') ? path.resolve(arg('--shots')) : null; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const LIVE = 'https://juicypasta.github.io/latecup-data/v1/';
const ALL = { fri2240: '2026-11-28T03:40:00Z', fri1400: '2026-11-27T19:00:00Z', sat0330: '2026-11-28T08:30:00Z', tue0910: '2026-12-01T14:10:00Z', xmas: '2026-12-25T23:30:00Z' };
const NOWS = QUICK ? { fri2240: ALL.fri2240 } : ALL;
let OLD, NEW; // the two addresses, set once the two servers are up
const freePort = () => new Promise((done) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => done(p)); }); });
const serve = async (root) => { // serve.mjs on a free port; resolves when it answers
  const port = await freePort(), child = spawn(process.execPath, [path.join(__dirname, 'serve.mjs'), '--port', String(port), '--root', root], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://localhost:${port}/latecup/`)).ok) return { child, base: `http://localhost:${port}/latecup/` }; } catch (e) { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  child.kill(); throw new Error('the local server did not start');
};
let failures = 0, checks = 0;
const same = (what, a, b) => { // on a difference: the two values from a little before the place where they part
  checks++;
  const x = JSON.stringify(a), y = JSON.stringify(b); if (x === y) return;
  let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const from = Math.max(0, i - 120);
  failures++; console.log(`DIFFERENT: ${what}${from ? ` (the same for the first ${i} characters)` : ''}\n   old: ${x.slice(from, from + 500)}\n   new: ${y.slice(from, from + 500)}`);
};

const INIT = () => { // keep the map object the page makes, so its layers and data can be read
  let real, wrapped;
  Object.defineProperty(window, 'maplibregl', { configurable: true, get() { return wrapped; }, set(v) {
    real = v;
    wrapped = new Proxy(v, { get(t, k) { if (k !== 'Map') return t[k]; return class extends t.Map { constructor(...a) { super(...a); window.__map = this; } }; } });
  } });
};
async function open(browser, base, { now, hash = '', viewport = { width: 1280, height: 800 }, geo } = {}) {
  const context = await browser.newContext({ viewport, timezoneId: 'America/Los_Angeles', locale: 'en-US', ...(geo ? { geolocation: geo, permissions: ['geolocation'] } : {}) });
  const posts = [], gets = [];
  await context.route(/docs\.google\.com/, (route) => { posts.push(Object.fromEntries(new URLSearchParams(route.request().postData() || ''))); route.fulfill({ status: 200, body: 'ok' }); });
  const page = await context.newPage();
  page.on('request', (r) => {
    const u = r.url();
    if (r.method() === 'POST' && u.includes('/__report')) posts.push(Object.fromEntries(new URLSearchParams(r.postData() || '')));
    if (r.method() !== 'POST' && !/tiles\.openfreemap\.org\/(planet|fonts|sprites|natural_earth)/.test(u)) gets.push(u.replace(base, 'SITE/').replace(/\?.*$/, ''));
  });
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { page.__dialog = { type: d.type(), message: d.message(), value: d.defaultValue() }; d.dismiss(); });
  await page.addInitScript(INIT);
  await page.goto(base + (now ? '?now=' + now : '') + hash);
  await page.waitForFunction(() => window.__map && window.__map.loaded() && document.querySelectorAll('#rows li').length > 0, null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  return { page, context, posts, gets, errors };
}
const snap = (page) => page.evaluate(async () => {
  const m = window.__map, vis = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  const layers = m.getStyle().layers.filter((l) => l.source === 'places' || l.source === 'help' || l.source === 'areas');
  const src = m.getSource('places'), data = src.getData ? await src.getData() : src._data;
  const b = m.getMaxBounds();
  return {
    title: document.title, h1: document.querySelector('#controls h1').textContent, clock: document.getElementById('clock').textContent,
    head: [...document.querySelectorAll('head meta[name], head meta[property], head link[rel=canonical]')].map((m) => (m.getAttribute('name') || m.getAttribute('property') || 'canonical') + '=' + (m.content || m.getAttribute('href'))),
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((e) => e.textContent),
    boxes: [...document.querySelectorAll('input[type=checkbox]')].filter((e) => e.getClientRects().length).map((e) => [e.id, e.getAttribute('aria-label'), e.getAttribute('aria-labelledby'), e.checked].join('/')),
    holiday: vis(document.getElementById('holiday')) ? document.getElementById('holiday').textContent : null,
    chips: document.getElementById('chips').innerHTML, day: document.getElementById('day').innerHTML, dayValue: document.getElementById('day').value,
    controlsText: document.getElementById('controls').innerText, count: document.getElementById('count').innerHTML, rows: document.getElementById('rows').innerHTML,
    moreVisible: vis(document.getElementById('more')), listText: document.getElementById('list').innerText, msg: vis(document.getElementById('msg')) ? document.getElementById('msg').textContent : null,
    place: vis(document.getElementById('place')) ? document.getElementById('place').innerHTML : null,
    bodyText: document.body.innerText, nav: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') + ' | ' + a.textContent.trim()),
    hash: location.hash, layers, data, sources: Object.keys(m.getStyle().sources).filter((s) => !/openmaptiles|ne2_shaded|natural|openfreemap/.test(s)).sort(),
    minZoom: m.getMinZoom(), maxZoom: m.getMaxZoom(), maxBounds: b ? b.toArray() : null, center: m.getCenter().toArray().map((x) => +x.toFixed(5)), zoom: +m.getZoom().toFixed(3),
    selected: m.getFilter('selected'), images: ['pill-plenty', 'pill-under2', 'pill-soon', 'pill-o-plenty'].map((i) => m.hasImage(i)),
    stored: JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k).replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, '<uuid>')]))),
  };
});
/* Each run of text that is drawn, with the element it sits in. An element more inside a sentence, even a hidden one, cuts a run in
   two, and the letters beside the cut are drawn a shade differently: the same words, not the same picture. The text that never
   changes (below the map, and the line under the list) is compared once, at the end; what the script draws, in each state. */
const RUNS = (fixed) => {
  const out = [], walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), range = document.createRange(); let node;
  while ((node = walk.nextNode())) { if (!!node.parentElement.closest('main.text, .osm') !== fixed) continue; range.selectNodeContents(node); if (range.getClientRects().length) out.push(node.parentElement.tagName + '|' + node.nodeValue); }
  return out;
};
/* Two screenshots, pixel by pixel. A headless browser does not always round an anti-aliased edge the same way in
   two pages (one level out of 255, in a pixel or two), so a pixel counts as different from 3 levels up. Returns how many are. */
let bench;
const differing = async (browser, a, b) => {
  if (a.equals(b)) return 0;
  bench = bench || await (await browser.newContext()).newPage();
  return bench.evaluate(async ([x, y]) => {
    const load = (d) => new Promise((done, fail) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const g = c.getContext('2d'); g.drawImage(i, 0, 0); done(g.getImageData(0, 0, c.width, c.height)); }; i.onerror = fail; i.src = 'data:image/png;base64,' + d; });
    const p = await load(x), q = await load(y);
    if (p.width !== q.width || p.height !== q.height) return -1;
    let n = 0;
    for (let i = 0; i < p.data.length; i += 4) if (Math.abs(p.data[i] - q.data[i]) > 2 || Math.abs(p.data[i + 1] - q.data[i + 1]) > 2 || Math.abs(p.data[i + 2] - q.data[i + 2]) > 2) n++;
    return n;
  }, [a.toString('base64'), b.toString('base64')]);
};
const settle = async (page) => { await page.waitForTimeout(250); await page.waitForFunction(() => !window.__map || !window.__map.isMoving(), null, { timeout: 20000 }); await page.waitForTimeout(450); };
async function both(browser, opts, steps) { // the same steps on the old page and the new, compared after each
  const o = await open(browser, OLD, opts), n = await open(browser, NEW, opts);
  const uu = (v) => JSON.parse(JSON.stringify(v).replace(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g, '<uuid>'));
  const all = async (page) => uu({ ...(await snap(page)), runs: await page.evaluate(RUNS, false) });
  const cmp = async (label) => { const a = await all(o.page), b = await all(n.page); for (const k of Object.keys(a)) same(`${label}: ${k}`, a[k], b[k]); return [a, b]; };
  await steps(o, n, cmp);
  same('page errors, old', o.errors, []); same('page errors, new', n.errors, []);
  return [o, n];
}
const each = async (o, n, fn) => { await fn(o.page); await fn(n.page); await settle(o.page); await settle(n.page); };

(async () => {
  // the older page: latecup/ as the ref has it, in a folder of its own
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'latecup-compare-'));
  execFileSync('sh', ['-c', `git -C "${ROOT}" archive ${REF} latecup | tar -x -C "${tmp}"`]);
  const older = await serve(tmp), newer = await serve(ROOT); OLD = older.base; NEW = newer.base;
  const stop = () => { older.child.kill(); newer.child.kill(); fs.rmSync(tmp, { recursive: true, force: true }); };
  process.on('exit', stop);
  const manifest = await (await fetch(LIVE + 'manifest.json')).json(), first = manifest.cities[0];
  console.log(`${REF} against this checkout, on the live feed: ${manifest.cities.length} area(s), ${first.count} places, generated ${manifest.generated}` + (['indie', 'help', 'visitors'].some((k) => k in first) || manifest.cities.length > 1 ? '\nNOTE: the live manifest is a 1.1 manifest now. The newer page is meant to differ from the older one on it.' : ''));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP docs.google.com ~NOTFOUND'] }); // the real form cannot even be resolved
  const t0 = Date.now();

  // 1. Five clocks (one with --quick): first paint, the chips, a few interactions
  for (const [name, now] of Object.entries(NOWS)) {
    const [o, n] = await both(browser, { now }, async (o, n, cmp) => {
      const [a] = await cmp(`${name} first paint`);
      console.log(`${name}: ${a.clock} | ${a.count.replace(/<[^>]+>/g, '')} | ${a.data.features.length} pins | holiday: ${a.holiday}`);
      if (OUT) { await o.page.screenshot({ path: path.join(OUT, `${name}-old.png`) }); await n.page.screenshot({ path: path.join(OUT, `${name}-new.png`) }); }
      const left = { x: 0, y: 0, width: 400, height: 800 };
      let off = -1;
      for (let i = 0; i < 3 && off; i++) { await o.page.waitForTimeout(800); await n.page.waitForTimeout(400); off = await differing(browser, await o.page.screenshot({ clip: left }), await n.page.screenshot({ clip: left })); }
      same(`${name}: the left column, pixels that differ`, off, 0);
      off = -1; // the map fades labels in: look again before calling the two windows different
      for (let i = 0; i < 4 && off; i++) { await o.page.waitForTimeout(700); await n.page.waitForTimeout(700); off = await differing(browser, await o.page.screenshot(), await n.page.screenshot()); }
      same(`${name}: the whole window, map included, pixels that differ`, off, 0);
      for (const chip of await o.page.$$eval('#chips [data-chip]', (bs) => bs.map((b) => b.dataset.chip))) {
        await each(o, n, (p) => p.click(`#chips [data-chip="${chip}"]`)); await cmp(`${name} chip ${chip}`);
      }
      await each(o, n, (p) => p.selectOption('#day', '2')); await cmp(`${name} two nights on`);
      await each(o, n, (p) => p.selectOption('#day', '0'));
      await each(o, n, (p) => p.check('#indie')); await cmp(`${name} independent only`); await each(o, n, (p) => p.uncheck('#indie'));
      await each(o, n, (p) => p.check('#confirmed')); await cmp(`${name} confirmed only`); await each(o, n, (p) => p.uncheck('#confirmed'));
      for (const q of ['blue', 'astoria', 'zzzz no such place', 'st marks']) { await each(o, n, (p) => p.fill('#q', q)); await cmp(`${name} search "${q}"`); }
      await each(o, n, (p) => p.fill('#q', ''));
      if (await o.page.isVisible('#more')) { await each(o, n, (p) => p.click('#more')); await cmp(`${name} show more`); }
      await each(o, n, (p) => p.evaluate(() => window.__map.jumpTo({ center: [-73.95, 40.68], zoom: 13.4 }))); await cmp(`${name} map moved to Brooklyn`);
      await each(o, n, (p) => p.evaluate(() => window.__map.jumpTo({ zoom: 9 }))); await cmp(`${name} zoomed all the way out`);
    });
    same(`${name}: feed and page requests`, o.gets.filter((u) => !u.startsWith('SITE/')).sort(), n.gets.filter((u) => !u.startsWith('SITE/')).sort());
    const own = (x) => [...new Set(x.gets.filter((u) => u.startsWith('SITE/') && !/SITE\/(areas|table)\.js$/.test(u)))].sort(); // areas.js and table.js came with areas: an older ref does not load them
    same(`${name}: the page's own files, apart from the two scripts that came with areas`, own(o), own(n));
    same(`${name}: nothing posted`, [o.posts, n.posts], [[], []]);
    await o.context.close(); await n.context.close();
  }

  // 2. Places: the panel, the deep link, the report, a confirmation, a rating, the city request
  const feed = (await (await fetch(LIVE + first.places)).json()).places;
  const votes = first.votes ? (await (await fetch(LIVE + first.votes)).json()).votes : {};
  const pick = (f) => feed.filter(f).slice(0, 2).map((p) => p.id);
  const ids = [...new Set([...Object.keys(votes), ...pick((p) => p.src === 'shop'), ...pick((p) => p.src === 'brand'), ...pick((p) => p.src === 'osm' && !p.checked), ...pick((p) => p.src === 'osm' && p.checked),
    ...pick((p) => p.hours.every((d) => d.length === 1 && d[0][0] === 0 && d[0][1] === 1440)), ...pick((p) => p.hours.some((d) => !d.length)), ...pick((p) => p.hours.some((d) => d.length > 1)), ...pick((p) => !p.web && !p.phone), ...pick((p) => p.ig), ...pick((p) => p.tags)])].filter((id) => feed.some((p) => p.id === id));
  console.log(`${ids.length} places compared in the panel`);
  for (const now of QUICK ? [ALL.fri2240] : [ALL.fri2240, ALL.tue0910]) {
    const [o, n] = await both(browser, { now, hash: '#p=' + ids[0] }, async (o, n, cmp) => {
      await cmp('deep link #p= on load');
      for (const id of ids) {
        await each(o, n, (p) => p.evaluate((x) => { location.hash = '#p=' + x; }, id)); await cmp(`place ${id}`);
        await each(o, n, (p) => p.click('#place details.wrong summary')); await cmp(`place ${id}, Hours wrong? open`);
        await each(o, n, (p) => p.evaluate(() => { document.getElementById('place').scrollTop = 1e5; })); // the form is at the foot of the panel
        same(`place ${id}: the panel with the form open, pixels that differ`, await differing(browser, await o.page.locator('#place').screenshot(), await n.page.locator('#place').screenshot()), 0);
      }
      await each(o, n, (p) => p.click('#closeplace')); await cmp('place closed');
      await each(o, n, (p) => p.click('#rows li:nth-child(3) .row')); await cmp('a row tapped');
      await each(o, n, (p) => p.click('#share')); const port = (d) => JSON.parse(JSON.stringify(d).replace(/localhost:\d+/, 'localhost'));
      same('Copy link', port(o.page.__dialog || await o.page.textContent('#share')), port(n.page.__dialog || await n.page.textContent('#share')));
      console.log('   Copy link gives', JSON.stringify(n.page.__dialog));
      await each(o, n, (p) => p.keyboard.press('Escape')); await cmp('Escape');
      // a pin tapped on the map
      await each(o, n, async (p) => { const pt = await p.evaluate(async () => { const m = window.__map; m.jumpTo({ center: [-73.9911, 40.7359], zoom: 15 }); await new Promise((r) => m.once('idle', r)); const r = m.getCanvas().getBoundingClientRect(); const f = m.queryRenderedFeatures([[150, 150], [r.width - 150, r.height - 150]], { layers: ['pins'] })[0]; const xy = m.project(f.geometry.coordinates); return [r.left + xy.x, r.top + xy.y]; }); await p.mouse.click(pt[0], pt[1]); });
      same('the pin opened a place', [await o.page.isVisible('#place'), await n.page.isVisible('#place')], [true, true]);
      await cmp('a pin tapped');
      // the report, as it has always been sent
      await each(o, n, (p) => p.click('#place details.wrong summary'));
      await each(o, n, (p) => p.selectOption('#report select[name=type]', 'closed')); await each(o, n, (p) => p.fill('#report textarea', 'test: please ignore'));
      await each(o, n, (p) => p.click('#report button[type=submit]')); await cmp('report sent');
      // a confirmation and a rating
      await each(o, n, (p) => p.evaluate((x) => { location.hash = '#p=' + x; }, ids[1]));
      await each(o, n, (p) => p.click('#attest')); await cmp('Hours are right');
      await each(o, n, (p) => p.click('[data-star="4"]')); await cmp('four stars');
      await each(o, n, (p) => p.click('#closeplace'));
      await each(o, n, (p) => p.click('#showid')); same('the ID line', (await o.page.textContent('#myid')).replace(/[0-9a-f-]{36}/, '<uuid>'), (await n.page.textContent('#myid')).replace(/[0-9a-f-]{36}/, '<uuid>'));
      await each(o, n, (p) => p.fill('#cityform input', 'Testville')); await each(o, n, (p) => p.click('#cityform button')); await cmp('city request sent');
      await each(o, n, (p) => p.click('#forgetid')); await cmp('ID forgotten');
    });
    const norm = (posts) => posts.map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.replace(/iid=[0-9a-f-]{36}/, 'iid=<uuid>')])));
    same('what was posted, field for field', norm(o.posts), norm(n.posts));
    console.log('   posted by the newer page, to the stand-in:', JSON.stringify(norm(n.posts)));
    await o.context.close(); await n.context.close();
  }

  // 3. A neighborhood link, Near me inside and outside the city, a phone
  for (const hash of QUICK ? ['#hood=East%20Village', '#a=chicago'] : ['#hood=East%20Village', '#hood=Astoria', '#hood=Nowhere', '#p=n0', '#a=chicago', '#a=chicago&p=' + ids[0], '']) {
    const [o, n] = await both(browser, { now: NOWS.fri2240, hash }, async (o, n, cmp) => {
      await cmp(`link ${hash || '(none)'}`);
      if (/East/.test(hash)) { await each(o, n, (p) => p.click('#rows li:first-child .row')); await cmp('hood: a place opened'); await each(o, n, (p) => p.click('#closeplace')); await cmp('hood: place closed'); await each(o, n, (p) => p.click('#clearhood')); await cmp('hood: whole city'); }
    });
    await o.context.close(); await n.context.close();
  }
  for (const [label, geo] of [['in the East Village', { latitude: 40.7265, longitude: -73.9815 }], ['in Chicago', { latitude: 41.88, longitude: -87.63 }], ['in Hoboken, inside the rectangle', { latitude: 40.744, longitude: -74.032 }]]) {
    const [o, n] = await both(browser, { now: NOWS.fri2240, geo }, async (o, n, cmp) => {
      await each(o, n, (p) => p.click('#near')); await o.page.waitForTimeout(1500); await n.page.waitForTimeout(1500); await cmp(`Near me ${label}`);
      await each(o, n, (p) => p.click('#near')); await cmp(`Near me ${label}, off again`);
    });
    await o.context.close(); await n.context.close();
  }
  for (const viewport of QUICK ? [{ width: 390, height: 844 }] : [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 820, height: 1180 }, { width: 1920, height: 1080 }]) {
    const [o, n] = await both(browser, { now: NOWS.fri2240, viewport }, async (o, n, cmp) => {
      await cmp(`${viewport.width} wide`);
      // the whole page from top to bottom, a screen at a time (one picture of it all is too tall for the browser to take on a phone)
      const height = await o.page.evaluate(() => document.documentElement.scrollHeight);
      same(`${viewport.width} wide: the page is as tall`, await n.page.evaluate(() => document.documentElement.scrollHeight), height);
      let screens = 0, off = 0;
      for (let y = 0; y < height; y += viewport.height) {
        await each(o, n, (p) => p.evaluate((top) => window.scrollTo(0, top), y));
        off += await differing(browser, await o.page.screenshot(), await n.page.screenshot()); screens++;
      }
      same(`${viewport.width} wide: the whole page from top to bottom, ${screens} screens, pixels that differ`, off, 0);
      await each(o, n, (p) => p.evaluate(() => window.scrollTo(0, 0)));
      const [po, pn] = [await o.page.screenshot({ fullPage: false }), await n.page.screenshot({ fullPage: false })];
      if (OUT) { fs.writeFileSync(path.join(OUT, `${viewport.width}-old.png`), po); fs.writeFileSync(path.join(OUT, `${viewport.width}-new.png`), pn); }
      await each(o, n, (p) => p.evaluate(() => document.getElementById('list').scrollIntoView())); await o.page.waitForTimeout(300);
      await each(o, n, (p) => p.click('#rows li:nth-child(2) .row')); await cmp(`${viewport.width} wide, a place open`);
      const [qo, qn] = [await o.page.locator('#place').screenshot(), await n.page.locator('#place').screenshot()];
      same(`${viewport.width} wide: the place panel, pixels that differ`, await differing(browser, qo, qn), 0);
      await each(o, n, (p) => p.click('#place details.wrong summary')); await each(o, n, (p) => p.evaluate(() => { document.getElementById('place').scrollTop = 1e5; }));
      same(`${viewport.width} wide: the panel with the form open, pixels that differ`, await differing(browser, await o.page.locator('#place').screenshot(), await n.page.locator('#place').screenshot()), 0);
      if (OUT) fs.writeFileSync(path.join(OUT, `${viewport.width}-place-new.png`), qn);
    });
    await o.context.close(); await n.context.close();
  }
  // 4. The real clock, and the page's text below the map
  {
    const [o, n] = await both(browser, {}, async (o, n, cmp) => {
      // each page reads the clock when it draws: draw both again in the same minute, away from the turn of it
      const sec = new Date().getSeconds(); if (sec > 40 || sec < 3) await new Promise((r) => setTimeout(r, ((63 - sec) % 60) * 1000));
      await each(o, n, (p) => p.click('#chips [data-chip]'));
      const [a] = await cmp('the real clock'); console.log('now:', a.clock, '|', a.count);
    });
    same('the whole text of the page', await o.page.evaluate(() => document.querySelector('main.text').innerText), await n.page.evaluate(() => document.querySelector('main.text').innerText));
    same('the text that never changes, run by run', await o.page.evaluate(RUNS, true), await n.page.evaluate(RUNS, true));
    same('hidden extras stay hidden', await n.page.evaluate(() => ['cover', 'helprow', 'pinmark', 'pinbar', 'helplist'].map((id) => getComputedStyle(document.getElementById(id)).display)), ['none', 'none', 'none', 'none', 'none']);
    same('paragraphs for the other feed stay hidden', await n.page.evaluate(() => [...document.querySelectorAll('[data-if=many],[data-if=v11],[data-if=vis],[data-fill]')].filter((el) => el.offsetParent !== null || el.getClientRects().length > 0).length), 0);
    same('no sentence for the other feed was put into a paragraph', await n.page.evaluate(() => [...document.querySelectorAll('[data-after]')].filter((el) => !el.hasAttribute('data-more') || el.textContent.includes(el.getAttribute('data-say'))).length), 0);
    await o.context.close(); await n.context.close();
  }
  await browser.close();
  console.log(`${checks} comparisons, ${failures} different, ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
