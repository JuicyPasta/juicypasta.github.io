// The page: airport pickers, data loading, rendering. Logic lives in forecast.js
// (and flights.js for the flight-number box).
import * as F from './forecast.js';
import * as Fl from './flights.js';

const DATA_BASE = 'https://juicypasta.github.io/jetcalm-data/v1/';
const LEVEL_NAMES = ['Calm', 'Light', 'Moderate', 'Strong', 'Severe'];
const LEVEL_INLINE = ['calm', 'light', 'moderate', 'strong', 'severe'];
const HEADLINES = ['A calm flight', 'Light bumps', 'Some moderate bumps', 'Strong bumps in places', 'Severe turbulence in places'];
const DESCRIPTIONS = [
  'Nothing to notice, or an occasional gentle wobble.',
  'Small bumps, like a car on a gravel road. Drinks stay in the cup. Very common.',
  'Clear bumps and some jolts. Drinks can spill and walking is awkward. The seatbelt sign is usually on.',
  'Firm jolts that press you against the belt. Loose items move. Service stops. Uncommon.',
  'Abrupt, large movements. Rare, and pilots plan routes to stay away from areas where it is forecast.',
];
const NO_DATA_DESCRIPTION = 'The forecast does not cover this stretch. A gap means no data, not calm.';
const CONFIDENCE = {
  high: 'High confidence: your flight is less than a day away.',
  good: 'Good confidence: your flight is one to two days away.',
  outlook: 'Early outlook: expect changes as your flight gets closer.',
};
const STALE_MS = 18 * 3600e3;

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.style.cssText = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
};

// ---------- airports ----------
let airports = [];
const byIata = new Map();
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function loadAirports() {
  const res = await fetch('airports.json');
  const json = await res.json();
  airports = json.a.map(([iata, name, city, country, lat, lon, tz, size]) => {
    const a = { iata, name, city, country, lat, lon, tz, size, place: city || name };
    a.key = { iata: iata.toLowerCase(), city: fold(city), name: fold(name) };
    byIata.set(iata, a);
    return a;
  });
}

function search(query) {
  const q = fold(query.trim());
  if (!q) return [];
  const scored = [];
  for (const a of airports) {
    const k = a.key;
    let score = null;
    if (k.iata === q) score = 0;
    else if (q.length <= 3 && k.iata.startsWith(q)) score = 2;
    else if (k.city.startsWith(q)) score = 1;
    else if (k.name.startsWith(q)) score = 3;
    else if (k.city.includes(` ${q}`) || k.name.includes(` ${q}`)) score = 4;
    else if (q.length >= 3 && (k.name.includes(q) || k.city.includes(q))) score = 5;
    if (score !== null) scored.push([score, a]);
  }
  scored.sort((x, y) => x[0] - y[0] || x[1].size - y[1].size || x[1].place.localeCompare(y[1].place));
  return scored.slice(0, 8).map((s) => s[1]);
}

const label = (a) => `${a.place} (${a.iata})`;

function combo(inputId, onChoose = () => {}) {
  const input = $(inputId);
  const list = $(`${inputId}-list`);
  const state = { selected: null, options: [], active: -1 };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    state.active = -1;
  };
  const choose = (a) => {
    state.selected = a;
    input.value = label(a);
    input.setCustomValidity('');
    close();
    onChoose(a);
  };
  const highlight = (i) => {
    state.active = i;
    [...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
    if (i >= 0) input.setAttribute('aria-activedescendant', `${inputId}-opt-${i}`);
  };
  const render = () => {
    state.options = search(input.value);
    list.replaceChildren(...state.options.map((a, i) => el('li', {
      id: `${inputId}-opt-${i}`, role: 'option', 'aria-selected': 'false',
      onmousedown: (e) => { e.preventDefault(); choose(a); },
    }, el('b', {}, a.iata), ' ', el('span', {}, `${a.place}`), el('small', {}, `${a.name}, ${a.country}`))));
    const open = state.options.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open) highlight(0);
  };
  input.addEventListener('input', () => { state.selected = null; render(); });
  input.addEventListener('focus', () => { if (!state.selected && input.value) render(); else input.select(); });
  input.addEventListener('blur', () => {
    if (!state.selected) {
      const exact = byIata.get(input.value.trim().toUpperCase());
      if (exact) choose(exact);
    }
    close();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(Math.min(state.options.length - 1, state.active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(Math.max(0, state.active - 1)); }
    else if (e.key === 'Enter' && state.active >= 0) { e.preventDefault(); choose(state.options[state.active]); }
    else if (e.key === 'Escape') close();
  });
  return {
    get value() {
      if (state.selected) return state.selected;
      const text = input.value.trim();
      const exact = byIata.get(text.toUpperCase());
      if (exact) return exact;
      const m = /\(([A-Z]{3})\)$/.exec(text);
      return m ? byIata.get(m[1]) ?? null : null;
    },
    set(a) { if (a) choose(a); },
  };
}

