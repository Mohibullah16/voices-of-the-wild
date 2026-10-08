// Records one continuous, unscripted session of the production build in headed Chromium
// (real EmbeddingGemma 2 on WebGPU, real voice files, real offline mode) and logs everything
// the editor needs: every screen frame with its timestamp (CDP screencast), when each voice
// line starts and stops (hooked <audio> events), named markers and measured timings.
//   BASE=http://localhost:4180 npx tsx record.ts
// Output: work/session.json, work/frames/*.jpg, work/share-card.png
import { chromium, type Page } from "playwright";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:4180";
const plan = JSON.parse(readFileSync(join(here, "plan.json"), "utf8")) as {
  viewfinder: string;
  encounters: Array<{ tag: string; photo: string; expect?: string }>;
  detail: string;
};
const photosDir = join(here, "..", "pipeline", "calibration", "photos");
const photo = (id: string) => { const [sp, n] = id.split("/"); return join(photosDir, sp!, `${n ?? 1}.jpg`); };
const work = join(here, "work");
const framesDir = join(work, "frames");
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

// A fresh browser profile every take: onboarding and the field-kit download are real.
const profile = join(process.env.TEMP ?? "/tmp", "votw-demo-rec-profile");
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

// Chromium's fake camera plays the viewfinder photo (a real calibration photo) with a slight
// hand-held drift. The app grabs a frame from it exactly as it would from a phone camera.
const cam = join(work, "camera.y4m");
{
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-i", photo(plan.viewfinder), "-t", "4", "-r", "30",
    "-vf", "scale=660:880:force_original_aspect_ratio=increase,crop=660:880,crop=600:800:30+22*sin(2*PI*t/4):40+16*sin(2*PI*t/4+1),format=yuv420p",
    "-f", "yuv4mpegpipe", cam], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg could not make the camera file");
}

