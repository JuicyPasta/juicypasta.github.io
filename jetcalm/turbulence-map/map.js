// Today's turbulence map: the official (WAFS) step nearest to now, layer
// cruise_max, drawn like the app's TurbulenceMapPainter
// (Jetcalm/lib/widgets/turbulence_map.dart, colours from JetcalmTheme).
import * as F from '../turbulence-forecast/forecast.js';

const DATA_BASE = 'https://juicypasta.github.io/jetcalm-data/v1/';
const LEVEL_RGB = ['#6fbf9b', '#cfe36a', '#f2c14e', '#ee8a3c', '#c9503c'];

// MapBounds: world is the app's; the other two are this page's views.
const VIEWS = {
  world: { latTop: 78, latBottom: -78, lonLeft: -180, lonRight: 180, name: 'World' },
  usa: { latTop: 52, latBottom: 21, lonLeft: -128, lonRight: -63, name: 'USA' },
  atlantic: { latTop: 68, latBottom: 30, lonLeft: -80, lonRight: 8, name: 'North Atlantic' },
};

const $ = (id) => document.getElementById(id);
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const sea = () => (dark() ? '#10201f' : '#e4eef0');
const landColor = () => (dark() ? '#263836' : '#fbfaf5');
const coast = () => (dark() ? '#3d5451' : '#b8c6c4');

/** MapBounds.lonScale: 1 for the world, else RouteRaster.lonScale(midLat). */
function lonScale(b) {
  const span = b.lonRight - b.lonLeft;
  if (span > 300) return 1;
  return Math.max(0.35, Math.cos((((b.latTop + b.latBottom) / 2) * Math.PI) / 180));
}
const aspect = (b) => ((b.lonRight - b.lonLeft) * lonScale(b)) / (b.latTop - b.latBottom);

/** rasterImage(): one pixel per cell, calm left clear. */
function rasterCanvas(step, layer, thresholds) {
  const { rows, cols } = step.spec;
  const data = step.layers.get(layer);
  const canvas = document.createElement('canvas');
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  const rgba = LEVEL_RGB.map((hex, level) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, Math.round((level === 1 ? 0.75 : 0.9) * 255)];
  });
  const noData = dark() ? [255, 255, 255, 26] : [0, 0, 0, 26];
  for (let i = 0; i < rows * cols; i++) {
    const v = data[i];
    let c = null;
    if (v === F.NO_DATA) c = noData;
    else {
      const level = F.levelOf(v, thresholds);
      if (level > 0) c = rgba[level];
    }
    if (c) img.data.set(c, i * 4);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function draw(canvas, bounds, land, raster, spec) {
  // clientWidth excludes the 1px border; the CSS height includes it.
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

  if (raster) {
    const half = spec.step / 2;
    const lonRight = spec.lonLeft + raster.width * spec.step;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    for (const shift of [-360, 0, 360]) {
      if (spec.lonLeft + shift > visibleRight || lonRight + shift < visibleLeft) continue;
      const x0 = px(spec.lonLeft - half + shift);
      const y0 = py(spec.latTop + half);
      const x1 = px(spec.lonLeft - half + raster.width * spec.step + shift);
      const y1 = py(spec.latTop + half - raster.height * spec.step);
      ctx.drawImage(raster, x0, y0, x1 - x0, y1 - y0);
    }
  }
  ctx.strokeStyle = coast();
  ctx.lineWidth = 0.7;
  ctx.stroke(path);
}

const fmt = (ms, opts) => new Intl.DateTimeFormat('en-US', opts).format(new Date(ms));
const local = (ms) => fmt(ms, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const utc = (ms) => `${fmt(ms, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} UTC`;

/** The official step nearest to now (never an outlook step). */
export function nearestOfficial(steps, now) {
  let best = null;
  for (const s of steps) {
    if (s.kind !== 'wafs') continue;
    if (best === null || Math.abs(s.valid - now) < Math.abs(best.valid - now)) best = s;
  }
  return best;
}

async function main() {
  const canvas = $('map');
  const status = $('map-status');
  const q = new URLSearchParams(location.search);
  let view = VIEWS[q.get('view')] ? q.get('view') : 'world';
  const buttons = [...document.querySelectorAll('[data-view]')];
  const setPressed = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  setPressed();

  let land = { polygons: [] };
  let raster = null;
  let spec = null;
  const redraw = () => draw(canvas, VIEWS[view], land, raster, spec);
  redraw();

  try {
    const [landJson, manifestJson] = await Promise.all([
      fetch('land.json').then((r) => r.json()),
      fetch(`${DATA_BASE}manifest.json`).then((r) => {
        if (!r.ok) throw new Error(`manifest ${r.status}`);
        return r.json();
      }),
    ]);
    land = landJson;
    redraw();
    const manifest = F.parseManifest(manifestJson);
    const info = nearestOfficial(manifest.steps, Date.now());
    if (!info) throw new Error('no official step');
    const res = await fetch(DATA_BASE + info.file);
    if (!res.ok) throw new Error(`step ${res.status}`);
    const step = new F.StepGrid(info, manifest.grid, await F.inflate(await res.arrayBuffer()));
    spec = manifest.grid;
    raster = rasterCanvas(step, F.LAYER_CRUISE_MAX, manifest.thresholds);
    redraw();
    const run = manifest.wafsRun && /^\d{10}$/.test(manifest.wafsRun)
      ? utc(Date.UTC(+manifest.wafsRun.slice(0, 4), +manifest.wafsRun.slice(4, 6) - 1, +manifest.wafsRun.slice(6, 8), +manifest.wafsRun.slice(8, 10)))
      : null;
    $('valid').textContent = `${local(info.valid)} (${utc(info.valid)})`;
    status.textContent = `Forecast valid ${local(info.valid)}, ${utc(info.valid)}${run ? `, from the ${run} run` : ''}. Updated ${local(manifest.generated)}; next update about ${fmt(manifest.generated + 6 * 3600e3, { hour: 'numeric', minute: '2-digit' })}.`;
    document.body.dataset.step = info.file;
  } catch (e) {
    console.error(e);
    status.textContent = "Can't reach the forecast. Check your connection and try again.";
  }
  document.body.dataset.ready = '1';

  for (const b of buttons) {
    b.addEventListener('click', () => {
      view = b.dataset.view;
      setPressed();
      const u = new URL(location.href);
      if (view === 'world') u.searchParams.delete('view');
      else u.searchParams.set('view', view);
      history.replaceState(null, '', u);
      redraw();
    });
  }
  let pending = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(redraw);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => location.reload());
}

main();
