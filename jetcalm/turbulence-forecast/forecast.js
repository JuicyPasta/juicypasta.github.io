// Jetcalm forecast logic for the web: a line-by-line port of the app's pure
// Dart code (Jetcalm/lib/forecast: geo, grid, levels, sampler, flight_plan,
// timeline). Keep the two in step; test/forecast.test.mjs pins the port to
// values computed by the Dart code itself. No DOM in here.

// ---- geo.dart ----
export const EARTH_RADIUS_KM = 6371.0088;
export const ROUTE_STEP_KM = 50;
export const MIN_ROUTE_POINTS = 12;

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// Dart's num.round(): halves away from zero.
export const dartRound = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));

export function normalizeLongitude(lon) {
  if (lon >= -180 && lon < 180) return lon;
  let l = (lon + 180) % 360;
  if (l < 0) l += 360;
  return l - 180;
}

export function centralAngle(a, b) {
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const distanceKm = (a, b) => centralAngle(a, b) * EARTH_RADIUS_KM;

export function interpolate(a, b, fraction) {
  const angle = centralAngle(a, b);
  if (angle < 1e-12) return a;
  const lat1 = rad(a.lat);
  const lon1 = rad(a.lon);
  const lat2 = rad(b.lat);
  const lon2 = rad(b.lon);
  const s = Math.sin(angle);
  const wa = Math.sin((1 - fraction) * angle) / s;
  const wb = Math.sin(fraction * angle) / s;
  const x = wa * Math.cos(lat1) * Math.cos(lon1) + wb * Math.cos(lat2) * Math.cos(lon2);
  const y = wa * Math.cos(lat1) * Math.sin(lon1) + wb * Math.cos(lat2) * Math.sin(lon2);
  const z = wa * Math.sin(lat1) + wb * Math.sin(lat2);
  return {
    lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))),
    lon: normalizeLongitude(deg(Math.atan2(y, x))),
  };
}

export const routePointCount = (km) =>
  Math.max(MIN_ROUTE_POINTS, Math.ceil(km / ROUTE_STEP_KM) + 1);

export function greatCircle(a, b) {
  const count = routePointCount(distanceKm(a, b));
  const out = [];
  for (let i = 0; i < count; i++) {
    if (i === 0) out.push({ lat: a.lat, lon: normalizeLongitude(a.lon) });
    else if (i === count - 1) out.push({ lat: b.lat, lon: normalizeLongitude(b.lon) });
    else out.push(interpolate(a, b, i / (count - 1)));
  }
  return out;
}

// ---- levels.dart ----
export const LEVELS = ['calm', 'light', 'moderate', 'strong', 'severe'];
export const DEFAULT_THRESHOLDS = { light: 15, moderate: 22, strong: 34, severe: 45 };

export function thresholdsFromJson(json) {
  if (!json || typeof json !== 'object') return { ...DEFAULT_THRESHOLDS };
  const read = (k) => {
    const v = json[k];
    return typeof v === 'number' && v > 0 && v < 255 ? dartRound(v) : DEFAULT_THRESHOLDS[k];
  };
  const t = { light: read('light'), moderate: read('moderate'), strong: read('strong'), severe: read('severe') };
  return t.light < t.moderate && t.moderate < t.strong && t.strong < t.severe
    ? t
    : { ...DEFAULT_THRESHOLDS };
}

/** Level index (0 calm .. 4 severe) of an EDR x 100 value. */
export function levelOf(edr, t = DEFAULT_THRESHOLDS) {
  if (edr >= t.severe) return 4;
  if (edr >= t.strong) return 3;
  if (edr >= t.moderate) return 2;
  if (edr >= t.light) return 1;
  return 0;
}

// ---- grid.dart ----
export const LAYER_CRUISE_MID = 'cruise_mid';
export const LAYER_CRUISE_MAX = 'cruise_max';
export const LAYER_LOW_MAX = 'low_max';
export const LAYER_CB = 'cb';
export const CB_THRESHOLD = 30;
export const NO_DATA = 255;

export class GridSpec {
  constructor({ rows = 301, cols = 720, latTop = 75, lonLeft = -180, step = 0.5 } = {}) {
    Object.assign(this, { rows, cols, latTop, lonLeft, step });
  }

