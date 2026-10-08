// Skip a quest after a miss (costs XP), walks can't be skipped, fast-forward to the next day's trail.
//   BASE=http://localhost:5173 npx tsx tools/skip-ff-e2e.ts
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "screenshots", "skip-ff");
mkdirSync(out, { recursive: true });
const BASE = process.env.BASE ?? "http://localhost:5173";
const img = join(here, "..", "public", "og-image.png");
const failures: string[] = [];
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures.push(msg); };

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on("pageerror", (e) => failures.push(`page error: ${e.message}`));
  let n = 0;
  const shot = (name: string) => page.screenshot({ path: join(out, `${String(++n).padStart(2, "0")}-${name}.png`) });
  const g = () => page.evaluate(() => { const w = (window as any).__votw; return { xp: w.state.game.xp as number, active: w.activeQuest() as any, quests: w.quests() as any[] }; });
  const closeMoments = async () => { for (let k = 0; k < 6 && (await page.locator("dialog.moment[open]").count()); k++) await page.locator("dialog.moment[open] .btn-primary").click(); };

  await page.goto(`${BASE}/?mock`, { waitUntil: "networkidle" });
  await page.waitForSelector("#setup-title");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: /Start the trail/ }).click();
  await page.waitForSelector("#listen-title");

  let s = await g();
  check(s.quests.length >= 5 && s.quests.length <= 7, `trail has ${s.quests.length} quests (5-7)`);
  check(s.active.kind !== "walk", `first quest is a find: ${s.active.label}`);
  // Earn XP from something that doesn't solve the quest.
  const other = await page.evaluate((cat) => [...(window as any).__votw.state.data.owners.values()].find((o: any) => !o.guardian && o.category !== cat && o.id !== "lawn-grass").id, s.active.category);
  await page.evaluate((o) => (window as any).__votw.setMockPlan({ kind: "species", owner: o }), other);
  await page.setInputFiles("#cam-input", img);
  await page.waitForSelector("#enc-name", { timeout: 15000 });
  await page.waitForTimeout(800);
  await closeMoments();
  const xp0 = (await g()).xp;
  check(xp0 > 0, `earned ${xp0} XP`);

  // A miss: nobody answers. Near-miss text and a Skip button.
  await page.evaluate(() => (window as any).__votw.setMockPlan({ kind: "nobody" }));
  await page.setInputFiles("#cam-input", img);
  await page.waitForSelector(".nobody #enc-name", { timeout: 15000 });
  await page.waitForTimeout(500);
  const lede = await page.locator(".nobody .lede").innerText();
  console.log(`      miss says: "${lede}"`);
  const skip = page.getByRole("button", { name: /Skip quest .* costs 25 XP/ });
  check(await skip.isVisible(), "Skip (−25 XP) offered after a miss");
  await shot("miss-with-skip");
  await skip.click();
  await page.waitForSelector("#listen-title");
  await page.waitForTimeout(400);
  s = await g();
  check(s.xp === xp0 - 25, `skip cost 25 XP (${xp0} → ${s.xp})`);
  check(s.active.kind === "walk", `next quest is the walk: ${s.active.label}`);
  check((await page.locator(".quest.skipped").count()) === 1, "skipped quest marked in the trail");
  check((await page.getByRole("button", { name: /Skip quest/ }).count()) === 0, "walks can't be skipped");
  await shot("trail-after-skip");

  // Fast-forward: two taps (no blocking dialog), new trail, XP kept.
  const before = JSON.stringify(s.quests);
  await page.getByRole("button", { name: /Fast-forward a day/ }).click();
  check(await page.getByRole("button", { name: /Confirm: start tomorrow/ }).isVisible(), "first tap asks for a second");
  await shot("ff-armed");
  await page.getByRole("button", { name: /Confirm: start tomorrow/ }).click();
  await page.waitForTimeout(300);
  s = await g();
  check(JSON.stringify(s.quests) !== before && s.quests.length >= 5, `new trail: ${s.quests.map((q: any) => q.label).join(" → ")}`);
  check(s.xp === xp0 - 25, "XP kept across fast-forward");
  check((await page.locator("#quests-title").innerText()).includes("+1"), "trail title shows day +1");
  check((await page.locator(".quest.done").count()) === 0, "fresh trail, nothing done");
  await shot("ff-new-trail");
  await browser.close();
  console.log(failures.length ? `\n${failures.length} FAILED:\n- ${failures.join("\n- ")}` : "\nAll checks passed.");
  process.exit(failures.length ? 1 : 0);
}
void main();
