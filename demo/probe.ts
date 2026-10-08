// Finds which calibration photos the REAL in-browser model (EmbeddingGemma 2, WebGPU, headed Chromium)
// names, hands to a guardian, or rejects, so the walkthrough uses photos whose outcome is known.
// Nothing is scripted: this runs the production build's own pipeline with ?debug.
//   BASE=http://localhost:4180 npx tsx probe.ts [species/n,...]
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? "http://localhost:4180";
const photos = join(here, "..", "pipeline", "calibration", "photos");
const profile = join(process.env.TEMP ?? "/tmp", "votw-demo-probe-profile");
mkdirSync(profile, { recursive: true });

const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  args: ["--enable-unsafe-webgpu", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/?debug#/`, { waitUntil: "load" });
const first = await page.waitForSelector("#setup-title, #listen-title", { timeout: 60000 });
if ((await first.getAttribute("id")) === "setup-title") {
  await page.getByRole("button", { name: /Skip/ }).click();
  await page.getByRole("button", { name: /Get the field kit/ }).click();
  await page.waitForSelector("#ready-title, #setup-error", { timeout: 30 * 60_000 });
  if (await page.locator("#setup-error").count()) throw new Error(await page.locator(".error-box").innerText());
  await page.getByRole("button", { name: /Start the trail/ }).click();
  await page.goto(`${BASE}/?debug#/`, { waitUntil: "load" });
}
await page.waitForSelector("#listen-title", { timeout: 60000 });

const arg = process.argv[2];
const list: string[] = arg
  ? arg.split(",")
  : readdirSync(photos).filter((d) => !d.startsWith("_") && existsSync(join(photos, d, "1.jpg"))).flatMap((d) => [1, 2, 3].filter((n) => existsSync(join(photos, d, `${n}.jpg`))).map((n) => `${d}/${n}`));

const rows: Array<Record<string, string | number>> = [];
for (const id of list) {
  const [sp, n] = id.split("/");
  const file = join(photos, sp!, `${n ?? 1}.jpg`);
  if (!existsSync(file)) continue;
  await page.setInputFiles("#cam-input", file);
  await page.waitForSelector(".stirring", { timeout: 10000 }).catch(() => {});
  await page.waitForSelector("#enc-name", { timeout: 300000 });
  await page.waitForTimeout(250);
  const name = await page.locator("#enc-name").innerText();
  const dd = await page.locator(".debug dd").allTextContents().catch(() => [] as string[]);
  const row = { photo: id, name, outcome: dd[0] ?? "?", embedder: dd[1] ?? "?", species: dd[3] ?? "" };
  console.log(`${id.padEnd(28)} ${row.outcome.padEnd(22)} ${name.padEnd(26)} ${row.embedder} | ${row.species}`);
  rows.push(row);
}
mkdirSync(join(here, "work"), { recursive: true });
writeFileSync(join(here, "work", `probe-${arg ? "subset" : "all"}.json`), JSON.stringify(rows, null, 2));
await ctx.close();
