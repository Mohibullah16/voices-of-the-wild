// `npm run calibrate` — embed real Wikimedia Commons photos with the image path, run the app's exact
// CONTRACT §3 matcher, pick the description prefix variant, fit thresholds that minimise confident wrong
// answers, write build/calibration.json, refresh embeddings + roster.runtime.json, write calibration/REPORT.md.
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { match, scoreOwners } from "../../app/src/match.ts";
import { CALIBRATION_JSON, CAL_DIR, DEFAULT_PREFIX, PHOTOS_DIR, PIPELINE_DIR, TEXT_PREFIXES, loadRoster, readJson, writeJson } from "./lib.ts";
import { loadEmbedder, type Embedder } from "./model.ts";
import { writeRuntime, type Thresholds } from "./runtime.ts";
import { buildBank, writeBank, type Bank } from "./textbank.ts";

// Utility weights: a confidently wrong name is much worse than a guardian hint.
const U = {
  species_ok: 1,
  guardian_right_cat: 0.25,
  guardian_wrong_cat: -0.5,
  species_wrong: -3,
  nobody_on_positive: -0.5,
  nobody_on_negative: 1,
  guardian_on_negative: -1,
  species_on_negative: -3,
};

interface Photo {
  file: string; // relative to photos dir
  label: string | null; // character id, null = negative (not a roster thing)
  category: string | null;
  fold: number;
  vec?: Float32Array;
}

const roster = loadRoster();
const catOf = new Map<string, string>();
const nameOf = new Map<string, string>();
for (const c of roster.categories) {
  nameOf.set(c.guardian.id, c.guardian.name);
  for (const ch of c.characters) { catOf.set(ch.id, c.id); nameOf.set(ch.id, ch.name); }
}
const cats = roster.categories.map((c) => c.id);

// ---- photos ----
const manifest = readJson<Record<string, { file: string; title: string }[]>>(join(CAL_DIR, "photos.json"), {});
const negatives = readJson<{ file: string }[]>(join(CAL_DIR, "negatives.json"), []);
const photos: Photo[] = [];
for (const c of roster.categories) {
  for (const ch of c.characters) {
    (manifest[ch.id] ?? []).forEach((p, i) => {
      if (existsSync(join(PHOTOS_DIR, p.file))) photos.push({ file: p.file, label: ch.id, category: c.id, fold: i % 3 });
    });
  }
}
negatives.forEach((p, i) => existsSync(join(PHOTOS_DIR, p.file)) && photos.push({ file: p.file, label: null, category: null, fold: i % 3 }));
const missing = roster.categories.flatMap((c) => c.characters).filter((ch) => !(manifest[ch.id] ?? []).length).map((c) => c.id);
console.log(`photos: ${photos.filter((p) => p.label).length} positive, ${photos.filter((p) => !p.label).length} negative; no photo: ${missing.join(", ") || "none"}`);

let embedderP: Promise<Embedder> | null = null;
const embedder = () => (embedderP ??= loadEmbedder({ vision: true }));

// Photo embedding cache (path + size + mtime).
const PCACHE = join(PIPELINE_DIR, ".cache", "photo-embeddings.json");
const pcache = readJson<Record<string, number[]>>(PCACHE, {});
let fresh = 0;
const t0 = Date.now();
for (const p of photos) {
  const abs = join(PHOTOS_DIR, p.file);
  const st = statSync(abs);
  const key = `${p.file}:${st.size}:${Math.round(st.mtimeMs)}`;
  if (!pcache[key]) {
    const e = await embedder();
    pcache[key] = Array.from(await e.embedImageFile(abs));
    if (++fresh % 20 === 0) { console.log(`  embedded ${fresh} photos…`); writeJson(PCACHE, pcache); }
  }
  p.vec = Float32Array.from(pcache[key]!);
}
writeJson(PCACHE, pcache);
if (fresh) console.log(`embedded ${fresh} new photos in ${((Date.now() - t0) / 1000).toFixed(0)}s (avg ${((Date.now() - t0) / fresh / 1000).toFixed(2)}s/photo, CPU, q4)`);

