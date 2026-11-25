// Turbulence tracker: the last 3 hours of pilot reports (PIREPs/AIREPs) from
// the NOAA/NWS Aviation Weather Center, as dots on the map page's base map.
// The feed is written hourly by jetcalm-data (jetcalm_data/reports.py) and read
// from raw.githubusercontent.com, because the AWC API sends no CORS header.
// Projection and land drawing copied from ../turbulence-map/map.js.

const FEED = 'https://raw.githubusercontent.com/JuicyPasta/jetcalm-data/main/reports/latest.json';
const STALE_MS = 3 * 3600e3;
const REFRESH_MS = 10 * 60e3;

// Forecast colours (../turbulence-forecast/page.css --l0..--l4); light-moderate sits between light and moderate.
const LEVELS = {
  smooth: { rank: 0, name: 'Smooth', color: '#6fbf9b' },
  light: { rank: 1, name: 'Light', color: '#cfe36a' },
  'light-moderate': { rank: 2, name: 'Light to moderate', color: '#cfe36a', color2: '#f2c14e' },
  moderate: { rank: 3, name: 'Moderate', color: '#f2c14e' },
  'moderate-severe': { rank: 4, name: 'Moderate to severe', color: '#f2c14e', color2: '#c9503c' },
  severe: { rank: 5, name: 'Severe', color: '#c9503c' },
  extreme: { rank: 6, name: 'Extreme', color: '#c9503c' },
};

const VIEWS = {
  usa: { latTop: 52, latBottom: 21, lonLeft: -128, lonRight: -63, name: 'USA' },
  world: { latTop: 78, latBottom: -78, lonLeft: -180, lonRight: 180, name: 'World' },
};
const ALTS = { all: () => true, cruise: (r) => r.fl >= 200 };

const $ = (id) => document.getElementById(id);
const swatch = (lv) => (lv.color2 ? `linear-gradient(90deg, ${lv.color} 50%, ${lv.color2} 50%)` : lv.color);
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const sea = () => (dark() ? '#10201f' : '#e4eef0');
const landColor = () => (dark() ? '#263836' : '#fbfaf5');
const coast = () => (dark() ? '#3d5451' : '#b8c6c4');

function lonScale(b) {
  const span = b.lonRight - b.lonLeft;
  if (span > 300) return 1;
  return Math.max(0.35, Math.cos((((b.latTop + b.latBottom) / 2) * Math.PI) / 180));
}
const aspect = (b) => ((b.lonRight - b.lonLeft) * lonScale(b)) / (b.latTop - b.latBottom);

/** Draws the base map and the dots; returns the number of dots drawn inside the canvas. */
export function draw(canvas, bounds, land, reports) {
  const cssWidth = canvas.clientWidth;
  const cssHeight = Math.round(cssWidth / aspect(bounds));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.height = `${cssHeight + 2}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = cssWidth;
  const h = cssHeight;
  ctx.fillStyle = sea();
  ctx.fillRect(0, 0, w, h);

  const ls = lonScale(bounds);
  const scale = Math.min(w / ((bounds.lonRight - bounds.lonLeft) * ls), h / (bounds.latTop - bounds.latBottom));
  const midLon = (bounds.lonLeft + bounds.lonRight) / 2;
  const midLat = (bounds.latTop + bounds.latBottom) / 2;
  const px = (lon) => w / 2 + (lon - midLon) * ls * scale;
  const py = (lat) => h / 2 - (lat - midLat) * scale;
  const visibleLeft = midLon - w / 2 / (ls * scale);
  const visibleRight = midLon + w / 2 / (ls * scale);

  const path = new Path2D();
  for (const shift of [-360, 0, 360]) {
    if (-180 + shift > visibleRight || 180 + shift < visibleLeft) continue;
    for (const ring of land.polygons) {
      for (let i = 0; i + 1 < ring.length; i += 2) {
        const x = px(ring[i] + shift);
        const y = py(ring[i + 1]);
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.closePath();
    }
  }
  ctx.fillStyle = landColor();
  ctx.fill(path);
  ctx.strokeStyle = coast();
  ctx.lineWidth = 0.7;
  ctx.stroke(path);

  // Calmest first, so the roughest reports sit on top.
  const r0 = w < 500 ? 3.5 : 4.5;
  const sorted = [...reports].sort((a, b) => LEVELS[a.level].rank - LEVELS[b.level].rank);
  let drawn = 0;
  ctx.lineWidth = 1;
  ctx.strokeStyle = dark() ? 'rgba(0,0,0,.7)' : 'rgba(18,48,44,.65)';
  for (const r of sorted) {
    const lv = LEVELS[r.level];
    const x = px(r.lon);
    const y = py(r.lat);
    if (x < -r0 || x > w + r0 || y < -r0 || y > h + r0) continue;
    const rad = lv.rank >= 4 ? r0 + 1.5 : r0;
    // In-between reports ("light to moderate") are split dots: left half the lower level, right half the higher.
    if (lv.color2) {
      ctx.beginPath();
      ctx.arc(x, y, rad, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fillStyle = lv.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, rad, -Math.PI / 2, Math.PI / 2);
      ctx.fillStyle = lv.color2;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 2 * Math.PI);
    if (!lv.color2) {
      ctx.fillStyle = lv.color;
      ctx.fill();
    }
    ctx.stroke();
    drawn++;
  }
  return drawn;
}

const fmt = (ms, opts) => new Intl.DateTimeFormat(undefined, opts).format(new Date(ms));
const clock = (ms) => fmt(ms, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

export function ago(ms, now) {
  const min = Math.max(0, Math.round((now - ms) / 60e3));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min ago` : `${h} h ago`;
}

