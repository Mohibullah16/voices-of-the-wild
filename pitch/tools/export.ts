// Exports the deck: slides/NN-name.png (1920x1080 each) and Voices-of-the-Wild.pdf
// (one 1920x1080 page per slide), and reports layout problems per slide:
// elements spilling outside the slide, clipped text, and images that failed to load.
//
// Run from week-1/:   app/node_modules/.bin/tsx pitch/tools/export.ts
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pitch = join(here, "..");
const appRequire = createRequire(join(pitch, "..", "app", "package.json"));
const { chromium } = appRequire("playwright") as typeof import("playwright");

const url = pathToFileURL(join(pitch, "index.html")).href + "?print";
const outDir = join(pitch, "slides");
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".png")) rmSync(join(outDir, f));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

const problems = await page.evaluate(() => {
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>(".slide").forEach((s, i) => {
    const sr = s.getBoundingClientRect();
    s.querySelectorAll<HTMLElement>("*").forEach((el) => {
      if (el.closest("aside.notes, svg") && el.tagName.toLowerCase() !== "svg") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const tilted = el.closest(".tilt");
      const slack = tilted ? 40 : 1;
      if (r.right > sr.right + slack || r.bottom > sr.bottom + slack || r.left < sr.left - slack || r.top < sr.top - slack) {
        out.push(`slide ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className && typeof el.className === "string" ? el.className : ""}"> outside slide (${Math.round(r.left - sr.left)},${Math.round(r.top - sr.top)} ${Math.round(r.width)}x${Math.round(r.height)})`);
      }
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && cs.overflow !== "visible" && !el.matches(".card-art, .slide, .phone, .track")) out.push(`slide ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> clips text horizontally`);
    });
    // Content must stay clear of the footer band.
    const foot = s.querySelector(".foot")?.getBoundingClientRect();
    if (foot) {
      s.querySelectorAll<HTMLElement>("[data-r]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom > foot.top - 8 && r.top < foot.top) out.push(`slide ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> runs into the footer (bottom ${Math.round(r.bottom - sr.top)})`);
      });
    }
    s.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) out.push(`slide ${i + 1}: image failed to load: ${img.getAttribute("src")}`);
    });
  });
  return out;
});

const slides = await page.$$(".slide");
for (let i = 0; i < slides.length; i++) {
  const cls = (await slides[i]!.getAttribute("class")) ?? "";
  const name = (cls.match(/\bs-([\w-]+)/)?.[1]) ?? "slide";
  const file = join(outDir, `${String(i + 1).padStart(2, "0")}-${name}.png`);
  await slides[i]!.screenshot({ path: file });
}
console.log(`wrote ${slides.length} PNGs to slides/`);

// The paper grain uses mix-blend-mode, which forces Chromium to rasterise every
// PDF page (about 20 MB). The PNGs keep it; the PDF gets crisp vector text instead.
await page.addStyleTag({ content: ".slide::before { display: none !important; }" });
await page.pdf({ path: join(pitch, "Voices-of-the-Wild.pdf"), width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
console.log("wrote Voices-of-the-Wild.pdf");
await browser.close();

if (problems.length) {
  console.log(`\n${problems.length} layout problem(s):`);
  for (const p of problems) console.log("  " + p);
} else console.log("layout check: no overflow, no clipped text, all images loaded");
