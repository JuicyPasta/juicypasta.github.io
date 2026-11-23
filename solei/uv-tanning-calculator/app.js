// The page: inputs and rendering. The maths lives in sun.js (a port of the app's).
import * as S from './sun.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const CATEGORY = { low: 'Low', moderate: 'Moderate', high: 'High', veryHigh: 'Very high', extreme: 'Extreme' };
// The app's advice line for each WHO category (uvAdvice* in app_en.arb).
const ADVICE = {
  low: 'Most people need no protection.',
  moderate: 'Wear sunscreen and seek shade around midday.',
  high: 'Protection needed: shade, clothing and sunscreen.',
  veryHigh: 'Extra protection needed. Avoid the midday sun.',
  extreme: 'Stay out of the midday sun. Full protection is essential.',
};
const SPF_NAME = { 0: 'No sunscreen', 15: 'SPF 15', 30: 'SPF 30', 50: 'SPF 50', 60: 'SPF 50+' };
const MAX_UV = 15;

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

const form = $('calc');
const uvInput = $('uv');
const uvRange = $('uv-range');

function readUv() {
  const raw = uvInput.value.trim().replace(',', '.');
  if (raw === '') return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.min(MAX_UV, v);
}

const state = () => ({
  uv: readUv(),
  skin: Number(form.querySelector('input[name=skin]:checked')?.value ?? 3),
  spf: Number(form.querySelector('input[name=spf]:checked')?.value ?? 0),
  swim: $('swim').checked,
});

const fmtUv = (uv) => (Number.isInteger(uv) ? String(uv) : uv.toFixed(1));
const timeText = (s) => {
  if (s.sunDown) return 'No UV to speak of';
  if (s.minutes === null) return 'More than a day';
  return S.formatDuration(s.minutes);
};

function headline(st, safe, cat) {
  const kicker = `Safe sun time at UV ${fmtUv(st.uv)} · ${CATEGORY[cat]}`;
  const big = el('p', { class: 'big', id: 'big' }, timeText(safe));
  if (safe.capped) big.append(el('span', { class: 'then' }, ', then reapply'));
  const who = `Type ${ROMAN[st.skin]} skin · ${SPF_NAME[st.spf]}${st.spf && st.swim ? ' · swimming or sweating' : ''}`;
  return el('div', { class: `headline c-${cat}` }, el('p', { class: 'kicker' }, kicker), big, el('p', { class: 'who' }, who));
}

function pair(st) {
  const items = [[0, 'No sunscreen']];
  const other = st.spf || 30;
  items.push([other, st.spf ? SPF_NAME[st.spf] : 'With SPF 30']);
  return el('div', { class: 'pair' }, items.map(([spf, label]) => {
    const s = S.safeTime(st.uv, st.skin, spf, st.swim);
    return el('div', { class: 'pair-item' + (spf === st.spf ? ' on' : '') },
      el('span', { class: 'pair-label' }, label),
      el('span', { class: 'pair-value' }, timeText(s)),
      s.capped ? el('span', { class: 'pair-sub' }, 'then reapply') : null);
  }));
}

// Durations inside sentences don't break across lines.
const dur = (m) => S.formatDuration(m).replace(/ /g, '\u00a0');

function notes(st, safe, cat) {
  const out = [];
  const add = (cls, ...text) => out.push(el('li', { class: cls }, ...text));
  const skin = `type ${ROMAN[st.skin]} skin`;
  const interval = S.reapplyEvery(st.swim);
  const intervalText = dur(interval);
  const uvText = `UV ${fmtUv(st.uv)}`;

  if (safe.sunDown) {
    add('n-sun', 'Below a UV index of 0.1 the sun counts as down: there is no UV to speak of.');
  } else if (safe.minutes === null) {
    add('n-sun', `At ${uvText}, ${skin} doesn't reach its limit within a day of steady sun.`);
  } else if (st.spf === 0) {
    add('n-sun', `At ${uvText}, ${skin} without sunscreen reaches its estimated safe limit after about ${dur(safe.minutes)}. Then get into the shade or cover up.`);
  } else if (!safe.capped) {
    add('n-sun', `With ${SPF_NAME[st.spf]} applied generously, ${skin} reaches its estimated safe limit after about ${dur(safe.minutes)} at ${uvText}, before the sunscreen needs reapplying. Then get into the shade or cover up.`);
  } else {
    const onTime = S.limitReapplyingOnTime(st.uv, st.skin, st.spf);
    add('n-sun', `With ${SPF_NAME[st.spf]}, the sunscreen wears off before your limit: reapply after ${intervalText}. `
      + (onTime === null
        ? `If you reapply on time, the limit isn't reached within a day at ${uvText}.`
        : `If you reapply on time, ${skin} reaches its estimated limit after about ${dur(onTime)} at ${uvText}.`));
  }
  if (!safe.sunDown) add('n-advice', `${CATEGORY[cat]} UV: ${ADVICE[cat]}`);
  add('n-reapply', st.spf
    ? `Reapply every ${intervalText}${st.swim ? ' while swimming or sweating' : ''}, and right after a swim. Reapplying keeps the protection going; it doesn't reset the limit, which counts for the whole day.`
    : 'Sunscreen counts as the square root of its SPF and only until it\'s time to reapply: every 2 hours, or every 80 minutes when you swim or sweat.');
  if (!safe.sunDown && safe.minutes !== null) {
    add('n-flip', `Turning over doesn't add time: Solei's tan mode splits this time between front, back and sides, about ${S.autoFlipMinutes(safe.minutes)} min per side.`);
  }
  add('n-curve', 'This assumes the UV index stays the same. Real UV rises toward midday and falls after it; the Solei app adds up the dose along the day\'s forecast curve.');
  return el('ul', { class: 'notes' }, out);
}

