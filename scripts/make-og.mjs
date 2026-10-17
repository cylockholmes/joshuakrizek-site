// One-off: render the 1200x630 social preview card (src/og.png) from an SVG.
// Re-run after changing the name/tagline: node scripts/make-og.mjs
// The output is committed, so the deploy build doesn't depend on system fonts.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SITE } from "./build.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="g" cx="75%" cy="0%" r="90%">
      <stop offset="0" stop-color="#13261c"/><stop offset="1" stop-color="#0b0f0d"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="40" y="40" width="1120" height="550" rx="24" fill="none" stroke="#1f2a25" stroke-width="2"/>
  <g font-family="Menlo, DejaVu Sans Mono, monospace">
    <text x="100" y="250" font-size="84" font-weight="700" fill="#d7e2dc"><tspan fill="#39ff14">&gt;&#160;</tspan>${esc(SITE.name)}</text>
    <text x="100" y="330" font-size="40" fill="#39ff14">${esc(SITE.tagline)}</text>
    <text x="100" y="410" font-size="30" fill="#8aa093">PNPT · GWAPT · GCIH · GSEC · Security+</text>
    <text x="100" y="530" font-size="30" fill="#29c5ff">joshuakrizek.com</text>
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(path.join(ROOT, "src", "og.png"));
console.log("Wrote src/og.png");