// ---------- flight number ----------
// The optional box above the airports only fills them; flights.js has the
// rules and the words. flightFill is the flight that filled the airports now
// picked, so the shareable URL can carry it while they still match.
let airportsReady = null;
let flightFill = null;
let flightIndex = null;
const airlineFiles = new Map();

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

function getFlightIndex() {
  if (!flightIndex) {
    flightIndex = getJson(`${Fl.BASE}index.json`);
    flightIndex.catch(() => { flightIndex = null; });
  }
  return flightIndex;
}

function getAirline(file) {
  if (!airlineFiles.has(file)) {
    const promise = getJson(Fl.BASE + file);
    airlineFiles.set(file, promise);
    promise.catch(() => airlineFiles.delete(file));
  }
  return airlineFiles.get(file);
}

function flightParam(origin, destination) {
  return flightFill && flightFill.from === origin.iata && flightFill.to === destination.iata ? flightFill.param : null;
}

function flightBox(from, to) {
  const input = $('flight-no');
  const find = $('flight-find');
  const status = $('flight-status');
  const legs = $('flight-legs');
  const key = (s) => s.toUpperCase().replace(/[\s.-]/g, '');
  let looked = null; // what the shown answer is for
  let seq = 0;
  let pending = Promise.resolve();

  const fill = (param, a, b) => {
    from.set(a);
    to.set(b);
    flightFill = { param, from: a.iata, to: b.iata };
  };
  const clear = () => {
    status.textContent = '';
    status.className = 'flight-status';
    legs.replaceChildren();
    find.removeAttribute('aria-busy');
  };
  const answer = (o) => {
    const d = Fl.describe(o, label);
    status.className = `flight-status ${d.found ? 'found' : 'miss'}`;
    status.textContent = d.text;
    if (o.kind === 'one') fill(o.param, ...o.legs[0]);
    legs.replaceChildren(...d.legs.map((leg) => el('button', {
      type: 'button', class: 'leg', 'aria-pressed': 'false',
      onclick: (e) => {
        for (const b of legs.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        fill(o.param, leg.from, leg.to);
      },
    }, leg.text)));
  };
  const lookup = () => {
    const text = input.value;
    const mine = ++seq;
    clear();
    looked = key(text);
    if (!looked) {
      flightFill = null;
      pending = Promise.resolve();
      return pending;
    }
    find.setAttribute('aria-busy', 'true');
    pending = (async () => {
      let o;
      try {
        await airportsReady;
        o = await Fl.lookup(text, { index: getFlightIndex, airline: getAirline, known: (iata) => byIata.get(iata) });
      } catch (error) {
        o = { kind: 'failed', error };
      }
      if (o.kind === 'failed') console.warn('flight lookup', o.error);
      if (mine !== seq) return;
      find.removeAttribute('aria-busy');
      answer(o);
    })();
    return pending;
  };

  find.addEventListener('click', lookup);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); lookup(); }
  });
  // Leaving the box after typing a number looks it up too.
  input.addEventListener('change', () => { if (key(input.value) !== looked) lookup(); });
  input.addEventListener('input', () => {
    if (key(input.value) === looked) return;
    seq++;
    clear();
    looked = null;
  });

  return {
    settled: () => pending,
    /** ?flight=BA117: fills the box; looks it up only if the URL has no airports (they win). */
    restore(param, origin, destination) {
      const parsed = Fl.parse(param ?? '');
      if (!parsed) return null;
      input.value = `${parsed.code} ${parsed.number}`;
      if (!origin && !destination) return lookup();
      looked = key(input.value);
      flightFill = { param: `${parsed.code}${parsed.number}`, from: origin?.iata, to: destination?.iata };
      return null;
    },
  };
}

