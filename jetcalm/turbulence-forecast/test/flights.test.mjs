// The flight-number box (../flights.js): reading a number as FLIGHTS.md in
// jetcalm-data says (its parse / lookup in jetcalm_data/flights.py are the
// reference), which legs to offer, and the exact words the page shows.
// Run: node --test jetcalm/turbulence-forecast/test/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Fl from '../flights.js';

test('flight numbers people type', () => {
  const cases = {
    'BA 117': ['BA', '117', 'iata'],
    ba0117: ['BA', '117', 'iata'],
    'BA-117': ['BA', '117', 'iata'],
    'BA.117': ['BA', '117', 'iata'],
    ' ba 117 ': ['BA', '117', 'iata'],
    'U2 8001': ['U2', '8001', 'iata'],
    B61: ['B6', '1', 'iata'],
    '6E 123': ['6E', '123', 'iata'],
    BAW117: ['BAW', '117', 'icao'],
    'baw 0117': ['BAW', '117', 'icao'],
    AA100A: ['AA', '100', 'iata'],
    'AF 0000': ['AF', '0', 'iata'],
    BA1: ['BA', '1', 'iata'],
  };
  for (const [text, [code, number, kind]] of Object.entries(cases)) {
    assert.deepEqual(Fl.parse(text), { code, number, kind }, text);
  }
});

test('not flight numbers', () => {
  for (const text of ['117', '11 7', 'BA', 'BA12345', 'LHR JFK', 'LHR', '', '   ', 'BA 117 JFK', '12 34', 'BAWX117', null, undefined]) {
    assert.equal(Fl.parse(text), null, String(text));
  }
});

// A tiny table in the shape of flights/v1.
const AIRPORTS = Object.fromEntries([
  ['LHR', 'London'], ['JFK', 'New York'], ['SIN', 'Singapore'], ['SYD', 'Sydney'], ['BHD', 'Belfast'],
].map(([iata, place]) => [iata, { iata, place }]));
const known = (iata) => AIRPORTS[iata];
const label = (a) => `${a.place} (${a.iata})`;
const INDEX = {
  version: 1,
  generated: '2026-11-27T23:08:20Z',
  flights: 9,
  airlines: {
    '6E': { name: 'IndiGo Airlines', icao: ['IGO'], flights: 1, file: '6E.json', sha: '000000000000' },
    BA: { name: 'British Airways', icao: ['BAW', 'SHT'], flights: 8, file: 'BA.json', sha: '111111111111' },
  },
};
const FILES = {
  '6E.json': { version: 1, airline: '6E', name: 'IndiGo Airlines', flights: { 123: 'SIN-SYD' } },
  'BA.json': {
    version: 1, airline: 'BA', name: 'British Airways',
    flights: {
      0: 'JFK-LHR', 15: 'LHR-SIN-SYD', 16: 'SYD-SIN-LHR', 20: 'LHR-QQQ', 21: 'QQQ-LHR-JFK',
      22: 'LHR-JFK-QQQ-SIN-SYD', 23: 'LHR-JFK-LHR-JFK', 117: 'LHR-JFK', 1416: 'LHR-BHD',
    },
  },
};

function loaders(overrides = {}) {
  const calls = [];
  return {
    calls,
    index: async () => { calls.push('index.json'); return INDEX; },
    airline: async (file) => { calls.push(file); return FILES[file]; },
    known,
    ...overrides,
  };
}

async function say(text, l = loaders()) {
  const o = await Fl.lookup(text, l);
  return { o, d: Fl.describe(o, label) };
}

test('one leg fills both airports', async () => {
  const { o, d } = await say('BA 117');
  assert.equal(o.kind, 'one');
  assert.deepEqual(o.legs, [[AIRPORTS.LHR, AIRPORTS.JFK]]);
  assert.equal(o.param, 'BA117');
  assert.equal(d.text, 'BA 117 (British Airways) usually flies London (LHR) → New York (JFK). Check it matches your ticket.');
  assert.equal(d.found, true);
  assert.deepEqual(d.legs, []);
  for (const typed of ['ba0117', 'BA-117', 'BAW117', 'BAW 0117', 'SHT117', 'BA117C']) {
    const again = await say(typed);
    assert.equal(again.d.text, d.text, typed);
    assert.equal(again.o.param, 'BA117', typed);
  }
  const zero = await say('BA 0000');
  assert.equal(zero.d.text, 'BA 0 (British Airways) usually flies New York (JFK) → London (LHR). Check it matches your ticket.');
  assert.equal((await say('6E 123')).d.text, '6E 123 (IndiGo Airlines) usually flies Singapore (SIN) → Sydney (SYD). Check it matches your ticket.');
});