function table(st) {
  const cols = [0];
  if (st.spf) cols.push(st.spf);
  const now = S.roundUvi(st.uv);
  const head = el('tr', {}, el('th', { scope: 'col' }, 'UV index'),
    cols.map((spf) => el('th', { scope: 'col' }, spf ? `${SPF_NAME[spf]}${st.swim ? ', wet' : ''}` : 'No sunscreen')));
  const rows = [];
  for (let uv = 1; uv <= 11; uv++) {
    const cat = S.uvCategory(uv);
    rows.push(el('tr', { class: uv === now ? 'here' : '' },
      el('th', { scope: 'row' }, el('span', { class: `dot c-${cat}` }), `${uv} `, el('small', {}, CATEGORY[cat])),
      cols.map((spf) => {
        const s = S.safeTime(uv, st.skin, spf, st.swim);
        return el('td', {}, el('span', { class: 't' }, timeText(s)), s.capped ? el('small', { class: 'then-cell' }, 'then reapply') : null);
      })));
  }
  return el('div', { class: 'table-wrap' }, el('table', { class: 'mine' },
    el('caption', {}, `Safe sun time at UV 1–11 for type ${ROMAN[st.skin]} skin`),
    el('thead', {}, head), el('tbody', {}, rows)));
}

function render() {
  const st = state();
  const result = $('result');
  const chip = $('uv-cat');
  if (st.uv === null) {
    chip.hidden = true;
    result.replaceChildren(el('p', { class: 'card error', role: 'alert' }, 'Enter a UV index from 0 to 15.'));
    result.hidden = false;
    return;
  }
  const cat = S.uvCategory(st.uv);
  chip.hidden = false;
  chip.className = `cat-chip c-${cat}`;
  chip.textContent = `${S.roundUvi(st.uv)} · ${CATEGORY[cat]}`;
  const safe = S.safeTime(st.uv, st.skin, st.spf, st.swim);
  result.replaceChildren(el('div', { class: 'card result' },
    headline(st, safe, cat),
    el('div', { class: 'body' },
      pair(st),
      notes(st, safe, cat),
      el('p', { class: 'disclaimer' }, el('strong', {}, 'Estimates only, not medical advice.'), ' Apply sunscreen generously. Some medicines make skin more sensitive to the sun.'),
      table(st))));
  result.hidden = false;
  const q = new URLSearchParams({ uv: fmtUv(st.uv), skin: st.skin, spf: st.spf });
  if (st.swim) q.set('swim', '1');
  history.replaceState(null, '', `?${q}`);
}

function setRadio(name, value) {
  const r = form.querySelector(`input[name=${name}][value="${value}"]`);
  if (r) r.checked = true;
}

// Restore a shared link (?uv=8&skin=2&spf=30&swim=1).
const params = new URLSearchParams(location.search);
if (params.has('uv')) {
  const v = Number(params.get('uv'));
  if (Number.isFinite(v) && v >= 0) uvInput.value = String(Math.min(MAX_UV, v));
}
if (params.has('skin')) setRadio('skin', params.get('skin'));
if (params.has('spf')) setRadio('spf', params.get('spf'));
$('swim').checked = params.get('swim') === '1';
uvRange.value = String(Math.round(readUv() ?? 0));

uvInput.addEventListener('input', () => {
  const v = readUv();
  if (v !== null) uvRange.value = String(Math.round(v));
  render();
});
uvRange.addEventListener('input', () => {
  uvInput.value = uvRange.value;
  render();
});
form.addEventListener('change', (e) => {
  if (e.target.matches('#quiz select')) {
    const answers = ['q1', 'q2', 'q3'].map((id) => $(id).value);
    const out = $('quiz-result');
    if (answers.every((a) => a !== '')) {
      const type = S.skinTypeFromQuiz(...answers.map(Number));
      setRadio('skin', type);
      out.textContent = `Your skin is probably type ${ROMAN[type]}. It's selected above.`;
      out.hidden = false;
    } else {
      out.hidden = true;
    }
  }
  render();
});
form.addEventListener('submit', (e) => e.preventDefault());
render();