const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: "light",
  permissions: ["camera"],
  acceptDownloads: true,
  args: [
    "--enable-unsafe-webgpu", "--autoplay-policy=no-user-gesture-required", "--mute-audio",
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${cam}`,
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
  ],
});

// Audio log + no OS share sheet (the app then takes its own download path, as on desktop).
await ctx.addInitScript(() => {
  const seen = new WeakSet<HTMLMediaElement>();
  const log = (ev: string, el: HTMLMediaElement) =>
    console.log("__AUDIO__" + JSON.stringify({ ev, src: el.currentSrc || el.src, t: Date.now(), ct: el.currentTime, dur: el.duration }));
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!seen.has(this)) {
      seen.add(this);
      for (const ev of ["playing", "pause", "ended", "emptied", "error"]) this.addEventListener(ev, () => log(ev, this));
    }
    return orig.call(this);
  };
  try { delete (Navigator.prototype as unknown as { canShare?: unknown }).canShare; } catch { /* ignore */ }
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
const audio: Array<{ ev: string; src: string; t: number; ct: number; dur: number }> = [];
page.on("console", (m) => {
  const s = m.text();
  if (s.startsWith("__AUDIO__")) { const a = JSON.parse(s.slice(9)); if (!a.src.startsWith("data:")) audio.push(a); }
  else if (m.type() === "error") console.log("[console.error]", s.slice(0, 200));
});
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

// ---- frames -----------------------------------------------------------------------
const frames: Array<{ f: string; t: number }> = [];
let sparse = false;
let lastKept = 0;
let n = 0;
const cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", (f) => {
  void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  const t = f.metadata.timestamp ? f.metadata.timestamp * 1000 : Date.now();
  if (sparse && t - lastKept < 200) return;
  lastKept = t;
  const name = `${String(n++).padStart(6, "0")}.jpg`;
  writeFileSync(join(framesDir, name), Buffer.from(f.data, "base64"));
  frames.push({ f: name, t });
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });

const markers: Array<{ name: string; t: number }> = [];
const mark = (name: string) => { const t = Date.now(); markers.push({ name, t }); console.log(`${((t - markers[0]!.t) / 1000).toFixed(1).padStart(6)}s  ${name}`); return t; };
const measured: Record<string, unknown> = {};
const wait = (ms: number) => page.waitForTimeout(ms);
const tap = async (p: Page, name: RegExp | string) => p.getByRole("button", { name }).first().tap();

const voiceEnded = () => page.waitForSelector("section.encounter voice-line .voice-play[aria-label^='Replay']", { timeout: 60000 });
async function drainMoments(tag: string, dwell = 1800) {
  for (let i = 0; i < 8; i++) {
    const d = await page.waitForSelector("dialog.moment[open]", { timeout: 2500 }).catch(() => null);
    if (!d) return;
    const kicker = (await page.locator("dialog.moment[open] .moment-kicker").textContent()) ?? "";
    const title = (await page.locator("dialog.moment[open] .moment-title").textContent()) ?? "";
    mark(`${tag}-moment:${kicker}:${title}`);
    await wait(dwell);
    await page.locator("dialog.moment[open] .btn-primary").tap();
    await wait(350);
  }
}

async function encounter(tag: string, file: string, trigger: () => Promise<void>) {
  const tTap = mark(`${tag}-tap`);
  await trigger();
  await page.waitForSelector(".stirring", { timeout: 15000 });
  const tStir = mark(`${tag}-stir`);
  await page.waitForSelector("#enc-name", { timeout: 300000 });
  const tCard = mark(`${tag}-card`);
  const name = await page.locator("#enc-name").innerText();
  const chip = await page.locator(".chip-note").count();
  const caution = await page.locator(".banner-caution").count();
  const xp = (await page.locator(".reward-strip").innerText().catch(() => "")).replace(/\s+/g, " ");
  measured[tag] = { file, name, guardian: chip > 0, caution: caution > 0, xp, stirToCardMs: tCard - tStir, tapToCardMs: tCard - tTap };
  console.log(`   ${tag}: ${name}${chip ? " (guardian hint)" : ""}${caution ? " (caution)" : ""} | stir→card ${((tCard - tStir) / 1000).toFixed(1)} s | ${xp}`);
  // Taller cards (guardian chip, caution banner) push the caption under the tab bar: scroll it into view, as a thumb would.
  await wait(1400);
  const scrolled = await page.evaluate(() => {
    const v = document.querySelector("section.encounter voice-line .caption");
    if (!v) return false;
    const over = v.getBoundingClientRect().bottom - (window.innerHeight - 84);
    if (over > 0) window.scrollBy({ top: over, behavior: "smooth" });
    return over > 0;
  });
  if (scrolled) mark(`${tag}-scroll`);
  await voiceEnded();
  mark(`${tag}-voice-end`);
  await drainMoments(tag);
  await wait(600);
}

const viaListen = (file: string, button: RegExp) => async () => {
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), tap(page, button)]);
  await fc.setFiles(file);
};

// ---- 1. onboarding and the field kit ---------------------------------------------
mark("start");
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForSelector("#setup-title", { timeout: 60000 });
await wait(1200);
mark("onboard-1");
await wait(1500);
await tap(page, /Next/);
mark("onboard-2");
await wait(2200);
await tap(page, /Next/);
mark("onboard-3");
await page.waitForFunction(() => /\d+ MB/.test(document.querySelector(".btn-row .small")?.textContent ?? ""), null, { timeout: 30000 });
measured.downloadEstimate = await page.locator(".btn-row .small").innerText();
await wait(2200);
await tap(page, /Get the field kit/);
mark("download");
await wait(3000);
sparse = true;
await page.waitForSelector("#ready-title, #setup-error", { timeout: 30 * 60_000 });
sparse = false;
if (await page.locator("#setup-error").count()) throw new Error(await page.locator(".error-box").innerText());
mark("ready");
measured.ready = (await page.locator(".checks").innerText()).replace(/\n/g, " | ");
measured.downloadMs = markers.at(-1)!.t - markers.find((m) => m.name === "download")!.t;
console.log("   ready:", measured.ready);
await wait(2600);

// ---- 2. airplane mode -----------------------------------------------------------
await page.waitForFunction(async () => {
  if (!(await navigator.serviceWorker.getRegistration())?.active) return false;
  for (const k of await caches.keys()) if (k.startsWith("votw-data-") && (await (await caches.open(k)).keys()).length >= 3) return true;
  return false;
}, null, { timeout: 120000, polling: 500 });
mark("pre-offline");
await wait(600);
const leaks: string[] = [];
ctx.on("request", (r) => { const u = r.url(); if (!u.startsWith("data:") && !u.startsWith("blob:") && !u.startsWith(BASE)) leaks.push(u); });
ctx.on("requestfailed", (r) => leaks.push(`FAILED ${r.url()}`));
await ctx.setOffline(true);
mark("offline");
await wait(1800);
await tap(page, /Start the trail/);
await page.waitForSelector("#listen-title");
mark("home-1");
await wait(1500);
mark("reload");
await page.reload({ waitUntil: "load" });
await page.waitForSelector("#listen-title", { timeout: 60000 });
mark("home-2");
measured.offlineChip = await page.locator(".top-status").innerText().catch(() => "");
await wait(7000); // the model wakes from cache in the background (cut in the edit)

// ---- 3. home ----------------------------------------------------------------------
mark("home");
await wait(2600);
await page.evaluate(() => { const c = document.querySelector(".compass"); if (c) window.scrollTo({ top: c.getBoundingClientRect().top + window.scrollY - 360, behavior: "smooth" }); });
mark("compass");
await wait(2600);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await wait(1200);

// ---- 4. the money moment: viewfinder → Elder ----------------------------------------
mark("vf-tap");
await tap(page, /Viewfinder/);
await page.waitForFunction(() => { const v = document.getElementById("vf-video") as HTMLVideoElement | null; return !!v && v.videoWidth > 0; }, null, { timeout: 15000 });
mark("vf");
await wait(2000);
await encounter("enc1", `viewfinder:${plan.viewfinder}`, async () => { await page.getByRole("button", { name: "Take the photo" }).tap(); });

// ---- 5. more encounters -----------------------------------------------------------
for (const e of plan.encounters) {
  const guardianBefore = (await page.locator(".chip-note").count()) > 0;
  await encounter(e.tag, e.photo, viaListen(photo(e.photo), guardianBefore ? /Closer/ : /Again/));
}

// ---- 6. walk on, pocket, field guide, share, badges ----------------------------------
mark("walkon");
await tap(page, /Walk on/);
await page.waitForSelector("#pocket-title", { timeout: 30000 });
mark("pocket");
await wait(2600);
await page.locator(".tabbar a[href='#/guide']").tap();
await page.waitForSelector("#guide-title");
mark("guide");
await wait(2200);
await page.evaluate(() => window.scrollTo({ top: 260, behavior: "smooth" }));
await wait(1400);
const tile = page.locator(`a[href='#/guide/${plan.detail}']`).first();
if (await tile.count()) await tile.tap();
else await page.evaluate((id) => (location.hash = `#/guide/${id}`), plan.detail);
await page.waitForSelector("#detail-title");
mark("detail");
await wait(1800);
const shareBtn = page.locator(".detail .btn-row .btn").first();
await shareBtn.scrollIntoViewIfNeeded();
await wait(700);
const [dl] = await Promise.all([page.waitForEvent("download"), shareBtn.tap()]);
mark("share");
await dl.saveAs(join(work, "share-card.png"));
await wait(2200);
await page.locator(".tabbar a[href='#/badges']").tap();
await page.waitForSelector("#badges-title");
mark("badges");
await wait(3000);
mark("end");

await cdp.send("Page.stopScreencast").catch(() => {});
measured.offlineNetworkAttempts = leaks;
writeFileSync(join(work, "session.json"), JSON.stringify({ base: BASE, plan, markers, audio, frames, measured, recordedAt: new Date().toISOString() }, null, 1));
console.log(`frames: ${frames.length}, audio events: ${audio.length}, offline network attempts: ${leaks.length}`);
await ctx.close();
