// Builds pitch/index.html from src/deck.html + deck.css + deck.js.
// Inlines the app's own art (logo mark, category emblems, guardian sigils,
// per-character card motifs), Phosphor Light icons and the self-hosted fonts,
// so index.html needs nothing but the local screenshots it references.
//
// Run from week-1/:   app/node_modules/.bin/tsx pitch/tools/build.ts
//
// Template tokens in deck.html:
//   {{mark:64}}  {{emblem:trees:48}}  {{sigil:birds:200}}  {{motif:neem-tree}}
//   {{icon:camera}}  {{card:neem-tree}}  {{card:trees-guardian}}
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARK_PATHS } from "../../app/src/art/logo";
import { emblemSvg, CATEGORY_IDS } from "../../app/src/art/emblems";
import { sigilSvg } from "../../app/src/art/sigil";
import { motifSvg } from "../../app/src/art/motif";

const here = dirname(fileURLToPath(import.meta.url));
const pitch = join(here, "..");
const week1 = join(pitch, "..");
const nm = join(week1, "app", "node_modules");

interface Owner { id: string; name: string; species: string; category: string; elder: boolean; guardian: boolean; no: number; catName: string }
const roster = JSON.parse(readFileSync(join(week1, "data", "roster", "roster.json"), "utf8"));
const owners = new Map<string, Owner>();
let n = 0;
for (const c of roster.categories) {
  n++;
  owners.set(c.guardian.id, { id: c.guardian.id, name: c.guardian.name, species: `Guardian of ${c.name.split(" ")[0]}`, category: c.id, elder: false, guardian: true, no: n, catName: c.name });
  for (const ch of c.characters) {
    n++;
    owners.set(ch.id, { id: ch.id, name: ch.name, species: ch.species, category: c.id, elder: ch.tier === "elder", guardian: false, no: n, catName: c.name });
  }
}

const markSvg = (size: number) =>
  `<svg class="mark" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${MARK_PATHS}</svg>`;

function icon(name: string): string {
  const raw = readFileSync(join(nm, "@phosphor-icons", "core", "assets", "light", `${name}-light.svg`), "utf8");
  return raw.replace("<svg ", `<svg class="icon" aria-hidden="true" `).replace(/ width="\d+"/, "").replace(/ height="\d+"/, "");
}

function card(id: string): string {
  const o = owners.get(id);
  if (!o) throw new Error(`unknown owner ${id}`);
  const art = o.guardian ? sigilSvg(o.category, 150) : motifSvg(o.id, o.category);
  const tag = o.elder ? `<span class="tag gold">Elder voice</span>` : o.guardian ? `<span class="tag">Guardian</span>` : `<span class="tag plain">Common voice</span>`;
  return `<div class="card${o.elder ? " elder" : ""}${o.guardian ? " guardian" : ""}" style="--pig:var(--pig-${o.category})">
  <div class="card-in">
    <div class="card-top"><span>No. ${String(o.no).padStart(3, "0")}</span>${emblemSvg(o.category, 26)}</div>
    <div class="card-art">${art}</div>
    <div class="card-body"><div class="card-name">${o.name}</div><div class="card-sp">${o.species}</div>${tag}</div>
  </div>
</div>`;
}

const b64 = (p: string) => readFileSync(join(pitch, "assets", "fonts", p)).toString("base64");
const fonts = `
@font-face { font-family: "EB Garamond"; font-style: normal; font-weight: 400 800; font-display: block; src: url(data:font/woff2;base64,${b64("eb-garamond-latin-wght-normal.woff2")}) format("woff2"); }
@font-face { font-family: "EB Garamond"; font-style: italic; font-weight: 400 800; font-display: block; src: url(data:font/woff2;base64,${b64("eb-garamond-latin-wght-italic.woff2")}) format("woff2"); }
@font-face { font-family: "Atkinson Hyperlegible Next"; font-style: normal; font-weight: 400; font-display: block; src: url(data:font/woff2;base64,${b64("atkinson-hyperlegible-next-latin-400-normal.woff2")}) format("woff2"); }
@font-face { font-family: "Atkinson Hyperlegible Next"; font-style: italic; font-weight: 400; font-display: block; src: url(data:font/woff2;base64,${b64("atkinson-hyperlegible-next-latin-400-italic.woff2")}) format("woff2"); }
@font-face { font-family: "Atkinson Hyperlegible Next"; font-style: normal; font-weight: 700; font-display: block; src: url(data:font/woff2;base64,${b64("atkinson-hyperlegible-next-latin-700-normal.woff2")}) format("woff2"); }`;

