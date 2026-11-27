// The planner's UI strings (../i18n.js) and the translated pages that use them.
// Run: node --test rotinia/glp-1-injection-sites/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EN, fill, mergeStrings, missingKeys, requiredKeys } from '../i18n.js';
import { SITE_IDS } from '../rotation.js';
import { faqLd } from '../../../_tools/rotinia-faq/build.mjs';

const rotinia = fileURLToPath(new URL('../../', import.meta.url));
const PAGES = {
  'pt-BR': 'pt/onde-aplicar-mounjaro/index.html',
  es: 'es/donde-aplicar-mounjaro/index.html',
};
// English pages per medicine: same planner, strings in their own block.
const DRUG_PAGES = ['zepbound', 'mounjaro', 'wegovy', 'ozempic'].map((d) => `${d}-injection-sites/index.html`);

function pageStrings(rel) {
  const html = readFileSync(rotinia + rel, 'utf8');
  const m = html.match(/<script type="application\/json" id="planner-strings">([\s\S]*?)<\/script>/);
  assert.ok(m, `${rel}: no planner-strings block`);
  return { html, strings: JSON.parse(m[1]) };
}

test('English has a name for every site and nothing missing', () => {
  assert.deepEqual(Object.keys(EN.sites), SITE_IDS);
  assert.deepEqual(missingKeys(EN), []);
});

test('fill replaces known placeholders and leaves the rest', () => {
  assert.equal(fill('{n} of {total}', { n: 6, total: 8 }), '6 of 8');
  assert.equal(fill('a {x} b', {}), 'a {x} b');
  assert.equal(fill('{n}{n}', { n: 0 }), '00');
});

test('mergeStrings overrides by key and falls back to English', () => {
  assert.deepEqual(mergeStrings(null), EN);
  const m = mergeStrings({ next: 'Próximo', sites: { thigh_l: 'Coxa esquerda', elbow: 'x' }, bogus: 'y', agoN: 3 });
  assert.equal(m.next, 'Próximo');
  assert.equal(m.sites.thigh_l, 'Coxa esquerda');
  assert.equal(m.sites.thigh_r, EN.sites.thigh_r);
  assert.equal(m.sites.elbow, undefined);
  assert.equal(m.bogus, undefined);
  assert.equal(m.agoN, EN.agoN);
  // EN itself is never changed.
  assert.equal(EN.sites.thigh_l, 'Left thigh');
});

for (const [lang, rel] of Object.entries(PAGES)) {
  test(`${lang} page: every string translated, placeholders kept`, () => {
    const { html, strings } = pageStrings(rel);
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    assert.deepEqual(missingKeys(strings), []);
    for (const key of requiredKeys()) {
      const en = key.startsWith('sites.') ? EN.sites[key.slice(6)] : EN[key];
      const tr = key.startsWith('sites.') ? strings.sites[key.slice(6)] : strings[key];
      const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
      assert.equal(ph(tr), ph(en), `${lang} ${key}: placeholders differ`);
    }
    assert.ok(strings.badge.length <= 5, `${lang} badge too long for the body map`);
    // The page's buttons and checkboxes use the same site names as the planner.
    for (const id of SITE_IDS) {
      assert.ok(html.includes(`data-site="${id}">${strings.sites[id]}<small>`), `${lang} button ${id}`);
      assert.ok(html.includes(`value="${id}"> ${strings.sites[id]}</label>`), `${lang} checkbox ${id}`);
    }
    // Loads the one shared planner, not a copy.
    assert.match(html, /<script type="module" src="\.\.\/\.\.\/glp-1-injection-sites\/app\.js"><\/script>/);
  });
}

for (const [lang, rel] of Object.entries(PAGES)) {
  test(`${lang} page: names tirzepatida, FAQ markup says what the page shows, no doses`, () => {
    const { html } = pageStrings(rel);
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    assert.ok(title.length <= 60, `${lang} title is ${title.length} characters`);
    assert.match(title, /Mounjaro \(tirzepatida\)/);
    assert.match(html.match(/<h1>(.*?)<\/h1>/)[1], /Mounjaro \(tirzepatida\)/);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    assert.ok(faq, `${lang}: no FAQPage block`);
    // Rebuilt from the visible section: node _tools/rotinia-faq/build.mjs
    assert.deepEqual(faq, faqLd(html));
    assert.ok(faq.mainEntity.length >= 4);
    assert.ok(faq.mainEntity.every((q) => /tirzepatida/i.test(q.name)), `${lang}: every question names tirzepatida`);
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(visible, /\d\s?mg\b/i, `${lang}: no doses`);
    assert.doesNotMatch(html, /\u2014/, `${lang}: no em dashes`);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\(/);
  });
}

for (const rel of DRUG_PAGES) {
  test(`${rel}: every planner string, shared planner, canonical`, () => {
    const { html, strings } = pageStrings(rel);
    assert.match(html, /<html lang="en">/);
    assert.deepEqual(missingKeys(strings), []);
    for (const key of requiredKeys()) {
      const en = key.startsWith('sites.') ? EN.sites[key.slice(6)] : EN[key];
      const got = key.startsWith('sites.') ? strings.sites[key.slice(6)] : strings[key];
      assert.equal(got, en, `${rel} ${key}`);
    }
    for (const id of SITE_IDS) {
      assert.ok(html.includes(`data-site="${id}">${strings.sites[id]}<small>`), `${rel} button ${id}`);
      assert.ok(html.includes(`value="${id}"> ${strings.sites[id]}</label>`), `${rel} checkbox ${id}`);
    }
    assert.match(html, /<script type="module" src="\.\.\/glp-1-injection-sites\/app\.js"><\/script>/);
    assert.equal((html.match(/<script type="module"/g) || []).length, 1);
    const dir = rel.replace('index.html', '');
    assert.ok(html.includes(`<link rel="canonical" href="https://juicypasta.github.io/rotinia/${dir}">`), `${rel} canonical`);
    assert.doesNotMatch(html, /hreflang="[^"]*" href=/, `${rel}: not a translation, no alternates`);
    assert.doesNotMatch(html, /\b\d+(\.\d+)?\s?mg\b/i, `${rel}: no doses`);
    assert.match(html, /not affiliated with or endorsed by Eli Lilly or Novo Nordisk/);
    assert.match(html, /talk to your doctor or pharmacist/i);
    assert.match(html, /Coming soon to the App Store for iPhone\./);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\(/);
    const sitemap = readFileSync(rotinia + '../sitemap.xml', 'utf8');
    assert.ok(sitemap.includes(`<loc>https://juicypasta.github.io/rotinia/${dir}</loc>`), `${rel} in sitemap`);
    for (const other of DRUG_PAGES) {
      if (other !== rel) assert.ok(html.includes(`href="../${other.replace('index.html', '')}"`), `${rel} links ${other}`);
    }
  });
}