const pos = photos.filter((p) => p.label);
const neg = photos.filter((p) => !p.label);

// ---- raw ranking stats per prefix variant ----
interface Raw {
  top1: string; // best non-guardian owner overall
  top5: string[];
  bestCat: string;
  catScores: Map<string, number>;
  s1: { owner: string; score: number } | null; // within best category, non-guardian
  s2: { owner: string; score: number } | null;
  c1Score: number;
}
function rawFor(p: Photo, bank: Bank): Raw {
  const owners = [...scoreOwners(p.vec!, bank).values()].sort((a, b) => b.score - a.score || a.owner.localeCompare(b.owner));
  const species = owners.filter((o) => !o.guardian);
  const catScores = new Map<string, number>();
  for (const o of owners) if (!catScores.has(o.category)) catScores.set(o.category, o.score);
  const bestCat = owners[0]!.category;
  const inCat = species.filter((o) => o.category === bestCat);
  return {
    top1: species[0]!.owner,
    top5: species.slice(0, 5).map((o) => o.owner),
    bestCat,
    catScores,
    s1: inCat[0] ? { owner: inCat[0].owner, score: inCat[0].score } : null,
    s2: inCat[1] ? { owner: inCat[1].owner, score: inCat[1].score } : null,
    c1Score: owners[0]!.score,
  };
}
function rawStats(raws: Raw[], ps: Photo[]) {
  let t1 = 0, t5 = 0, cat = 0, inCatTop1 = 0;
  ps.forEach((p, i) => {
    const r = raws[i]!;
    if (r.top1 === p.label) t1++;
    if (r.top5.includes(p.label!)) t5++;
    if (r.bestCat === p.category) { cat++; if (r.s1?.owner === p.label) inCatTop1++; }
  });
  return { n: ps.length, top1: t1 / ps.length, top5: t5 / ps.length, category: cat / ps.length, speciesGivenCat: cat ? inCatTop1 / cat : 0 };
}

const variants: Record<string, { bank: Bank; raws: Raw[]; stats: ReturnType<typeof rawStats> }> = {};
for (const name of Object.keys(TEXT_PREFIXES)) {
  const bank = await buildBank(roster, name, embedder);
  const raws = pos.map((p) => rawFor(p, bank));
  variants[name] = { bank, raws, stats: rawStats(raws, pos) };
  const s = variants[name]!.stats;
  console.log(`prefix ${name.padEnd(15)} top1 ${(s.top1 * 100).toFixed(1)}%  top5 ${(s.top5 * 100).toFixed(1)}%  category ${(s.category * 100).toFixed(1)}%`);
}
const prefixOrder = Object.keys(variants).sort((a, b) => {
  const A = variants[a]!.stats, B = variants[b]!.stats;
  return B.top1 - A.top1 || B.category - A.category || (a === DEFAULT_PREFIX ? -1 : b === DEFAULT_PREFIX ? 1 : 0);
});
const chosen = prefixOrder[0]!;
console.log(`chosen prefix variant: ${chosen}`);
const bank = variants[chosen]!.bank;