  static fromJson(json) {
    if (!json || typeof json !== 'object') return new GridSpec();
    const pick = (keys) => {
      for (const k of keys) if (typeof json[k] === 'number') return json[k];
      return null;
    };
    const rows = Math.trunc(pick(['rows', 'nlat', 'height']) ?? 301);
    const cols = Math.trunc(pick(['cols', 'nlon', 'width']) ?? 720);
    const latTop = pick(['lat_top', 'lat0', 'lat_max', 'lat_start']) ?? 75;
    const lonLeft = pick(['lon_left', 'lon0', 'lon_min', 'lon_start']) ?? -180;
    const step = Math.abs(pick(['step', 'res', 'resolution', 'dlon', 'deg']) ?? 0.5);
    if (rows < 2 || cols < 2 || step <= 0) return new GridSpec();
    return new GridSpec({ rows, cols, latTop, lonLeft, step });
  }

  get cellCount() { return this.rows * this.cols; }
  get latBottom() { return this.latTop - (this.rows - 1) * this.step; }
  get wrapsLongitude() { return Math.abs(this.cols * this.step - 360) < 1e-6; }

  rowOf(lat) {
    const edge = this.step / 2;
    if (lat > this.latTop + edge || lat < this.latBottom - edge) return null;
    const r = dartRound((this.latTop - lat) / this.step);
    return Math.min(this.rows - 1, Math.max(0, r));
  }

  colOf(lon) {
    let offset = normalizeLongitude(lon) - this.lonLeft;
    if (offset < 0) offset += 360;
    const col = dartRound(offset / this.step);
    if (this.wrapsLongitude) return col % this.cols;
    return col < this.cols ? col : null;
  }
}

export function parseManifest(json) {
  if (!json || typeof json !== 'object') throw new Error('Manifest is not a JSON object');
  const generated = Date.parse(json.generated ?? '');
  if (Number.isNaN(generated) || !Array.isArray(json.steps)) {
    throw new Error('Manifest has no generated time or steps');
  }
  const steps = [];
  for (const s of json.steps) {
    if (!s || typeof s !== 'object') continue;
    const valid = Date.parse(s.valid ?? '');
    if (Number.isNaN(valid) || typeof s.file !== 'string' || !Array.isArray(s.layers)) continue;
    steps.push({
      valid,
      kind: s.kind === 'outlook' ? 'outlook' : 'wafs',
      file: s.file,
      layers: s.layers.map(String),
    });
  }
  steps.sort((a, b) => a.valid - b.valid);
  return {
    generated,
    steps,
    grid: GridSpec.fromJson(json.grid),
    thresholds: thresholdsFromJson(json.thresholds),
    wafsRun: json.wafs_run ?? null,
    gfsRun: json.gfs_run ?? null,
    notice: json.notice && typeof json.notice.en === 'string' ? json.notice.en : null,
  };
}

/** Every step inside from..to plus the nearest one on each side (ms UTC). */
export function stepsFor(manifest, from, to) {
  const steps = manifest.steps;
  if (!steps.length) return [];
  let first = 0;
  for (let i = 0; i < steps.length; i++) if (!(steps[i].valid > from)) first = i;
  let last = steps.length - 1;
  for (let i = steps.length - 1; i >= 0; i--) if (!(steps[i].valid < to)) last = i;
  if (last < first) return [];
  return steps.slice(first, last + 1);
}

export class StepGrid {
  constructor(info, spec, bytes) {
    const cells = spec.cellCount;
    if (!info.layers.length || bytes.length !== cells * info.layers.length) {
      throw new Error(`Step ${info.file}: ${bytes.length} bytes for ${info.layers.length} layers of ${cells} cells`);
    }
    this.info = info;
    this.spec = spec;
    this.layers = new Map();
    info.layers.forEach((name, i) => {
      this.layers.set(name, bytes.subarray(i * cells, (i + 1) * cells));
    });
  }

  get valid() { return this.info.valid; }
  get kind() { return this.info.kind; }
  has(layer) { return this.layers.has(layer); }

  valueAt(layer, lat, lon) {
    const data = this.layers.get(layer);
    const row = this.spec.rowOf(lat);
    const col = this.spec.colOf(lon);
    if (!data || row === null || col === null) return null;
    const v = data[row * this.spec.cols + col];
    return v === NO_DATA ? null : v;
  }

