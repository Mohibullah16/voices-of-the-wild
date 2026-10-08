// Real end-to-end acceptance test against a production build (npm run build && npm run preview):
// 1. first-run setup downloads the real EmbeddingGemma 2 weights (once, ~316 MB)
// 2. the browser goes OFFLINE and the page is reloaded
// 3. real outdoor photos are matched on-device; any network attempt is reported
//   BASE=http://localhost:4173 npx tsx tools/e2e-real.ts
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:4173";
const photos = join(here, "..", "..", "pipeline", "calibration", "photos");
const profile = process.env.PROFILE ?? join(process.env.TEMP ?? "/tmp", "votw-e2e-profile");
mkdirSync(profile, { recursive: true });
const shots = join(here, "..", "screenshots");

const ctx = await chromium.launchPersistentContext(profile, {
  headless: process.env.HEADED !== "1",
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  args: ["--enable-unsafe-webgpu", "--autoplay-policy=no-user-gesture-required"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`[console.${m.type()}] ${m.text().slice(0, 240)}`); });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
page.on("worker", (w) => {
  console.log("[worker started]", w.url());
  w.on("console", (m) => console.log("[worker]", m.text().slice(0, 240)));
  w.on("close", () => console.log("[worker closed]", w.url()));
});

let offline = false;
const leaks: string[] = [];
ctx.on("requestfailed", (r) => { if (offline) leaks.push(`FAILED ${r.url()}`); });
ctx.on("request", (r) => {
  if (!offline) return;
  const u = r.url();
  if (u.startsWith("data:") || u.startsWith("blob:")) return;
  if (!u.startsWith(BASE)) leaks.push(`OFF-ORIGIN ${u}`);
});

const t0 = Date.now();
await page.goto(`${BASE}/${process.env.QS ?? ""}`, { waitUntil: "load" });
// Start clean of any previous build's service worker (the model cache is kept).
await page.evaluate(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) if (k.startsWith("workbox")) await caches.delete(k); });
await page.goto(`${BASE}/${process.env.QS ?? ""}`, { waitUntil: "load" });
console.log("crossOriginIsolated:", await page.evaluate(() => self.crossOriginIsolated));
const setupDone = await page.waitForSelector("#setup-title, #listen-title", { timeout: 60000 });
if ((await setupDone.getAttribute("id")) === "setup-title") {
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForFunction(() => !document.body.textContent?.includes("checking…"), null, { timeout: 30000 });
  console.log("setup checks:", ((await page.locator(".checks").textContent()) ?? "").replace(/\s+/g, " "));
  const tStart = Date.now();
  await page.getByRole("button", { name: /Start the trail/ }).click();
  await page.waitForSelector("#listen-title", { timeout: 30000 });
  console.log(`app usable ${((Date.now() - tStart) / 1000).toFixed(1)}s after Start (the field kit keeps downloading in the background)`);
  const timer = setInterval(async () => {
    const chip = await page.locator(".kit-chip").innerText().catch(() => "");
    if (chip) console.log(`  ${Math.round((Date.now() - tStart) / 1000)}s | ${chip.replace(/\s*\n\s*/g, " / ")}`);
  }, 15000);
  await page.waitForFunction(() => !document.querySelector(".kit-chip") || document.querySelector(".banner-caution"), null, { timeout: 30 * 60 * 1000, polling: 1000 });
  clearInterval(timer);
  if (await page.locator(".banner-caution").count()) {
    console.log("KIT ERROR:", await page.locator(".banner-caution").innerText());
    await page.screenshot({ path: join(shots, "real-setup-error.png") });
    await ctx.close();
    process.exit(1);
  }
  console.log(`field kit on the phone ${Math.round((Date.now() - tStart) / 1000)}s after Start`);
}

// ---- airplane mode -------------------------------------------------------
// After a redeploy the app fetches the new field data once (online); wait for it.
await page.waitForFunction(async () => {
  for (const k of await caches.keys()) if (k.startsWith("votw-data-") && (await (await caches.open(k)).keys()).length >= 3) return true;
  return false;
}, null, { timeout: 120000, polling: 1000 });
// A returning visitor skips setup: make sure this deploy's service worker controls the page first.
await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 120000, polling: 500 });
await page.waitForTimeout(1500);
offline = true;
await ctx.setOffline(true);
await page.goto(`${BASE}/?debug${process.env.QS ? "&" + process.env.QS.replace("?", "") : ""}#/`, { waitUntil: "load" });
await page.waitForSelector("#listen-title", { timeout: 60000 });
console.log("reloaded OFFLINE, app shell served by the service worker");

