// The live UV pages' pure code: MET parsing, WHO bands, local time zones,
// day summaries and the city list.
// met-sao-paulo.json and met-madrid.json are real MET Norway locationforecast
// responses from 2026-11-27 ~10:30 UTC, trimmed to the fields the page reads.
// Run: node --test solei/live-uv/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as U from '../uv.js';
import { CITIES } from '../cities.js';

const PAGES = ['../../uv-index-today/index.html', '../../es/indice-uv-hoy/index.html', '../../pt/indice-uv-hoje/index.html'];
const fixture = (name) => JSON.parse(readFileSync(new URL(`./met-${name}.json`, import.meta.url)));
const H = 3600e3;

test('MET URL: coordinates rounded to 2 decimals, bad ones refused', () => {
  assert.equal(U.metUrl(-23.55052, -46.633308), 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=-23.55&lon=-46.63');
  assert.equal(U.metUrl(40.4168, -3.7038), 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=40.42&lon=-3.70');
  assert.equal(U.metUrl(-0.001, 0.004), 'https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=0.00&lon=0.00');
  assert.throws(() => U.metUrl(91, 0), RangeError);
  assert.throws(() => U.metUrl(NaN, 0), RangeError);
});

test('parseMet keeps the hourly stretch with clear-sky UV and cloud cover', () => {
  const s = U.parseMet(fixture('sao-paulo'));
  assert.equal(s.length, 63, 'hourly instants only (to 2026-11-30T00:00Z), the 6-hourly tail is dropped');
  assert.equal(new Date(s[0].t).toISOString(), '2026-11-27T10:00:00.000Z');
  for (let i = 1; i < s.length; i++) assert.equal(s[i].t - s[i - 1].t, H);
  const peak = s.find((e) => new Date(e.t).toISOString() === '2026-11-27T15:00:00.000Z');
  assert.equal(peak.uv, 15);
  assert.equal(typeof peak.cloud, 'number');
});

test('parseMet: bad input, missing UV, negative values', () => {
  assert.throws(() => U.parseMet({}), TypeError);
  assert.throws(() => U.parseMet(null), TypeError);
  const s = U.parseMet({ properties: { timeseries: [
    { time: '2026-01-01T10:00:00Z', data: { instant: { details: { ultraviolet_index_clear_sky: 2.5, cloud_area_fraction: 50 } } } },
    { time: '2026-01-01T11:00:00Z', data: { instant: { details: { cloud_area_fraction: 10 } } } },
    { time: '2026-01-01T12:00:00Z', data: { instant: { details: { ultraviolet_index_clear_sky: -0.2 } } } },
    { time: 'garbage', data: { instant: { details: { ultraviolet_index_clear_sky: 3 } } } },
  ] } });
  assert.deepEqual(s.map((e) => [e.uv, e.cloud]), [[2.5, 50], [0, null]]);
});

test('WHO bands and protection steps', () => {
  const cases = [[0, 'low'], [2.4, 'low'], [2.5, 'moderate'], [5.49, 'moderate'], [6, 'high'], [7.4, 'high'], [7.5, 'veryHigh'], [10.4, 'veryHigh'], [10.5, 'extreme'], [15, 'extreme']];
  for (const [uv, cat] of cases) assert.equal(U.uvCategory(uv), cat, `UV ${uv}`);
  assert.equal(U.protectionStep(2.4), 'none');
  assert.equal(U.protectionStep(3), 'needed');
  assert.equal(U.protectionStep(7.4), 'needed');
  assert.equal(U.protectionStep(7.5), 'extra');
  assert.equal(U.protectionStep(14), 'extra');
});

test('local time: São Paulo is UTC−3 all year (no daylight saving since 2019)', () => {
  const tz = 'America/Sao_Paulo';
  assert.deepEqual(U.localParts(Date.parse('2026-11-27T15:00:00Z'), tz), { date: '2026-11-27', hour: 12, minute: 0, hhmm: '12:00' });
  assert.equal(U.localParts(Date.parse('2026-11-28T02:00:00Z'), tz).date, '2026-11-27');
  assert.equal(U.localParts(Date.parse('2026-11-28T02:00:00Z'), tz).hhmm, '23:00');
  assert.equal(U.localParts(Date.parse('2026-11-28T03:00:00Z'), tz).hhmm, '00:00');
  assert.equal(U.localParts(Date.parse('2026-07-01T15:00:00Z'), tz).hhmm, '12:00');
  // Manaus is an hour behind, Noronha an hour ahead.
  assert.equal(U.localParts(Date.parse('2026-11-27T15:00:00Z'), 'America/Manaus').hhmm, '11:00');
  assert.equal(U.localParts(Date.parse('2026-11-27T15:00:00Z'), 'America/Noronha').hhmm, '13:00');
});

test('local time: Madrid is UTC+1 in winter and UTC+2 in summer; Canarias an hour behind', () => {
  const tz = 'Europe/Madrid';
  assert.equal(U.localParts(Date.parse('2026-11-27T12:00:00Z'), tz).hhmm, '13:00');
  assert.deepEqual(U.localParts(Date.parse('2026-11-27T23:00:00Z'), tz), { date: '2026-11-28', hour: 0, minute: 0, hhmm: '00:00' });
  assert.equal(U.localParts(Date.parse('2026-07-15T12:00:00Z'), tz).hhmm, '14:00');
  // The switch: 2026-03-29 01:00 UTC.
  assert.equal(U.localParts(Date.parse('2026-03-29T00:30:00Z'), tz).hhmm, '01:30');
  assert.equal(U.localParts(Date.parse('2026-03-29T01:30:00Z'), tz).hhmm, '03:30');
  assert.equal(U.localParts(Date.parse('2026-07-15T12:00:00Z'), 'Atlantic/Canary').hhmm, '13:00');
});

test('São Paulo, 07:29 local: today has every daylight hour, peak 15 at 12:00', () => {
  const tz = 'America/Sao_Paulo';
  const now = Date.parse('2026-11-27T10:29:00Z');
  const s = U.parseMet(fixture('sao-paulo'));
  const days = U.localDays(s, tz, now);
  assert.deepEqual(days.map((d) => d.date), ['2026-11-27', '2026-11-28', '2026-11-29']);
  assert.equal(days[0].hours[0].hhmm, '07:00');
  assert.equal(days[0].hours.at(-1).hhmm, '23:00');
  assert.equal(days[1].hours.length, 24);
  assert.equal(U.localParts(U.currentHour(s, now).t, tz).hhmm, '07:00');
  assert.equal(U.currentHour(s, Date.parse('2026-11-27T09:59:00Z')), null);
  const sum = U.summarizeDay(days[0]);
  assert.equal(sum.maxRounded, 15);
  assert.equal(sum.maxAt, '12:00');
  assert.equal(sum.category, 'extreme');
  assert.equal(sum.partial, false);
  assert.deepEqual(sum.spans[3], { from: '08:00', to: '16:00', count: 9 });
  assert.deepEqual(sum.spans[6], { from: '09:00', to: '15:00', count: 7 });
  assert.deepEqual(sum.spans[8], { from: '09:00', to: '14:00', count: 6 });
  const shown = U.daylightHours(days[0].hours);
  assert.equal(shown[0].hhmm, '07:00');
  assert.equal(shown.at(-1).hhmm, '18:00');
});

test('Madrid, 11:29 local in November: low all day, peak 2 at 13:00', () => {
  const tz = 'Europe/Madrid';
  const now = Date.parse('2026-11-27T10:29:00Z');
  const s = U.parseMet(fixture('madrid'));
  const days = U.localDays(s, tz, now);
  assert.equal(days[0].date, '2026-11-27');
  assert.equal(days[0].hours[0].hhmm, '11:00');
  assert.equal(days[0].hours.at(-1).hhmm, '23:00');
  const sum = U.summarizeDay(days[0]);
  assert.equal(sum.maxRounded, 2);
  assert.equal(sum.maxAt, '13:00');
  assert.equal(sum.category, 'low');
  assert.equal(sum.spans[3], null);
  assert.equal(U.protectionStep(sum.max), 'none');
  const tomorrow = U.summarizeDay(days[1]);
  assert.equal(tomorrow.date, '2026-11-28');
  assert.equal(tomorrow.maxAt, '13:00');
});

test('an afternoon visit: the peak has passed, so the max is "from now"', () => {
  const t0 = Date.parse('2026-01-10T18:00:00Z'); // 15:00 in São Paulo
  const series = [9.2, 6.1, 3.0, 0.8, 0.1, 0].map((uv, i) => ({ t: t0 + i * H, uv, cloud: 20 }));
  const [today] = U.localDays(series, 'America/Sao_Paulo', t0 + 10 * 60e3);
  const sum = U.summarizeDay(today);
  assert.equal(sum.partial, true);
  assert.equal(sum.maxAt, '15:00');
  assert.deepEqual(sum.spans[8], { from: '15:00', to: '15:00', count: 1 });
  // Evening: nothing left but zeros; not "partial" and nothing to list.
  const night = [0, 0, 0].map((uv, i) => ({ t: t0 + (6 + i) * H, uv, cloud: null }));
  const [late] = U.localDays(night, 'America/Sao_Paulo', t0 + 6 * H);
  assert.equal(U.summarizeDay(late).partial, false);
  assert.deepEqual(U.daylightHours(late.hours), []);
});

test('localDays drops hours before the local today', () => {
  const t0 = Date.parse('2026-11-27T22:00:00Z'); // 23:00 in Madrid
  const series = [0, 0, 0].map((uv, i) => ({ t: t0 + i * H, uv, cloud: 0 }));
  const days = U.localDays(series, 'Europe/Madrid', t0 + H + 60e3); // 00:01 on the 28th
  assert.deepEqual(days.map((d) => [d.date, d.hours.map((h) => h.hhmm)]), [['2026-11-28', ['00:00', '01:00']]]);
});

test('city list: valid zones, sane coordinates, unique ids, accent-free search', () => {
  assert.ok(CITIES.length >= 150, `${CITIES.length} cities`);
  const ids = new Set();
  for (const c of CITIES) {
    assert.ok(U.validZone(c.tz), `${c.n}: ${c.tz}`);
    assert.ok(Math.abs(c.lat) <= 60 && Math.abs(c.lon) <= 180, `${c.n} coordinates`);
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`);
    ids.add(c.id);
  }
  // Southern hemisphere for BR (but the far north), AR, CL, PE; northern for ES, PT, MX.
  for (const c of CITIES) {
    if (['AR', 'CL'].includes(c.c)) assert.ok(c.lat < 0, c.n);
    if (['ES', 'PT', 'MX'].includes(c.c)) assert.ok(c.lat > 0, c.n);
    if (['BR', 'AR', 'CL', 'CO', 'PE', 'MX'].includes(c.c)) assert.ok(c.lon < -30, c.n);
    if (c.c === 'AU') assert.ok(c.lat < -10 && c.lon > 110 && c.lon < 155 && c.tz.startsWith('Australia/'), c.n);
    if (c.c === 'NZ') assert.ok(c.lat < -34 && c.lon > 166 && c.tz === 'Pacific/Auckland', c.n);
    if (c.c === 'ZA') assert.ok(c.lat < -22 && c.lon > 16 && c.lon < 33 && c.tz === 'Africa/Johannesburg', c.n);
  }
  const names = (q) => U.searchCities(CITIES, q, (c) => c).map((c) => `${c.n} ${c.c}`);
  assert.equal(names('sao paulo')[0], 'São Paulo BR');
  assert.equal(names('BOGOTA')[0], 'Bogotá CO');
  assert.deepEqual(names('cordoba').slice(0, 2).sort(), ['Córdoba AR', 'Córdoba ES']);
  assert.equal(names('rio')[0], 'Rio de Janeiro BR');
  assert.ok(names('janeiro').includes('Rio de Janeiro BR'));
  assert.deepEqual(names(''), []);
  assert.deepEqual(names('zzzz'), []);
  assert.ok(CITIES.find((c) => c.id === 'br-sao-paulo'));
  assert.ok(CITIES.find((c) => c.id === 'mx-ciudad-de-mexico'));
});

test('the quick-pick buttons on every page point at real cities', () => {
  for (const page of PAGES) {
    const html = readFileSync(new URL(page, import.meta.url), 'utf8');
    const ids = [...html.matchAll(/data-city="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(ids.length >= 6, page);
    for (const id of ids) assert.ok(CITIES.some((c) => c.id === id), `${page}: ${id}`);
    const strings = JSON.parse(html.match(/<script type="application\/json" id="uv-strings">([\s\S]*?)<\/script>/)[1]);
    for (const k of ['low', 'moderate', 'high', 'veryHigh', 'extreme']) {
      assert.ok(strings.cat[k] && strings.advice[k], `${page}: ${k}`);
    }
    assert.equal(strings.skinTypes.length, 6);
    // Every city in the shared list has a country name on every page.
    for (const code of new Set(CITIES.map((c) => c.c))) assert.ok(strings.countries[code], `${page}: country ${code}`);
  }
});

test('English page: the cities the searches ask for, each one a ?city= link', () => {
  const html = readFileSync(new URL('../../uv-index-today/index.html', import.meta.url), 'utf8');
  const links = [...html.matchAll(/<a href="\?city=([^"]+)" data-city="([^"]+)">([^<]+)<\/a>/g)].map((m) => ({ q: m[1], id: m[2], text: m[3] }));
  const wanted = ['Melbourne', 'Sydney', 'Perth', 'Brisbane', 'Auckland', 'Adelaide', 'Gold Coast', 'Cape Town',
    'Hobart', 'Darwin', 'Canberra', 'Newcastle', 'Cairns', 'Wellington', 'Christchurch', 'Johannesburg', 'Durban'];
  for (const name of wanted) {
    const link = links.find((l) => l.text === name);
    assert.ok(link, `no link for ${name}`);
    const c = U.findCity(CITIES, link.q);
    assert.ok(c, `?city=${link.q} finds nothing`);
    assert.equal(c.id, link.id, name);
    assert.equal(c.n, name);
    assert.equal(U.linkId(CITIES, c), link.q, `${name}: the link is what the page writes back`);
  }
  for (const l of links) assert.equal(U.findCity(CITIES, l.q)?.id, l.id, l.q);
  const strings = JSON.parse(html.match(/<script type="application\/json" id="uv-strings">([\s\S]*?)<\/script>/)[1]);
  assert.equal(strings.param, 'city');
  assert.equal(strings.calcHref, '../uv-tanning-calculator/');
  assert.ok(html.includes('href="../live-uv/app.js"') || html.includes('src="../live-uv/app.js"'));
});

test('findCity and linkId: ids, short names, ambiguity', () => {
  assert.equal(U.findCity(CITIES, 'au-melbourne').n, 'Melbourne');
  assert.equal(U.findCity(CITIES, 'melbourne').id, 'au-melbourne');
  assert.equal(U.findCity(CITIES, 'MELBOURNE').id, 'au-melbourne');
  assert.equal(U.findCity(CITIES, 'gold-coast').id, 'au-gold-coast');
  assert.equal(U.findCity(CITIES, 'br-sao-paulo').n, 'São Paulo');
  assert.equal(U.findCity(CITIES, 'sao-paulo').id, 'br-sao-paulo');
  assert.equal(U.findCity(CITIES, ''), null);
  assert.equal(U.findCity(CITIES, null), null);
  assert.equal(U.findCity(CITIES, 'atlantis'), null);
  // Córdoba is in Argentina and in Spain: the short name is ambiguous, the id isn't.
  assert.equal(U.findCity(CITIES, 'cordoba'), null);
  const cba = CITIES.find((c) => c.n === 'Córdoba' && c.c === 'AR');
  assert.equal(U.linkId(CITIES, cba), cba.id);
  assert.equal(U.findCity(CITIES, U.linkId(CITIES, cba)), cba);
  for (const c of CITIES) assert.equal(U.findCity(CITIES, U.linkId(CITIES, c)), c, c.id);
});

test('the three UV pages name each other in hreflang, both ways, and the FAQ markup matches', async () => {
  const { faqLd } = await import('../../../_tools/solei-pages/faq.mjs');
  const urls = { en: 'https://juicypasta.github.io/solei/uv-index-today/', es: 'https://juicypasta.github.io/solei/es/indice-uv-hoy/', 'pt-BR': 'https://juicypasta.github.io/solei/pt/indice-uv-hoje/' };
  for (const page of PAGES) {
    const html = readFileSync(new URL(page, import.meta.url), 'utf8');
    const alts = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]));
    assert.deepEqual(alts, { ...urls, 'x-default': urls.en }, page);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)[1];
    assert.ok(Object.values(urls).includes(canonical), page);
    for (const m of html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)) JSON.parse(m[1]);
  }
  const en = readFileSync(new URL('../../uv-index-today/index.html', import.meta.url), 'utf8');
  const ld = [...en.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(ld.map((b) => b['@type']), ['WebApplication', 'FAQPage']);
  assert.deepEqual(ld[1], faqLd(en));
  assert.ok(ld[1].mainEntity.length >= 6);
  // Honest labels: the model is named as clear-sky, the national services as the authority.
  for (const s of ['clear-sky', 'Bureau of Meteorology', 'ARPANSA', 'MetService', 'NIWA', 'South African Weather Service', 'MET Norway']) assert.ok(en.includes(s), s);
  assert.ok(!/googletagmanager|google-analytics|gtag\(/.test(en), 'no analytics');
  assert.ok(!/apps\.apple\.com|play\.google\.com/.test(en), 'no store link before approval');
  const title = en.match(/<title>([^<]+)<\/title>/)[1];
  const desc = en.match(/<meta name="description" content="([^"]+)">/)[1];
  assert.match(title, /^UV index today/);
  assert.ok(title.length <= 65 && desc.length <= 155, `${title.length} / ${desc.length}`);
});
