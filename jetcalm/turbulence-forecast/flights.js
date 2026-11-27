// Flight numbers for the web: reads the flight table of jetcalm-data
// (FLIGHTS.md, flights/v1) and picks what to say. parse() and lookup() follow
// the reference client, parse() / lookup() in jetcalm_data/flights.py, step by
// step; the app does the same and uses the same words. No DOM in here.

// Same origin as the page on GitHub Pages.
export const BASE = '/jetcalm-data/flights/v1/';

const IATA_INPUT = /^([A-Z][A-Z0-9]|[0-9][A-Z])(\d{1,4})[A-Z]?$/;
const ICAO_INPUT = /^([A-Z]{3})(\d{1,4})[A-Z]?$/;

/**
 * 'BA 117' -> {code: 'BA', number: '117', kind: 'iata'};
 * 'BAW0117' -> {code: 'BAW', number: '117', kind: 'icao'}; anything else -> null.
 * Upper-case, drop spaces, hyphens and dots; a trailing letter (an operational
 * suffix) is ignored; leading zeros are dropped ('0000' -> '0').
 */
export function parse(text) {
  const s = String(text ?? '').toUpperCase().replace(/[\s.-]/g, '');
  for (const [pattern, kind] of [[IATA_INPUT, 'iata'], [ICAO_INPUT, 'icao']]) {
    const m = pattern.exec(s);
    if (m) return { code: m[1], number: m[2].replace(/^0+/, '') || '0', kind };
  }
  return null;
}

/** The index entry for a parsed number: {code (IATA), name, file}, or null for an airline we don't know. */
export function airlineOf(index, parsed) {
  const airlines = index.airlines;
  const code = parsed.kind === 'icao'
    ? Object.keys(airlines).find((iata) => Array.isArray(airlines[iata].icao) && airlines[iata].icao.includes(parsed.code))
    : parsed.code;
  if (!code || !Object.hasOwn(airlines, code)) return null;
  return { code, name: airlines[code].name, file: airlines[code].file };
}

/**
 * The legs of a route ('LHR-SIN-SYD': each pair of neighbours) whose two
 * airports the page knows, as [from, to] airports; the same leg twice is shown
 * once. stops: the route from the first of those legs to the last, an airport
 * the page doesn't know left as its code.
 */
export function legsOf(route, known) {
  const codes = route.split('-');
  const legs = [];
  const seen = new Set();
  let first = -1;
  let last = -1;
  for (let i = 0; i + 1 < codes.length; i++) {
    const a = known(codes[i]);
    const b = known(codes[i + 1]);
    if (!a || !b) continue;
    if (first < 0) first = i;
    last = i + 1;
    const key = `${codes[i]}-${codes[i + 1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    legs.push([a, b]);
  }
  const stops = first < 0 ? [] : codes.slice(first, last + 1).map((c) => known(c) ?? c);
  return { legs, stops };
}

/**
 * Looks a flight number up. loaders: index() and airline(file) resolve to the
 * parsed JSON files; known(iata) is the page's airport or undefined.
 * Resolves to one of
 *   {kind: 'invalid'}                     not a flight number (nothing fetched)
 *   {kind: 'failed'}                      a file didn't load
 *   {kind: 'unknown', flight}             an airline or number we don't know, or no leg with known airports
 *   {kind: 'one', flight, param, airline, legs: [[from, to]], stops}
 *   {kind: 'legs', flight, param, airline, legs: [[from, to], ...], stops}
 * flight is how the number is shown ('BA 117'), param how the URL carries it ('BA117').
 */
export async function lookup(text, { index, airline, known }) {
  const parsed = parse(text);
  if (!parsed) return { kind: 'invalid' };
  let entry;
  let flights;
  try {
    const idx = await index();
    if (idx?.version !== 1 || typeof idx.airlines !== 'object' || idx.airlines === null) throw new Error('flights index: not version 1');
    entry = airlineOf(idx, parsed);
    if (entry) {
      flights = (await airline(entry.file))?.flights;
      if (typeof flights !== 'object' || flights === null) throw new Error(`flights ${entry.file}: no flights`);
    }
  } catch (error) {
    return { kind: 'failed', error };
  }
  const code = entry ? entry.code : parsed.code;
  const flight = `${code} ${parsed.number}`;
  const route = entry && Object.hasOwn(flights, parsed.number) ? flights[parsed.number] : null;
  const { legs, stops } = typeof route === 'string' ? legsOf(route, known) : { legs: [], stops: [] };
  if (!legs.length) return { kind: 'unknown', flight };
  return { kind: legs.length === 1 ? 'one' : 'legs', flight, param: `${code}${parsed.number}`, airline: entry.name, legs, stops };
}

/**
 * The words for a lookup: {text, found, legs: [{text, from, to}]} (legs: one
 * button each, only for a flight with stops). label(airport) is how the page's
 * airport pickers name an airport.
 */
export function describe(o, label) {
  const name = (s) => (typeof s === 'string' ? s : label(s));
  const leg = ([a, b]) => `${label(a)} → ${label(b)}`;
  switch (o.kind) {
    case 'one':
      return { found: true, legs: [], text: `${o.flight} (${o.airline}) usually flies ${leg(o.legs[0])}. Check it matches your ticket.` };
    case 'legs':
      return {
        found: true,
        legs: o.legs.map(([a, b]) => ({ text: leg([a, b]), from: a, to: b })),
        text: `${o.flight} (${o.airline}) usually flies ${o.stops.map(name).join(' → ')}. Which part are you on?`,
      };
    case 'unknown':
      return { found: false, legs: [], text: `We don't know ${o.flight}. Pick your airports below.` };
    case 'invalid':
      return { found: false, legs: [], text: "That doesn't look like a flight number. Try one like BA 117." };
    default:
      return { found: false, legs: [], text: "Flight numbers can't be looked up right now. Pick your airports below." };
  }
}