// ---- outcome model (mirrors app match.ts; verified against it below) ----
type Kind = "species_ok" | "species_wrong" | "guardian_right_cat" | "guardian_wrong_cat" | "nobody";
interface Feat { label: string | null; category: string | null; c1: string; c1Score: number; s1: string | null; s1Score: number; gap: number }
const featOf = (p: Photo, r: Raw): Feat => ({
  label: p.label, category: p.category, c1: r.bestCat, c1Score: r.c1Score,
  s1: r.s1?.owner ?? null, s1Score: r.s1?.score ?? -Infinity, gap: r.s1 && r.s2 ? r.s1.score - r.s2.score : Infinity,
});
function outcome(f: Feat, th: Thresholds): { kind: Kind | "neg_nobody" | "neg_guardian" | "neg_species"; owner?: string } {
  const catT = th.category[f.c1] ?? th.global_min;
  if (f.c1Score < th.global_min || f.c1Score < catT) return { kind: f.label ? "nobody" : "neg_nobody" };
  const spT = th.species[f.c1] ?? th.global_min;
  const named = f.s1 && f.s1Score >= spT && f.gap >= th.margin;
  if (!f.label) return { kind: named ? "neg_species" : "neg_guardian", owner: named ? f.s1! : undefined };
  if (named) return { kind: f.s1 === f.label ? "species_ok" : "species_wrong", owner: f.s1! };
  return { kind: f.c1 === f.category ? "guardian_right_cat" : "guardian_wrong_cat" };
}
const utilOf = (k: string) =>
  ({ species_ok: U.species_ok, species_wrong: U.species_wrong, guardian_right_cat: U.guardian_right_cat, guardian_wrong_cat: U.guardian_wrong_cat, nobody: U.nobody_on_positive, neg_nobody: U.nobody_on_negative, neg_guardian: U.guardian_on_negative, neg_species: U.species_on_negative } as Record<string, number>)[k]!;

const round4 = (x: number) => Math.round(x * 10000) / 10000;
function candidatesFrom(values: number[], lo: number, hi: number) {
  const v = [...new Set(values.filter(Number.isFinite).map(round4))].sort((a, b) => a - b);
  const out = [lo];
  for (let i = 0; i + 1 < v.length; i++) out.push((v[i]! + v[i + 1]!) / 2);
  if (v.length) { out.push(v[0]! - 0.005, v[v.length - 1]! + 0.005); }
  out.push(hi);
  return [...new Set(out.map(round4))].filter((x) => x >= lo && x <= hi).sort((a, b) => a - b);
}

type Mode = "per_category" | "pooled" | "shrunk";
function fit(feats: Feat[], mode: Mode): Thresholds {
  // Coarse grids for the global knobs (keeps the search fast and the knobs smooth); exact
  // midpoints between observed scores for the per-category species thresholds.
  const sc = feats.map((f) => f.c1Score).sort((a, b) => a - b);
  const gmCands = [0, ...Array.from({ length: 41 }, (_, i) => round4(sc[0]! - 0.01 + ((sc[sc.length - 1]! - sc[0]! + 0.02) * i) / 40))].filter((x) => x >= 0);
  const mCands = Array.from({ length: 25 }, (_, i) => round4(i * 0.0025));
  const isWrong = (k: string) => k === "species_wrong" || k === "neg_species";
  // Best threshold for a set of feats with a shared species threshold t (all else fixed).
  // Among tied-best candidates take the median: keeps the threshold away from the observed scores.
  function bestT(fs: Feat[], th: Thresholds, setT: (t: number) => void) {
    const tCands = candidatesFrom(fs.map((f) => f.s1Score), 0, 1);
    const scored = tCands.map((t) => {
      setT(t);
      let u = 0, w = 0;
      for (const f of fs) { const k = outcome(f, th).kind; u += utilOf(k); if (isWrong(k)) w++; }
      return { t, u, w };
    });
    const top = Math.max(...scored.map((s) => s.u));
    const tied = scored.filter((s) => s.u > top - 1e-9);
    const minW = Math.min(...tied.map((s) => s.w));
    const pick = tied.filter((s) => s.w === minW);
    return pick[Math.floor(pick.length / 2)]!;
  }
  let best: { u: number; wrong: number; th: Thresholds } | null = null;
  for (const gm of gmCands) {
    for (const m of mCands) {
      const th: Thresholds = { category: {}, species: {}, margin: m, global_min: gm };
      for (const c of cats) th.category[c] = gm;
      const passing = feats.filter((f) => f.c1Score >= gm);
      // pooled: one species threshold for every category
      const pooled = bestT(passing, th, (t) => { for (const c of cats) th.species[c] = t; }).t;
      for (const c of cats) {
        const fc = passing.filter((f) => f.c1 === c);
        const own = fc.length ? bestT(fc, th, (t) => { th.species[c] = t; }).t : pooled;
        th.species[c] = mode === "pooled" ? pooled : mode === "per_category" ? own : (own + pooled) / 2;
      }
      let u = 0, wrong = 0;
      for (const f of feats) { const k = outcome(f, th).kind; u += utilOf(k); if (isWrong(k)) wrong++; }
      if (!best || u > best.u + 1e-9 || (Math.abs(u - best.u) < 1e-9 && wrong < best.wrong)) best = { u, wrong, th: structuredClone(th) };
    }
  }
  return best!.th;
}

