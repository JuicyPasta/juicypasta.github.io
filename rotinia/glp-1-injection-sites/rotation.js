// Rotinia's site-rotation rule for the web: a line-by-line port of the app's
// Dart code (Rotinia/lib/core/site_rotation.dart). Keep the two in step;
// test/rotation.test.mjs repeats the Dart tests (test/core/small_rules_test.dart).
// No DOM in here.

/** The sites, in the order they are suggested when none has been used yet. */
export const SITES = [
  { id: 'abdomen_ul', name: 'Upper-left abdomen', short: 'Abdomen, upper left', group: 'abdomen' },
  { id: 'abdomen_ur', name: 'Upper-right abdomen', short: 'Abdomen, upper right', group: 'abdomen' },
  { id: 'abdomen_ll', name: 'Lower-left abdomen', short: 'Abdomen, lower left', group: 'abdomen' },
  { id: 'abdomen_lr', name: 'Lower-right abdomen', short: 'Abdomen, lower right', group: 'abdomen' },
  { id: 'thigh_l', name: 'Left thigh', short: 'Left thigh', group: 'thigh' },
  { id: 'thigh_r', name: 'Right thigh', short: 'Right thigh', group: 'thigh' },
  { id: 'arm_l', name: 'Left upper arm', short: 'Left upper arm', group: 'arm' },
  { id: 'arm_r', name: 'Right upper arm', short: 'Right upper arm', group: 'arm' },
];

export const SITE_IDS = SITES.map((s) => s.id);

/** On by default: the four abdomen sites and both thighs. */
export const DEFAULTS = new Set(['abdomen_ul', 'abdomen_ur', 'abdomen_ll', 'abdomen_lr', 'thigh_l', 'thigh_r']);

/** The site with this id, or null (InjectionSite.fromId). */
export function fromId(id) {
  for (const site of SITES) {
    if (site.id === id) return site;
  }
  return null;
}

/**
 * Last use of each site, from [siteId, time] pairs in any order
 * (SiteRotation.lastUsed). Times are numbers or Dates.
 */
export function lastUsed(uses) {
  const result = new Map();
  for (const [site, at] of uses) {
    const known = result.get(site);
    if (known === undefined || +at > +known) result.set(site, at);
  }
  return result;
}

/**
 * The site id to suggest, or null when no site is enabled
 * (SiteRotation.suggest): the enabled site used least recently; sites never
 * used come first, in the listed order.
 */
export function suggest(enabled, used) {
  let best = null;
  let bestAt = null;
  for (const site of SITE_IDS) {
    if (!enabled.has(site)) continue;
    const at = used.get(site);
    if (at === undefined) return site;
    if (bestAt === null || +at < +bestAt) {
      best = site;
      bestAt = at;
    }
  }
  return best;
}

// ---- web only: the page records an order of sites, not dates ----

/** [siteId, position] pairs for a history listed oldest first. */
export const historyUses = (history) => history.map((id, i) => [id, i]);

/** The suggestion after a history listed oldest first. */
export const suggestAfter = (enabled, history) => suggest(enabled, lastUsed(historyUses(history)));

/**
 * The next `count` sites if each suggestion is used in turn, starting after
 * `history` (oldest first). Empty when no site is enabled.
 */
export function plan(enabled, history, count) {
  const h = history.filter((id) => fromId(id));
  const out = [];
  for (let i = 0; i < count; i++) {
    const next = suggestAfter(enabled, h);
    if (next === null) break;
    out.push(next);
    h.push(next);
  }
  return out;
}

/** How many shots ago each site was last used (1 = the last shot). */
export function shotsAgo(history) {
  const ago = new Map();
  for (let i = history.length - 1; i >= 0; i--) {
    if (!ago.has(history[i])) ago.set(history[i], history.length - i);
  }
  return ago;
}

/** Cleans stored state: known ids only, at most `max` entries, newest kept. */
export function cleanHistory(value, max = 40) {
  if (!Array.isArray(value)) return [];
  return value.filter((id) => typeof id === 'string' && fromId(id)).slice(-max);
}

export function cleanEnabled(value) {
  if (!Array.isArray(value)) return new Set(DEFAULTS);
  const set = new Set(value.filter((id) => typeof id === 'string' && fromId(id)));
  return set.size ? set : new Set(DEFAULTS);
}
