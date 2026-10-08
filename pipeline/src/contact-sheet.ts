// Dev aid: one contact sheet per category (rows = characters, 3 photos each) for eyeballing calibration photos.
// Usage: tsx src/contact-sheet.ts <outDir>
import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { CAL_DIR, PHOTOS_DIR, ensureDir, loadRoster, readJson } from "./lib.ts";

const out = process.argv[2] ?? join(CAL_DIR, ".sheets");
ensureDir(out);
const manifest = readJson<Record<string, { file: string }[]>>(join(CAL_DIR, "photos.json"), {});
const S = 180, LABEL = 160;
const groups: [string, { id: string; files: string[] }[]][] = loadRoster().categories.map((c) => [
  c.id,
  c.characters.map((ch) => ({ id: ch.id, files: (manifest[ch.id] ?? []).map((p) => p.file) })),
]);
groups.push(["_negative", [{ id: "negatives", files: readJson<{ file: string }[]>(join(CAL_DIR, "negatives.json"), []).map((p) => p.file) }]]);
for (const [cat, rows] of groups) {
  const cols = Math.max(3, ...rows.map((r) => r.files.length));
  const W = LABEL + cols * S, H = rows.length * S;
  const comps: sharp.OverlayOptions[] = [];
  for (const [ri, r] of rows.entries()) {
    comps.push({ input: Buffer.from(`<svg width="${LABEL}" height="${S}"><text x="6" y="${S / 2}" font-size="15" font-family="sans-serif" fill="black">${r.id}</text></svg>`), left: 0, top: ri * S });
    for (const [ci, f] of r.files.entries()) {
      const p = join(PHOTOS_DIR, f);
      if (!existsSync(p)) continue;
      comps.push({ input: await sharp(p).resize(S - 4, S - 4, { fit: "cover" }).toBuffer(), left: LABEL + ci * S + 2, top: ri * S + 2 });
    }
  }
  await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(comps).jpeg({ quality: 70 }).toFile(join(out, `${cat}.jpg`));
}
console.log(`sheets in ${out}`);
