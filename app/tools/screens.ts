// Walks the whole game in a real browser at phone/desktop sizes, light and dark, using the real
// field data with a mock embedder (?mock, dev server only) so outcomes are scripted. Saves
// screenshots and reports overflow, small tap targets, unnamed controls and console errors.
//   BASE=http://localhost:5173 npx tsx tools/screens.ts [phone|desktop|tablet]
import { chromium, type Page } from "playwright";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "screenshots");
mkdirSync(out, { recursive: true });
const BASE = process.env.BASE ?? "http://localhost:5173";
const photos = join(here, "..", "..", "pipeline", "calibration", "photos");
const photo = (id: string) => {
  const p = join(photos, id, "1.jpg");
  return existsSync(p) ? p : join(here, "..", "public", "og-image.png");
};

// The viewfinder shot should show a real tree, not Chromium's green test pattern: turn a real
// calibration photo into the fake camera feed (needs ffmpeg; falls back to the test pattern).
const cam = (() => {
  const src = photo("neem-tree");
  const file = join(tmpdir(), "votw-screens-camera.y4m");
  if (!src.includes("neem-tree")) return null;
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-i", src, "-t", "2", "-r", "30",
    "-vf", "scale=600:800:force_original_aspect_ratio=increase,crop=600:800,format=yuv420p", "-f", "yuv4mpegpipe", file], { stdio: "ignore" });
  return r.status === 0 ? file : null;
})();

type Plan = { kind: string; owner?: string; category?: string };
const problems: string[] = [];

async function audit(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    const small: string[] = [];
    const modal = document.querySelector("dialog[open]");
    document.querySelectorAll<HTMLElement>("button, a[href], input:not(.file-input), select, [role=switch]").forEach((el) => {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") return;
      if (modal && !modal.contains(el)) return; // page behind a modal is inert
      if (el.tagName === "A" && el.closest("p, .sample-credits")) return; // inline text links
      if (b.width < 44 || b.height < 44) {
        const host = el.closest(".switch, .segmented label");
        if (host && host.getBoundingClientRect().height >= 32) return;
        small.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      }
    });
    const noName = [...document.querySelectorAll<HTMLElement>("button, a[href]")].filter((el) => !(el.getAttribute("aria-label") || el.textContent?.trim())).length;
    const uncaptioned = [...document.querySelectorAll("voice-line")].filter((v) => !(v.querySelector("[data-caption]")?.textContent ?? "").trim()).length;
    return { overflow, small, noName, uncaptioned };
  });
  if (r.overflow) problems.push(`${label}: horizontal overflow`);
  if (r.small.length) problems.push(`${label}: small targets ${r.small.join("; ")}`);
  if (r.noName) problems.push(`${label}: ${r.noName} controls without accessible name`);
  if (r.uncaptioned) problems.push(`${label}: ${r.uncaptioned} voice lines without caption`);
}

