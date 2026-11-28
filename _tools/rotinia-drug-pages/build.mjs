// Builds the four English drug pages from the generic page's planner and log
// sections plus per-drug content in drugs.mjs, and every page's injection-sites diagram (diagram.mjs). Usage (from the repo root): node _tools/rotinia-drug-pages/build.mjs rotinia _tools/rotinia-drug-pages/drugs.mjs
// Edit drugs.mjs (label text, sources) and rerun; the folder starts with _ so Jekyll does not publish it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.argv[2].replace(/\/$/, '') + '/';
const { EN } = await import(pathToFileURL(root + 'glp-1-injection-sites/i18n.js'));
const { DRUGS, GENERIC_DIAGRAM } = await import(pathToFileURL(process.argv[3]));
const { diagramSvg, DIAGRAM_SIZE } = await import(new URL('./diagram.mjs', import.meta.url));
const DIAGRAM = 'injection-sites-diagram.svg';

const generic = readFileSync(root + 'glp-1-injection-sites/index.html', 'utf8');
const planner = generic.match(/<section id="planner"[\s\S]*?\n<\/section>/)[0];
const logTpl = generic.match(/<section id="log"[\s\S]*?\n<\/section>/)[0];
const cta = generic.match(/<section class="app-cta card">[\s\S]*?\n<\/section>/)[0].replace('href="../"', 'href="../"');

const SITE = 'https://juicypasta.github.io/rotinia/';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Plain text of a block of page HTML, so the FAQ markup says exactly what the page shows.
const text = (h) => h.replace(/<\/(p|li)>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// The diagram figure: a real image file (image search indexes it) with the label's wording as its caption.
const figure = (g) => `<figure class="diagram" id="diagram">
<img src="${DIAGRAM}" width="${DIAGRAM_SIZE.width}" height="${DIAGRAM_SIZE.height}" alt="${esc(g.alt)}">
<figcaption>${g.caption.replace(/^([^,]+ injection sites diagram)/, '<strong>$1</strong>')}</figcaption>
</figure>`;
const imageLd = (url, g) => ({ '@type': 'ImageObject', url: url + DIAGRAM, contentUrl: url + DIAGRAM, caption: g.caption });

for (const d of DRUGS) {
  const url = SITE + d.slug + '/';
  const others = DRUGS.filter((o) => o.slug !== d.slug);
  const log = logTpl
    .replace(/<p class="print-title">[^<]*<\/p>/, `<p class="print-title">${d.name} injection site rotation log</p>`)
    .replace(/<p class="print-sub">[^<]*<\/p>/, `<p class="print-sub">${d.printSub}</p>`)
    .replace(/<p class="print-foot">[^<]*<\/p>/, `<p class="print-foot">Free planner and log: juicypasta.github.io/rotinia/${d.slug}/ · Rotinia is not affiliated with Eli Lilly or Novo Nordisk.</p>`)
    .replace('<h2 id="log-h">Printable injection site rotation log</h2>', `<h2 id="log-h">Printable ${d.name} injection site log</h2>`);
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebApplication',
    name: `${d.name} injection site rotation planner (Rotinia)`, url,
    applicationCategory: 'HealthApplication', operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: `Free injection site rotation planner and printable log for once-weekly ${d.name} (${d.generic}) injections.`,
    image: imageLd(url, d.diagram),
  };
  const faq = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: [{ '@type': 'Question', name: d.bestQ, acceptedAnswer: { '@type': 'Answer', text: text(d.best) } }],
  };
  const related = [
    ...others.map((o) => `<li><a href="../${o.slug}/">${o.name} injection sites</a> (${o.generic}, ${o.maker})</li>`),
    '<li><a href="../glp-1-injection-sites/">GLP-1 injection sites: all four pens side by side</a></li>',
    '<li><a href="../pt/onde-aplicar-mounjaro/" hreflang="pt-BR" lang="pt-BR">Onde aplicar Mounjaro</a> (português) · <a href="../es/donde-aplicar-mounjaro/" hreflang="es" lang="es">Dónde aplicar Mounjaro</a> (español)</li>',
    '<li><a href="../pt/onde-aplicar-ozempic/" hreflang="pt-BR" lang="pt-BR">Onde aplicar Ozempic</a> (português) · <a href="../es/donde-aplicar-ozempic/" hreflang="es" lang="es">Dónde aplicar Ozempic</a> (español)</li>',
    '<li><a href="../de/wo-spritzt-man-mounjaro-wegovy-ozempic/" hreflang="de" lang="de">Wo spritzt man Mounjaro, Wegovy, Ozempic?</a> (Deutsch) · <a href="../fr/comment-injecter-mounjaro-wegovy-ozempic/" hreflang="fr" lang="fr">Comment injecter Mounjaro, Wegovy ou Ozempic</a> (français)</li>',
  ].join('\n');
  // A page with translations lists them, itself and x-default; the others have no alternates.
  const alternates = d.alternates
    ? [['en', url], ...Object.entries(d.alternates).map(([lang, path]) => [lang, SITE + path]), ['x-default', url]]
      .map(([lang, href]) => `\n<link rel="alternate" hreflang="${lang}" href="${href}">`).join('')
    : '';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${d.title} | Rotinia</title>