const featsAll = photos.map((p) => featOf(p, rawFor(p, bank)));

// Cross-validation per strategy: refit on 2 of 3 photo folds, evaluate on the held-out fold.
function crossValidate(mode: Mode) {
  const kinds: string[] = [];
  for (let k = 0; k < 3; k++) {
    const th = fit(featsAll.filter((_, i) => photos[i]!.fold !== k), mode);
    featsAll.forEach((f, i) => { if (photos[i]!.fold === k) kinds.push(outcome(f, th).kind); });
  }
  return { kinds, u: kinds.reduce((s, k) => s + utilOf(k), 0), wrong: kinds.filter((k) => k === "species_wrong" || k === "neg_species").length };
}
const modes: Mode[] = ["per_category", "shrunk", "pooled"];
const cvByMode = Object.fromEntries(modes.map((m) => [m, crossValidate(m)])) as Record<Mode, ReturnType<typeof crossValidate>>;
const mode = [...modes].sort((a, b) => cvByMode[b].u - cvByMode[a].u || cvByMode[a].wrong - cvByMode[b].wrong)[0]!;
console.log(`threshold strategy by CV utility: ${modes.map((m) => `${m}=${cvByMode[m].u.toFixed(2)} (wrong ${cvByMode[m].wrong})`).join(", ")} → ${mode}`);
const cvKinds = cvByMode[mode].kinds;

const thresholds = fit(featsAll, mode);
for (const c of cats) { thresholds.species[c] = round4(thresholds.species[c]!); thresholds.category[c] = round4(thresholds.category[c]!); }
thresholds.margin = round4(thresholds.margin);
thresholds.global_min = round4(thresholds.global_min);

// Verify our outcome model against the app's real matcher.
let disagreements = 0;
const finals = photos.map((p, i) => {
  const r = match(p.vec!, bank as any, thresholds);
  const mine = outcome(featsAll[i]!, thresholds);
  const appKind = r.outcome.kind;
  const myKind = mine.kind.startsWith("species") || mine.kind === "neg_species" ? "species" : mine.kind.includes("guardian") ? "guardian" : "nobody";
  if (appKind !== myKind || (appKind === "species" && (r.outcome as any).owner !== mine.owner)) disagreements++;
  return { p, r, kind: mine.kind };
});
console.log(`matcher parity (pipeline model vs app/src/match.ts): ${photos.length - disagreements}/${photos.length} agree`);

// ---- metrics ----
const count = (ks: string[], k: string) => ks.filter((x) => x === k).length;
function summary(kinds: string[], nPos: number, nNeg: number) {
  const pk = kinds.filter((k) => !k.startsWith("neg_"));
  const nk = kinds.filter((k) => k.startsWith("neg_"));
  return {
    species_ok: count(pk, "species_ok") / nPos,
    guardian_fallback: (count(pk, "guardian_right_cat") + count(pk, "guardian_wrong_cat")) / nPos,
    guardian_right_cat: count(pk, "guardian_right_cat") / nPos,
    guardian_wrong_cat: count(pk, "guardian_wrong_cat") / nPos,
    wrong_confident: count(pk, "species_wrong") / nPos,
    nobody: count(pk, "nobody") / nPos,
    precision_when_named: count(pk, "species_ok") / Math.max(1, count(pk, "species_ok") + count(pk, "species_wrong")),
    negatives_rejected: nNeg ? count(nk, "neg_nobody") / nNeg : null,
    negatives_named: nNeg ? count(nk, "neg_species") / nNeg : null,
  };
}
const inSample = summary(finals.map((f) => f.kind), pos.length, neg.length);
const cv = summary(cvKinds, pos.length, neg.length);
const raw = variants[chosen]!.stats;

