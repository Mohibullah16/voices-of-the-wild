// Plays one whole day of the quest chain on a phone viewport: find → listen → walk N steps → find …
// Steps come from synthetic devicemotion events (a walking-shaped accelerometer signal), so the real
// sensor → step detector → quest path runs. After proving the sensor counts, the rest of each walk is
// fast-forwarded through the dev hook (nobody wants a 10-minute test).
// Also checks that every XP pop-up is visible on top, not hidden behind the playing voice line.
//   BASE=http://localhost:5173 npx tsx tools/quest-e2e.ts
import { chromium, type Page } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "screenshots", "quests");
mkdirSync(out, { recursive: true });
const BASE = process.env.BASE ?? "http://localhost:5173";
const photo = (id: string) => {
  const p = join(here, "..", "..", "pipeline", "calibration", "photos", id, "1.jpg");
  return existsSync(p) ? p : join(here, "..", "public", "og-image.png");
};
const failures: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures.push(msg); };

type Q = { id: string; kind: string; label: string; category?: string; need: number };
const hook = <T>(page: Page, fn: string, arg?: unknown) => page.evaluate(([f, a]) => { const w = (window as any).__votw; return typeof w[f as string] === "function" ? w[f as string](a) : w[f as string]; }, [fn, arg] as const) as Promise<T>;

/** Fires a walking-shaped accelerometer signal (2 steps/s, 50 Hz) for `ms`. */
const walkSignal = (page: Page, ms: number) => page.evaluate((dur) => new Promise<void>((done) => {
  const t0 = performance.now();
  const id = setInterval(() => {
    const t = performance.now() - t0;
    const bounce = 4 * Math.max(0, Math.sin(2 * Math.PI * 2 * t / 1000)) ** 2;
    window.dispatchEvent(new DeviceMotionEvent("devicemotion", { accelerationIncludingGravity: { x: 0.3, y: 9.81 + bounce, z: 0.4 }, interval: 20 }));
    if (t > dur) { clearInterval(id); done(); }
  }, 20);
}), ms);

/** The XP pop-up must be on screen and topmost at its centre (not behind the voice line). */
async function popOnTop(page: Page, label: string) {
  const pop = page.locator(".xp-pop").last();
  await pop.waitFor({ state: "visible", timeout: 4000 });
  await page.waitForTimeout(450); // let the entrance animation land
  const r = await pop.evaluate((el) => {
    const b = el.getBoundingClientRect();
    (el as HTMLElement).style.pointerEvents = "auto"; // the layer ignores taps; let elementFromPoint see it
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    (el as HTMLElement).style.pointerEvents = "";
    return { top: el.contains(hit), inView: b.top >= 0 && b.bottom <= innerHeight, text: (el as HTMLElement).innerText.replace(/\s+/g, " ") };
  });
  check(r.top && r.inView, `${label}: XP pop-up visible on top ("${r.text}")`);
  return r.text;
}

