// A simulated walk through the LIVE app, for the post: real Wikimedia photos (credited in
// pipeline/calibration/ATTRIBUTION.md) answer today's quest chain; the real step counter is fed a simulated
// walking signal. Everything else is real: cloud matching, voices, XP, timings. The footage is labelled
// "Simulated walk" on screen. Rankings are switched off first, so the run never reaches the public board.
//   npx tsx tools/walk-sim.ts            → submission/walk-sim/{NN-*.png, walk-sim.mp4, numbers.json}
import { chromium, type Page } from "playwright";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE ?? "https://voices-of-the-wild.netlify.app";
const root = join(import.meta.dirname, "..", "..");
const out = join(root, "submission", "walk-sim");
const photos = join(root, "pipeline", "calibration", "photos");
const tmp = join(tmpdir(), "votw-walk-sim");
// VIDEO_ONLY=1: no screenshots (each one glitches a frame of the recording); only rewrites walk-sim.mp4.
const VIDEO_ONLY = process.env.VIDEO_ONLY === "1";
if (!VIDEO_ONLY) rmSync(out, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });

const roster = JSON.parse(readFileSync(join(root, "app", "public", "data", "roster.runtime.json"), "utf8"));
const categoryOf = new Map<string, string>();
for (const c of roster.categories) for (const o of c.characters) categoryOf.set(o.id, c.id);
const available = readdirSync(photos).filter((d) => categoryOf.has(d));
// Photos the live matcher names correctly (from earlier checks), preferred for each kind.
const PREFER = ["auto-rickshaw", "motorcycle", "lawn-grass", "neem-tree", "house-crow", "bougainvillea", "street-dog", "mango-fruit", "sunset", "zebra-crossing", "tea-stall", "park-bench", "frere-hall", "sea-waves", "pebbles", "cumulus-clouds"];

const numbers: Record<string, unknown>[] = [];
let shotN = 0;
const shot = async (page: Page, name: string) => { if (!VIDEO_ONLY) await page.screenshot({ path: join(out, `${String(++shotN).padStart(2, "0")}-${name}.png`) }); };
const negative = join(photos, "_negative", "1.jpg");
/** An indoor photo: nobody answers, and the near-miss hint says what it half-saw. */
const miss = async (page: Page, name: string) => {
  await page.setInputFiles("#cam-input", negative);
  await page.waitForSelector(".nobody #enc-name, .encounter #enc-name", { timeout: 90000 });
  const nobody = await page.locator(".nobody").count();
  console.log(nobody ? `miss: ${await page.locator(".nobody .lede").innerText()}` : "WARNING: the indoor photo matched something");
  await page.waitForTimeout(3200);
  await shot(page, name);
};
const dismiss = async (page: Page) => {
  for (let k = 0; k < 8 && (await page.locator("dialog.moment[open]").count()); k++) {
    await shot(page, "moment");
    await page.locator("dialog.moment[open] .btn-primary").click();
    await page.waitForTimeout(400);
  }
};

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  permissions: ["accelerometer", "gyroscope"], recordVideo: { dir: tmp, size: { width: 780, height: 1688 } },
});
const page = await ctx.newPage();
const born = Date.now();
const at = () => (Date.now() - born) / 1000;
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));

// Label the footage itself.
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const b = document.createElement("div");
    b.textContent = "Simulated walk · photos: Wikimedia Commons";
    b.setAttribute("aria-hidden", "true");
    b.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(var(--header-h,60px) + 8px);z-index:2147483647;font:600 11px system-ui;padding:4px 10px;border-radius:999px;background:rgba(20,30,25,.78);color:#f6f1e6;pointer-events:none;letter-spacing:.02em";
    document.body.append(b);
  });
});

await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.getByRole("button", { name: "Skip", exact: true }).click();
await page.getByRole("button", { name: /Start the trail/ }).click();
await page.waitForSelector("#listen-title");
// Keep the simulation off the public board.
await page.evaluate(() => (location.hash = "#/about"));
await page.locator("#rankings-toggle").uncheck();
await page.evaluate(() => (location.hash = "#/"));
await page.waitForSelector("#listen-title");
await page.waitForFunction(() => !document.querySelector(".kit-chip"), null, { timeout: 120000 }).catch(() => {});
await page.waitForTimeout(1500);
const t0 = at();
await shot(page, "trail");

