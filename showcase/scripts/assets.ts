// Collects everything the compositions need into public/ and src/generated/:
//   fonts, screenshots (fixture badge masked), real character lines (+ word timings),
//   a real match trace from the calibration set, roster stats, footage slots, ambient bed.
// Read-only towards the app and pipeline; writes only inside showcase/.
//   npx tsx scripts/assets.ts
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CHARACTER_LINES } from "../src/content/lines.ts";
import { FOOTAGE_SLOTS } from "../src/footage.ts";
import { match } from "../../app/src/match.ts";
import { SHOWCASE, WEEK1 } from "./eleven.ts";

const APP = join(WEEK1, "app");
const PUB = join(SHOWCASE, "public");
const GEN = join(SHOWCASE, "src", "generated");
for (const d of ["fonts", "shots", "lines", "footage", "ambient", "photos"]) mkdirSync(join(PUB, d), { recursive: true });
mkdirSync(GEN, { recursive: true });
// Real photos for the video cards (the app shows your own photo on each card).
for (const id of ["neem-tree", "lawn-grass"]) copyFileSync(join(WEEK1, "pipeline", "calibration", "photos", id, "1.jpg"), join(PUB, "photos", id + ".jpg"));

const ff = (args: string[]) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
const probeDuration = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());
const pixel = (file: string, x: number, y: number) => {
  const b = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", `crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  return `0x${[...b.subarray(0, 3)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
};

/** True when the strip where the fixture badge sits has any dark pixels (text or dashed border). */
const badgePresent = (file: string) => {
  const b = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-vf", "crop=200:44:550:36,format=gray", "-f", "rawvideo", "-"]);
  let dark = 0;
  for (const v of b) if (v < 150) dark++;
  return dark > 40;
};

// ---------- fonts ----------
const FONTS: Record<string, string> = {
  "eb-garamond.woff2": "node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2",
  "eb-garamond-italic.woff2": "node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-italic.woff2",
  "atkinson-400.woff2": "node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2",
  "atkinson-600.woff2": "node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-600-normal.woff2",
  "atkinson-700.woff2": "node_modules/@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2",
};
for (const [out, src] of Object.entries(FONTS)) copyFileSync(join(APP, src), join(PUB, "fonts", out));

// ---------- screenshots ----------
// Picked by suffix so renumbering in app/tools/screens.ts doesn't break anything.
const SHOT_DIR = join(APP, "screenshots");
const shotFiles = readdirSync(SHOT_DIR).filter((f) => f.endsWith(".png"));
// Avoid captures made with the test camera (solid green) or the mock embedder (debug scores).
const SHOTS: Record<string, string[]> = {
  home: ["phone-light-*-home.png", "phone-light-*-listen.png"],
  encounter: ["phone-light-*-encounter-caption.png", "phone-light-*-encounter-new-elder.png", "phone-light-*-encounter-elder.png"],
  cardNew: ["phone-light-*-encounter-new-elder.png", "phone-light-*-encounter-caption.png", "phone-light-*-encounter-elder.png"],
  guide: ["phone-light-*-field-guide.png", "phone-light-*-guide.png"],
  ready: ["real-setup-ready.png", "phone-light-*-setup-ready.png"],
  offline: ["real-offline-encounter.png"],
};
const globRe = (g: string) => new RegExp(`^${g.replace(/[.]/g, "\\.").replace(/\*/g, "[^]*?")}$`);
const shots: Record<string, string | null> = {};
for (const [key, pats] of Object.entries(SHOTS)) {
  let hit: string | undefined;
  for (const p of pats) {
    hit = shotFiles.filter((f) => globRe(p).test(f)).sort().pop();
    if (hit) break;
  }
  if (!hit) {
    shots[key] = null;
    console.log(`  shot ${key}: missing`);
    continue;
  }
  const src = join(SHOT_DIR, hit);
  const out = join(PUB, "shots", `${key}.png`);
  // Crop to one phone screen (some captures are full-page). If an older fixture capture still carries the
  // dev-only "DEV FIXTURE" badge (top right differs from the header colour), paint it out.
  const filters = ["crop=780:min(ih\\,1688):0:0"];
  const bg = pixel(src, 520, 60);
  if (!hit.startsWith("real-") && badgePresent(src)) filters.push(`drawbox=x=540:y=26:w=225:h=70:color=${bg}:t=fill`);
  ff(["-i", src, "-vf", filters.join(","), out]);
  shots[key] = `shots/${key}.png`;
  console.log(`  shot ${key}: ${hit}`);
}

