// Writes the numbers on the UV tanning calculator page from the calculator's
// own maths (solei/uv-tanning-calculator/sun.js), so the page text, the table
// and the calculator can't disagree:
//   <tbody id="burn-body">          minutes to the safe limit, UV 1–11+, types I–VI, no sunscreen
//   <span data-list="8">            "11 minutes for type I, 13 for type II, …" at UV 8
//   <span data-range="3,8">         "29 to 11 minutes for type I, …" from UV 3 to UV 8
//   <span data-t="8,3,30">          formatDuration of the safe time (UV, skin type, SPF)
//   FAQPage JSON-LD                 from the visible <section id="faq" class="faq">
// Run after editing the page: node _tools/solei-pages/burn-table.mjs
// The test (solei/uv-tanning-calculator/test/page.test.mjs) fails if the page
// isn't what this writes.
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as S from '../../solei/uv-tanning-calculator/sun.js';
import { faqOf, faqLd, withFaqLd } from './faq.mjs';

export const PAGE = fileURLToPath(new URL('../../solei/uv-tanning-calculator/index.html', import.meta.url));
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const CATEGORY = { low: 'Low', moderate: 'Moderate', high: 'High', veryHigh: 'Very high', extreme: 'Extreme' };
const SKINS = [1, 2, 3, 4, 5, 6];

// Whole minutes, rounded down, as the calculator shows them.
export const burnMinutes = (uv, skin) => Math.floor(S.safeTime(uv, skin, 0).minutes + 1e-9);

export const tableRows = () => Array.from({ length: 11 }, (_, i) => {
  const uv = i + 1;
  const label = uv === 11 ? '11+' : String(uv);
  return `<tr><th scope="row">${label} <small>${CATEGORY[S.uvCategory(uv)]}</small></th>`
    + SKINS.map((skin) => `<td>${burnMinutes(uv, skin)}</td>`).join('') + '</tr>';
}).join('\n');

const series = (parts) => `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
export const listAt = (uv) => series(SKINS.map((skin, i) => `${burnMinutes(uv, skin)}${i === 0 ? ' minutes' : ''} for type ${ROMAN[skin]}`));
export const rangeOf = (lo, hi) => series(SKINS.map((skin, i) => `${burnMinutes(lo, skin)} to ${burnMinutes(hi, skin)}${i === 0 ? ' minutes' : ''} for type ${ROMAN[skin]}`));
export function timeOf(uv, skin, spf) {
  const s = S.safeTime(uv, skin, spf);
  if (s.sunDown || s.minutes === null || s.capped) throw new Error(`data-t="${uv},${skin},${spf}" isn't a plain time (${JSON.stringify(s)})`);
  return S.formatDuration(s.minutes);
}

export { faqOf, faqLd };

const ANCHOR = '<script type="module" src="app.js"></script>';

export function build(html) {
  let out = html.replace(/(<tbody id="burn-body">)[\s\S]*?(<\/tbody>)/, (_, a, b) => `${a}\n${tableRows()}\n${b}`);
  out = out.replace(/(<span data-list="(\d+)">)[^<]*(<\/span>)/g, (_, a, uv, b) => a + listAt(Number(uv)) + b);
  out = out.replace(/(<span data-range="(\d+),(\d+)">)[^<]*(<\/span>)/g, (_, a, lo, hi, b) => a + rangeOf(Number(lo), Number(hi)) + b);
  out = out.replace(/(<span data-t="(\d+),(\d),(\d+)">)[^<]*(<\/span>)/g, (_, a, uv, skin, spf, b) => a + timeOf(Number(uv), Number(skin), Number(spf)) + b);
  return withFaqLd(out, ANCHOR);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const html = readFileSync(PAGE, 'utf8');
  const out = build(html);
  writeFileSync(PAGE, out);
  console.log(`${out === html ? 'unchanged' : 'written'}: ${faqOf(out).length} questions in the FAQ`);
}