async function run(name: string, viewport: { width: number; height: number }, scheme: "light" | "dark", mobile: boolean) {
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", ...(cam ? [`--use-file-for-fake-video-capture=${cam}`] : [])] });
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, permissions: ["camera"] });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") problems.push(`${name}: console error: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => problems.push(`${name}: page error: ${e.message}`));
  const seen = new Set<string>();
  const shot = async (n: string, full = false) => {
    await audit(page, `${name}/${n}`);
    await page.screenshot({ path: join(out, `${name}-${n}.png`), fullPage: full });
  };
  // Dev-only test hook (window.__votw) exists with ?mock / the fixture.
  const plan = (p: Plan) => page.evaluate((pp) => (window as any).__votw.setMockPlan(pp), p);
  const input = mobile ? "#cam-input" : "#gallery-input";

  /** Screenshot each new kind of moment once, then dismiss them all. */
  const drainMoments = async () => {
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(300);
      if (!(await page.locator("dialog.moment[open]").count())) return;
      const kicker = (await page.locator("dialog.moment[open] .moment-kicker").textContent()) ?? "moment";
      const k = kicker.toLowerCase();
      const slug = k.includes("trail") ? "trail-complete" : k.includes("complete") ? "category-complete" : k.includes("rank") ? "levelup" : k.includes("badge") ? "badge-unlock" : k.includes("every") ? "finale" : k.replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
      if (!seen.has(slug)) {
        seen.add(slug);
        await page.waitForTimeout(slug === "category-complete" ? 2600 : 900);
        await shot(slug);
      }
      await page.locator("dialog.moment[open] .btn-primary").click();
    }
  };
  const meet = async (p: Plan, file: string) => {
    await plan(p);
    await page.setInputFiles(input, file);
    await page.waitForSelector(".stirring", { timeout: 5000 }).catch(() => {});
    await page.waitForSelector("#enc-name", { timeout: 15000 });
  };
  /** Back to the trail after an encounter (the quest chain has its own test: tools/quest-e2e.ts). */
  const walkOn = async () => {
    await drainMoments();
    await page.evaluate(() => { const w = (window as any).__votw; w.state.listen = { kind: "idle" }; w.update(); });
    await page.waitForSelector("#listen-title");
  };

  // ---- onboarding + setup
  await page.goto(`${BASE}/?mock`, { waitUntil: "networkidle" });
  await page.waitForSelector("#setup-title");
  await page.waitForTimeout(800);
  await shot("01-onboard-1");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.waitForTimeout(600);
  await shot("01-onboard-2");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.waitForTimeout(1200);
  await shot("01-onboard-3");
  await page.getByRole("button", { name: /Start the trail/ }).click();
  await page.waitForSelector("#listen-title");
  // The field kit downloads in the background while the trail is already usable.
  await page.waitForSelector(".kit-chip", { timeout: 5000 }).then(() => shot("02-kit-downloading")).catch(() => {});
  await page.waitForFunction(() => !document.querySelector(".kit-chip"), null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await shot("04-home");

  // ---- viewfinder (fake camera) into a first encounter
  // Phones open the live camera from Listen itself; desktop keeps a Webcam button.
  await page.getByRole("button", { name: mobile ? "Open the camera and listen" : "Webcam" }).click();
  await page.waitForFunction(() => { const v = document.getElementById("vf-video") as HTMLVideoElement | null; return !!v && v.videoWidth > 0; }, null, { timeout: 10000 });
  await shot("04b-viewfinder");
  await plan({ kind: "species", owner: "neem-tree" });
  await page.getByRole("button", { name: "Take the photo" }).click();
  await page.waitForSelector(".stirring");
  await page.waitForTimeout(450);
  await shot("05a-stirring");
  await page.waitForSelector("#enc-name", { timeout: 15000 });
  await page.waitForTimeout(650);
  await shot("05-encounter-new-elder");
  await page.waitForTimeout(2000);
  await shot("05b-encounter-caption");
  await page.evaluate(() => { const w = (window as any).__votw; w.state.settings.debug = true; w.update(); });
  await page.waitForTimeout(300);
  await page.waitForSelector(".debug summary");
  await page.click(".debug summary");
  await page.locator(".debug").scrollIntoViewIfNeeded();
  await shot("05c-debug-scores");
  await page.evaluate(() => { const w = (window as any).__votw; w.state.settings.debug = false; w.update(); });
  await walkOn();

  // ---- caution, guardian hint, nobody, sample
  await meet({ kind: "species", owner: "oleander" }, photo("oleander"));
  await page.waitForTimeout(1500);
  await shot("06-encounter-caution");
  await walkOn();
  await meet({ kind: "guardian", category: "birds" }, photo("house-sparrow"));
  await page.waitForTimeout(1500);
  await shot("07-guardian-hint");
  await walkOn();
  await meet({ kind: "nobody" }, photo("overcast-sky"));
  await page.waitForTimeout(600);
  await shot("08-nobody");
  await page.locator(".nobody .btn-quiet").click();
  await page.waitForSelector("#listen-title");
  await plan({ kind: "species", owner: "camel" });
  await page.locator("button.sample").nth(4).click();
  await page.waitForSelector("#enc-name", { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot("08b-sample-encounter");
  await walkOn();

  // ---- complete a whole kind (water) for the blessing; ranks up on the way
  const water: string[] = await page.evaluate(() => [...(window as any).__votw.state.data.owners.values()].filter((o: any) => o.category === "water" && !o.guardian).map((o: any) => o.id));
  for (const id of water) {
    await meet({ kind: "species", owner: id }, photo(id));
    await page.waitForTimeout(400);
    await walkOn();
  }

  // ---- a walk quest: steps (fast-forwarded through the dev hook) and the walk-done screen
  await page.evaluate(() => { const w = (window as any).__votw; w.state.listen = { kind: "idle" }; w.update(); });
  await page.waitForSelector("#listen-title");
  const walk = await page.evaluate(() => { const w = (window as any).__votw; const q = w.quests().find((x: any) => x.kind === "walk"); if (!q) return null; const d = w.state.game.days[Object.keys(w.state.game.days).at(-1)!]; for (const x of w.quests()) { if (x.id === q.id) break; if (!d.questsDone.includes(x.id)) d.questsDone.push(x.id); } d.legStart = d.events.length; d.steps = 0; w.update(); return q.need; });
  if (walk) {
    await page.getByRole("button", { name: /Start walking/ }).click();
    await page.waitForSelector("#walk-title");
    await page.evaluate((n) => (window as any).__votw.walkSteps(Math.round(n * 0.4)), walk);
    await page.waitForTimeout(500);
    await shot("09-walk");
    await page.evaluate((n) => (window as any).__votw.walkSteps(n), walk);
    await page.waitForTimeout(600);
    await shot("09b-walk-done");
    await page.waitForTimeout(2600);
    await drainMoments();
    await page.getByRole("button", { name: "Trail" }).click();
    await page.waitForSelector("#listen-title");
  }
  await page.waitForTimeout(500);
  await shot("04c-trail");
  if (mobile) {
    await page.locator(".samples").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot("04d-sample-strip");
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // ---- share cards (rendered offline on a canvas)
  if (name === "phone-light") {
    for (const [fmt, id] of [["portrait", "neem-tree"], ["wide", "house-crow"]] as const) {
      const dataUrl: string = await page.evaluate(async ([f, oid]) => {
        const w = (window as any).__votw;
        const o = w.state.data.owners.get(oid);
        const blob: Blob = await w.renderShareCard(o, o.lines.first_meet, f, new Date().toISOString());
        return await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
      }, [fmt, id] as const);
      writeFileSync(join(out, fmt === "portrait" ? "phone-light-share-card.png" : "phone-light-share-card-wide.png"), Buffer.from(dataUrl.split(",")[1]!, "base64"));
    }
  }

  // ---- other tabs
  for (const [hash, id, n] of [["#/guide", "guide-title", "10-field-guide"], ["#/guide/neem-tree", "detail-title", "11-detail"], ["#/badges", "badges-title", "12-badges"], ["#/about", "about-title", "13-about"]] as const) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForSelector(`#${id}`);
    await page.waitForTimeout(500);
    await shot(n, mobile);
  }

  // Keyboard: the shutter is reachable from the top of the trail.
  await page.evaluate(() => (location.hash = "#/"));
  await page.waitForSelector("#listen-title");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => document.activeElement?.classList.contains("shutter") ?? false);
  }
  if (!reached) problems.push(`${name}: shutter not reachable by keyboard in 20 tabs`);
  await browser.close();
}

const which = process.argv[2] ?? "all";
const runs: Array<[string, { width: number; height: number }, "light" | "dark", boolean]> = [
  ["phone-light", { width: 390, height: 844 }, "light", true],
  ["phone-dark", { width: 390, height: 844 }, "dark", true],
  ["desktop-light", { width: 1440, height: 900 }, "light", false],
  ["desktop-dark", { width: 1440, height: 900 }, "dark", false],
  ["tablet-light", { width: 820, height: 1180 }, "light", true],
];
for (const r of runs) if (which === "all" || r[0].startsWith(which)) await run(...r);
console.log(problems.length ? `PROBLEMS (${problems.length}):\n` + problems.join("\n") : "No problems found.");