// ---------- roster: lines, stats ----------
const roster = JSON.parse(readFileSync(join(APP, "public", "data", "roster.runtime.json"), "utf8"));
const owners: any[] = roster.categories.flatMap((c: any) => [{ ...c.guardian, category: c.id, guardian: true }, ...c.characters]);
const ownerById = new Map(owners.map((o) => [o.id, o]));
let lineCount = 0, eleven = 0, kokoro = 0, seconds = 0;
for (const o of owners) for (const l of Object.values<any>(o.lines)) {
  lineCount++;
  seconds += l.duration ?? 0;
  if (l.engine === "elevenlabs") eleven++;
  else kokoro++;
}
const elders = owners.filter((o) => o.tier === "elder").length;
const stats = {
  categories: roster.categories.length,
  owners: owners.length,
  characters: owners.filter((o) => !o.guardian).length,
  elders,
  lines: lineCount,
  elevenLines: eleven,
  kokoroLines: kokoro,
  audioMinutes: Math.round((seconds / 60) * 10) / 10,
  dim: roster.model.dim,
  modelId: roster.model.id,
  dtype: roster.model.dtype,
  rows: 0,
};

const lines: Record<string, unknown> = {};
for (const c of CHARACTER_LINES) {
  const o = ownerById.get(c.owner);
  const l = o.lines[c.line];
  const file = basename(l.src);
  const out = join(PUB, "lines", `${c.owner}.${file}`);
  copyFileSync(join(APP, "public", l.src), out);
  const alignFile = join(GEN, "align", `${file}.json`);
  const align = existsSync(alignFile) ? JSON.parse(readFileSync(alignFile, "utf8")) : null;
  lines[c.key] = {
    owner: c.owner,
    name: o.name,
    species: o.species ?? null,
    category: o.category,
    guardian: !!o.guardian,
    tier: o.tier ?? (o.guardian ? "guardian" : "common"),
    engine: l.engine,
    line: c.line,
    tagged: l.text,
    caption: l.caption,
    src: `lines/${c.owner}.${file}`,
    duration: probeDuration(out),
    words: align?.words ?? null,
    no: owners.findIndex((x) => x.id === c.owner) + 1,
  };
}

// ---------- a real match, end to end ----------
// The calibration photo embeddings (pipeline cache) run through the app's own match() against the
// shipped embedding bank, with the shipped thresholds. Same code path as the phone.
const index = JSON.parse(readFileSync(join(APP, "public", "data", "embeddings.index.json"), "utf8"));
const buf = readFileSync(join(APP, "public", "data", "embeddings.bin"));
const vectors = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const bank = { dim: roster.model.dim, vectors, index };
stats.rows = index.length;
const photoCache = JSON.parse(readFileSync(join(WEEK1, "pipeline", ".cache", "photo-embeddings.json"), "utf8"));
const latest = (photo: string) => {
  const keys = Object.keys(photoCache).filter((k) => k.startsWith(`${photo}:`));
  keys.sort((a, b) => Number(a.split(":").pop()) - Number(b.split(":").pop()));
  return photoCache[keys.at(-1)!] as number[];
};
const describe = (photo: string) => {
  const v = latest(photo);
  const r = match(v, bank, roster.thresholds, 5);
  const name = (id: string) => ownerById.get(id)?.name ?? id;
  return {
    photo,
    outcome: r.outcome.kind,
    owner: r.outcome.kind === "species" ? r.outcome.owner : null,
    ownerName: r.outcome.kind === "species" ? name(r.outcome.owner) : r.outcome.kind === "guardian" ? name(`${r.outcome.category}-guardian`) : null,
    category: r.trace.bestCategory,
    categoryScore: r.trace.categoryScore,
    categoryThreshold: r.trace.categoryThreshold,
    speciesThreshold: r.trace.speciesThreshold,
    margin: r.trace.margin,
    s1: r.trace.species1 && { id: r.trace.species1.owner, name: name(r.trace.species1.owner), score: r.trace.species1.score },
    s2: r.trace.species2 && { id: r.trace.species2.owner, name: name(r.trace.species2.owner), score: r.trace.species2.score },
    top: r.top.map((t) => ({ id: t.owner, name: name(t.owner), score: Math.round(t.score * 1000) / 1000, guardian: t.guardian })),
    // A coarse look at the actual vector, for the "768 numbers" visual.
    vector: Array.from(v, (x) => Math.round(x * 10000) / 10000),
  };
};
const matches = {
  named: describe("neem-tree/1.jpg"),
  guardian: describe("hibiscus/1.jpg"),
  nobody: describe("_negative/3.jpg"),
};
for (const [k, m] of Object.entries(matches)) console.log(`  match ${k}: ${m.photo} → ${m.outcome} ${m.ownerName ?? ""} (top: ${m.top[0]!.name} ${m.top[0]!.score})`);

