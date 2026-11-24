// The planner page: taps, the suggestion, the printable log. The rule itself
// is in rotation.js (a port of the app's Dart code); the UI text is in
// i18n.js, and a translated page overrides it with a JSON block
// (<script type="application/json" id="planner-strings">).
import { SITES, DEFAULTS, fromId, suggestAfter, plan, shotsAgo, cleanHistory, cleanEnabled } from './rotation.js';
import { mergeStrings, fill } from './i18n.js';

const KEY = 'rotinia-sites-v1';
const OFF_KEY = 'rotinia-sites-remember-off';
const MAX = 40;

const $ = (id) => document.getElementById(id);

function readStrings() {
  const el = document.getElementById('planner-strings');
  if (!el) return mergeStrings(null);
  try { return mergeStrings(JSON.parse(el.textContent)); } catch { return mergeStrings(null); }
}
const T = readStrings();
const nameOf = (id) => (fromId(id) ? T.sites[id] : '');
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch { /* storage blocked: the page still works */ } },
  del(k) { try { window.localStorage.removeItem(k); } catch { /* ignore */ } },
};

const state = { history: [], enabled: new Set(DEFAULTS), remember: true };

function load() {
  state.remember = store.get(OFF_KEY) !== '1';
  const raw = store.get(KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    state.history = cleanHistory(data.history, MAX);
    state.enabled = cleanEnabled(data.enabled);
  } catch { /* unreadable: start fresh */ }
}

function isDefaultEnabled() {
  return state.enabled.size === DEFAULTS.size && [...DEFAULTS].every((id) => state.enabled.has(id));
}

function save() {
  if (!state.remember) return;
  if (!state.history.length && isDefaultEnabled()) { store.del(KEY); return; }
  store.set(KEY, JSON.stringify({ history: state.history, enabled: [...state.enabled] }));
}

function agoText(n) {
  return n === 1 ? T.agoLast : fill(T.agoN, { n });
}

// Squeezes a body-map label that is wider than its zone (a long translated
// badge) so it stays inside the box; short labels are left alone.
function fitLabel(text, rect) {
  text.removeAttribute('textLength');
  text.removeAttribute('lengthAdjust');
  const room = Number(rect.getAttribute('width')) - 4;
  let width = 0;
  try { width = text.getComputedTextLength(); } catch { return; }
  if (width > room) {
    text.setAttribute('textLength', String(room));
    text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
  }
}

function render() {
  const { history, enabled } = state;
  const ago = shotsAgo(history);
  const next = suggestAfter(enabled, history);
  const last = history.length ? history[history.length - 1] : null;

  for (const g of document.querySelectorAll('#body .zone')) {
    const id = g.dataset.site;
    const n = ago.get(id);
    g.classList.toggle('used', n !== undefined);
    g.classList.toggle('last', id === last && id !== next);
    g.classList.toggle('next', id === next);
    g.classList.toggle('off', !enabled.has(id));
    const label = g.querySelector('text');
    label.textContent = id === next ? T.badge : (n !== undefined ? String(n) : '');
    fitLabel(label, g.querySelector('rect'));
  }

  for (const b of document.querySelectorAll('.site-btn')) {
    const id = b.dataset.site;
    const n = ago.get(id);
    const parts = [];
    if (id === next) parts.push(T.next);
    if (n !== undefined) parts.push(id === next ? lower(agoText(n)) : agoText(n));
    else if (id !== next) parts.push(T.notUsed);
    if (!enabled.has(id)) parts.push(T.notTicked);
    b.querySelector('small').textContent = parts.join(' · ');
    b.classList.toggle('last', id === last && id !== next);
    b.classList.toggle('next', id === next);
    b.classList.toggle('off', !enabled.has(id));
    b.setAttribute('aria-label', fill(T.aria, { site: nameOf(id), parts: parts.join(', ') }));
  }

  const nextEl = $('next-site');
  const why = $('next-why');
  if (!next) {
    nextEl.textContent = T.noneTicked;
    why.textContent = T.noneTickedWhy;
  } else {
    nextEl.textContent = nameOf(next);
    const n = ago.get(next);
    if (!history.length) {
      why.textContent = T.whyStart;
    } else if (n === undefined) {
      why.textContent = fill(T.whyUnused, { last: lower(nameOf(last)) });
    } else if (enabled.size === 1) {
      why.textContent = T.whyOnly;
    } else {
      why.textContent = fill(T.whyLeast, { last: lower(nameOf(last)), n });
    }
  }

  $('used-next').disabled = !next;
  $('undo').disabled = !history.length;
  $('clear').disabled = !history.length && isDefaultEnabled();

  const recent = $('recent');
  if (!history.length) {
    recent.textContent = T.recentNone;
  } else {
    const shown = history.slice(-8).reverse().map((id, i) => `${i + 1}. ${nameOf(id)}`);
    const more = history.length > 8 ? fill(T.recentMore, { n: history.length - 8 }) : '';
    recent.textContent = fill(T.recent, { list: shown.join(', '), more });
  }

  for (const box of document.querySelectorAll('#checks input')) box.checked = enabled.has(box.value);
  $('use-count').textContent = fill(T.useCount, { n: enabled.size, total: SITES.length });
  $('remember').checked = state.remember;

  renderLog(next);
  save();
}

function renderLog() {
  const rows = Number($('rows').value) || 26;
  const sites = $('prefill').checked ? plan(state.enabled, state.history, rows) : [];
  const body = $('log-body');
  body.textContent = '';
  for (let i = 0; i < rows; i++) {
    const tr = document.createElement('tr');
    const cells = [String(i + 1), '', sites[i] ? nameOf(sites[i]) : '', ''];
    cells.forEach((text, c) => {
      const td = document.createElement('td');
      if (c === 0) td.className = 'n';
      td.textContent = text;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  }
}

function add(id) {
  if (!fromId(id)) return;
  state.history = cleanHistory([...state.history, id], MAX);
  render();
}

function init() {
  load();
  for (const g of document.querySelectorAll('#body .zone')) {
    g.addEventListener('click', () => add(g.dataset.site));
  }
  for (const b of document.querySelectorAll('.site-btn')) {
    b.addEventListener('click', () => add(b.dataset.site));
  }
  $('used-next').addEventListener('click', () => {
    const next = suggestAfter(state.enabled, state.history);
    if (next) add(next);
  });
  $('undo').addEventListener('click', () => {
    state.history = state.history.slice(0, -1);
    render();
  });
  $('clear').addEventListener('click', () => {
    state.history = [];
    state.enabled = new Set(DEFAULTS);
    store.del(KEY);
    render();
  });
  for (const box of document.querySelectorAll('#checks input')) {
    box.addEventListener('change', () => {
      const next = new Set(state.enabled);
      if (box.checked) next.add(box.value); else next.delete(box.value);
      if (!next.size) { box.checked = true; return; } // keep at least one site on
      state.enabled = next;
      render();
    });
  }
  $('remember').addEventListener('change', (e) => {
    state.remember = e.target.checked;
    if (state.remember) store.del(OFF_KEY);
    else { store.del(KEY); store.set(OFF_KEY, '1'); }
    render();
  });
  $('rows').addEventListener('change', () => renderLog());
  $('prefill').addEventListener('change', () => renderLog());
  $('print').addEventListener('click', () => window.print());
  render();
}

init();
