// Today's UV index by the hour from MET Norway's locationforecast, for the
// Spanish and Portuguese "UV index today" pages. Pure functions, no DOM:
// test/uv.test.mjs covers the parsing, the WHO bands and the time zones.
import { roundUvi, uvCategory } from '../uv-tanning-calculator/sun.js';

export { roundUvi, uvCategory };

export const MET_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';

// MET asks for at most 4 decimals. Two (about 1 km) is plenty for UV, keeps
// the visitor's position vague and lets MET's cache serve neighbours.
export const roundCoord = (v) => {
  const r = Math.round(Number(v) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

export function metUrl(lat, lon) {
  const la = roundCoord(lat), lo = roundCoord(lon);
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) {
    throw new RangeError('bad coordinates');
  }
  return `${MET_BASE}?lat=${la.toFixed(2)}&lon=${lo.toFixed(2)}`;
}

// The hourly part of the forecast: [{ t (ms, UTC), uv (clear sky), cloud (% or null) }].
// MET is hourly for about two and a half days, then 6-hourly; only the
// hourly stretch is kept. Entries without a UV value are dropped.
export function parseMet(json) {
  const ts = json?.properties?.timeseries;
  if (!Array.isArray(ts)) throw new TypeError('not a locationforecast response');
  const out = [];
  let prev = null;
  for (const e of ts) {
    const t = Date.parse(e?.time);
    if (!Number.isFinite(t)) continue;
    if (prev !== null && t - prev > 3600e3) break;
    if (prev !== null && t <= prev) continue;
    prev = t;
    const d = e?.data?.instant?.details;
    const uv = d?.ultraviolet_index_clear_sky;
    if (typeof uv !== 'number' || !Number.isFinite(uv)) continue;
    const cloud = typeof d.cloud_area_fraction === 'number' ? d.cloud_area_fraction : null;
    out.push({ t, uv: Math.max(0, uv), cloud });
  }
  return out;
}

const partsCache = new Map();
function partsFormatter(tz) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    partsCache.set(tz, f);
  }
  return f;
}

// The wall clock in a time zone: { date: 'YYYY-MM-DD', hour, minute, hhmm: 'HH:MM' }.
export function localParts(ms, tz) {
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value;
  const hour = Number(p.hour) % 24;
  const hh = String(hour).padStart(2, '0');
  return { date: `${p.year}-${p.month}-${p.day}`, hour, minute: Number(p.minute), hhmm: `${hh}:${p.minute}` };
}

// True when the runtime knows this IANA zone.
export function validZone(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

// Splits the hourly series into local days: [{ date, hours: [{ t, uv, cloud, hhmm, hour }] }],
// starting with the local day that contains `now`.
export function localDays(series, tz, now) {
  const today = localParts(now, tz).date;
  const days = [];
  for (const e of series) {
    const p = localParts(e.t, tz);
    if (p.date < today) continue;
    let day = days[days.length - 1];
    if (!day || day.date !== p.date) days.push(day = { date: p.date, hours: [] });
    day.hours.push({ ...e, hhmm: p.hhmm, hour: p.hour });
  }
  return days;
}

// The forecast hour that covers `now` (MET's values are for the top of each
// hour), or null when the series doesn't reach it.
export function currentHour(series, now) {
  for (const e of series) if (e.t <= now && now < e.t + 3600e3) return e;
  return null;
}

// The first and last hour whose rounded index is at least `level`, or null.
export function spanAtLeast(hours, level) {
  const hit = hours.filter((h) => roundUvi(h.uv) >= level);
  if (!hit.length) return null;
  return { from: hit[0].hhmm, to: hit[hit.length - 1].hhmm, count: hit.length };
}

// One day's summary. `partial` is set when the day's first available hour is
// already its highest and the index is falling: the peak may have passed
// before the forecast starts (an afternoon visit), so the page says "from now".
export function summarizeDay(day) {
  const hours = day.hours;
  if (!hours.length) return null;
  let max = hours[0];
  for (const h of hours) if (h.uv > max.uv) max = h;
  const partial = max === hours[0] && hours.length > 1 && hours[1].uv < hours[0].uv && roundUvi(hours[0].uv) > 0;
  return {
    date: day.date,
    max: max.uv,
    maxRounded: roundUvi(max.uv),
    maxAt: max.hhmm,
    category: uvCategory(max.uv),
    partial,
    spans: { 3: spanAtLeast(hours, 3), 6: spanAtLeast(hours, 6), 8: spanAtLeast(hours, 8) },
  };
}

// Hours worth listing: the ones with any UV (rounded ≥ 1), plus one hour on each side.
export function daylightHours(hours) {
  const idx = hours.map((h, i) => (roundUvi(h.uv) >= 1 ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return [];
  return hours.slice(Math.max(0, idx[0] - 1), Math.min(hours.length, idx[idx.length - 1] + 2));
}

// WHO's three protection steps (Global Solar UV Index: A Practical Guide, 2002).
export function protectionStep(uvi) {
  const r = roundUvi(uvi);
  if (r <= 2) return 'none';
  if (r <= 7) return 'needed';
  return 'extra';
}

// Accent- and case-insensitive text for the city search ("sao paulo" finds São Paulo).
export const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Cities whose name (or "name, country") starts with or contains the query, best first.
export function searchCities(cities, query, countryName = (c) => c, limit = 8) {
  const q = fold(query);
  if (!q) return [];
  const scored = [];
  for (const c of cities) {
    const name = fold(c.n);
    const full = `${name} ${fold(countryName(c.c))}`;
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.split(' ').some((w) => w.startsWith(q))) score = 2;
    else if (full.includes(q)) score = 3;
    if (score >= 0) scored.push([score, c]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map((s) => s[1]);
}
