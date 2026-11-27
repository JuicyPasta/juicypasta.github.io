// FAQPage markup for the Portuguese and Spanish Rotinia pages, written from the
// page's own <section class="faq"> so the markup says exactly what the page shows.
// Run after editing a FAQ section: node _tools/rotinia-faq/build.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rotinia = fileURLToPath(new URL('../../rotinia/', import.meta.url));
const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// [{ q, a }] from <h3>question</h3> followed by its <p> paragraphs.
export function faqOf(html) {
  const m = html.match(/<section id="[^"]+" class="faq">([\s\S]*?)<\/section>/);
  if (!m) return [];
  return m[1].split(/<h3>/).slice(1).map((part) => {
    const [q, rest] = part.split('</h3>');
    return { q: text(q), a: text(rest.replace(/<\/p>/g, ' ')) };
  });
}

export function faqLd(html) {
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqOf(html).map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

const BLOCK = /<script type="application\/ld\+json">\n\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>\n/;
const ANCHOR = '<script type="application/json" id="planner-strings">';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const lang of ['pt', 'es']) {
    for (const dir of readdirSync(rotinia + lang)) {
      const file = `${rotinia}${lang}/${dir}/index.html`;
      let html = readFileSync(file, 'utf8');
      if (!faqOf(html).length) continue;
      const block = `<script type="application/ld+json">\n${JSON.stringify(faqLd(html))}\n</script>\n`;
      html = BLOCK.test(html) ? html.replace(BLOCK, () => block) : html.replace(ANCHOR, () => block + ANCHOR);
      writeFileSync(file, html);
      console.log(`${lang}/${dir}: ${faqOf(html).length} questions`);
    }
  }
}