// ---------- calibration numbers (week-1/pipeline/calibration/REPORT.md, 2026-10-08) ----------
const report = {
  photos: 232,
  charactersCovered: 78,
  top1: 89.2,
  top5: 98.7,
  category: 90.9,
  precisionNamed: 93.4, // cross-validated
  correctNamed: 78.9, // cross-validated
  wrongNoFallback: 12.1,
  wrongWithFallback: 5.6, // cross-validated
  negatives: 10,
  negativesNobody: 9,
  negativesNamed: 0,
  rescued: 13,
};

// ---------- ElevenLabs build credits for the app's 78 Elder lines ----------
// 701 = 461 for the first cast + 240 for the English recast (GET /v1/user/subscription: 558 → 798 after the recast, checked before the narration re-run).
const voiceBuild = { elevenLines: eleven, elevenCredits: 701 };

// ---------- footage slots ----------
const footage: Record<string, { src: string; duration: number } | null> = {};
rmSync(join(PUB, "footage"), { recursive: true, force: true });
mkdirSync(join(PUB, "footage"), { recursive: true });
for (const [slot, cfg] of Object.entries(FOOTAGE_SLOTS)) {
  const file = join(SHOWCASE, "footage", cfg.file);
  if (existsSync(file) && statSync(file).size > 0) {
    copyFileSync(file, join(PUB, "footage", cfg.file));
    footage[slot] = { src: `footage/${cfg.file}`, duration: probeDuration(file) };
    console.log(`  footage ${slot}: ${cfg.file} (${footage[slot]!.duration.toFixed(1)} s)`);
  } else footage[slot] = null;
}

// ---------- ambient bed: loop the short ElevenLabs SFX clip into a soft 100 s bed ----------
let ambient: { src: string; duration: number } | null = null;
const nar = existsSync(join(GEN, "narration.json")) ? JSON.parse(readFileSync(join(GEN, "narration.json"), "utf8")) : null;
if (nar?.ambient) {
  const src = join(PUB, nar.ambient.src);
  const out = join(PUB, "ambient", "bed.mp3");
  const d = nar.ambient.duration as number;
  const n = Math.ceil(100 / (d - 1.5)) + 1;
  // Chain crossfades so the loop seam is inaudible; lift the very quiet source and roll off rumble.
  const inputs = Array.from({ length: n }, () => ["-i", src]).flat();
  let graph = "";
  let last = "[0:a]";
  for (let i = 1; i < n; i++) {
    graph += `${last}[${i}:a]acrossfade=d=1.5:c1=tri:c2=tri[x${i}];`;
    last = `[x${i}]`;
  }
  graph += `${last}highpass=f=120,volume=16dB,atrim=0:100,afade=t=in:d=1.5[out]`;
  ff([...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "2", "-ar", "44100", "-b:a", "128k", out]);
  ambient = { src: "ambient/bed.mp3", duration: probeDuration(out) };
}

// ---------- film grain tile (static; overlaid at low opacity, like the app's paper grain) ----------
const grain = join(PUB, "grain.png");
if (!existsSync(grain)) ff(["-f", "lavfi", "-i", "color=c=0x808080:s=512x512,noise=alls=60:allf=u,format=gray", "-frames:v", "1", grain]);

writeFileSync(join(GEN, "assets.json"), JSON.stringify({ shots, lines, stats, report, voiceBuild, matches, footage, ambient }, null, 1));
console.log(`Wrote src/generated/assets.json. Stats: ${JSON.stringify(stats)}`);
