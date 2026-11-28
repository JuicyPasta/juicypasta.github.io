// The injection-sites diagram on the Portuguese, Spanish, German and French pages. Those pages are
// hand-written; this writes each one's injection-sites-diagram.svg (diagram.mjs, in the page's language)
// and puts the <figure> and the JSON-LD image into its index.html. Rerunning replaces both.
// Each diagram shades only the sites the label quoted on that page names, with the page's own words;
// the caption quotes that label (test/diagram-l10n.test.mjs checks every quote is on the page).
// Run by build.mjs; on its own: node _tools/rotinia-drug-pages/l10n.mjs rotinia
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { diagramSvg, DIAGRAM_SIZE } from './diagram.mjs';

const DIAGRAM = 'injection-sites-diagram.svg';
const SITE = 'https://juicypasta.github.io/rotinia/';
const N = ' '; // French spacing, as on the French page

// head: the bold start of the caption (and the SVG's <title>); rest: the label's own words.
// at: where the figure goes: after the first `close` that follows <h2 id="h2">, or before `before`.
export const PAGES = [
  {
    path: 'pt/onde-aplicar-mounjaro/', lang: 'pt-BR',
    at: { h2: 'mounjaro', close: '</ul>' },
    title: 'Onde aplicar Mounjaro', subtitle: 'Segundo a bula da Anvisa (tirzepatida)',
    // The Brazilian bula states no distance from the navel, so no navel ring.
    ring: false,
    abdomen: ['Barriga (abdome)'],
    thigh: ['Coxa'],
    arm: ['Parte de trás', 'do braço: quem aplica', 'é outra pessoa'],
    head: 'Onde aplicar Mounjaro: diagrama dos locais de aplicação',
    alt: 'Onde aplicar Mounjaro: diagrama dos locais de aplicação. Contorno do corpo de frente e de costas com a barriga (abdome), as coxas e a parte de trás dos braços marcadas; na parte de trás do braço, quem aplica é outra pessoa.',
    rest: ', segundo a bula aprovada pela Anvisa: "administrar MOUNJARO por via subcutânea no abdome, coxa ou outra pessoa deve administrar na parte de trás do braço."',
  },
  {
    path: 'pt/onde-aplicar-ozempic/', lang: 'pt-BR',
    at: { h2: 'ozempic', close: '</p>' },
    title: 'Onde aplicar Ozempic', subtitle: 'Segundo a bula da Anvisa (semaglutida)',
    // "A bula brasileira do Ozempic não fala em ... distância do umbigo."
    ring: false,
    abdomen: ['Abdome', 'parte anterior', 'da cintura'],
    thigh: ['Coxa', 'parte anterior'],
    arm: ['Parte superior', 'do braço'],
    head: 'Onde aplicar Ozempic: diagrama dos locais de aplicação',
    alt: 'Onde aplicar Ozempic: diagrama dos locais de aplicação. Contorno do corpo de frente e de costas com a parte anterior da cintura (abdome), a parte anterior das coxas e a parte superior dos braços marcadas.',
    rest: ', segundo a bula aprovada pela Anvisa: "Os melhores locais para aplicar a injeção são a parte anterior das coxas, a parte anterior da cintura (abdome) e a parte superior do braço."',
  },
  {
    path: 'es/donde-aplicar-mounjaro/', lang: 'es',
    at: { h2: 'mounjaro', close: '</ul>' },
    title: 'Dónde aplicar Mounjaro', subtitle: 'Según el prospecto (tirzepatida)',
    abdomen: ['Abdomen', 'a 5 cm o más', 'del ombligo'],
    thigh: ['Muslo'],
    arm: ['Parte de atrás', 'del brazo: ahí debe', 'inyectar otra persona'],
    head: 'Dónde aplicar Mounjaro: diagrama de las zonas de inyección',
    alt: 'Dónde aplicar Mounjaro: diagrama de las zonas de inyección. Silueta del cuerpo de frente y de espaldas con el abdomen marcado a 5 cm o más del ombligo, los muslos y la parte de atrás de los brazos, donde debe inyectar otra persona.',
    rest: ', según el prospecto europeo de Mounjaro KwikPen: "se inyecta debajo de la piel (inyección subcutánea) de la zona del abdomen a una distancia mínima de 5 cm del ombligo o en la parte superior de la pierna (muslo) o en la parte posterior de la parte superior del brazo. Otra persona debe ayudarle si desea inyectarse en la parte posterior de la parte superior del brazo."',
  },
  {
    path: 'es/donde-aplicar-ozempic/', lang: 'es',
    at: { h2: 'ozempic', close: '</p>' },
    title: 'Dónde aplicar Ozempic', subtitle: 'Según el prospecto (semaglutida)',
    // "El prospecto europeo de Ozempic no habla de ... la distancia al ombligo."
    ring: false,
    abdomen: ['Abdomen', 'parte frontal', 'de la cintura'],
    thigh: ['Muslo', 'parte frontal'],
    arm: ['Parte superior', 'del brazo'],
    head: 'Dónde aplicar Ozempic: diagrama de las zonas de inyección',
    alt: 'Dónde aplicar Ozempic: diagrama de las zonas de inyección. Silueta del cuerpo de frente y de espaldas con la parte frontal de la cintura (abdomen), la parte frontal de los muslos y la parte superior de los brazos marcadas.',
    rest: ', según el prospecto europeo de Ozempic: "Las mejores zonas para administrar la inyección son la parte frontal de los muslos, la parte frontal de su cintura (abdomen) o la parte superior del brazo."',
  },
  {
    path: 'de/wo-spritzt-man-mounjaro-wegovy-ozempic/', lang: 'de',
    at: { before: '<table class="sum">' },
    title: 'Einstichstellen', subtitle: 'Mounjaro, Wegovy, Ozempic (EU-Packungsbeilagen)',
    // Wegovy names the front of the upper arm, Mounjaro the back: both are shaded.
    armFront: true,
    abdomen: ['Bauch (Abdomen)', 'Mounjaro, Wegovy: 5 cm', 'Abstand zum Bauchnabel'],
    thigh: ['Oberschenkel'],
    arm: ['Oberarm', 'Wegovy: Vorderseite', 'Mounjaro: Rückseite,', 'eine andere Person spritzt'],
    head: 'Wo spritzt man Mounjaro, Wegovy und Ozempic: Diagramm der Einstichstellen',
    alt: 'Wo spritzt man Mounjaro, Wegovy und Ozempic: Diagramm der Einstichstellen. Körperumriss von vorne und hinten mit Bauch, Oberschenkeln und Oberarmen markiert; bei Mounjaro und Wegovy 5 cm Abstand zum Bauchnabel; bei Mounjaro die Rückseite des Oberarms, wo eine andere Person spritzt, bei Wegovy die Vorderseite des Oberarms.',
    rest: ', laut EU-Packungsbeilagen. Mounjaro: „Mounjaro wird unter die Haut (subkutane Injektion) Ihres Bauchbereiches (Abdomen) mindestens 5 cm vom Bauchnabel entfernt, Ihres Oberschenkels oder in die Rückseite Ihres Oberarms injiziert.“ und „Eine andere Person sollte Ihnen helfen, wenn Sie in die Rückseite Ihres Oberarms injizieren möchten.“ Wegovy: „Die besten Stellen für die Injektion sind die Vorderseite des Oberarms, die Oberschenkel oder der Bauch.“ Die Bedienungsanleitung sagt dazu: „halten Sie einen Abstand von 5 cm zum Bauchnabel“. Ozempic: „Die am besten geeigneten Stellen für das Geben der Spritze sind die Vorderseite Ihrer Oberschenkel, die Vorderseite Ihres Bauches (Abdomen) oder Ihr Oberarm.“',
  },
  {
    path: 'fr/comment-injecter-mounjaro-wegovy-ozempic/', lang: 'fr',
    at: { before: '<table class="sum">' },
    title: "Zones d'injection", subtitle: 'Mounjaro, Wegovy, Ozempic (notices européennes)',
    armFront: true,
    abdomen: ['Ventre (abdomen)', `Mounjaro, Wegovy${N}:`, 'à 5 cm du nombril'],
    thigh: ['Cuisse'],
    arm: ['Haut du bras', `Wegovy${N}: le devant`, `Mounjaro${N}: l’arrière,`, 'par une autre personne'],
    head: `Comment injecter Mounjaro, Wegovy ou Ozempic${N}: schéma des zones d'injection`,
    alt: `Comment injecter Mounjaro, Wegovy ou Ozempic${N}: schéma des zones d'injection. Silhouette de face et de dos avec le ventre, les cuisses et le haut des bras marqués${N}; pour Mounjaro et Wegovy, à 5 cm du nombril${N}; pour Mounjaro, l’arrière du haut du bras, injection faite par une autre personne${N}; pour Wegovy, le devant du haut du bras.`,
    rest: `, selon les notices européennes. Mounjaro${N}: «${N}Mounjaro doit être injecté sous la peau (injection sous-cutanée) du ventre (abdomen) à au moins 5 cm du nombril ou du haut de la jambe (cuisse) ou de l’arrière du haut du bras.${N}» et «${N}Une autre personne doit vous aider si vous optez pour des injections dans l’arrière du haut du bras.${N}» Wegovy${N}: «${N}Les meilleurs endroits pour réaliser l’injection sont le devant du haut du bras, la cuisse ou le ventre.${N}» Ses instructions ajoutent${N}: «${N}à une distance de 5 cm du nombril${N}». Ozempic${N}: «${N}Les meilleurs endroits pour réaliser vos injections sont le dessus de la cuisse, le ventre (abdomen) ou le haut du bras.${N}»`,
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const caption = (p) => p.head + p.rest;

export function figureHtml(p) {
  return `<figure class="diagram" id="diagram">
<img src="${DIAGRAM}" width="${DIAGRAM_SIZE.width}" height="${DIAGRAM_SIZE.height}" alt="${esc(p.alt)}">
<figcaption><strong>${escText(p.head)}</strong>${escText(p.rest)}</figcaption>
</figure>`;
}

export function patchPage(html, p) {
  const url = SITE + p.path;
  // Take out the figure an earlier run put in, with the blank line it added.
  let out = html
    .replace(/<figure class="diagram" id="diagram">[\s\S]*?<\/figure>\n\n(?=<table class="sum">)/, '')
    .replace(/\n<figure class="diagram" id="diagram">[\s\S]*?<\/figure>/, '');
  let i;
  if (p.at.before) {
    i = out.indexOf(p.at.before);
    if (i < 0) throw new Error(`${p.path}: no ${p.at.before}`);
    out = out.slice(0, i) + figureHtml(p) + '\n\n' + out.slice(i);
  } else {
    const h = out.indexOf(`<h2 id="${p.at.h2}">`);
    if (h < 0) throw new Error(`${p.path}: no h2#${p.at.h2}`);
    i = out.indexOf(p.at.close, h) + p.at.close.length;
    out = out.slice(0, i) + '\n' + figureHtml(p) + out.slice(i);
  }
  // The image in the page's WebApplication / WebPage / Article JSON-LD.
  let found = 0;
  out = out.replace(/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n<\/script>)/g, (m, a, json, b) => {
    const ld = JSON.parse(json);
    if (!['WebApplication', 'WebPage', 'Article'].includes(ld['@type'])) return m;
    found++;
    ld.image = { '@type': 'ImageObject', url: url + DIAGRAM, contentUrl: url + DIAGRAM, caption: caption(p), inLanguage: p.lang };
    return a + JSON.stringify(ld) + b;
  });
  if (!found) throw new Error(`${p.path}: no WebApplication/WebPage/Article JSON-LD`);
  return out;
}

export function buildLocalized(root) {
  for (const p of PAGES) {
    const file = root + p.path + 'index.html';
    writeFileSync(file, patchPage(readFileSync(file, 'utf8'), p));
    writeFileSync(root + p.path + DIAGRAM, diagramSvg({ ...p, svgTitle: p.head, desc: p.alt }));
    console.log('wrote', p.path + DIAGRAM);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) buildLocalized(process.argv[2].replace(/\/$/, '') + '/');