const tests = (process.env.PHOTOS ?? "neem-tree,house-crow,auto-rickshaw,sunset,street-dog,mango-fruit,bougainvillea,pebbles").split(",");
const results: string[] = [];
for (const id of tests) {
  const [sp, n] = id.split("/");
  const file = /^([A-Za-z]:|\/)/.test(id) ? id : join(photos, sp!, `${n ?? 1}.jpg`);
  if (!existsSync(file)) continue;
  const t = Date.now();
  await page.setInputFiles("#cam-input", file);
  await page.waitForSelector(".stirring", { timeout: 10000 }).catch(() => {}); // the previous result must go first
  const ok = await page.waitForSelector("#enc-name, #listen-error", { timeout: 300000 }).catch(() => null);
  if (!ok || (await page.locator("#listen-error").count())) {
    console.log(`${id}: NO ENCOUNTER. Screen says: ${(await page.locator("main").innerText().catch(() => "")).replace(/\n+/g, " / ").slice(0, 400)}`);
    await page.screenshot({ path: join(shots, "real-offline-failure.png") });
    break;
  }
  await page.waitForTimeout(400);
  const name = await page.locator("#enc-name").innerText();
  const outcome = (await page.locator(".debug dd").first().textContent().catch(() => "?")) ?? "?";
  const embed = (await page.locator(".debug dd").nth(1).textContent().catch(() => "?")) ?? "?";
  const top = (await page.locator(".debug tbody tr").allTextContents().catch(() => [] as string[])).map((r) => r.replace(/\s+/g, " ").trim());
  const line = `${id.padEnd(16)} → ${name} [${outcome}] (${embed}; wall ${((Date.now() - t) / 1000).toFixed(1)}s) top: ${top.slice(0, 3).map((r) => r.replace(/\t/g, " ")).join(" | ")}`;
  console.log(line);
  results.push(line);
  if (id === tests[0]) await page.screenshot({ path: join(shots, "real-offline-encounter.png") });
}
// ---- the "No camera? Try one" samples: real pipeline, no XP -------------
if (process.env.SAMPLES !== "0") {
  await page.goto(`${BASE}/?debug&samples${process.env.QS ? "&" + process.env.QS.replace("?", "") : ""}#/`, { waitUntil: "load" });
  await page.waitForSelector("button.sample", { timeout: 30000 }).catch(async (e) => {
    await page.screenshot({ path: join(shots, "real-sample-failure.png"), fullPage: true });
    console.log("NO SAMPLES:", await page.evaluate(async () => { const r = await fetch("/samples/samples.json").then((x) => x.status + " " + x.headers.get("content-type")).catch((e) => String(e)); return r + " | " + (await caches.keys()).join(","); }));
    throw e;
  });
  const n = Math.min(Number(process.env.SAMPLE_LIMIT ?? 99), await page.locator("button.sample").count());
  for (let i = 0; i < n; i++) {
    if (!(await page.locator("button.sample").count())) {
      await page.goto(`${BASE}/?debug&sample=${i}${process.env.QS ? "&" + process.env.QS.replace("?", "") : ""}#/`, { waitUntil: "load" });
      await page.waitForSelector("button.sample");
    }
    const label = (await page.locator("button.sample").nth(i).textContent())?.trim();
    await page.locator("button.sample").nth(i).click();
    await page.waitForSelector(".stirring", { timeout: 10000 }).catch(() => {});
    await page.waitForSelector("#enc-name", { timeout: 900000 });
    await page.waitForTimeout(300);
    const name = await page.locator("#enc-name").innerText();
    const outcome = (await page.locator(".debug dd").first().textContent()) ?? "?";
    const noXp = (await page.locator(".reward-strip").textContent().catch(() => ""))?.includes("No XP") || outcome.startsWith("nobody");
    const top = (await page.locator(".debug tbody tr").allTextContents().catch(() => [] as string[])).slice(0, 3).map((r) => r.replace(/\s+/g, " ").trim());
    const embed = ((await page.locator(".debug dd").nth(1).textContent()) ?? "").trim();
    console.log(`sample ${label?.padEnd(14)} → ${name} [${outcome}] ${noXp ? "no XP (ok)" : "XP AWARDED (bug)"} (${embed}) top: ${top.join(" | ")}`);
    if (i === 0) await page.screenshot({ path: join(shots, "real-offline-sample.png") });
  }
}
console.log(`\nnetwork attempts while offline: ${leaks.length}`);
for (const l of leaks.slice(0, 20)) console.log("  ", l);
await ctx.close();