  maxAround(layer, lat, lon) {
    const data = this.layers.get(layer);
    const spec = this.spec;
    const row = spec.rowOf(lat);
    const col = spec.colOf(lon);
    if (!data || row === null || col === null) return null;
    let best = null;
    for (let r = Math.max(0, row - 1); r <= Math.min(spec.rows - 1, row + 1); r++) {
      for (let dc = -1; dc <= 1; dc++) {
        let c = col + dc;
        if (spec.wrapsLongitude) c = (c + spec.cols) % spec.cols;
        else if (c < 0 || c >= spec.cols) continue;
        const v = data[r * spec.cols + c];
        if (v === NO_DATA) continue;
        if (best === null || v > best) best = v;
      }
    }
    return best;
  }
}

// ---- flight_plan.dart ----
export const CRUISE_SPEED_KMH = 830;
export const OVERHEAD_MINUTES = 30;

/** Estimated flight time in minutes, rounded to 5. */
export const estimateMinutes = (km) =>
  dartRound((km / CRUISE_SPEED_KMH * 60 + OVERHEAD_MINUTES) / 5) * 5;

function zoneOffsetMs(zone, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** The UTC instant (ms) of a wall-clock time in an IANA zone. A time in a
 *  spring-forward gap moves forward by the gap, like the timezone package. */
export function zonedToUtc(zone, year, month, day, hour, minute) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = zoneOffsetMs(zone, wall - zoneOffsetMs(zone, wall));
  const t1 = wall - o1;
  if (zoneOffsetMs(zone, t1) === o1) return t1;
  // In a gap: use the offset in force before it.
  const o2 = zoneOffsetMs(zone, t1 - 3 * 3600e3);
  return wall - o2;
}

/** Wall-clock parts of a UTC instant in a zone. */
export function utcToZoned(zone, utcMs) {
  const o = zoneOffsetMs(zone, utcMs);
  const d = new Date(utcMs + o);
  return {
    year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
    hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay(), offsetMs: o,
  };
}

export class FlightPlan {
  constructor({ origin, destination, departure, arrival }) {
    this.origin = origin;
    this.destination = destination;
    this.departure = departure; // ms UTC
    this.arrival = arrival;
  }

  /** From the departure instant; arrival estimated from the distance. */
  static estimated(origin, destination, departure) {
    const km = distanceKm(origin, destination);
    return new FlightPlan({ origin, destination, departure, arrival: departure + estimateMinutes(km) * 60e3 });
  }

  get durationMinutes() { return Math.trunc((this.arrival - this.departure) / 1000) / 60; }
  get distanceKm() { return distanceKm(this.origin, this.destination); }
  get climbMinutes() { return Math.min(20, this.durationMinutes * 0.15); }
  get descentMinutes() { return Math.min(25, this.durationMinutes * 0.15); }

  /** 'climb' | 'cruise' | 'descent' */
  phaseAt(minutes) {
    if (minutes < this.climbMinutes) return 'climb';
    if (minutes > this.durationMinutes - this.descentMinutes) return 'descent';
    return 'cruise';
  }
}

// ---- sampler.dart ----
export const MAX_STEP_DISTANCE_MS = 3 * 3600e3;
export const MAX_BLEND_GAP_MS = 6 * 3600e3;

function bracketFor(steps, time) {
  let before = null;
  let after = null;
  for (const s of steps) {
    if (!(s.valid > time) && (before === null || s.valid > before.valid)) before = s;
    if (!(s.valid < time) && (after === null || s.valid < after.valid)) after = s;
  }
  if (before && after) {
    const gap = after.valid - before.valid;
    if (gap === 0) return makeBracket(before, null, 0);
    if (gap <= MAX_BLEND_GAP_MS) {
      return makeBracket(before, after, Math.trunc((time - before.valid) / 1000) / Math.trunc(gap / 1000));
    }
  }
  let nearest = null;
  let distance = MAX_STEP_DISTANCE_MS + 1000;
  for (const s of [before, after]) {
    if (!s) continue;
    const d = Math.abs(s.valid - time);
    if (d < distance) {
      distance = d;
      nearest = s;
    }
  }
  return nearest ? makeBracket(nearest, null, 0) : null;
}

function makeBracket(a, b, weight) {
  return {
    a, b, weight,
    get outlook() { return (weight < 0.5 ? a.kind : (b ?? a).kind) === 'outlook'; },
    read(reader) {
      const va = reader(a);
      if (!b) return va;
      const vb = reader(b);
      if (va === null) return vb;
      if (vb === null) return va;
      return dartRound(va + (vb - va) * weight);
    },
  };
}

