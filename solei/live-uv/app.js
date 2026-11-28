// The live "UV index today" pages (en, es, pt). Words come from the page's
// #uv-strings block (plus optional "locale" for dates, "param" for the link's
// query key, "calcHref" and "titleCity"); the maths lives in uv.js and ../uv-tanning-calculator/sun.js.
// Nothing is stored: no cookies, no localStorage. The only request is the
// forecast for the chosen place, with coordinates rounded to ~1 km.
import * as U from './uv.js';
import * as S from '../uv-tanning-calculator/sun.js';
import { CITIES } from './cities.js';

const T = JSON.parse(document.getElementById('uv-strings').textContent);
const LANG = T.locale || document.documentElement.lang;
// ?c=au-melbourne (es, pt) or ?city=melbourne (en); both are read everywhere.
const PARAM = T.param || 'c';
const fill = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

const country = (code) => T.countries[code] ?? code;
const cityLabel = (c) => `${c.n}, ${country(c.c)}`;
const deviceZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

// ---- forecast, kept in memory until MET's Expires time ----
const cache = new Map();
async function forecast(lat, lon) {
  const url = U.metUrl(lat, lon);
  const hit = cache.get(url);
  if (hit && hit.until > Date.now()) return hit.json;
  // Browsers can't set User-Agent; MET identifies browser apps by the Origin header.
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MET ${res.status}`);
  const json = await res.json();
  const exp = Date.parse(res.headers.get('expires'));
  cache.set(url, { json, until: Number.isFinite(exp) ? exp : Date.now() + 30 * 60e3 });
  return json;
}

// ---- city search ----
const input = $('city');
const list = $('city-list');
const status = $('status');
let matches = [];
let active = -1;

function closeList() {
  list.hidden = true;
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
  active = -1;
}

function showList() {
  matches = U.searchCities(CITIES, input.value, country);
  list.replaceChildren();
  if (!input.value.trim()) { closeList(); return; }
  if (!matches.length) {
    list.append(el('li', { class: 'none', role: 'option', 'aria-disabled': 'true' }, T.noMatch));
  } else {
    matches.forEach((c, i) => list.append(el('li', {
      id: `opt-${i}`, role: 'option', 'aria-selected': 'false',
      onmousedown: (e) => e.preventDefault(),
      onclick: () => pick(c),
    }, el('b', {}, c.n), `, ${country(c.c)}`)));
  }
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  active = -1;
}

function highlight(i) {
  const items = list.querySelectorAll('li[id]');
  if (!items.length) return;
  active = (i + items.length) % items.length;
  items.forEach((li, k) => li.setAttribute('aria-selected', String(k === active)));
  input.setAttribute('aria-activedescendant', items[active].id);
  items[active].scrollIntoView({ block: 'nearest' });
}

input.addEventListener('input', showList);
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) showList(); highlight(active + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const c = matches[active >= 0 ? active : 0];
    if (c) pick(c);
  } else if (e.key === 'Escape') closeList();
});
input.addEventListener('blur', () => setTimeout(closeList, 150));
$('picker').addEventListener('submit', (e) => e.preventDefault());

function pick(c) {
  input.value = cityLabel(c);
  closeList();
  const q = new URLSearchParams(location.search);
  q.delete('c');
  q.delete('city');
  q.set(PARAM, PARAM === 'city' ? U.linkId(CITIES, c) : c.id);
  history.replaceState(null, '', `?${q}${location.hash}`);
  if (T.titleCity) document.title = fill(T.titleCity, { place: c.n });
  load({ name: c.n, full: cityLabel(c), lat: c.lat, lon: c.lon, tz: c.tz });
}

for (const b of document.querySelectorAll('[data-city]')) {
  // Buttons, or links (<a href="?city=…">) that stay on the page.
  b.addEventListener('click', (e) => {
    const c = CITIES.find((x) => x.id === b.dataset.city);
    if (!c) return;
    e.preventDefault();
    pick(c);
    if (!b.closest('#picker')) $('picker').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---- "use my location" ----
$('locate').addEventListener('click', () => {
  if (!navigator.geolocation) { status.textContent = T.geoUnsupported; return; }
  status.textContent = T.geoAsk;
  navigator.geolocation.getCurrentPosition((pos) => {
    // Rounded before it goes anywhere; never kept or put in the URL.
    const lat = U.roundCoord(pos.coords.latitude), lon = U.roundCoord(pos.coords.longitude);
    input.value = '';
    const q = new URLSearchParams(location.search);
    q.delete('c');
    q.delete('city');
    const qs = q.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    load({ name: T.myPlace, full: T.myPlace, lat, lon, tz: deviceZone(), here: true });
  }, () => { status.textContent = T.geoDenied; }, { enableHighAccuracy: false, maximumAge: 10 * 60e3, timeout: 20e3 });
});

// ---- rendering ----
let seq = 0;
async function load(place) {
  const my = ++seq;
  status.textContent = fill(T.loading, { place: place.full });
  let json;
  try {
    json = await forecast(place.lat, place.lon);
  } catch {
    if (my === seq) status.textContent = T.error;
    return;
  }
  if (my !== seq) return;
  status.textContent = place.guessed ? fill(T.guessed, { place: place.full }) : '';
  render(place, json);
}

const whenText = (place) => (place.here ? T.localTime : fill(T.placeTime, { place: place.name }));
const fmtDate = (ms, tz) => new Intl.DateTimeFormat(LANG, { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date(ms));

function spanText(span) {
  if (!span) return T.spanNone;
  if (span.from === span.to) return fill(T.spanOne, { from: span.from });
  return fill(T.spanFromTo, { from: span.from, to: span.to });
}

function chip(uv) {
  const cat = U.uvCategory(uv);
  return el('span', { class: `uvchip c-${cat}` }, el('b', {}, String(U.roundUvi(uv))), ` ${T.cat[cat]}`);
}

function dayPanel(place, day, isToday, now) {
  const sum = U.summarizeDay(day);
  const cat = sum.category;
  const first = day.hours[0];
  const kicker = `${place.name} · ${isToday ? T.today : T.tomorrow}, ${fmtDate(first.t, place.tz)}`;
  const label = isToday ? (sum.partial ? T.maxFromNow : T.maxToday) : T.maxDay;
  const head = el('div', { class: `headline c-${cat}` },
    el('p', { class: 'kicker' }, kicker),
    el('p', { class: 'big' }, String(sum.maxRounded), el('span', { class: 'catname' }, T.cat[cat])),
    el('p', { class: 'who' }, `${label}, ${fill(T.at, { t: sum.maxAt })} · ${T.clearSky}`));

  const facts = [];
  if (isToday) {
    const cur = U.currentHour(day.hours, now);
    if (cur) facts.push(el('div', { class: 'pair-item' }, el('span', { class: 'pair-label' }, fill(T.now, { t: cur.hhmm })), el('span', { class: 'pair-value' }, chip(cur.uv))));
  }
  facts.push(el('div', { class: 'pair-item' }, el('span', { class: 'pair-label' }, label), el('span', { class: 'pair-value' }, chip(sum.max)), el('span', { class: 'pair-sub' }, fill(T.at, { t: sum.maxAt }))));

  const step = U.protectionStep(sum.max);
  const advice = el('p', { class: `advice step-${step}` }, el('strong', {}, `${T.step[step]}. `), T.stepText[step], ' ', el('span', { class: 'muted' }, `${T.cat[cat]}: ${T.advice[cat]}`));

  const spans = el('ul', { class: 'spans' }, [3, 6, 8].map((n) => el('li', {},
    el('span', { class: `dot c-${U.uvCategory(n)}` }), el('b', {}, fill(T.spanLine, { n })), ': ', spanText(sum.spans[n]))));

  const shown = U.daylightHours(day.hours);
  const top = Math.max(11, ...shown.map((h) => h.uv));
  const rows = shown.map((h) => {
    const c = U.uvCategory(h.uv);
    const isNow = isToday && h.t <= now && now < h.t + 3600e3;
    return el('tr', { class: isNow ? 'here' : '' },
      el('th', { scope: 'row' }, h.hhmm),
      el('td', { class: 'barcell' }, el('div', { class: 'barwrap' },
        el('span', { class: `bar c-${c}`, style: `width:${Math.max(1, (h.uv / top) * 60).toFixed(1)}%` }),
        el('span', { class: 'barval' }, el('b', {}, String(U.roundUvi(h.uv))), ' ', el('small', {}, T.cat[c])))),
      el('td', { class: 'cloud' }, h.cloud === null ? '–' : `${Math.round(h.cloud)}%`));
  });
  const hourly = shown.length
    ? el('div', { class: 'table-wrap' }, el('table', { class: 'hours' },
      el('caption', {}, fill(T.hourCaption, { when: whenText(place) })),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, T.hourCol), el('th', { scope: 'col' }, T.uvCol), el('th', { scope: 'col' }, T.cloudCol))),
      el('tbody', {}, rows)))
    : el('p', { class: 'muted' }, T.noUvHours);

  let skin = null;
  if (sum.max >= S.DARK_UVI) {
    const cells = [1, 2, 3, 4, 5, 6].map((t) => {
      const s = S.safeTime(sum.max, t, 0);
      return el('td', {}, s.minutes === null ? T.noLimit : S.formatDuration(s.minutes));
    });
    skin = el('div', { class: 'table-wrap' }, el('table', { class: 'skintimes' },
      el('caption', {}, fill(T.skinCaption, { uv: sum.maxRounded })),
      el('thead', {}, el('tr', {}, ['I', 'II', 'III', 'IV', 'V', 'VI'].map((r, i) => el('th', { scope: 'col', title: T.skinTypes[i] }, r)))),
      el('tbody', {}, el('tr', {}, cells))));
  }

  return el('div', { class: 'day', 'data-day': isToday ? 'today' : 'tomorrow' },
    head,
    el('div', { class: 'body' },
      el('div', { class: 'pair' }, facts),
      advice,
      spans,
      hourly,
      skin,
      skin ? el('p', { class: 'small muted' }, T.skinNote, ' ', el('a', { href: T.calcHref || '../../uv-tanning-calculator/', hreflang: 'en' }, T.calcLink)) : null));
}

function render(place, json) {
  const result = $('result');
  let series, days;
  const now = Date.now();
  if (!U.validZone(place.tz)) place = { ...place, tz: 'UTC' };
  try {
    series = U.parseMet(json);
    days = U.localDays(series, place.tz, now).slice(0, 2).filter((d) => d.hours.length);
  } catch { status.textContent = T.error; return; }
  if (!days.length) { status.textContent = T.error; return; }
  const today = days[0];
  const tomorrow = days[1];
  const todayHasUv = today.hours.some((h) => U.roundUvi(h.uv) >= 1);
  let showing = !todayHasUv && tomorrow ? 'tomorrow' : 'today';

  const panels = { today: dayPanel(place, today, true, now) };
  if (tomorrow) panels.tomorrow = dayPanel(place, tomorrow, false, now);

  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const select = (which) => {
    showing = which;
    for (const [k, p] of Object.entries(panels)) p.hidden = k !== which;
    for (const b of tabs.children) b.setAttribute('aria-selected', String(b.dataset.day === which));
  };
  for (const [k, label] of [['today', T.today], ['tomorrow', T.tomorrow]]) {
    if (!panels[k]) continue;
    tabs.append(el('button', { type: 'button', role: 'tab', 'data-day': k, onclick: () => select(k) }, label));
  }

  const updated = Date.parse(json?.properties?.meta?.updated_at);
  const source = el('p', { class: 'source small muted' },
    T.sourceData, ' ', el('a', { href: 'https://api.met.no/' }, 'MET Norway'), ' (', el('a', { href: 'https://creativecommons.org/licenses/by/4.0/' }, 'CC BY 4.0'), '). ',
    T.sourceClear, ' ',
    Number.isFinite(updated) ? fill(T.sourceUpdated, { t: U.localParts(updated, place.tz).hhmm, when: whenText(place) }) + ' ' : '',
    T.sourceChanges);

  const note = !todayHasUv && tomorrow ? el('p', { class: 'note-line' }, fill(T.noUvLeft, { place: place.name })) : null;
  result.replaceChildren(el('div', { class: 'card result' }, note, tabs, Object.values(panels), el('div', { class: 'body foot' }, source)));
  select(showing);
  result.hidden = false;
}

// ---- start: a shared link (?c=… or ?city=…), else the device's time zone picks a city ----
const linked = new URLSearchParams(location.search);
const fromLink = U.findCity(CITIES, linked.get('city') || linked.get('c'));
if (fromLink) {
  pick(fromLink);
} else {
  // Browsers report some zones by their old ICU names (America/Buenos_Aires
  // for America/Argentina/Buenos_Aires), so Argentina is matched as a whole.
  const AR = /^America\/(Argentina\/|Buenos_Aires$|Cordoba$|Catamarca$|Jujuy$|Mendoza$|Rosario$)/;
  const zoneKey = (z) => (AR.test(z) ? 'AR' : z);
  const want = zoneKey(deviceZone());
  const guess = CITIES.find((c) => zoneKey(c.tz) === want);
  if (guess) load({ name: guess.n, full: cityLabel(guess), lat: guess.lat, lon: guess.lon, tz: guess.tz, guessed: true });
}
