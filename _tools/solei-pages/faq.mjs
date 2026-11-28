// FAQPage markup written from a page's visible <section id="faq" class="faq">,
// so the markup says exactly what the page shows (same idea as _tools/rotinia-faq).
// Run after editing a FAQ: node _tools/solei-pages/faq.mjs <page.html>
// (the calculator's FAQ is written by burn-table.mjs, which also fills in its numbers).
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const text = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// [{ q, a }] from <h3>question</h3> followed by its paragraphs.
export function faqOf(html) {
  const m = html.match(/<section id="faq" class="faq">([\s\S]*?)<\/section>/);
  if (!m) return [];
  return m[1].split(/<h3[^>]*>/).slice(1).map((part) => {
    const [q, rest] = part.split('</h3>');
    return { q: text(q), a: text(rest.replace(/<\/p>/g, ' ')) };
  });
}

export const faqLd = (html) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqOf(html).map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

export const FAQ_BLOCK = /<script type="application\/ld\+json">\n\{"@context":"https:\/\/schema\.org","@type":"FAQPage"[\s\S]*?<\/script>\n/;

// The page with its FAQPage block replaced, or inserted before `anchor`.
export function withFaqLd(html, anchor) {
  const block = `<script type="application/ld+json">\n${JSON.stringify(faqLd(html))}\n</script>\n`;
  if (FAQ_BLOCK.test(html)) return html.replace(FAQ_BLOCK, () => block);
  if (!html.includes(anchor)) throw new Error(`no FAQPage block and no ${anchor}`);
  return html.replace(anchor, () => block + anchor);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  for (const file of process.argv.slice(2)) {
    const html = readFileSync(file, 'utf8');
    const out = withFaqLd(html, '<script type="application/json" id="uv-strings">');
    writeFileSync(file, out);
    console.log(`${file}: ${out === html ? 'unchanged' : 'written'}, ${faqOf(out).length} questions`);
  }
}
