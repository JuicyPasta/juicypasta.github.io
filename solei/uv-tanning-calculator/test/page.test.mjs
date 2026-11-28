// The page's numbers come from the calculator's own maths.
// _tools/solei-pages/burn-table.mjs writes them; this fails if the page isn't
// what it writes, or if the table and the calculator would disagree.
// Run: node --test solei/uv-tanning-calculator/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../sun.js';
import { build, faqLd, faqOf } from '../../../_tools/solei-pages/burn-table.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const whole = (uv, skin) => Math.floor(S.safeTime(uv, skin, 0).minutes + 1e-9);

test('the page is what _tools/solei-pages/burn-table.mjs writes (run it after editing the page)', () => {
  assert.equal(build(html), html);
});

test('minutes to burn: every cell is the calculator\'s safe time with no sunscreen', () => {
  const body = html.split('<tbody id="burn-body">')[1].split('</tbody>')[0];
  const rows = body.trim().split('\n');
  assert.equal(rows.length, 11);
  rows.forEach((row, i) => {
    const uv = i + 1;
    assert.ok(row.startsWith(`<tr><th scope="row">${uv === 11 ? '11+' : uv} `), `row ${uv}`);
    const cells = [...row.matchAll(/<td>(\d+)<\/td>/g)].map((m) => Number(m[1]));
    assert.deepEqual(cells, [1, 2, 3, 4, 5, 6].map((skin) => whole(uv, skin)), `row ${uv}`);
  });
  // Spot values a reader can check by hand: 200 J/m² ÷ (8 × 1.5 J/m² a minute) = 16.7 min.
  assert.match(rows[7], /<td>16<\/td>/);
  assert.equal(whole(8, 3), 16);
  assert.equal(whole(10, 1), 8);
});

test('the answers state the same minutes as the table', () => {
  const answers = faqOf(html);
  const uv8 = answers.find((a) => a.q === 'How long can I stay in the sun at UV 8?').a;
  assert.ok(uv8.includes(`${whole(8, 1)} minutes for type I, ${whole(8, 2)} for type II, ${whole(8, 3)} for type III, ${whole(8, 4)} for type IV, ${whole(8, 5)} for type V and ${whole(8, 6)} for type VI`));
  assert.ok(uv8.includes(S.formatDuration(S.safeTime(8, 3, 30).minutes)));
  const uv10 = answers.find((a) => a.q === 'How long at UV 10?').a;
  assert.ok(uv10.includes(`${whole(10, 1)} minutes for type I, ${whole(10, 2)} for type II, ${whole(10, 3)} for type III`));
  assert.ok(html.replace(/<[^>]+>/g, '').includes(`from about ${whole(3, 1)} to ${whole(8, 1)} minutes for type I, ${whole(3, 2)} to ${whole(8, 2)} for type II`));
});

test('FAQ markup parses and says what the page shows', () => {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
  assert.deepEqual(blocks.map((b) => b['@type']), ['WebApplication', 'FAQPage']);
  assert.deepEqual(blocks[1], faqLd(html));
  const qs = blocks[1].mainEntity.map((q) => q.name);
  for (const q of ['What UV index is best for tanning?', 'How long can I stay in the sun at UV 8?', 'How long at UV 10?']) assert.ok(qs.includes(q), q);
  for (const q of blocks[1].mainEntity) assert.ok(q.acceptedAnswer.text.length > 80, q.name);
});

test('title, description and honesty', () => {
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  const desc = html.match(/<meta name="description" content="([^"]+)">/)[1];
  assert.ok(title.length <= 60, title);
  assert.ok(desc.length <= 155, desc);
  assert.match(title, /UV Index for Tanning/i);
  assert.match(title, /calculator/i);
  // No "best tanning UV", no safe tan, no store link before approval.
  assert.ok(!/safe tan|tan safely|tan faster|best uv (index )?(for tanning )?is \d/i.test(html.replace(/<[^>]+>/g, ' ')));
  assert.ok(html.includes('No UV level makes a tan safe'));
  assert.ok(!/apps\.apple\.com|play\.google\.com/.test(html));
  assert.ok(html.includes('<strong>Coming soon to the App Store and Google Play.</strong>'));
});