test('a flight with stops asks which part, one button per leg', async () => {
  const { o, d } = await say('BA 15');
  assert.equal(o.kind, 'legs');
  assert.equal(d.text, 'BA 15 (British Airways) usually flies London (LHR) → Singapore (SIN) → Sydney (SYD). Which part are you on?');
  assert.deepEqual(d.legs, [
    { text: 'London (LHR) → Singapore (SIN)', from: AIRPORTS.LHR, to: AIRPORTS.SIN },
    { text: 'Singapore (SIN) → Sydney (SYD)', from: AIRPORTS.SIN, to: AIRPORTS.SYD },
  ]);
  assert.equal(o.param, 'BA15');
  // The same leg twice (a shuttle) is one button; the sentence keeps the route.
  const shuttle = await say('BA 23');
  assert.equal(shuttle.d.text, 'BA 23 (British Airways) usually flies London (LHR) → New York (JFK) → London (LHR) → New York (JFK). Which part are you on?');
  assert.deepEqual(shuttle.d.legs.map((l) => l.text), ['London (LHR) → New York (JFK)', 'New York (JFK) → London (LHR)']);
});

test('legs with an airport the page does not know are dropped', async () => {
  // Only one leg left: said as a one-leg flight.
  const partial = await say('BA 21');
  assert.equal(partial.o.kind, 'one');
  assert.equal(partial.d.text, 'BA 21 (British Airways) usually flies London (LHR) → New York (JFK). Check it matches your ticket.');
  // No leg left.
  assert.equal((await say('BA 20')).d.text, "We don't know BA 20. Pick your airports below.");
  // A gap in the middle: the unknown stop is named by its code, no button for its legs.
  const gap = await say('BA 22');
  assert.equal(gap.d.text, 'BA 22 (British Airways) usually flies London (LHR) → New York (JFK) → QQQ → Singapore (SIN) → Sydney (SYD). Which part are you on?');
  assert.deepEqual(gap.d.legs.map((l) => l.text), ['London (LHR) → New York (JFK)', 'Singapore (SIN) → Sydney (SYD)']);
  assert.deepEqual(Fl.legsOf('QQQ-RRR', known), { legs: [], stops: [] });
});

test('airlines and numbers we do not know', async () => {
  assert.equal((await say('XX 1')).d.text, "We don't know XX 1. Pick your airports below.");
  assert.equal((await say('BA 1417')).d.text, "We don't know BA 1417. Pick your airports below.");
  assert.equal((await say('BAW 9999')).d.text, "We don't know BA 9999. Pick your airports below.");
  assert.equal((await say('ABC 0012')).d.text, "We don't know ABC 12. Pick your airports below.");
  assert.equal((await say('XX 1')).d.found, false);
  // Number keys only: nothing from the object prototype.
  assert.equal((await say('BA 1', loaders({ airline: async () => ({ flights: Object.create({ 1: 'LHR-JFK' }) }) }))).o.kind, 'unknown');
});

test('not a flight number: nothing is fetched', async () => {
  for (const text of ['LHR', '117', '']) {
    const l = loaders();
    const { o, d } = await say(text, l);
    assert.equal(o.kind, 'invalid');
    assert.equal(d.text, "That doesn't look like a flight number. Try one like BA 117.");
    assert.deepEqual(l.calls, []);
  }
});

test('only the index and that airline are fetched', async () => {
  const l = loaders();
  await say('BA 117', l);
  assert.deepEqual(l.calls, ['index.json', 'BA.json']);
  const unknownAirline = loaders();
  await say('XX 1', unknownAirline);
  assert.deepEqual(unknownAirline.calls, ['index.json']);
});

test('a file that does not load', async () => {
  const failed = "Flight numbers can't be looked up right now. Pick your airports below.";
  const boom = async () => { throw new Error('offline'); };
  for (const l of [
    loaders({ index: boom }),
    loaders({ airline: boom }),
    loaders({ index: async () => ({ version: 2, airlines: {} }) }),
    loaders({ index: async () => null }),
    loaders({ airline: async () => ({ version: 1 }) }),
  ]) {
    const { o, d } = await say('BA 117', l);
    assert.equal(o.kind, 'failed');
    assert.equal(d.text, failed);
    assert.equal(d.found, false);
  }
});