// ---------- data ----------
let manifestCache = null;
const stepCache = new Map();

async function getManifest(force = false) {
  if (manifestCache && !force && Date.now() - manifestCache.fetchedAt < 10 * 60e3) return manifestCache.manifest;
  const res = await fetch(`${DATA_BASE}manifest.json`, { cache: force ? 'no-cache' : 'default' });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const manifest = F.parseManifest(await res.json());
  manifestCache = { manifest, fetchedAt: Date.now() };
  return manifest;
}

async function getStep(manifest, info) {
  if (stepCache.has(info.file)) return stepCache.get(info.file);
  const promise = (async () => {
    const res = await fetch(DATA_BASE + info.file);
    if (!res.ok) {
      const err = new Error(`step ${info.file} ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return new F.StepGrid(info, manifest.grid, await F.inflate(await res.arrayBuffer()));
  })();
  stepCache.set(info.file, promise);
  promise.catch(() => stepCache.delete(info.file));
  return promise;
}

async function compute(origin, destination, departure) {
  let manifest = await getManifest();
  const plan = F.FlightPlan.estimated(origin, destination, departure);
  const outcome = F.freeOutcome(plan, manifest, Date.now());
  if (outcome.kind !== 'ready') return { plan, manifest, outcome };
  let steps;
  try {
    steps = await Promise.all(F.stepsFor(manifest, plan.departure, plan.arrival).map((i) => getStep(manifest, i)));
  } catch (e) {
    if (e.status !== 404) throw e;
    // The manifest is older than the files on the host: fetch it again once.
    manifest = await getManifest(true);
    steps = await Promise.all(F.stepsFor(manifest, plan.departure, plan.arrival).map((i) => getStep(manifest, i)));
  }
  const samples = F.sample(plan, steps);
  const summary = F.summarize(samples, manifest.thresholds, plan.durationMinutes);
  return { plan, manifest, outcome, samples, summary, steps };
}

// ---------- formatting ----------
const fmtWhen = (ms, tz) => new Intl.DateTimeFormat('en-US', {
  timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(ms));
const fmtClock = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
const fmtDay = (ms, tz) => new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(ms));
const fmtUtc = (ms) => `${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))} UTC`;
const runLabel = (run) => (run && /^\d{10}$/.test(run)
  ? fmtUtc(Date.UTC(+run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10)))
  : null);
const dur = (m) => F.formatDuration(F.roundToFive(m));
const km = (d) => `${Math.round(d).toLocaleString('en-US')} km (${Math.round(d / 1.609344).toLocaleString('en-US')} mi)`;

// ---------- rendering ----------
const result = () => $('result');

function show(...children) {
  const r = result();
  r.replaceChildren(...children);
  r.hidden = false;
}

function routeHeader(plan) {
  const { origin: o, destination: d } = plan;
  return el('div', { class: 'route' },
    el('p', { class: 'route-line' }, `${o.place} (${o.iata}) → ${d.place} (${d.iata})`),
    el('p', { class: 'route-times' },
      `Takeoff ${fmtWhen(plan.departure, o.tz)}, ${o.place} time · Landing about ${fmtWhen(plan.arrival, d.tz)}, ${d.place} time`),
    el('p', { class: 'muted small' }, `${km(plan.distanceKm)} · ${F.formatDuration(plan.durationMinutes)} flight. The landing time is our estimate from the distance.`));
}

function renderMessage(plan, title, body, extra = null) {
  show(el('div', { class: 'card', id: 'message' }, routeHeader(plan), el('h2', { class: 'msg-title' }, title), el('p', {}, body),
    extra ? el('p', { class: 'pro-note' }, extra, ' ', el('a', { href: '../' }, 'About the app')) : null));
}

function bar(segments, duration, { tall, onPick }) {
  const wrap = el('div', { class: `bar ${tall ? 'tall' : 'thin'}` });
  segments.forEach((s, i) => {
    const cls = s.level === null ? 'gap' : `l${s.level}`;
    const width = ((s.end - s.start) / duration) * 100;
    const name = s.level === null ? 'No data' : LEVEL_NAMES[s.level];
    // Overlap neighbours by a pixel so no hairline shows between them.
    const w = i < segments.length - 1 ? `calc(${width}% + 1px)` : `${width}%`;
    const seg = el(onPick ? 'button' : 'span', {
      class: `seg ${cls}`, style: `left:${(s.start / duration) * 100}%;width:${w}`,
      title: `${name}: ${dur(s.start)} to ${dur(s.end)} after takeoff`,
      'aria-label': `${name}, ${F.formatDuration(s.start)} to ${F.formatDuration(s.end)} after takeoff`,
    });
    if (onPick) {
      seg.type = 'button';
      seg.addEventListener('click', () => onPick(s, i));
    }
    wrap.append(seg);
  });
  return wrap;
}

/** The bracket above the bar that marks early-outlook stretches. */
function outlookRow(outlook, duration) {
  const row = el('div', { class: 'outlook-row', 'aria-hidden': 'true' });
  for (const o of outlook) {
    const width = ((o.end - o.start) / duration) * 100;
    row.append(el('span', { class: 'outlook-mark', style: `left:${(o.start / duration) * 100}%;width:${width}%` },
      width >= 22 ? 'early outlook' : ''));
  }
  return row;
}

function ticks(duration) {
  const hours = duration / 60;
  const every = hours <= 3 ? 0.5 : hours <= 8 ? 1 : hours <= 16 ? 2 : 3;
  const out = el('div', { class: 'ticks', 'aria-hidden': 'true' });
  for (let h = 0; h <= hours + 1e-9; h += every) {
    const left = ((h * 60) / duration) * 100;
    if (left > 96 && h > 0) break;
    out.append(el('span', { style: `left:${left}%` }, h === 0 ? '0' : `${Number.isInteger(h) ? h : h.toFixed(1)} h`));
  }
  return out;
}

function renderForecast(r) {
  const { plan, manifest, samples, summary } = r;
  const duration = plan.durationMinutes;
  const t = manifest.thresholds;
  const could = F.segmentsFromValues(samples.map((s) => s.couldReach), t, duration);
  const outlook = F.outlookStretches(samples, duration);
  const now = Date.now();
  const confidence = F.confidenceOf(plan.departure, now, F.outlookShare(samples));
  const lastValid = manifest.steps[manifest.steps.length - 1].valid;
  const headline = summary.headline;
  const notes = [];

  if (headline !== null && summary.worst === null && summary.noDataShare < 0.5) {
    notes.push(['ok', 'No bumps worth mentioning are forecast along your route.']);
  }
  if (summary.worst) {
    notes.push(['waves', `Bumpiest part: about ${dur(summary.worst.start)} after takeoff, for around ${dur(summary.worst.end - summary.worst.start)}, ${LEVEL_INLINE[summary.worst.level]}.`]);
  }
  if (summary.stronger) {
    notes.push(['up', `Some stronger bumps (${LEVEL_INLINE[summary.stronger.level]}) are possible about ${dur(summary.stronger.start)} after takeoff.`]);
  }
  if (summary.stormAt !== null) {
    notes.push(['storm', `Thunderstorms are forecast near the route about ${dur(summary.stormAt)} after takeoff. Pilots route around them, which can add a few minutes.`]);
  }
  const polar = samples.filter((s) => s.expected === null && Math.abs(s.lat) > 75.25);
  if (polar.length) {
    const side = polar[0].lat > 0 ? 'northern' : 'southern';
    notes.push(['gap', `The far-${side} stretch of this route, beyond 75° latitude, is outside the published forecast maps. It is shown as a gap, not as calm.`]);
  } else if (summary.noDataShare > 0.01 && headline !== null) {
    notes.push(['gap', 'Part of this route has no forecast data. It is shown as a gap, not as calm.']);
  }
  if (plan.arrival > lastValid + F.MAX_STEP_DISTANCE_MS) {
    notes.push(['gap', `The forecast doesn't reach the end of this flight yet (it runs to ${fmtWhen(lastValid, plan.destination.tz)}, ${plan.destination.place} time). It fills in as new runs arrive, about every six hours.`]);
  }

  const shares = summary.shares
    .map((s, i) => [s, i])
    .filter(([s]) => s >= 0.005)
    .map(([s, i]) => `${Math.round(s * 100)}% ${LEVEL_INLINE[i]}`);
  if (summary.noDataShare >= 0.005) shares.push(`${Math.round(summary.noDataShare * 100)}% no data`);

  const detail = el('p', { class: 'seg-detail', id: 'seg-detail' }, 'Tap any part of the bar to see what it means.');
  const pick = (s) => {
    const name = s.level === null ? 'No data' : LEVEL_NAMES[s.level];
    const desc = s.level === null ? NO_DATA_DESCRIPTION : DESCRIPTIONS[s.level];
    const from = plan.departure + s.start * 60e3;
    const to = plan.departure + s.end * 60e3;
    const range = s.start < 0.5 ? `From takeoff to ${dur(s.end)}` : `${dur(s.start)} to ${dur(s.end)} after takeoff`;
    const reach = could.filter((c) => c.level !== null && c.start < s.end && c.end > s.start)
      .reduce((m, c) => Math.max(m, c.level), -1);
    const isOutlook = outlook.some((o) => o.start < s.end && o.end > s.start);
    detail.replaceChildren(
      el('strong', {}, `${name}. `), `${range} (${fmtClock(from, plan.origin.tz)} to ${fmtClock(to, plan.origin.tz)}, ${plan.origin.place} time). ${desc}`,
      s.level !== null && reach > s.level ? ` Could reach here: ${LEVEL_INLINE[reach]}.` : '',
      isOutlook ? ' Early outlook, less exact.' : '',
    );
  };

  const headColor = headline === null ? 'gap' : `l${headline}`;
  const card = el('div', { class: 'card forecast' },
    el('div', { class: `headline ${headColor}` },
      el('p', { class: 'route-line' }, `${plan.origin.iata} → ${plan.destination.iata} · ${fmtDay(plan.departure, plan.origin.tz)}`),
      el('h2', { id: 'headline' }, headline === null ? 'No forecast data for this flight' : HEADLINES[headline]),
      shares.length ? el('p', { class: 'shares' }, shares.join(' · ')) : null),
    el('div', { class: 'body' },
      el('ul', { class: 'notes', id: 'notes' }, notes.map(([icon, text]) => el('li', { class: `note-${icon}` }, text))),
      el('h3', {}, 'Your flight, minute by minute'),
      el('div', { class: 'timeline', role: 'group', 'aria-label': 'Turbulence timeline from takeoff to landing' },
        el('p', { class: 'bar-label' }, 'Expected'),
        outlook.length ? outlookRow(outlook, duration) : null,
        bar(summary.expected, duration, { tall: true, onPick: pick }),
        el('p', { class: 'bar-label' }, 'Could reach'),
        bar(could, duration, { tall: false }),
        ticks(duration),
        el('div', { class: 'ends' }, el('span', {}, `Takeoff ${fmtClock(plan.departure, plan.origin.tz)}`), el('span', {}, `Landing ~${fmtClock(plan.arrival, plan.destination.tz)}`))),
      outlook.length ? el('p', { class: 'outlook-note' }, el('span', { class: 'outlook-key', 'aria-hidden': 'true' }), 'Early outlook, less exact: this stretch comes from the GFS-based estimate, not the official 48-hour forecast.') : null,
      detail,
      el('p', { class: 'muted small' }, 'Could reach is the strongest forecast nearby and at other cruise altitudes. Real flights don\'t follow the line exactly.'),
      el('p', { class: `confidence ${confidence}` }, CONFIDENCE[confidence]),
      routeHeader(plan),
      el('p', { class: 'asof muted small', id: 'asof' },
        `As of the ${runLabel(manifest.wafsRun) ?? runLabel(manifest.gfsRun) ?? 'latest'} forecast run, published ${fmtWhen(manifest.generated)} your time. Next update about ${fmtClock(manifest.generated + 6 * 3600e3)}.`),
      now - manifest.generated > STALE_MS ? el('p', { class: 'warn' }, `Forecast data is delayed. This is the latest we have, from ${fmtWhen(manifest.generated)}.`) : null,
      manifest.notice ? el('p', { class: 'warn' }, manifest.notice) : null,
      el('p', { class: 'muted small' }, 'A forecast, not a promise. Forecasts can be wrong. Always follow the crew\'s instructions.')));
  show(card);
}

// ---------- form ----------
function pad(n) { return String(n).padStart(2, '0'); }

function defaults() {
  const d = new Date(Date.now() + 2 * 3600e3);
  $('date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  $('time').value = `${pad(d.getHours())}:00`;
}

function setError(msg) {
  const e = $('form-error');
  e.textContent = msg ?? '';
  e.hidden = !msg;
}

async function run(from, to, push = true) {
  const origin = from.value;
  const destination = to.value;
  if (!origin || !destination) return setError('Choose where you are flying from and to.');
  if (origin.iata === destination.iata) return setError('Choose two different airports.');
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec($('date').value);
  const time = /^(\d{1,2}):(\d{2})/.exec($('time').value);
  if (!date || !time) return setError('Choose the departure date and time.');
  setError(null);
  const departure = F.zonedToUtc(origin.tz, +date[1], +date[2], +date[3], +time[1], +time[2]);
  if (push) {
    const q = new URLSearchParams({ from: origin.iata, to: destination.iata, date: $('date').value, time: `${pad(+time[1])}:${time[2]}` });
    const flight = flightParam(origin, destination);
    if (flight) q.set('flight', flight);
    history.replaceState(null, '', `?${q}`);
  }
  const btn = $('go');
  btn.disabled = true;
  btn.textContent = 'Loading the forecast…';
  try {
    const r = await compute(origin, destination, departure);
    const kind = r.outcome.kind;
    if (kind === 'past') {
      renderMessage(r.plan, 'This flight has already flown', 'The free forecast covers flights from now to 48 hours ahead.');
    } else if (kind === 'needsPro' || kind === 'opensLater') {
      const opens = r.outcome.opensAt;
      const when = `${fmtWhen(opens)} your time`;
      renderMessage(r.plan, `Your forecast opens on ${fmtWhen(opens)}`,
        `The free forecast reaches 48 hours ahead, so it opens for this flight on ${when}. Come back then.`,
        'An early outlook for flights 2 to 5 days ahead is part of Jetcalm Pro in the app, coming soon to the App Store and Google Play.');
    } else {
      renderForecast(r);
    }
    if (push) result().scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error(e);
    show(el('div', { class: 'card note' }, el('h2', { class: 'msg-title' }, "Can't reach the forecast"), el('p', {}, 'Check your connection and try again.')));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Show my forecast';
  }
}

async function main() {
  defaults();
  const from = combo('from', (a) => { $('time-hint').textContent = `Local time at ${a.place} (${a.iata}), as on your ticket.`; });
  const to = combo('to');
  airportsReady = loadAirports();
  const flight = flightBox(from, to);
  $('flight').addEventListener('submit', async (e) => {
    e.preventDefault();
    await flight.settled(); // a number typed and left is still being looked up
    run(from, to);
  });
  try {
    await airportsReady;
  } catch (e) {
    setError('The airport list did not load. Reload the page to try again.');
    return;
  }
  const q = new URLSearchParams(location.search);
  from.set(byIata.get((q.get('from') ?? '').toUpperCase()));
  to.set(byIata.get((q.get('to') ?? '').toUpperCase()));
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.get('date') ?? '')) $('date').value = q.get('date');
  if (/^\d{1,2}:\d{2}$/.test(q.get('time') ?? '')) $('time').value = q.get('time').padStart(5, '0');
  await flight.restore(q.get('flight'), from.value, to.value);
  if (from.value && to.value && q.get('date')) run(from, to, false);
  getManifest().catch(() => {});
  document.body.dataset.ready = '1';
}

main();
