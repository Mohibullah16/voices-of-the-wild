// Renders PWA icons, favicon, apple-touch-icon, the OG image and a DEV cover
// from the same SVG art the app uses. Run once after changing the mark:
//   npm run icons
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARK_PATHS } from "../src/art/logo";
import { motifSvg } from "../src/art/motif";
import { sigilSvg } from "../src/art/sigil";
import { emblemSvg } from "../src/art/emblems";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..");
const pub = join(app, "public");
mkdirSync(join(pub, "icons"), { recursive: true });
mkdirSync(join(app, "screenshots"), { recursive: true });

const MOSS = "#2d5b3c", PAPER = "#f1eee3", INK = "#1c2420";

const markOn = (size: number, scale: number, bg: string, fg: string, radius: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="${size}" height="${size}">
  <rect width="48" height="48" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${24 - 24 * scale} ${24 - 24 * scale}) scale(${scale})" fill="none" stroke="${fg}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${MARK_PATHS}</g>
</svg>`;

// favicon.svg: rounded tile, legible on light and dark tab strips.
writeFileSync(join(pub, "favicon.svg"), markOn(48, 0.82, MOSS, PAPER, 11).replace(' width="48" height="48"', ""));

const font = (p: string) => `data:font/woff2;base64,${readFileSync(join(app, "node_modules", p)).toString("base64")}`;
const fontCss = `
@font-face { font-family: "EB Garamond"; font-weight: 400 800; src: url("${font("@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2")}"); }
@font-face { font-family: "EB Garamond"; font-style: italic; font-weight: 400 800; src: url("${font("@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-italic.woff2")}"); }
@font-face { font-family: "Atkinson"; font-weight: 400; src: url("${font("@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2")}"); }
@font-face { font-family: "Atkinson"; font-weight: 700; src: url("${font("@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2")}"); }`;

const grain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .4 0 0 0 0 .3 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

function miniCard(o: { name: string; species: string; no: string; cat: string; id: string; elder?: boolean; guardian?: boolean; pig: string }, rot: number, x: number, y: number) {
  const artSvg = o.guardian ? sigilSvg(o.cat, 150) : motifSvg(o.id, o.cat);
  return `<div class="card ${o.elder ? "elder" : ""}" style="--pig:${o.pig};transform:translate(${x}px,${y}px) rotate(${rot}deg)">
    <div class="inner">
      <div class="top"><span>${o.no}</span><span class="cat">${emblemSvg(o.cat, 18)}</span></div>
      <div class="art ${o.guardian ? "g" : ""}">${artSvg}</div>
      <div class="body"><div class="name">${o.name}</div><div class="sp">${o.species}</div>${o.elder ? `<span class="tag">Elder voice</span>` : ""}</div>
    </div></div>`;
}

function poster(w: number, h: number, compact: boolean) {
  const cards = [
    miniCard({ name: "The Wingmaster", species: "Guardian of Birds", no: "No. 008", cat: "birds", id: "birds-guardian", guardian: true, elder: true, pig: "#7e9db5" }, -9, 0, 26),
    miniCard({ name: "King Mango", species: "Mango", no: "No. 044", cat: "fruits-vegetables", id: "mango-fruit", pig: "#d2a55a" }, 7, 190, 40),
    miniCard({ name: "Granny Neem", species: "Neem tree", no: "No. 002", cat: "trees", id: "neem-tree", elder: true, pig: "#7fa27a" }, -1.5, 92, 0),
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}
  * { box-sizing: border-box; margin: 0; }
  body { width: ${w}px; height: ${h}px; background: ${PAPER}; color: ${INK}; font-family: Atkinson, sans-serif; overflow: hidden; position: relative; }
  body::before { content: ""; position: absolute; inset: 0; background-image: ${grain}; opacity: .7; mix-blend-mode: multiply; }
  .wrap { position: absolute; inset: 0; display: grid; grid-template-columns: ${compact ? "1fr 400px" : "1fr 470px"}; align-items: center; padding: 0 ${compact ? 56 : 80}px; gap: 20px; }
  .brand { display: grid; gap: ${compact ? 14 : 22}px; }
  .row { display: flex; align-items: center; gap: 16px; color: ${MOSS}; }
  h1 { font-family: "EB Garamond", serif; font-weight: 600; font-size: ${compact ? 74 : 96}px; line-height: .95; letter-spacing: -0.025em; color: ${INK}; }
  h1 i { font-weight: 450; font-size: .78em; }
  p { font-family: "EB Garamond", serif; font-style: italic; font-size: ${compact ? 27 : 34}px; line-height: 1.2; color: #444c46; max-width: 15em; }
  .meta { font-size: ${compact ? 17 : 20}px; font-weight: 700; color: ${MOSS}; letter-spacing: .01em; }
  .stack { position: relative; margin-top: ${compact ? 40 : 60}px; height: ${compact ? 380 : 470}px; transform: scale(${compact ? 0.78 : 0.95}); transform-origin: 0 50%; }
  .card { position: absolute; width: 260px; padding: 5px; border-radius: 14px; background: #e6e1d2; box-shadow: 0 30px 50px -30px rgba(32,36,24,.6); }
  .card.elder { background: linear-gradient(135deg,#c9a03c,#f0d98f 38%,#a77d1f 62%,#f0d98f 86%,#c9a03c); }
  .inner { background: #f8f6ef; border-radius: 9px; border: 1px solid #cdc6b2; overflow: hidden; }
  .top { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px 6px; font-size: 13px; font-weight: 700; color: #444c46; }
  .cat svg { color: #444c46; }
  .art { margin: 0 8px; border-radius: 7px; overflow: hidden; aspect-ratio: 240/150; background: ${PAPER}; border: 1px solid #cdc6b2; color: ${INK}; display: grid; place-items: center; }
  .art.g { background: radial-gradient(circle at 50% 55%, color-mix(in srgb, var(--pig) 28%, ${PAPER}), ${PAPER} 70%); }
  .art .motif { width: 100%; height: 100%; }
  .art .sigil { width: 60%; height: auto; }
  .motif .wash { fill: var(--pig); opacity: .32; }
  .motif .lines .ink-2 { opacity: .55; }
  .motif .lines .dot, .motif .lines .seed { fill: currentColor; stroke: none; }
  .motif .lines .hole { fill: ${PAPER}; stroke: currentColor; }
  .body { padding: 10px 14px 14px; }
  .name { font-family: "EB Garamond", serif; font-weight: 600; font-size: 30px; line-height: 1; letter-spacing: -.01em; }
  .sp { font-family: "EB Garamond", serif; font-style: italic; font-size: 17px; color: #444c46; margin-top: 2px; }
  .tag { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 99px; border: 1px solid #7d5e10; color: #7d5e10; background: #f2e7c6; }
  </style></head><body><div class="wrap">
    <div class="brand">
      <div class="row"><svg viewBox="0 0 48 48" width="${compact ? 46 : 58}" height="${compact ? 46 : 58}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${MARK_PATHS}</svg></div>
      <h1>Voices <i>of the</i><br/>Wild</h1>
      <p>Everything outside has something to say. Go find out what.</p>
      <div class="meta">On-device with EmbeddingGemma 2. Works offline.</div>
    </div>
    <div class="stack">${cards.join("")}</div>
  </div></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(html: string, w: number, h: number, out: string) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: false });
  console.log("wrote", out);
}

const bare = (svg: string, size: number) => `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('width="', `style="display:block" width="`).replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`;

await shot(bare(markOn(192, 0.78, MOSS, PAPER, 0), 192), 192, 192, join(pub, "icons", "icon-192.png"));
await shot(bare(markOn(512, 0.78, MOSS, PAPER, 0), 512), 512, 512, join(pub, "icons", "icon-512.png"));
await shot(bare(markOn(512, 0.6, MOSS, PAPER, 0), 512), 512, 512, join(pub, "icons", "icon-maskable-512.png"));
await shot(bare(markOn(180, 0.74, MOSS, PAPER, 0), 180), 180, 180, join(pub, "icons", "apple-touch-icon.png"));
await shot(bare(markOn(32, 0.86, MOSS, PAPER, 7), 32), 32, 32, join(pub, "icons", "favicon-32.png"));
await shot(poster(1200, 630, false), 1200, 630, join(pub, "og-image.png"));
await shot(poster(1000, 420, true), 1000, 420, join(app, "screenshots", "cover-1000x420.png"));
await browser.close();

// favicon.ico: a single 32×32 PNG wrapped in an ICO container.
const png = readFileSync(join(pub, "icons", "favicon-32.png"));
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9);
ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
writeFileSync(join(pub, "favicon.ico"), Buffer.concat([ico, png]));
console.log("wrote favicon.ico");
