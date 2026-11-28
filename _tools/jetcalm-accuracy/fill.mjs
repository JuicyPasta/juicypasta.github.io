// Fills the Jetcalm forecast page's accuracy answer from jetcalm-data's daily verification summary,
// so the numbers on the page are never older than a day (they were typed by hand on 2026-11-26).
//
//   node _tools/jetcalm-accuracy/fill.mjs                 # fetch latest.json from GitHub, rewrite the page
//   node _tools/jetcalm-accuracy/fill.mjs --summary f.json # use a local summary (tests)
//   node _tools/jetcalm-accuracy/fill.mjs --page p.html    # rewrite another file (tests)
//
// Only the numbers inside the known sentence change; if the sentence is not found exactly twice
// (visible FAQ + FAQPage markup) the script changes nothing and exits 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SUMMARY_URL = 'https://raw.githubusercontent.com/JuicyPasta/jetcalm-data/main/verification/latest.json';

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const pct = (rate) => `${Math.round(rate * 100)}%`;

export function numbers(summary) {
  const a = summary.all;
  return {
    since: String(summary.first_report).slice(0, 10),
    reports: a.n.toLocaleString('en-US'),
    agree: pct(a.agree_rate),
    inRange: pct(a.within_range_rate),
    modExpected: pct(a.moderate_or_greater.hit_rate_expected),
    modCouldReach: pct(a.moderate_or_greater.hit_rate_could_reach),
    calm: pct(a.smooth_reports.calm_rate),
  };
}

// The sentence as written on the page; every number is a capture we replace.
const PATTERN = new RegExp(
  'Since (\\d{4}-\\d{2}-\\d{2}) this forecast has been scored against ([\\d,]+) pilot reports, mostly over the United States: '
  + 'the expected level matched what the pilot reported (\\d+%) of the time, and the report fell inside the range the page shows '
  + '\\(expected to could reach\\) (\\d+%) of the time\\. Of the reports of moderate or worse turbulence, the forecast showed moderate or more '
  + '(\\d+%) of the time on the expected level and (\\d+%) on could reach\\. Smooth reports are where it is weakest: the forecast said calm for only (\\d+%) of them',
  'g');

export function fill(html, n) {
  const found = html.match(PATTERN) || [];
  if (found.length !== 2) throw new Error(`accuracy sentence found ${found.length} times, expected 2`);
  return html.replace(PATTERN, () =>
    `Since ${n.since} this forecast has been scored against ${n.reports} pilot reports, mostly over the United States: `
    + `the expected level matched what the pilot reported ${n.agree} of the time, and the report fell inside the range the page shows `
    + `(expected to could reach) ${n.inRange} of the time. Of the reports of moderate or worse turbulence, the forecast showed moderate or more `
    + `${n.modExpected} of the time on the expected level and ${n.modCouldReach} on could reach. Smooth reports are where it is weakest: the forecast said calm for only ${n.calm} of them`);
}

async function main() {
  const page = arg('--page') || join(ROOT, 'jetcalm', 'turbulence-forecast', 'index.html');
  const local = arg('--summary');
  const summary = local ? JSON.parse(readFileSync(local, 'utf8')) : await (await fetch(SUMMARY_URL)).json();
  if (!summary?.all?.n || summary.all.n < 1000) throw new Error('summary looks wrong (fewer than 1,000 reports); page left as it was');
  const before = readFileSync(page, 'utf8');
  const after = fill(before, numbers(summary));
  if (after !== before) writeFileSync(page, after);
  console.log(after === before ? 'accuracy numbers unchanged' : `accuracy numbers updated: ${numbers(summary).reports} reports`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
