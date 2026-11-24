// The planner's UI text. English is built in; a translated page puts its own
// strings in <script type="application/json" id="planner-strings"> and app.js
// merges them over these. Same logic for every language (rotation.js).
// No DOM in here. test/i18n.test.mjs checks every page has every key.

export const EN = {
  sites: {
    abdomen_ul: 'Upper-left abdomen',
    abdomen_ur: 'Upper-right abdomen',
    abdomen_ll: 'Lower-left abdomen',
    abdomen_lr: 'Lower-right abdomen',
    thigh_l: 'Left thigh',
    thigh_r: 'Right thigh',
    arm_l: 'Left upper arm',
    arm_r: 'Right upper arm',
  },
  badge: 'NEXT', // on the body map; keep it short (4-5 letters)
  next: 'Next',
  agoLast: 'Last time',
  agoN: '{n} shots ago',
  notUsed: 'Not used yet',
  notTicked: 'not ticked',
  aria: '{site}: {parts}. Tap to add it as your latest site.',
  noneTicked: 'No site ticked',
  noneTickedWhy: 'Tick at least one site under "Sites you use".',
  whyStart: 'No sites tapped yet, so it starts with the first site in the list. Tap the site you used last time.',
  whyUnused: "Last time: {last}. Sites you haven't used yet come first, in list order.",
  whyOnly: 'It is the only site ticked. Tick more sites to rotate.',
  whyLeast: 'Last time: {last}. This is the site you used least recently ({n} shots ago).',
  recentNone: 'Your sites, newest first: none yet.',
  recent: 'Your sites, newest first: {list}{more}.',
  recentMore: ' (+{n} older)',
  useCount: '{n} of {total}',
};

/** Replaces {name} placeholders; unknown ones are left as they are. */
export function fill(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * EN with `overrides` laid over it (sites merged per id). Anything missing or
 * not a string falls back to English, so a half-translated page still works.
 */
export function mergeStrings(overrides) {
  const out = { ...EN, sites: { ...EN.sites } };
  if (!overrides || typeof overrides !== 'object') return out;
  for (const [k, v] of Object.entries(overrides)) {
    if (k === 'sites') {
      if (v && typeof v === 'object') {
        for (const [id, name] of Object.entries(v)) {
          if (id in EN.sites && typeof name === 'string' && name) out.sites[id] = name;
        }
      }
    } else if (k in EN && typeof v === 'string') {
      out[k] = v;
    }
  }
  return out;
}

/** Every key a translation must provide (sites as "sites.<id>"). */
export function requiredKeys() {
  return [
    ...Object.keys(EN).filter((k) => k !== 'sites'),
    ...Object.keys(EN.sites).map((id) => `sites.${id}`),
  ];
}

/** The required keys `strings` lacks. */
export function missingKeys(strings) {
  const s = strings && typeof strings === 'object' ? strings : {};
  return requiredKeys().filter((key) => {
    if (key.startsWith('sites.')) return typeof s.sites?.[key.slice(6)] !== 'string';
    return typeof s[key] !== 'string';
  });
}