<meta name="description" content="${esc(d.description)}">
<link rel="canonical" href="${url}">${alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rotinia">
<meta property="og:title" content="${esc(d.title)}">
<meta property="og:description" content="${esc(d.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}icon.png">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#b8442a">
<link rel="icon" href="../icon.png">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../glp-1-injection-sites/page.css">
<script type="application/ld+json">
${JSON.stringify(ld)}
</script>
<script type="application/ld+json">
${JSON.stringify(faq)}
</script>
<script type="application/json" id="planner-strings">
${JSON.stringify(EN, null, 2)}
</script>
<script type="module" src="../glp-1-injection-sites/app.js"></script>
</head>
<body>
<main>
<header class="top">
<a href="../"><img src="../icon.png" alt="Rotinia" width="64" height="64"></a>
<div><p class="brand"><a href="../">Rotinia</a></p><p>Free, no ads, no sign-up</p></div>
</header>
<p class="langs">Other pens: ${others.map((o) => `<a href="../${o.slug}/">${o.name}</a>`).join(' · ')} · <a href="../glp-1-injection-sites/">all GLP-1 pens</a></p>${d.langs ? '\n' + d.langs.trim() : ''}

<h1>${d.h1}</h1>

<div class="card answer">
${d.answer.trim()}
<p>The planner below keeps the rotation for you: tap the site you used last and it shows the next one. For a picture of the sites, see the <a href="#diagram">${d.name} injection sites diagram</a>.</p>
</div>

<h2 id="best">${d.bestQ}</h2>
${d.best.trim()}

${planner}

${cta}

${d.body.trim().replace('<!--diagram-->', figure(d.diagram))}

${log}

<div class="card note">
<p><strong>This page doesn't replace your doctor's or pharmacist's instructions. Follow the Instructions for Use that came with your ${d.name} ${d.device}, and talk to your doctor or pharmacist about any questions, including which site is right for you.</strong> It covers where to inject, how to rotate sites and how the ${d.device} works, from the US label; it gives no medical advice and nothing about doses.</p>
<p>${d.name} is a registered trademark of ${d.owner}. Rotinia is not affiliated with or endorsed by Eli Lilly or Novo Nordisk; brand names belong to their owners.</p>
</div>

<h2 id="related">Injection sites for other GLP-1 medicines</h2>
<ul>
${related}
</ul>

<h2 id="sources">Sources</h2>
${d.sources.trim()}

<footer>
<p>No ads, no cookies, no tracking: the planner works in your browser, and the sites you tap stay in this browser. <a href="../">Rotinia</a> · <a href="../privacy.html">Privacy</a></p>
<p>Rotinia is made by Jackson Darrow in New York City.</p>
</footer>
</main>
</body>
</html>
`;
  mkdirSync(root + d.slug, { recursive: true });
  writeFileSync(root + d.slug + '/index.html', html);
  writeFileSync(root + d.slug + '/' + DIAGRAM, diagramSvg({ title: `${d.name} injection sites`, desc: d.diagram.alt, ...d.diagram }));
  console.log('wrote', d.slug);
}

// The generic page is hand-written; only its diagram file is built here (the figure is in its index.html).
writeFileSync(root + 'glp-1-injection-sites/' + DIAGRAM, diagramSvg({ title: 'GLP-1 injection sites', desc: GENERIC_DIAGRAM.alt, ...GENERIC_DIAGRAM }));
console.log('wrote glp-1-injection-sites/' + DIAGRAM);