// App screenshots are being refreshed independently, so resolve them by pattern
// (first pattern with a match wins; newest file among matches). Re-run the build
// after new captures land and the deck picks them up.
const shotsDir = join(week1, "app", "screenshots");
const SHOTS: Record<string, RegExp[]> = {
  home: [/^phone-light-\d+[a-z]?-home\.png$/, /^phone-light-\d+[a-z]?-trail\.png$/, /^phone-light-\d+-listen\.png$/],
  encounter: [/^phone-light-\d+[a-z]?-encounter-new-elder\.png$/, /^phone-light-\d+[a-z]?-encounter-elder\.png$/],
  guide: [/^phone-light-\d+[a-z]?-field-guide\.png$/, /^phone-light-\d+[a-z]?-guide\.png$/],
  game: [/^phone-light-\d+[a-z]?-trail\.png$/, /^phone-light-\d+[a-z]?-home\.png$/, /^phone-light-\d+[a-z]?-badges\.png$/],
  offline: [/^real-offline-encounter\.png$/],
  guardian: [/^phone-light-\d+[a-z]?-guardian-hint\.png$/, /^phone-light-.*guardian.*\.png$/],
};
const shotFiles = readdirSync(shotsDir).map((f) => ({ f, t: statSync(join(shotsDir, f)).mtimeMs }));
const picked: Record<string, string> = {};
function shot(key: string): string {
  for (const re of SHOTS[key] ?? []) {
    const hits = shotFiles.filter((s) => re.test(s.f)).sort((a, b) => b.t - a.t);
    if (hits.length) return `../app/screenshots/${(picked[key] = hits[0]!.f)}`;
  }
  console.warn(`warning: no screenshot found for "${key}"`);
  picked[key] = "(missing)";
  return `../app/screenshots/missing-${key}.png`;
}

let html = readFileSync(join(pitch, "src", "deck.html"), "utf8");
const css = readFileSync(join(pitch, "src", "deck.css"), "utf8");
const js = readFileSync(join(pitch, "src", "deck.js"), "utf8");
html = html.replace("{{fonts}}", fonts).replace("{{css}}", css).replace("{{js}}", js);
html = html.replace(/\{\{(\w+)(?::([\w-]+))?(?::(\d+))?\}\}/g, (all, kind: string, a?: string, b?: string) => {
  switch (kind) {
    case "mark": return markSvg(Number(a ?? 48));
    case "emblem": return emblemSvg(a!, Number(b ?? 48));
    case "sigil": return sigilSvg(a!, Number(b ?? 96));
    case "motif": return motifSvg(a!, owners.get(a!)!.category);
    case "icon": return icon(a!);
    case "card": return card(a!);
    case "shot": return shot(a!);
    default: throw new Error(`unknown token ${all}`);
  }
});
if (/[–—]/.test(html.replace(/<aside class="notes">[\s\S]*?<\/aside>/g, ""))) console.warn("warning: en/em dash found in visible deck text");
writeFileSync(join(pitch, "index.html"), html);
console.log("wrote index.html", (html.length / 1024).toFixed(0), "KB");
for (const [k, f] of Object.entries(picked)) console.log(`  screenshot ${k.padEnd(9)} ${f}`);

// Standalone SVGs for reuse in the DEV post and social cards.
const svgFile = (inner: string) => inner.replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" `);
mkdirSync(join(pitch, "assets", "emblems"), { recursive: true });
mkdirSync(join(pitch, "assets", "sigils"), { recursive: true });
writeFileSync(join(pitch, "assets", "logo.svg"), svgFile(markSvg(48)).replace(/currentColor/g, "#2d5b3c"));
for (const c of CATEGORY_IDS) {
  writeFileSync(join(pitch, "assets", "emblems", `${c}.svg`), svgFile(emblemSvg(c, 48)).replace(/currentColor/g, "#1c2420"));
  writeFileSync(join(pitch, "assets", "sigils", `${c}.svg`), svgFile(sigilSvg(c, 96)).replace(/currentColor/g, "#1c2420"));
}