// No-threshold baseline: always name the top species of the top category.
const baselineWrong = pos.filter((p, i) => variants[chosen]!.raws[i]!.s1?.owner !== p.label).length / pos.length;

// Image-anchor experiment (not shipped): leave-one-out, other photos of the same character added as rows.
function anchorExperiment() {
  let t1 = 0, cat = 0;
  for (const p of pos) {
    const extra = pos.filter((q) => q !== p);
    const vectors = new Float32Array(bank.vectors.length + extra.length * bank.dim);
    vectors.set(bank.vectors);
    const index = [...bank.index];
    extra.forEach((q, j) => {
      vectors.set(q.vec!, bank.vectors.length + j * bank.dim);
      index.push({ row: index.length, owner: q.label!, category: q.category!, guardian: false });
    });
    const r = rawFor(p, { dim: bank.dim, vectors, index });
    if (r.top1 === p.label) t1++;
    if (r.bestCat === p.category) cat++;
  }
  // Why: compare score scales. Best photo→own-text cosine vs best photo→other-species-photo cosine.
  const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!; return s; };
  let ownText = 0, otherImg = 0;
  for (const p of pos) {
    const own = scoreOwners(p.vec!, bank).get(p.label!)!.score;
    ownText += own;
    otherImg += Math.max(...pos.filter((q) => q.label !== p.label).map((q) => dot(p.vec!, q.vec!)));
  }
  return { top1: t1 / pos.length, category: cat / pos.length, meanOwnText: ownText / pos.length, meanBestOtherImage: otherImg / pos.length };
}
const anchors = anchorExperiment();

// ---- persist ----
writeJson(CALIBRATION_JSON, {
  prefix: chosen,
  thresholds,
  summary: { at: new Date().toISOString(), photos: pos.length, negatives: neg.length, strategy: mode, raw, inSample, crossValidated: cv, anchors, weights: U },
});
writeBank(bank);
writeRuntime();