const used = new Set<string>();
const marks: { walk: [number, number][] } = { walk: [] };
// Find → walk → find → walk, then the extras: a miss, the board, fast-forward, a skip.
for (let step = 0; step < 4; step++) {
  const label = (await page.locator(".quest.now .quest-label").innerText().catch(() => "")).replace(/\s*now$/i, "").trim();
  if (!label) break;
  if (/^Walk/i.test(label)) {
    await page.getByRole("button", { name: /Start walking/ }).click();
    await page.waitForSelector("#walk-title");
    const w0 = at();
    const tw = Date.now();
    // A brisk walk: ~3.3 steps a second through the real detector.
    await page.evaluate(() => new Promise<void>((done) => {
      const t0 = performance.now();
      const id = setInterval(() => {
        const t = performance.now() - t0;
        const bounce = 4.2 * Math.max(0, Math.sin(2 * Math.PI * 3.3 * t / 1000)) ** 2;
        window.dispatchEvent(new DeviceMotionEvent("devicemotion", { accelerationIncludingGravity: { x: 0.3, y: 9.81 + bounce, z: 0.4 }, interval: 16 }));
        if (document.querySelector(".walk.bonus") || t > 600_000) { clearInterval(id); done(); }
      }, 16);
    }));
    const secs = (Date.now() - tw) / 1000;
    marks.walk.push([w0, at()]);
    await page.waitForTimeout(700);
    await shot(page, "walk-done");
    numbers.push({ quest: label, walkedSeconds: Math.round(secs), pop: (await page.locator(".xp-pop").last().innerText().catch(() => "")).replace(/\s+/g, " ") });
    await page.waitForTimeout(2800);
    await dismiss(page);
    await page.getByRole("button", { name: "Trail" }).click();
    await page.waitForSelector("#listen-title");
    await page.waitForTimeout(800);
    continue;
  }
  // A find quest: pick a photo of the right kind.
  const want = label.toLowerCase();
  const cat = /grass/.test(want) ? "plants" : roster.categories.find((c: { id: string; name: string }) => want.includes(c.name.toLowerCase().split(" ")[0]!.replace(/s$/, "")) || (c.id === "vehicles" && /vehicle/.test(want)) || (c.id === "trees" && /tree/.test(want)) || (c.id === "birds" && /bird/.test(want)) || (c.id === "flowers" && /flower/.test(want)) || (c.id === "sky" && /sky/.test(want)) || (c.id === "water" && /water/.test(want)) || (c.id === "ground" && /ground/.test(want)) || (c.id === "urban" && /street object/.test(want)) || (c.id === "structures" && /landmark/.test(want)) || (c.id === "animals" && /animal/.test(want)) || (c.id === "fruits-vegetables" && /fruit/.test(want)) || (c.id === "small-creatures" && /tiny/.test(want)))?.id;
  const pick = /grass/.test(want) ? "lawn-grass"
    : [...PREFER, ...available].find((id) => !used.has(id) && available.includes(id) && (cat ? categoryOf.get(id) === cat : true))!;
  used.add(pick);
  if (step === 0) await miss(page, "miss-first");
  const tp = Date.now();
  await page.setInputFiles("#cam-input", join(photos, pick, "1.jpg"));
  await page.waitForSelector(".stirring");
  await page.waitForTimeout(500);
  await shot(page, `stirring-${pick}`);
  await page.waitForSelector("#enc-name", { timeout: 90000 });
  const matchS = (Date.now() - tp) / 1000;
  await page.locator(".xp-pop").last().waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);
  await shot(page, `meet-${pick}`);
  const name = (await page.locator("#enc-name").innerText()).trim();
  const pop = (await page.locator(".xp-pop").last().innerText().catch(() => "")).replace(/\s+/g, " ");
  numbers.push({ quest: label, photo: `${pick}/1.jpg`, answered: name, secondsToAnswer: +matchS.toFixed(1), pop });
  console.log(`${label} → ${pick} → ${name} (${matchS.toFixed(1)} s) ${pop}`);
  // Let the voice play; a badge pop-up opens when it ends. Look at it for a second, then continue (as a person would).
  for (let w = 0; w < 40 && !(await page.locator("dialog.moment[open]").count()); w++) await page.waitForTimeout(250);
  await page.waitForTimeout(1200);
  await dismiss(page);
  const next = page.getByRole("button", { name: /^Next:/ });
  if (await next.count()) {
    await next.click();
    await page.waitForTimeout(1200);
    await dismiss(page);
    await page.getByRole("button", { name: "Skip", exact: true }).click({ timeout: 3000 }).catch(() => {});
    if (await page.locator("#vf-title").count()) await page.getByRole("button", { name: /Cancel/ }).click();
  } else {
    await page.getByRole("button", { name: /Trail/ }).first().click({ timeout: 2000 }).catch(() => {});
  }
  await page.waitForTimeout(800);
  if (!(await page.locator("#walk-title").count())) await page.evaluate(() => (location.hash = "#/"));
  if (await page.locator("#walk-title").count()) {
    // the walk view opened straight from "Next: Walk"; go back so the loop starts it uniformly
    await page.getByRole("button", { name: /Pause/ }).click();
  }
  await page.waitForSelector("#listen-title", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
}
await dismiss(page);
await page.evaluate(() => (location.hash = "#/"));
await page.waitForTimeout(3000);
await shot(page, "trail-progress");
await page.evaluate(() => (location.hash = "#/badges"));
await page.waitForTimeout(1500);
await shot(page, "badges");
// The anonymous leaderboard.
await page.locator(".board").scrollIntoViewIfNeeded().catch(() => {});
await page.waitForTimeout(3500);
await shot(page, "board");
// Fast-forward to tomorrow's trail (two taps), then a miss and a skip on it.
await page.evaluate(() => (location.hash = "#/"));
await page.waitForSelector("#listen-title");
await page.waitForTimeout(1200);
await page.locator(".trail-tools").scrollIntoViewIfNeeded().catch(() => {});
await page.getByRole("button", { name: /Fast-forward a day/ }).click();
await page.waitForTimeout(1500);
await shot(page, "ff-armed");
await page.getByRole("button", { name: /Confirm: start tomorrow/ }).click();
await page.waitForTimeout(2500);
await shot(page, "ff-trail");
await miss(page, "miss-ff");
await page.getByRole("button", { name: /Skip quest/ }).click();
await page.waitForSelector("#listen-title");
await page.waitForTimeout(3500);
await shot(page, "skipped");
const end = at(); // the video ends on tomorrow's trail, first quest skipped
const summary = await page.evaluate(() => ({ xp: document.querySelector(".rank-card .num")?.textContent?.trim(), rank: document.querySelector("#badges-title")?.textContent?.trim() }));
await ctx.close();
await browser.close();