export const minutesAt = (plan, index, count) => (plan.durationMinutes * index) / (count - 1);

/**
 * Samples the forecast along the great circle. Each sample:
 * { lat, lon, minutes, phase, expected, couldReach, outlook, storm }.
 */
export function sample(plan, steps) {
  const points = greatCircle(plan.origin, plan.destination);
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const minutes = minutesAt(plan, i, points.length);
    const phase = plan.phaseAt(minutes);
    const time = plan.departure + dartRound(minutes * 60) * 1000;
    const br = bracketFor(steps, time);
    const base = { lat: p.lat, lon: p.lon, minutes, phase };
    if (!br) {
      out.push({ ...base, expected: null, couldReach: null, outlook: false, storm: false });
      continue;
    }
    let expected;
    let couldReach;
    let storm = false;
    if (phase === 'cruise') {
      expected = br.read((s) => s.valueAt(LAYER_CRUISE_MID, p.lat, p.lon));
      couldReach = br.read((s) => s.maxAround(LAYER_CRUISE_MAX, p.lat, p.lon));
      const cb = br.read((s) => s.maxAround(LAYER_CB, p.lat, p.lon));
      storm = cb !== null && cb >= CB_THRESHOLD;
    } else {
      expected = br.read((s) => (s.has(LAYER_LOW_MAX)
        ? s.valueAt(LAYER_LOW_MAX, p.lat, p.lon)
        : s.valueAt(LAYER_CRUISE_MID, p.lat, p.lon)));
      couldReach = br.read((s) => (s.has(LAYER_LOW_MAX)
        ? s.maxAround(LAYER_LOW_MAX, p.lat, p.lon)
        : s.maxAround(LAYER_CRUISE_MAX, p.lat, p.lon)));
    }
    if (expected !== null) couldReach = Math.max(couldReach ?? expected, expected);
    else couldReach = null;
    out.push({ ...base, expected, couldReach, outlook: expected !== null && br.outlook, storm });
  }
  return out;
}

// ---- timeline.dart ----
/** Segments {level (index or null for a gap), start, end, peak}. */
export function segmentsFromValues(values, t, duration) {
  const segs = [];
  const n = values.length;
  if (!n) return segs;
  const half = n > 1 ? duration / (2 * (n - 1)) : duration / 2;
  for (let i = 0; i < n; i++) {
    const at = n > 1 ? (duration * i) / (n - 1) : duration / 2;
    const start = Math.max(0, at - half);
    const end = Math.min(duration, at + half);
    const v = values[i];
    const level = v === null ? null : levelOf(v, t);
    const last = segs[segs.length - 1];
    if (last && last.level === level) {
      last.end = end;
      last.peak = Math.max(last.peak, v ?? 0);
    } else {
      segs.push({ level, start, end, peak: v ?? 0 });
    }
  }
  return segs;
}

/** Same, but also splitting where the source changes from official to
 *  outlook, so the page can mark the early-outlook stretch. */
export function outlookStretches(samples, duration) {
  const n = samples.length;
  const half = n > 1 ? duration / (2 * (n - 1)) : duration / 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!samples[i].outlook) continue;
    const start = Math.max(0, samples[i].minutes - half);
    const end = Math.min(duration, samples[i].minutes + half);
    const last = out[out.length - 1];
    if (last && Math.abs(last.end - start) < 1e-6) last.end = end;
    else out.push({ start, end });
  }
  return out;
}

export const HEADLINE_MINUTES = 10;

