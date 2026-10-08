// Builds src/dev-fixtures/roster.runtime.json + embeddings.index.json from the
// shipped roster (week-1/data/roster/roster.json). Dev-only: it lets the app run
// before the pipeline has written public/data and public/audio.
// Shapes follow data/CONTRACT.md section 2. Vectors are NOT stored: the app
// synthesises deterministic fixture vectors at runtime (src/dev-fixtures/fixture.ts).
//
//   npm run fixture
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const roster = JSON.parse(readFileSync(join(here, "..", "..", "data", "roster", "roster.json"), "utf8"));
const outDir = join(here, "..", "src", "dev-fixtures");

const strip = (s) => s.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();
const hash8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);
// Rough speech rate: about 14 characters per second, plus a breath.
const duration = (caption) => Math.round((caption.length / 14 + 0.6) * 10) / 10;

const lines = (ownerId, raw, engine) =>
  Object.fromEntries(
    Object.entries(raw).map(([k, text]) => {
      const caption = strip(text);
      return [k, { text, caption, src: `audio/${ownerId}/${k}.${hash8(text)}.mp3`, engine, duration: duration(caption) }];
    }),
  );

const index = [];
let row = 0;
const categories = roster.categories.map((cat) => {
  const g = cat.guardian;
  for (const _ of g.descriptions) index.push({ row: row++, owner: g.id, category: cat.id, guardian: true });
  const characters = cat.characters.map((c) => {
    for (const _ of c.descriptions) index.push({ row: row++, owner: c.id, category: cat.id, guardian: false });
    const { descriptions: _d, ...rest } = c;
    return { ...rest, lines: lines(c.id, c.lines, c.tier === "elder" ? "elevenlabs" : "kokoro") };
  });
  const { descriptions: _gd, ...guardian } = g;
  return { id: cat.id, name: cat.name, guardian: { ...guardian, lines: lines(g.id, g.lines, "kokoro") }, characters };
});

const thresholds = { category: {}, species: {}, margin: 0.03, global_min: 0.2 };
for (const c of categories) {
  thresholds.category[c.id] = 0.25;
  thresholds.species[c.id] = 0.4;
}

const out = {
  version: roster.version ?? 1,
  fixture: true,
  model: { id: "onnx-community/embeddinggemma-2-ONNX", dtype: "q4", dim: 768, prefix: { image: "", text: "title: none | text: " } },
  thresholds,
  categories,
};
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "roster.runtime.json"), JSON.stringify(out, null, 1) + "\n");
writeFileSync(join(outDir, "embeddings.index.json"), JSON.stringify(index) + "\n");
console.log(`fixture: ${categories.length} categories, ${categories.reduce((n, c) => n + c.characters.length + 1, 0)} owners, ${index.length} rows`);
