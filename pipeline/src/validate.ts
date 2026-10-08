// `npm run validate` — check the build outputs in app/public against CONTRACT §2.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_OUT, DATA_OUT, DIM, PUBLIC_DIR, loadRoster, stripTags } from "./lib.ts";

const problems: string[] = [];
const warn: string[] = [];
const fail = (m: string) => problems.push(m);

const runtimePath = join(DATA_OUT, "roster.runtime.json");
const binPath = join(DATA_OUT, "embeddings.bin");
const idxPath = join(DATA_OUT, "embeddings.index.json");
for (const p of [runtimePath, binPath, idxPath]) if (!existsSync(p)) fail(`missing ${p}`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

const rt = JSON.parse(readFileSync(runtimePath, "utf8"));
const roster = loadRoster();

// model + thresholds
if (rt.model?.dim !== DIM) fail(`model.dim is ${rt.model?.dim}, expected ${DIM}`);
if (!rt.model?.id || rt.model?.dtype !== "q4") fail(`model id/dtype wrong: ${rt.model?.id} ${rt.model?.dtype}`);
if (typeof rt.model?.prefix?.image !== "string" || typeof rt.model?.prefix?.text !== "string") fail("model.prefix.{image,text} must be strings");
for (const k of ["margin", "global_min"]) if (typeof rt.thresholds?.[k] !== "number") fail(`thresholds.${k} missing`);
for (const c of roster.categories) {
  if (typeof rt.thresholds?.category?.[c.id] !== "number") fail(`thresholds.category.${c.id} missing`);
  if (typeof rt.thresholds?.species?.[c.id] !== "number") fail(`thresholds.species.${c.id} missing`);
}
if (!rt.credits?.voices) fail("credits.voices missing");

// lines + audio
let lines = 0, el = 0, ko = 0, totalDur = 0;
const referenced = new Set<string>();
const rtCats = new Map<string, any>(rt.categories.map((c: any) => [c.id, c]));
for (const c of roster.categories) {
  const rc = rtCats.get(c.id);
  if (!rc) { fail(`category ${c.id} missing from runtime`); continue; }
  const rOwners = [rc.guardian, ...rc.characters];
  for (const o of [c.guardian, ...c.characters]) {
    const ro = rOwners.find((x: any) => x.id === o.id);
    if (!ro) { fail(`${o.id} missing from runtime`); continue; }
    if ("descriptions" in ro) fail(`${o.id} still has descriptions`);
    for (const [k, text] of Object.entries(o.lines)) {
      const l = ro.lines?.[k];
      lines++;
      if (!l) { fail(`${o.id}.${k} missing`); continue; }
      if (l.text !== text) fail(`${o.id}.${k} text differs from roster`);
      if (l.caption !== stripTags(text as string)) fail(`${o.id}.${k} caption mismatch`);
      if (/\[|\]/.test(l.caption)) fail(`${o.id}.${k} caption still has tags`);
      if (!l.src) { fail(`${o.id}.${k} has no src`); continue; }
      if (!/^audio\/[^/]+\/[a-z_]+\.[0-9a-f]{8}\.mp3$/.test(l.src)) fail(`${o.id}.${k} src has unexpected shape: ${l.src}`);
      const file = join(PUBLIC_DIR, l.src);
      if (!existsSync(file)) fail(`${o.id}.${k} src does not exist: ${l.src}`);
      else if (statSync(file).size < 1000) fail(`${o.id}.${k} file is suspiciously small`);
      if (!(l.duration > 0)) fail(`${o.id}.${k} duration ${l.duration}`);
      if (l.engine !== "elevenlabs" && l.engine !== "kokoro") fail(`${o.id}.${k} engine ${l.engine}`);
      if (l.engine === "elevenlabs") el++; else ko++;
      if (o.tier === "elder" && l.engine !== "elevenlabs") warn.push(`${o.id}.${k} is an elder line rendered by Kokoro (fallback)`);
      if (o.tier !== "elder" && l.engine === "elevenlabs") fail(`${o.id}.${k} non-elder on ElevenLabs`);
      totalDur += l.duration || 0;
      referenced.add(l.src);
    }
  }
}
// orphan audio files
let files = 0, bytes = 0;
for (const d of existsSync(AUDIO_OUT) ? readdirSync(AUDIO_OUT) : []) {
  for (const f of readdirSync(join(AUDIO_OUT, d))) {
    files++; bytes += statSync(join(AUDIO_OUT, d, f)).size;
    if (!referenced.has(`audio/${d}/${f}`)) warn.push(`orphan audio file audio/${d}/${f}`);
  }
}

// embeddings
const idx = JSON.parse(readFileSync(idxPath, "utf8")) as { row: number; owner: string; category: string; guardian: boolean }[];
const buf = readFileSync(binPath);
const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
if (buf.byteLength % 4) fail("embeddings.bin size is not a multiple of 4");
if (vec.length !== idx.length * rt.model.dim) fail(`embeddings.bin has ${vec.length} floats; index has ${idx.length} rows × ${rt.model.dim}`);
idx.forEach((r, i) => { if (r.row !== i) fail(`index row ${i} has row=${r.row}`); });
const expectedRows = roster.categories.reduce((s, c) => s + [c.guardian, ...c.characters].reduce((t, o) => t + o.descriptions.length, 0), 0);
if (idx.length !== expectedRows) fail(`index has ${idx.length} rows; roster has ${expectedRows} descriptions`);
const ownerIds = new Set(roster.categories.flatMap((c) => [c.guardian.id, ...c.characters.map((x) => x.id)]));
for (const id of ownerIds) if (!idx.some((r) => r.owner === id)) fail(`no embedding rows for ${id}`);
let worstNorm = 0;
for (let i = 0; i < idx.length; i++) {
  let n = 0;
  for (let d = 0; d < DIM; d++) { const x = vec[i * DIM + d]!; n += x * x; if (!Number.isFinite(x)) { fail(`row ${i} has non-finite values`); break; } }
  worstNorm = Math.max(worstNorm, Math.abs(Math.sqrt(n) - 1));
}
if (worstNorm > 1e-3) fail(`rows not L2-normalised (worst |norm-1| = ${worstNorm})`);

const mb = (b: number) => (b / 1024 / 1024).toFixed(2) + " MB";
const dirSize = (p: string): number => existsSync(p) ? readdirSync(p).reduce((s, f) => { const q = join(p, f); const st = statSync(q); return s + (st.isDirectory() ? dirSize(q) : st.size); }, 0) : 0;
console.log(`lines: ${lines} (elevenlabs ${el}, kokoro ${ko}), total audio ${(totalDur / 60).toFixed(1)} min, ${files} files`);
console.log(`embeddings: ${idx.length} rows × ${rt.model.dim}, worst |norm-1| ${worstNorm.toExponential(1)}`);
console.log(`sizes: public/data ${mb(dirSize(DATA_OUT))}, public/audio ${mb(dirSize(AUDIO_OUT))}`);
for (const w of warn) console.warn(`warn: ${w}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("validate: OK");
