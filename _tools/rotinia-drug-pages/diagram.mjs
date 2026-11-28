// The labelled injection-sites diagram (a standalone SVG, so image search can index it).
// Body shapes are the planner's (glp-1-injection-sites/index.html), drawn at 0.95 scale;
// only the sites the drug's US label names are shaded. Light and dark colors are the planner's.
const W = 400, H = 386, S = 0.95, DY = 48, FX = 68, BX = 334;
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const front = `<circle cx="85" cy="27" r="17"/><rect x="78" y="40" width="14" height="14" rx="4"/><path d="M57 56 Q85 49 113 56 L117 98 Q120 130 115 164 L55 164 Q50 130 53 98 Z"/><rect x="38" y="58" width="16" height="96" rx="8" transform="rotate(7 46 58)"/><rect x="116" y="58" width="16" height="96" rx="8" transform="rotate(-7 124 58)"/><rect x="56" y="156" width="27" height="138" rx="12"/><rect x="87" y="156" width="27" height="138" rx="12"/>`;
const back = `<circle cx="255" cy="27" r="17"/><rect x="248" y="40" width="14" height="14" rx="4"/><path d="M227 56 Q255 49 283 56 L287 98 Q290 130 285 164 L225 164 Q220 130 223 98 Z"/><rect x="208" y="58" width="16" height="96" rx="8" transform="rotate(7 216 58)"/><rect x="286" y="58" width="16" height="96" rx="8" transform="rotate(-7 294 58)"/><rect x="226" y="156" width="27" height="138" rx="12"/><rect x="257" y="156" width="27" height="138" rx="12"/>`;

// Planner coordinates to diagram coordinates.
const fx = (x) => +(FX + (x - 85) * S).toFixed(1);
const bx = (x) => +(BX + (x - 255) * S).toFixed(1);
const yy = (y) => +(DY + y * S).toFixed(1);

// A label block: first line bold, the rest muted, 14 units apart.
function block(x, y, anchor, lines) {
  return lines.map((t, i) => `<text x="${x}" y="${y + i * 14.5}" text-anchor="${anchor}" class="${i ? 'sub' : 'lbl'}">${xmlEsc(t)}</text>`).join('');
}

// spec: { title, subtitle, abdomen: [lines], thigh: [lines], arm: [lines], desc }
export function diagramSvg(spec) {
  const TX = 130; // left edge of the front labels
  // Abdomen: dot on the zone right of the belly-button ring, leader across to the label.
  const ab = { x: fx(104), y: yy(134) };
  const th = { x: fx(100.5), y: yy(205) };
  // Back of the left upper arm (the back view's arm nearest the middle), upper part of the zone.
  const ar = { x: +(BX + (214.05 - 255) * S).toFixed(1), y: yy(73.9) };
  const armTextX = 272;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">
<title id="t">${xmlEsc(spec.title)} diagram</title>
<desc id="d">${xmlEsc(spec.desc)}</desc>
<style>
.bg{fill:#fff;stroke:#eadfd2}.fig *{fill:#efe3d6}.site{fill:#f0b9a5;stroke:#b8442a;stroke-width:1.6}
.ring{fill:#efe3d6;stroke:#655a6e;stroke-width:1.1;stroke-dasharray:2.5 2}.navel{fill:#655a6e}
.lead{stroke:#b8442a;stroke-width:1.5;fill:none}.dot{fill:#b8442a}
text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;fill:#2e2238}
.h{font-size:20px;font-weight:700}.st{font-size:13px;fill:#655a6e}.lbl{font-size:14.5px;font-weight:700}
.sub{font-size:12.5px;fill:#655a6e}.cap{font-size:13px;font-weight:600;fill:#655a6e;text-anchor:middle}.src{font-size:11.5px;fill:#655a6e;text-anchor:middle}
@media (prefers-color-scheme:dark){.bg{fill:#2a2132;stroke:#3e3348}.fig *,.ring{fill:#3b3045}.site{fill:#7a4f55;stroke:#ff9c80}
.ring{stroke:#b9adc0}.navel{fill:#b9adc0}.lead{stroke:#ff9c80}.dot{fill:#ff9c80}text{fill:#f6efe8}.st,.sub,.cap,.src{fill:#b9adc0}}
</style>
<rect class="bg" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12"/>
<text x="${W / 2}" y="30" text-anchor="middle" class="h">${xmlEsc(spec.title)}</text>
<text x="${W / 2}" y="49" text-anchor="middle" class="st">${xmlEsc(spec.subtitle)}</text>
<g transform="translate(${FX} ${DY}) scale(${S}) translate(-85 0)">
<g class="fig">${front}</g>
<rect class="site" x="58" y="94" width="54" height="62" rx="9"/>
<circle class="ring" cx="85" cy="125" r="9.5"/><circle class="navel" cx="85" cy="125" r="2.4"/>
<rect class="site" x="57" y="174" width="25" height="50" rx="9"/><rect class="site" x="88" y="174" width="25" height="50" rx="9"/>
</g>
<g transform="translate(${BX} ${DY}) scale(${S}) translate(-255 0)">
<g class="fig">${back}</g>
<rect class="site" x="204" y="66" width="24" height="40" rx="9" transform="rotate(7 216 58)"/>
<rect class="site" x="282" y="66" width="24" height="40" rx="9" transform="rotate(-7 294 58)"/>
</g>
<path class="lead" d="M${ab.x} ${ab.y}H${TX - 5}"/><circle class="dot" cx="${ab.x}" cy="${ab.y}" r="2.6"/>
${block(TX, ab.y + 5, 'start', spec.abdomen)}
<path class="lead" d="M${th.x} ${th.y}H${TX - 5}"/><circle class="dot" cx="${th.x}" cy="${th.y}" r="2.6"/>
${block(TX, th.y + 5, 'start', spec.thigh)}
<path class="lead" d="M${ar.x} ${ar.y}H${armTextX + 5}"/><circle class="dot" cx="${ar.x}" cy="${ar.y}" r="2.6"/>
${block(armTextX, ar.y + 5, 'end', spec.arm)}
<text x="${FX}" y="346" class="cap">Front</text><text x="${BX}" y="346" class="cap">Back</text>
<text x="${W / 2}" y="372" class="src">juicypasta.github.io/rotinia</text>
</svg>
`;
}

export const DIAGRAM_SIZE = { width: W, height: H };
