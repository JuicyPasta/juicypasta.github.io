// Solei's sun-safety maths for the web, at a constant UV index: a port of the
// app's pure Dart code (Solei/lib/core/sun_math.dart and session_math.dart).
// The app integrates the dose minute by minute along the day's forecast
// curve; with a flat curve that integral has the closed forms below.
// test/sun.test.mjs pins this file to values computed by the Dart code
// itself (test/dart-reference.json). No DOM in here.

// ---- sun_math.dart ----

// Minimal erythemal dose (J/m²) per Fitzpatrick type, the conservative low
// ends of the published ranges.
export const MED = { 1: 200, 2: 250, 3: 300, 4: 450, 5: 600, 6: 1000 };

// 1 UV index unit = 0.025 W/m² = 1.5 J/m² per minute.
export const JOULES_PER_UVI_MINUTE = 1.5;

// The safe limit stops at two thirds of the MED.
export const SAFE_FRACTION_OF_MED = 2 / 3;

// Sunscreen is reapplied every 2 hours, or every 80 minutes when wet.
export const REAPPLY_MINUTES = 120;
export const REAPPLY_MINUTES_WET = 80;

// Sunscreen choices, as labelled SPF used in the maths. "50+" means at least
// 60 in testing, so it counts as 60.
export const SPF_LEVELS = { none: 0, spf15: 15, spf30: 30, spf50: 50, spf50plus: 60 };

// UV index below which the sun counts as down (SessionMath.darkUvi).
export const DARK_UVI = 0.1;

// timeToDose / daylightLeft never look further than a day ahead.
export const HORIZON_MINUTES = 24 * 60;

// The whole number people know from weather reports (half rounds up).
export const roundUvi = (uvi) => (Number.isNaN(uvi) ? 0 : Math.round(Math.max(0, uvi)));

// WHO bands on the rounded index: 0–2 low, 3–5 moderate, 6–7 high,
// 8–10 very high, 11+ extreme.
export function uvCategory(uvi) {
  const r = roundUvi(uvi);
  if (r <= 2) return 'low';
  if (r <= 5) return 'moderate';
  if (r <= 7) return 'high';
  if (r <= 10) return 'veryHigh';
  return 'extreme';
}

// People apply a quarter to half of the tested amount, so the label is
// discounted to √SPF. No sunscreen is 1.
export const effectiveSpfFactor = (spf) => (spf <= 1 ? 1 : Math.sqrt(spf));

export const safeDose = (skin) => MED[skin] * SAFE_FRACTION_OF_MED;

export const doseRatePerMinute = (uvi) => Math.max(0, uvi) * JOULES_PER_UVI_MINUTE;

export const reapplyEvery = (swimming) => (swimming ? REAPPLY_MINUTES_WET : REAPPLY_MINUTES);

// SkinQuiz.typeFor: three answers 0–5 (most to least sun-sensitive): natural
// skin colour, reaction to strong sun, how easily the skin tans. The mean is
// rounded down, so a mixed result lands on the more cautious type.
export function skinTypeFromQuiz(skinColor, burnReaction, tanResponse) {
  const c = (v) => Math.min(5, Math.max(0, Math.trunc(v)));
  return Math.trunc((c(skinColor) + c(burnReaction) + c(tanResponse)) / 3) + 1;
}

// ---- session_math.dart, for a flat curve ----

// Minutes of constant UV until the limit with sunscreen credited at [factor]
// for the whole time (what the session timer gives when you reapply on time).
// Null when it isn't reached within a day, or when the sun is down.
export function minutesToLimit(uvi, skin, factor = 1) {
  if (!(uvi >= DARK_UVI)) return null;
  const t = (safeDose(skin) * factor) / doseRatePerMinute(uvi);
  return t <= HORIZON_MINUTES ? t : null;
}

// SessionMath.safeTime for a constant UV index: how long until the limit with
// this sunscreen, never more than one reapply interval.
// Returns { minutes, capped, sunDown }:
//   sunDown  UV under 0.1, "no UV to speak of";
//   minutes  null when the limit isn't reached within a day;
//   capped   true when the time shown is the reapply interval ("then reapply").
export function safeTime(uvi, skin, spf, swimming = false) {
  if (!(uvi >= DARK_UVI)) return { minutes: null, capped: false, sunDown: true };
  const unprotected = minutesToLimit(uvi, skin, 1);
  if (spf <= 0) return { minutes: unprotected, capped: false, sunDown: false };
  const cap = reapplyEvery(swimming);
  const toLimit = minutesToLimit(uvi, skin, effectiveSpfFactor(spf));
  if (toLimit !== null && toLimit <= cap) return { minutes: toLimit, capped: false, sunDown: false };
  // The sunscreen runs out while the (constant) sun is still up.
  return { minutes: cap, capped: true, sunDown: false };
}

// The session timer's limit if sunscreen is reapplied every time it is due.
export function limitReapplyingOnTime(uvi, skin, spf) {
  if (spf <= 0) return null;
  return minutesToLimit(uvi, skin, effectiveSpfFactor(spf));
}

// SessionMath.autoFlipMinutes: an even split of the safe time over the four
// sides, 3 to 30 minutes per side.
export function autoFlipMinutes(minutes) {
  if (minutes === null || minutes === undefined) return 30;
  return Math.min(30, Math.max(3, Math.trunc(Math.floor(minutes + 1e-9) / 4)));
}

// formatDuration (lib/utils/formatters.dart): whole minutes, rounded down.
export function formatDuration(minutes) {
  const whole = Math.floor(minutes + 1e-9);
  if (whole < 1) return '< 1 min';
  const h = Math.trunc(whole / 60);
  const m = whole % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
