// Every Portuguese, Spanish, German and French page has its own injection-sites diagram, in its language,
// shading only what the label quoted on that page says (built by _tools/rotinia-drug-pages/l10n.mjs).
// Run: node --test rotinia/glp-1-injection-sites/test/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rotinia = fileURLToPath(new URL('../../', import.meta.url));
// What the alt text and the SVG title say in each language, and the English words that must not appear.
const WORDS = {
  'pt-BR': /diagrama dos locais de aplicação/,
  es: /diagrama de las zonas de inyección/,
  de: /Diagramm der Einstichstellen/,
  fr: /schéma des zones d'injection/,
};
const LANG_OF_DIR = { pt: 'pt-BR', es: 'es', de: 'de', fr: 'fr' };

const pages = Object.keys(LANG_OF_DIR).flatMap((dir) =>
  readdirSync(rotinia + dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => `${dir}/${e.name}/`));

test('there are six localized pages', () => assert.equal(pages.length, 6, pages.join(', ')));

for (const path of pages) {
  const lang = LANG_OF_DIR[path.split('/')[0]];
  const html = readFileSync(rotinia + path + 'index.html', 'utf8');
  const svgFile = rotinia + path + 'injection-sites-diagram.svg';

  test(`${path}: figure with the diagram and an alt text in ${lang}`, () => {
    assert.match(html, new RegExp(`<html lang="${lang}">`));
    const fig = html.match(/<figure class="diagram" id="diagram">\n<img src="injection-sites-diagram.svg" width="(\d+)" height="(\d+)" alt="([^"]+)">\n<figcaption>([\s\S]+?)<\/figcaption>\n<\/figure>/);
    assert.ok(fig, 'figure with img and figcaption');
    assert.equal(fig[1], '400');
    assert.equal(fig[2], '386');
    assert.ok(fig[3].trim().length > 40, 'alt is not empty');
    assert.match(fig[3], WORDS[lang]);
    assert.doesNotMatch(fig[3], /injection sites diagram|front and back/i, 'alt is not English');
    assert.match(fig[4], WORDS[lang]);
    assert.equal(html.match(/id="diagram"/g).length, 1, 'one figure');
  });

  test(`${path}: every quote in the caption is on the page outside the figure`, () => {
    const caption = html.match(/<figcaption>([\s\S]+?)<\/figcaption>/)[1];
    const rest = html.replace(/<figure class="diagram"[\s\S]*?<\/figure>/, '');
    const quotes = [...caption.matchAll(/"([^"]+)"|„([^“]+)“|« ([^»]+?) ?»/g)].map((m) => (m[1] || m[2] || m[3]).trim());
    assert.ok(quotes.length >= 1, 'the caption quotes the label');
    for (const q of quotes) {
      // A quote may end the label's sentence where the page continues it ("…braço." vs "…braço. Alterne…").
      const core = q.replace(/[. ]+$/, '');
      assert.ok(rest.includes(core), `not on the page: ${core}`);
    }
  });

  test(`${path}: the SVG is in ${lang}, light and dark, and shades only labelled sites`, () => {
    assert.ok(existsSync(svgFile));
    const svg = readFileSync(svgFile, 'utf8');
    assert.match(svg, new RegExp(`xml:lang="${lang}"`));
    const title = svg.match(/<title id="t">([^<]+)<\/title>/)[1];
    assert.match(title, WORDS[lang]);
    assert.doesNotMatch(svg, />(Front|Back)</, 'view names are translated');
    assert.match(svg, /prefers-color-scheme:dark/);
    assert.doesNotMatch(svg, /\bmg\b|\bdose|\bdosis|\bDosis/i, 'no doses');
    const caption = html.match(/<figcaption>([\s\S]+?)<\/figcaption>/)[1];
    // The navel ring is drawn only when the quoted label states a distance from the navel.
    assert.equal(/class="ring"/.test(svg), /5 cm/.test(caption), 'navel ring iff the label gives a distance');
    // The front of the upper arm is shaded only when a quoted label names it.
    const frontView = svg.split('<g transform')[1];
    assert.equal(/class="site"[^>]*rotate\(-7 124 58\)/.test(frontView),
      /Vorderseite des Oberarms|devant du haut du bras/.test(caption), 'front arm iff a label names it');
  });

  test(`${path}: JSON-LD parses and carries the image`, () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/g)].map((m) => JSON.parse(m[1]));
    const app = blocks.find((b) => ['WebApplication', 'WebPage', 'Article'].includes(b['@type']));
    assert.ok(app);
    assert.equal(app.image['@type'], 'ImageObject');
    assert.equal(app.image.contentUrl, `https://juicypasta.github.io/rotinia/${path}injection-sites-diagram.svg`);
    assert.equal(app.image.inLanguage, lang);
    assert.match(app.image.caption, WORDS[lang]);
  });
}
