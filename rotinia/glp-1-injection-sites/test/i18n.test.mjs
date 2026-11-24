// The planner's UI strings (../i18n.js) and the translated pages that use them.
// Run: node --test rotinia/glp-1-injection-sites/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EN, fill, mergeStrings, missingKeys, requiredKeys } from '../i18n.js';
import { SITE_IDS } from '../rotation.js';

const rotinia = fileURLToPath(new URL('../../', import.meta.url));
const PAGES = {
  'pt-BR': 'pt/onde-aplicar-mounjaro/index.html',
  es: 'es/donde-aplicar-mounjaro/index.html',
};

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