export function summarize(samples, t, duration) {
  const expected = segmentsFromValues(samples.map((s) => s.expected), t, duration);
  const minutesAtLevel = [0, 0, 0, 0, 0];
  let gap = 0;
  for (const s of expected) {
    if (s.level === null) gap += s.end - s.start;
    else minutesAtLevel[s.level] += s.end - s.start;
  }
  const withData = duration - gap;

  let headline = null;
  if (withData > 0.01) {
    const needed = Math.min(HEADLINE_MINUTES, withData);
    let atOrAbove = 0;
    for (let level = 4; level >= 0; level--) {
      atOrAbove += minutesAtLevel[level];
      if (atOrAbove + 1e-6 >= needed) {
        headline = level;
        break;
      }
    }
  }

  let worst = null;
  for (const s of expected) {
    if (s.level === null || s.level === 0) continue;
    if (worst === null || s.level > worst.level
      || (s.level === worst.level && (s.end - s.start) > (worst.end - worst.start))) {
      worst = s;
    }
  }

  let stronger = null;
  const half = samples.length > 1 ? duration / (2 * (samples.length - 1)) : duration / 2;
  for (let i = 0; i < samples.length; i++) {
    const e = samples[i].expected;
    const c = samples[i].couldReach;
    if (e === null || c === null) continue;
    const reach = levelOf(c, t);
    if (reach < levelOf(e, t) + 2) continue;
    let j = i;
    let peak = c;
    let top = reach;
    while (j + 1 < samples.length) {
      const ne = samples[j + 1].expected;
      const nc = samples[j + 1].couldReach;
      if (ne === null || nc === null) break;
      const nr = levelOf(nc, t);
      if (nr < levelOf(ne, t) + 2) break;
      j++;
      peak = Math.max(peak, nc);
      if (nr > top) top = nr;
    }
    const cand = {
      level: top,
      start: Math.max(0, samples[i].minutes - half),
      end: Math.min(duration, samples[j].minutes + half),
      peak,
    };
    if (stronger === null || cand.peak > stronger.peak) stronger = cand;
    i = j;
  }

  let stormAt = null;
  for (const s of samples) {
    if (s.storm) {
      stormAt = s.minutes;
      break;
    }
  }

  return {
    headline,
    shares: minutesAtLevel.map((m) => (duration > 0 ? m / duration : 0)),
    noDataShare: duration > 0 ? gap / duration : 1,
    worst,
    stronger,
    stormAt,
    expected,
  };
}

/** 'high' | 'good' | 'outlook' (timeline.dart Confidence.of). */
export function confidenceOf(departure, now, outlookShare) {
  if (outlookShare > 0.5) return 'outlook';
  const lead = departure - now;
  if (lead < 24 * 3600e3) return 'high';
  if (lead <= 48 * 3600e3) return 'good';
  return 'outlook';
}

export function outlookShare(samples) {
  const withData = samples.filter((s) => s.expected !== null).length;
  if (!withData) return 0;
  return samples.filter((s) => s.outlook).length / withData;
}

/** 'ready' | 'tooEarly' | 'past' (forecast.dart ForecastWindow). */
export function availability(plan, manifest) {
  if (!manifest.steps.length) return 'tooEarly';
  const first = manifest.steps[0].valid - MAX_STEP_DISTANCE_MS;
  const last = manifest.steps[manifest.steps.length - 1].valid + MAX_STEP_DISTANCE_MS;
  if (plan.departure > last) return 'tooEarly';
  if (plan.arrival < first) return 'past';
  return 'ready';
}

// forecast.dart ForecastWindow + forecast_service.dart: what a FREE user
// gets (the web page has no Pro). The 48-hour window is free; a flight
// that departs later than that is the Pro early outlook in the app.
export const OFFICIAL_WINDOW_MS = 48 * 3600e3;
export const OUTLOOK_WINDOW_MS = 114 * 3600e3;

export const opensAt = (departure, earlyOutlook) =>
  departure - (earlyOutlook ? OUTLOOK_WINDOW_MS : OFFICIAL_WINDOW_MS);

/**
 * { kind: 'ready' | 'past' | 'needsPro' | 'opensLater', opensAt? }, in the
 * app's order (ForecastService.forecastFor with earlyOutlook = false).
 * A flight that departs inside the window is shown whole, even when its
 * landing is past 48 hours (that tail may come from outlook steps).
 */
export function freeOutcome(plan, manifest, now) {
  const lead = plan.departure - now;
  const avail = availability(plan, manifest);
  if (avail === 'past') return { kind: 'past' };
  if (lead > OFFICIAL_WINDOW_MS) {
    return { kind: avail === 'ready' ? 'needsPro' : 'opensLater', opensAt: opensAt(plan.departure, false) };
  }
  if (avail === 'tooEarly') return { kind: 'opensLater', opensAt: opensAt(plan.departure, true) };
  return { kind: 'ready' };
}

// ---- utils/formatters.dart ----
export function formatDuration(minutes) {
  const total = dartRound(minutes);
  const h = Math.trunc(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function roundToFive(minutes) {
  const r = dartRound(minutes / 5) * 5;
  return r < 5 ? 5 : r;
}

// ---- data ----
/** Bytes of a step file: gunzips when the body is still gzip. */
export async function inflate(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