// ---- report ----
const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
const L: string[] = [];
const rejectedCount = Object.values(readJson<{ reject: Record<string, string[]> }>(join(CAL_DIR, "curation.json"), { reject: {} }).reject).reduce((s, v) => s + v.length, 0);
L.push("# Calibration report", "");
L.push(`Generated by \`npm run calibrate\` on ${new Date().toISOString().slice(0, 10)}. Model \`onnx-community/embeddinggemma-2-ONNX\`, dtype \`q4\`, CPU (Node), image processor defaults (280 soft tokens). Matcher: the app's own \`app/src/match.ts\` (CONTRACT §3), parity ${photos.length - disagreements}/${photos.length}.`, "");
L.push("## In one paragraph", "");
L.push(`Out of ${pos.length} real photos, EmbeddingGemma 2 put the right character first ${pct(raw.top1)} of the time with no thresholds at all. Naming that top guess every time would have meant a wrong name on ${pct(baselineWrong)} of photos. With the calibrated thresholds and the guardian fallback, the app names the right character ${pct(cv.species_ok)} of the time (cross-validated). A guardian steps in ${pct(cv.guardian_fallback)} of the time, and a confidently wrong name drops to ${pct(cv.wrong_confident)}. When it does give a name, it is right ${pct(cv.precision_when_named)} of the time. ${neg.length ? `${pct(inSample.negatives_rejected)} of the indoor negative photos got "nobody wants to talk" and ${pct(inSample.negatives_named)} got a character name.` : ""} Most of the misses are shape-alike cross-category pairs (a mosque dome vs Mazar-e-Quaid, a peepal vs a wall-peepal sapling, ants on grass vs lawn grass) rather than random noise.`, "");
L.push("## Method", "");
L.push(`- **Photos:** ${pos.length} real photos of ${new Set(pos.map((p) => p.label)).size}/${roster.categories.reduce((s, c) => s + c.characters.length, 0)} characters from Wikimedia Commons (CC0 / PD / CC BY / CC BY-SA, ≤768px; see [ATTRIBUTION.md](ATTRIBUTION.md)), found by scientific/common-name search. Search results were checked by eye on contact sheets: ${rejectedCount} obviously wrong hits (botanical drawings, the wrong subject, such as a lava fountain or zebras for "zebra crossing") were rejected in \`calibration/curation.json\` and replaced by the next search results. Nothing was rejected for being *hard*: distant shots, odd framing and unusual scenes stay in. ${neg.length} negative photos (indoor objects that are nobody) test the "nobody wants to talk" floor.${missing.length ? ` No suitable photo: ${missing.join(", ")}.` : ""}`);
L.push(`- **Text side:** ${bank.index.length} descriptions (${roster.categories.length} guardians + ${roster.categories.reduce((s, c) => s + c.characters.length, 0)} characters), embedded once per prefix variant. The photo is embedded with no prefix (model card: prefixes are text-only).`);
L.push(`- **Thresholds** are fit to maximise a utility that punishes confident wrong names hardest: correct name +${U.species_ok}, guardian hint in the right category +${U.guardian_right_cat}, guardian in the wrong category ${U.guardian_wrong_cat}, "nobody" on a real thing ${U.nobody_on_positive}, **wrong name ${U.species_wrong}**; negatives: nobody +${U.nobody_on_negative}, guardian ${U.guardian_on_negative}, name ${U.species_on_negative}. One global margin and floor. Species thresholds: three strategies were compared by cross-validation (per-category, one pooled threshold, and per-category shrunk halfway to the pooled one); the best CV utility wins. Among equally good thresholds the median is taken, so a category with no observed mistakes doesn't collapse to 0. Category thresholds equal the global floor (too few negatives per category to fit them separately).`);
L.push("- **Honesty check:** with ~3 photos per character, in-sample numbers flatter the thresholds. The cross-validated column refits thresholds on 2 of 3 photo folds and scores the held-out fold.");
L.push("- **Caveats:** Commons photos are cleaner and better framed than phone snapshots, and these come from the internet rather than a real street. The phone runs the same q4 weights in the browser (WebGPU/wasm) while this ran on CPU in Node, and laptop/phone parity has not been measured here. Treat these numbers as an upper bound for real use.", "");
L.push("| Species-threshold strategy | CV utility | CV wrong names | CV correct names |", "|---|---|---|---|");
for (const m of modes) L.push(`| ${m === mode ? `**${m}** (chosen)` : m} | ${cvByMode[m].u.toFixed(2)} | ${cvByMode[m].wrong} | ${cvByMode[m].kinds.filter((k) => k === "species_ok").length} |`);
L.push("");