async function main() {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ["accelerometer", "gyroscope"] }); // as on an Android phone
  const page = await ctx.newPage();
  page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
  let n = 0;
  const shot = (name: string) => page.screenshot({ path: join(out, `${String(++n).padStart(2, "0")}-${name}.png`) });

  await page.goto(`${BASE}/?mock`, { waitUntil: "networkidle" });
  await page.waitForSelector("#setup-title");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Get the field kit/ }).click();
  await page.waitForSelector("#ready-title", { timeout: 90000 });
  await page.getByRole("button", { name: /Start the trail/ }).click();
  await page.waitForSelector("#listen-title");

  const quests = await hook<Q[]>(page, "quests");
  console.log(`Today's chain (${quests.length}): ${quests.map((q) => q.label).join(" → ")}`);
  check(quests.length >= 3 && quests.length <= 5, "3 to 5 quests today");
  await page.waitForTimeout(500);
  await shot("trail-start");
  check((await page.locator(".quest.locked").count()) === quests.length - 1, "only the first quest is unlocked");

  const owners: { id: string; category: string; guardian: boolean }[] = await page.evaluate(() => [...(window as any).__votw.state.data.owners.values()].map((o: any) => ({ id: o.id, category: o.category, guardian: o.guardian })));
  const met = new Set<string>();
  const solve = (q: Q) => {
    const pick = (f: (o: (typeof owners)[0]) => boolean) => owners.find((o) => !o.guardian && !met.has(o.id) && f(o))!.id;
    return q.kind === "touch-grass" ? "lawn-grass" : q.kind === "category" ? pick((o) => o.category === q.category) : pick(() => true);
  };

  for (const [i, q] of quests.entries()) {
    const active = await hook<Q | undefined>(page, "activeQuest");
    check(active?.id === q.id, `quest ${i + 1} is active: ${q.label}`);
    if (q.kind !== "walk") {
      const id = solve(q);
      met.add(id);
      await page.evaluate((o) => (window as any).__votw.setMockPlan({ kind: "species", owner: o }), id);
      await page.setInputFiles("#cam-input", photo(id));
      await page.waitForSelector("#enc-name", { timeout: 15000 });
      const text = await popOnTop(page, `after meeting ${id}`);
      check(text.includes(q.label), `pop-up names the finished quest "${q.label}"`);
      const next = quests[i + 1];
      if (next) check(text.includes(next.label), `pop-up announces next: "${next.label}"`);
      await shot(`meet-${id}`);
      // Voice keeps playing; dismiss any moments, then take the next task.
      await page.waitForTimeout(1200);
      for (let k = 0; k < 6 && (await page.locator("dialog.moment[open]").count()); k++) await page.locator("dialog.moment[open] .btn-primary").click();
      if (!next) break;
      await page.getByRole("button", { name: `Next: ${next.label}` }).click();
      await page.waitForTimeout(300);
      for (let k = 0; k < 6 && (await page.locator("dialog.moment[open]").count()); k++) await page.locator("dialog.moment[open] .btn-primary").click();
      await page.getByRole("button", { name: "Skip" }).click({ timeout: 3000 }).catch(() => {}); // the goodbye line
      continue;
    }
    // Walk quest.
    await page.waitForSelector("#walk-title", { timeout: 15000 });
    await walkSignal(page, 6000);
    const mode = await page.evaluate(() => (window as any).__votw.state.listen.mode);
    check(mode === "sensor", `walk uses the motion sensor (mode=${mode})`);
    const counted = Number((await page.locator(".step-count").innerText()).replace(/,/g, ""));
    check(counted >= 10 && counted <= 13, `6 s of walking signal counted ${counted} steps (expect ~12)`);
    await shot(`walk-${q.need}-progress`);
    // Shaking the phone hard must not race ahead of a running pace.
    await page.evaluate(() => new Promise<void>((done) => {
      let k = 0;
      const id = setInterval(() => { window.dispatchEvent(new DeviceMotionEvent("devicemotion", { accelerationIncludingGravity: { x: 0, y: k % 2 ? 22 : 2, z: 0 }, interval: 20 })); if (++k > 100) { clearInterval(id); done(); } }, 20);
    }));
    const afterShake = Number((await page.locator(".step-count").innerText()).replace(/,/g, ""));
    check(afterShake - counted <= 9, `2 s of hard shaking adds at most ~7 steps (added ${afterShake - counted})`);
    await page.evaluate((left) => (window as any).__votw.walkSteps(left), q.need - afterShake);
    await page.waitForSelector(".walk.bonus", { timeout: 4000 });
    const text = await popOnTop(page, `after walking ${q.need}`);
    check(text.includes(`Walked ${q.need.toLocaleString("en")} steps`), "pop-up shows the walk reward");
    await shot(`walk-${q.need}-done`);
    await page.waitForTimeout(2600); // held-back moments (badge, trail done) open after the pop-up
    for (let k = 0; k < 6 && (await page.locator("dialog.moment[open]").count()); k++) await page.locator("dialog.moment[open] .btn-primary").click();
    // Pausing a walk keeps the steps; the next quest opens the camera.
    await page.getByRole("button", { name: "Trail" }).click();
    await page.waitForSelector("#listen-title");
  }

  await page.waitForTimeout(800);
  for (let k = 0; k < 6 && (await page.locator("dialog.moment[open]").count()); k++) {
    await shot("moment");
    await page.locator("dialog.moment[open] .btn-primary").click();
    await page.waitForTimeout(300);
  }
  const day = await page.evaluate(() => { const w = (window as any).__votw; const d = Object.values(w.state.game.days)[0] as any; return { complete: d.complete, done: d.questsDone.length, xp: w.state.game.xp }; });
  check(day.complete && day.done === quests.length, `trail complete: ${day.done}/${quests.length}, ${day.xp} XP`);
  await page.locator("#listen-title").waitFor({ state: "attached" }).catch(() => {});
  await page.evaluate(() => (location.hash = "#/"));
  await page.waitForTimeout(500);
  await shot("trail-done");
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED:\n- ${failures.join("\n- ")}` : "\nAll checks passed.");
  process.exit(failures.length ? 1 : 0);
}
void main();
