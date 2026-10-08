// Records the quest chain for the showcase video's "trail" slot (showcase/footage/trail.mp4):
// today's trail → meet something (mock embedder, real voice) → XP pop-up → "Next: Walk 500 steps" →
// the step counter (a few real motion-sensor steps, then fast-forwarded) → walk done → next quest unlocked.
//   BASE=http://localhost:5173 npx tsx tools/record-trail-footage.ts
import { chromium, type Page } from "playwright";
import { mkdirSync, rmSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = join(here, "..", "..", "showcase", "footage", "trail.mp4");
const tmp = join(tmpdir(), "votw-trail-footage");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const photo = (id: string) => join(here, "..", "..", "pipeline", "calibration", "photos", id, "1.jpg");

const dismiss = async (page: Page) => {
  for (let k = 0; k < 6 && (await page.locator("dialog.moment[open]").count()); k++) await page.locator("dialog.moment[open] .btn-primary").click();
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  permissions: ["accelerometer", "gyroscope"], recordVideo: { dir: tmp, size: { width: 780, height: 1688 } }, // frames hold the 390×844 viewport top-left; cropped below,
});
const page = await ctx.newPage();
const born = Date.now();
await page.goto(`${BASE}/?mock`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Next/ }).click();
await page.getByRole("button", { name: /Next/ }).click();
await page.getByRole("button", { name: /Get the field kit/ }).click();
await page.waitForSelector("#ready-title", { timeout: 90000 });
await page.getByRole("button", { name: /Start the trail/ }).click();
await page.waitForSelector("#listen-title");
// Badges this footage would unlock open modals; mark them earned so the chain stays in view.
await page.evaluate(() => { const w = (window as any).__votw; for (const id of ["first-voice", "wanderer", "touched-grass"]) w.state.game.badges[id] = new Date().toISOString(); w.update(); });
await page.waitForTimeout(1200);
const start = (Date.now() - born) / 1000;

await page.waitForTimeout(1600); // the trail: 0/3, first quest "now"
await page.evaluate(() => (window as any).__votw.setMockPlan({ kind: "species", owner: "auto-rickshaw" }));
await page.setInputFiles("#cam-input", photo("auto-rickshaw"));
await page.waitForSelector("#enc-name", { timeout: 15000 });
await page.waitForTimeout(3600); // card, voice, XP pop-up
await dismiss(page);
await page.getByRole("button", { name: /Next: Walk/ }).click();
await page.waitForTimeout(1300); // the goodbye line starts
await dismiss(page);
await page.getByRole("button", { name: "Skip" }).click({ timeout: 3000 }).catch(() => {});
await page.waitForSelector("#walk-title");
// A few real steps through the motion sensor path…
await page.evaluate(() => new Promise<void>((done) => {
  const t0 = performance.now();
  const id = setInterval(() => {
    const t = performance.now() - t0;
    const bounce = 4 * Math.max(0, Math.sin(2 * Math.PI * 2 * t / 1000)) ** 2;
    window.dispatchEvent(new DeviceMotionEvent("devicemotion", { accelerationIncludingGravity: { x: 0.3, y: 9.81 + bounce, z: 0.4 }, interval: 20 }));
    if (t > 1800) { clearInterval(id); done(); }
  }, 20);
}));
// …then the rest of the 500, fast-forwarded.
await page.evaluate(() => new Promise<void>((done) => {
  const id = setInterval(() => {
    const w = (window as any).__votw;
    if (w.state.listen.kind !== "walk" || w.state.listen.done) { clearInterval(id); done(); return; }
    w.walkSteps(6);
  }, 45);
}));
await page.waitForTimeout(3200); // walk done + XP pop-up
await dismiss(page);
await page.getByRole("button", { name: "Trail" }).click();
await page.waitForTimeout(2600); // 2/3, "Touch grass" unlocked
const end = (Date.now() - born) / 1000;
await ctx.close();
await browser.close();

const webm = join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm"))!);
mkdirSync(dirname(OUT), { recursive: true });
const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", start.toFixed(2), "-to", end.toFixed(2), "-i", webm, "-vf", "crop=390:844:0:0,scale=780:1688:flags=lanczos", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-an", "-movflags", "+faststart", OUT], { stdio: "inherit" });
if (r.status !== 0) process.exit(1);
console.log(`Wrote ${OUT} (${(end - start).toFixed(1)} s)`);