L.push("## Prefix variants (raw ranking, no thresholds)", "");
L.push("| Variant | Text input | Top-1 species | Top-5 species | Category |", "|---|---|---|---|---|");
for (const name of prefixOrder) {
  const s = variants[name]!.stats;
  const lit = TEXT_PREFIXES[name]!("…", "{species}").replace(/\|/g, "\\|");
  L.push(`| ${name === chosen ? `**${name}** (chosen)` : name} | \`${lit}\` | ${pct(s.top1)} | ${pct(s.top5)} | ${pct(s.category)} |`);
}
L.push("");
L.push("## Headline numbers", "");
L.push("| Metric | In-sample | Cross-validated |", "|---|---|---|");
L.push(`| Raw top-1 species accuracy (no thresholds, all ${roster.categories.reduce((s, c) => s + c.characters.length, 0)} characters) | ${pct(raw.top1)} | — |`);
L.push(`| Raw category accuracy | ${pct(raw.category)} | — |`);
L.push(`| Raw species accuracy *given* the right category | ${pct(raw.speciesGivenCat)} | — |`);
L.push(`| Wrong name if we always named the top species (no fallback) | ${pct(baselineWrong)} | — |`);
L.push(`| **Correct character named** | ${pct(inSample.species_ok)} | ${pct(cv.species_ok)} |`);
L.push(`| **Guardian fallback** (total) | ${pct(inSample.guardian_fallback)} | ${pct(cv.guardian_fallback)} |`);
L.push(`|   …guardian of the right category | ${pct(inSample.guardian_right_cat)} | ${pct(cv.guardian_right_cat)} |`);
L.push(`|   …guardian of the wrong category | ${pct(inSample.guardian_wrong_cat)} | ${pct(cv.guardian_wrong_cat)} |`);
L.push(`| **Wrong-confident** (named the wrong character) | ${pct(inSample.wrong_confident)} | ${pct(cv.wrong_confident)} |`);
L.push(`| "Nobody wants to talk" on a real thing | ${pct(inSample.nobody)} | ${pct(cv.nobody)} |`);
L.push(`| Precision when a name is given | ${pct(inSample.precision_when_named)} | ${pct(cv.precision_when_named)} |`);
L.push(`| Negatives correctly "nobody" | ${pct(inSample.negatives_rejected)} | ${pct(cv.negatives_rejected)} |`);
L.push(`| Negatives given a character name | ${pct(inSample.negatives_named)} | ${pct(cv.negatives_named)} |`);
L.push("");

L.push("## Thresholds shipped", "");
L.push(`Global floor \`global_min\` = ${thresholds.global_min}, species margin = ${thresholds.margin}.`, "");
L.push("| Category | Photos | Category acc. (raw) | Species threshold | Named ✓ | Named ✗ | Guardian | Nobody |", "|---|---|---|---|---|---|---|---|");
for (const c of cats) {
  const fs = finals.filter((f) => f.p.category === c);
  const rawCat = pos.map((p, i) => ({ p, r: variants[chosen]!.raws[i]! })).filter((x) => x.p.category === c);
  const ca = rawCat.filter((x) => x.r.bestCat === c).length;
  L.push(`| ${c} | ${fs.length} | ${ca}/${rawCat.length} | ${thresholds.species[c]} | ${count(fs.map((f) => f.kind), "species_ok")} | ${count(fs.map((f) => f.kind), "species_wrong")} | ${count(fs.map((f) => f.kind), "guardian_right_cat") + count(fs.map((f) => f.kind), "guardian_wrong_cat")} | ${count(fs.map((f) => f.kind), "nobody")} |`);
}
L.push("");

// Category confusion (raw best category).
L.push("## Category confusion (raw, rows = truth, columns = best category)", "");
const short = (c: string) => c.replace("small-creatures", "small").replace("fruits-vegetables", "fruit").replace("structures", "struct").replace("vehicles", "vehic");
L.push(`| truth \\ predicted | ${cats.map(short).join(" | ")} |`, `|---|${cats.map(() => "---").join("|")}|`);
for (const c of cats) {
  const row = cats.map((d) => {
    const n = pos.filter((p, i) => p.category === c && variants[chosen]!.raws[i]!.bestCat === d).length;
    return n ? (c === d ? `**${n}**` : String(n)) : "·";
  });
  L.push(`| ${short(c)} | ${row.join(" | ")} |`);
}
L.push("");