if (!VIDEO_ONLY) writeFileSync(join(out, "numbers.json"), JSON.stringify({ site: BASE, ranAt: new Date().toISOString(), quests: numbers, end: summary, note: "Simulated walk: Wikimedia Commons photos (see pipeline/calibration/ATTRIBUTION.md); steps from a simulated walking signal through the real step detector." }, null, 2));

// Video: crop the viewport out of Playwright's padded frame; walks run 12x (labelled in the frame).
const webm = join(tmp, readdirSync(tmp).find((f) => f.endsWith(".webm"))!);
const segs: string[] = [];
let cur = t0;
const parts: string[] = [];
let i = 0;
for (const [a, b] of marks.walk) {
  parts.push(`[0:v]trim=${cur.toFixed(2)}:${(a + 3).toFixed(2)},setpts=PTS-STARTPTS[s${i}]`); segs.push(`[s${i++}]`);
  parts.push(`[0:v]trim=${(a + 3).toFixed(2)}:${(b - 1).toFixed(2)},setpts=(PTS-STARTPTS)/12[s${i}]`); segs.push(`[s${i++}]`);
  cur = b - 1;
}
parts.push(`[0:v]trim=${cur.toFixed(2)}:${end.toFixed(2)},setpts=PTS-STARTPTS[s${i}]`); segs.push(`[s${i++}]`);
const filter = `${parts.join(";")};${segs.join("")}concat=n=${segs.length}:v=1:a=0[c];[c]crop=390:844:0:0,scale=780:1688:flags=lanczos,fps=30[v]`;
const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", webm, "-filter_complex", filter, "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart", join(out, "walk-sim.mp4")], { stdio: "inherit" });
console.log(r.status === 0 ? `wrote ${out}` : "ffmpeg failed");
console.log(JSON.stringify(numbers, null, 1));