export function altitude(fl) {
  const ft = (fl * 100).toLocaleString('en-US');
  return fl >= 180 ? `FL${String(fl).padStart(3, '0')} (${ft} ft)` : `${ft} ft`;
}

const place = (lat, lon) =>
  `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;

/** The roughest reports first, newest first within a level. */
export function strongest(reports, n) {
  return [...reports]
    .filter((r) => r.level !== 'smooth')
    .sort((a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank || b.ms - a.ms)
    .slice(0, n);
}

export function parseFeed(json) {
  if (!json || !Array.isArray(json.reports)) throw new Error('bad feed');
  const generated = Date.parse(json.generated);
  const reports = json.reports
    .filter((r) => LEVELS[r.level] && Number.isFinite(r.lat) && Number.isFinite(r.lon) && Number.isFinite(r.fl))
    .map((r) => ({ ...r, ms: Date.parse(r.t) }));
  return { generated, windowHours: json.window_hours || 3, reports };
}

function renderList(list, reports, now) {
  list.replaceChildren();
  const top = strongest(reports, 15);
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = reports.length
      ? 'Only smooth reports in this window. Quiet skies where pilots reported.'
      : 'No reports at these altitudes in this window.';
    list.append(li);
    return;
  }
  for (const r of top) {
    const lv = LEVELS[r.level];
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'dot';
    sw.style.background = swatch(lv);
    const main = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${lv.name} at ${altitude(r.fl)}`;
    const meta = document.createElement('span');
    meta.className = 'meta';
    const who = r.ac ? `${r.ac}` : r.type === 'AIREP' ? 'airliner position report' : 'aircraft type not given';
    meta.textContent = `${ago(r.ms, now)} (${clock(r.ms)}) · ${who} · ${place(r.lat, r.lon)}`;
    main.append(title, meta);
    li.append(sw, main);
    list.append(li);
  }
}

async function main() {
  const canvas = $('map');
  const status = $('map-status');
  const list = $('strongest');
  const q = new URLSearchParams(location.search);
  let view = VIEWS[q.get('view')] ? q.get('view') : 'usa';
  let alt = 'all';
  const viewButtons = [...document.querySelectorAll('[data-view]')];
  const altButtons = [...document.querySelectorAll('[data-alt]')];
  const press = () => {
    viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    altButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.alt === alt)));
  };
  press();

  let land = { polygons: [] };
  let feed = null;
  const shown = () => (feed ? feed.reports.filter(ALTS[alt]) : []);
  const redraw = () => {
    const rs = shown();
    const drawn = draw(canvas, VIEWS[view], land, rs);
    document.body.dataset.dots = String(drawn);
  };
  const render = () => {
    redraw();
    if (!feed) return;
    const now = Date.now();
    const rs = shown();
    renderList(list, rs, now);
    const n = rs.length;
    const rough = rs.filter((r) => LEVELS[r.level].rank >= 3).length;
    const age = now - feed.generated;
    let text = `${n} report${n === 1 ? '' : 's'} from the last ${feed.windowHours} hours (${rough} moderate or worse). Updated ${ago(feed.generated, now)}, at ${clock(feed.generated)}; refreshes hourly.`;
    if (age > STALE_MS) text = `These reports are out of date: the feed last updated ${ago(feed.generated, now)}, at ${clock(feed.generated)}. ${text}`;
    status.textContent = text;
    status.classList.toggle('stale', age > STALE_MS);
  };
  redraw();

  const load = async () => {
    try {
      const res = await fetch(FEED, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      feed = parseFeed(await res.json());
      render();
    } catch (e) {
      console.warn('pilot reports unavailable:', e.message);
      if (!feed) {
        status.textContent = "Can't load the pilot reports right now. Check your connection and try again in a few minutes.";
        status.classList.add('stale');
        list.replaceChildren();
      }
    }
    document.body.dataset.ready = '1';
  };

  try {
    land = await fetch('../turbulence-map/land.json').then((r) => r.json());
  } catch (e) {
    console.warn('map outlines unavailable:', e.message);
  }
  redraw();
  await load();
  setInterval(load, REFRESH_MS);

  for (const b of viewButtons) {
    b.addEventListener('click', () => {
      view = b.dataset.view;
      press();
      const u = new URL(location.href);
      if (view === 'usa') u.searchParams.delete('view');
      else u.searchParams.set('view', view);
      history.replaceState(null, '', u);
      redraw();
    });
  }
  for (const b of altButtons) {
    b.addEventListener('click', () => {
      alt = b.dataset.alt;
      press();
      render();
    });
  }
  let pending = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(redraw);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', redraw);
}

main();