// Worst confusions.
const pairs = new Map<string, number>();
pos.forEach((p, i) => {
  const t = variants[chosen]!.raws[i]!.top1;
  if (t !== p.label) pairs.set(`${p.label} → ${t}`, (pairs.get(`${p.label} → ${t}`) ?? 0) + 1);
});
L.push("## Worst species confusions (raw top-1)", "");
const sortedPairs = [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
L.push("| Truth → predicted | Photos |", "|---|---|");
for (const [k, n] of sortedPairs) L.push(`| ${k} | ${n} |`);
L.push("");
const wrongNamed = finals.filter((f) => f.kind === "species_wrong" || f.kind === "neg_species");
L.push("### Confident wrong answers that survive the thresholds", "");
if (!wrongNamed.length) L.push("None in-sample.");
for (const f of wrongNamed) {
  const o = (f.r.outcome as any).owner;
  L.push(`- \`${f.p.file}\` (${f.p.label ?? "negative"}) was named **${o}** (score ${(f.r.outcome as any).score.toFixed(3)}).`);
}
L.push("");

// What the guardian rescued.
const rescued = finals.filter((f, i) => f.p.label && f.kind.startsWith("guardian") && variants[chosen]!.raws[pos.indexOf(f.p)]?.s1?.owner !== f.p.label);
const lost = finals.filter((f) => f.p.label && f.kind.startsWith("guardian") && variants[chosen]!.raws[pos.indexOf(f.p)]?.s1?.owner === f.p.label);
L.push("## What the guardian fallback did", "");
L.push(`- **Rescued ${rescued.length} photos** that would otherwise have been given a wrong name (the top species in the top category was wrong; the guardian asked for a closer look instead). ${rescued.filter((f) => f.kind === "guardian_right_cat").length} of those were at least the right category's guardian.`);
L.push(`- **Cost:** ${lost.length} photos whose top species was actually right were sent to the guardian anyway (margin or score too low to be sure).`);
L.push(`- Examples rescued: ${rescued.slice(0, 8).map((f) => `${f.p.label} (would have said ${variants[chosen]!.raws[pos.indexOf(f.p)]!.s1?.owner})`).join("; ") || "none"}.`, "");

L.push("## What's next (measured, not shipped)", "");
const anchorVerb = anchors.top1 >= raw.top1 ? "raises" : "**lowers**";
L.push(`- **Image anchors** (PLAN §3 mitigation 4), naive version: leave-one-out with every other Commons photo added as an extra row ${anchorVerb} raw top-1 species accuracy from ${pct(raw.top1)} to ${pct(anchors.top1)} (category ${pct(raw.category)} → ${pct(anchors.category)}). The reason is scale: a photo's best cosine to its own *text* averages ${anchors.meanOwnText.toFixed(3)}, but its best cosine to *some other species' photo* averages ${anchors.meanBestOtherImage.toFixed(3)}. Image–image similarity is on a higher scale, so mixed rows let photo style (lighting, framing, background) outvote the descriptions. Anchors would need their own score track and calibration (for example image rows compared only against image rows, with a separate threshold), not just extra rows. Not shipped.`);
L.push("- Field photos from the actual walk (real streets) should replace Commons photos as the calibration set; Commons skews to textbook shots.");
L.push("- Text side uses the same q4 weights as the phone; an fp32 text side was not compared in this run.", "");

L.push("## Per-photo outcomes", "", "<details><summary>All photos</summary>", "", "| Photo | Truth | Raw top-1 | Outcome |", "|---|---|---|---|");
finals.forEach((f) => {
  const r = rawFor(f.p, bank);
  const o = f.r.outcome as any;
  const shown = o.kind === "species" ? `named ${o.owner}` : o.kind === "guardian" ? `guardian(${o.category})` : "nobody";
  L.push(`| ${f.p.file} | ${f.p.label ?? "(negative)"} | ${r.top1} | ${shown}${f.kind === "species_wrong" || f.kind === "neg_species" ? " ✗" : f.kind === "species_ok" ? " ✓" : ""} |`);
});
L.push("", "</details>", "");
writeFileSync(join(CAL_DIR, "REPORT.md"), L.join("\n"), "utf8");

console.log(JSON.stringify({ prefix: chosen, raw, inSample, crossValidated: cv, anchors, thresholds }, null, 2));
