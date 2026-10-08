// Copies a few CC-licensed calibration photos into public/samples/ (downscaled WebP)
// with attribution, for the "No camera? Try a sample" strip. Picked from real
// on-device runs (WebGPU, offline) so they reliably show each outcome.
//   npx tsx tools/build-samples.ts
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cal = join(here, "..", "..", "pipeline", "calibration");
const out = join(here, "..", "public", "samples");
mkdirSync(out, { recursive: true });

type Meta = { id: string; file: string; title: string; author: string; license: string; licenseUrl: string; source: string };
const photos = JSON.parse(readFileSync(join(cal, "photos.json"), "utf8")) as Record<string, Meta[]>;
const negatives = JSON.parse(readFileSync(join(cal, "negatives.json"), "utf8")) as Meta[];
const all = [...Object.values(photos).flat(), ...negatives];

const PICKS: Array<{ file: string; label: string; expect: "species" | "guardian" | "nobody" }> = [
  { file: "neem-tree/1.jpg", label: "Neem tree", expect: "species" },
  { file: "house-crow/1.jpg", label: "Crow", expect: "species" },
  { file: "bougainvillea/1.jpg", label: "Bougainvillea", expect: "species" },
  { file: "mango-fruit/1.jpg", label: "Mango", expect: "species" },
  { file: "camel/2.jpg", label: "Camel", expect: "species" },
  { file: "croton/2.jpg", label: "Croton", expect: "species" },
  { file: "pebbles/2.jpg", label: "Pebbles", expect: "guardian" },
  { file: "_negative/5.jpg", label: "Computer", expect: "nobody" },
];

const samples = [];
for (const p of PICKS) {
  const meta = all.find((m) => m.file === p.file);
  if (!meta) throw new Error(`No attribution for ${p.file}`);
  const name = p.file.replace(/\//g, "-").replace(/^_/, "").replace(/\.jpg$/, ".webp");
  await sharp(join(cal, "photos", p.file)).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 74 }).toFile(join(out, name));
  samples.push({
    src: `samples/${name}`,
    label: p.label,
    expect: p.expect,
    title: meta.title.replace(/^File:/, ""),
    author: meta.author,
    license: meta.license,
    licenseUrl: meta.licenseUrl,
    source: meta.source,
  });
  console.log("wrote", name);
}
writeFileSync(join(out, "samples.json"), JSON.stringify({ note: "Wikimedia Commons photos, downscaled. Used as on-device demo inputs only.", samples }, null, 1) + "\n");
console.log(`samples.json: ${samples.length}`);
