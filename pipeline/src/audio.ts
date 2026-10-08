// `npm run audio` — generate every voice line.
//   Elders (tier "elder") → ElevenLabs Eleven v4 with [tags] kept; everyone else → Kokoro-82M with tags stripped.
//   Idempotent: audio/<id>/<line>.<hash8>.mp3, hash = sha1(engine+voice+model+text); existing files are skipped.
//   --dry-run   print plan + character counts, no API calls, no synthesis.
//   --kokoro-only  skip ElevenLabs entirely (elders fall back to Kokoro).
// The ElevenLabs key is read inside eleven.ts and never printed, logged or written.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HttpError, subscription, tts } from "./eleven.ts";
import { AUDIO_MANIFEST, AUDIO_OUT, MODEL_CACHE, PIPELINE_DIR, ensureDir, loadRoster, readJson, sha8, stripTags, writeJson, type LineKey, type RosterOwner } from "./lib.ts";
import { writeRuntime, type AudioEntry, type AudioManifest } from "./runtime.ts";
import { ELEVEN_CAST, ELEVEN_FORMAT, ELEVEN_MODEL, isElder, kokoroCast, type KVoice } from "./voices.ts";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const KOKORO_ONLY = args.includes("--kokoro-only");
const KOKORO_MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const KOKORO_DTYPE = "fp32";
const RESERVE = 500;
const LINE_ORDER: LineKey[] = ["first_meet", "again", "goodbye", "hint"];

interface Job {
  owner: RosterOwner;
  line: LineKey;
  text: string; // original, with tags
  engine: "elevenlabs" | "kokoro";
  voice: string; // EL voice id, or kokoro "voice@speed"
  voiceName: string;
  model: string;
  input: string; // exactly what is sent to the engine
  src: string;
  file: string;
}

const roster = loadRoster();
const kcast = kokoroCast(roster);

function makeJob(owner: RosterOwner, line: LineKey, engine: "elevenlabs" | "kokoro"): Job {
  const text = owner.lines[line]!;
  let voice: string, voiceName: string, model: string, input: string;
  if (engine === "elevenlabs") {
    const v = ELEVEN_CAST[owner.id];
    if (!v) throw new Error(`no ElevenLabs voice cast for elder ${owner.id}`);
    voice = v.id; voiceName = v.name; model = ELEVEN_MODEL; input = text;
  } else {
    const k: KVoice = kcast[owner.id] ?? { voice: "af_heart", speed: 1 };
    voice = `${k.voice}@${k.speed}`; voiceName = k.voice; model = `${KOKORO_MODEL}:${KOKORO_DTYPE}`; input = stripTags(text);
  }
  const hash = sha8(engine + voice + model + input);
  const src = `audio/${owner.id}/${line}.${hash}.mp3`;
  return { owner, line, text, engine, voice, voiceName, model, input, src, file: join(AUDIO_OUT, owner.id, `${line}.${hash}.mp3`) };
}

// ---- plan ----
const allOwners: RosterOwner[] = roster.categories.flatMap((c) => [c.guardian, ...c.characters]);
const elders = allOwners.filter(isElder);
const jobs: Job[] = [];
for (const o of allOwners) for (const k of LINE_ORDER) if (o.lines[k]) jobs.push(makeJob(o, k, isElder(o) && !KOKORO_ONLY ? "elevenlabs" : "kokoro"));

const elJobs = jobs.filter((j) => j.engine === "elevenlabs");
const koJobs = jobs.filter((j) => j.engine === "kokoro");
const pendingEl = elJobs.filter((j) => !existsSync(j.file));
const pendingKo = koJobs.filter((j) => !existsSync(j.file));
const elChars = (js: Job[]) => js.reduce((s, j) => s + j.input.length, 0);

console.log(`plan: ${jobs.length} lines — ElevenLabs ${elJobs.length} (${elChars(elJobs)} chars, ${pendingEl.length} pending = ${elChars(pendingEl)} chars), Kokoro ${koJobs.length} (${pendingKo.length} pending)`);
if (DRY) {
  console.log("\nElevenLabs cast (model " + ELEVEN_MODEL + ", " + ELEVEN_FORMAT + "):");
  for (const o of elders) {
    const js = elJobs.filter((j) => j.owner.id === o.id);
    console.log(`  ${o.id.padEnd(22)} ${ELEVEN_CAST[o.id]?.name.padEnd(32)} ${elChars(js)} chars`);
  }
  console.log("\nKokoro cast:");
  for (const c of roster.categories) {
    console.log(`  [${c.id}] ${c.guardian.id}: ${kcast[c.guardian.id]!.voice}@${kcast[c.guardian.id]!.speed}`);
    for (const ch of c.characters) if (!isElder(ch) || KOKORO_ONLY) console.log(`      ${ch.id.padEnd(22)} ${kcast[ch.id]!.voice}@${kcast[ch.id]!.speed}   (${ch.voice})`);
  }
  console.log(`\nElevenLabs total: ${elChars(elJobs)} chars; pending ${elChars(pendingEl)} chars (≈ credits at 1 credit/char). Dry run: no API calls made.`);
  process.exit(0);
}

// ---- helpers ----
const manifest = readJson<AudioManifest>(AUDIO_MANIFEST, {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function duration(file: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Math.round(parseFloat(out.trim()) * 100) / 100;
}

function record(j: Job, engineUsed: Job) {
  const entry: AudioEntry = {
    owner: j.owner.id, line: j.line, text: j.text, caption: stripTags(j.text), src: engineUsed.src,
    engine: engineUsed.engine, voice: engineUsed.voice, voiceName: engineUsed.voiceName, model: engineUsed.model,
    duration: duration(engineUsed.file),
  };
  manifest[`${j.owner.id}/${j.line}`] = entry;
}
const saveManifest = () => writeJson(AUDIO_MANIFEST, manifest);

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]!);
  }));
}

// ---- ElevenLabs ----
const fallbackToKokoro: Job[] = [];
const elLog: Record<string, unknown> = {};

async function elGenerate(j: Job): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      const { audio } = await tts(j.voice, j.model, j.input, ELEVEN_FORMAT);
      ensureDir(join(AUDIO_OUT, j.owner.id));
      writeFileSync(j.file, audio);
      return;
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 0;
      const retryable = status === 429 || status >= 500 || status === 0;
      if (!retryable || attempt >= 5) throw e;
      const wait = 1500 * 2 ** attempt + Math.random() * 500;
      console.warn(`  ${j.owner.id}/${j.line}: ${status || "network"} — retry in ${(wait / 1000).toFixed(1)}s`);
      await sleep(wait);
    }
  }
}

async function runEleven() {
  // Lines already rendered by ElevenLabs always win over an older Kokoro fallback.
  for (const j of elJobs) if (existsSync(j.file)) record(j, j);
  if (!pendingEl.length) {
    console.log("ElevenLabs: nothing pending.");
    return;
  }
  let sub;
  try {
    sub = await subscription();
  } catch (e: any) {
    console.error(`ElevenLabs unavailable (${e.status ?? e.message}); all elder lines fall back to Kokoro.`);
    fallbackToKokoro.push(...pendingEl);
    elLog.error = String(e.status ?? "network");
    return;
  }
  const before = { used: sub.character_count, limit: sub.character_limit, remaining: sub.character_limit - sub.character_count };
  console.log(`ElevenLabs credits before: used ${before.used} / ${before.limit} (remaining ${before.remaining})`);
  elLog.before = before;

  // Priority order: first_meet lines of every elder first, then again, then goodbye (roster order within each).
  const ordered = [...pendingEl].sort((a, b) => LINE_ORDER.indexOf(a.line) - LINE_ORDER.indexOf(b.line));

  // 1) One probe line, then measure credits/char.
  const probe = ordered.shift()!;
  if (probe.input.length > before.remaining - RESERVE) {
    console.error("Not enough credits even for one line; falling back to Kokoro.");
    fallbackToKokoro.push(probe, ...ordered);
    return;
  }
  try {
    await elGenerate(probe);
    record(probe, probe);
  } catch (e: any) {
    console.error(`ElevenLabs probe failed (${e.status ?? e.message}); all elder lines fall back to Kokoro.`);
    elLog.error = String(e.status ?? e.message).slice(0, 200);
    fallbackToKokoro.push(probe, ...ordered);
    return;
  }
  // The usage counter lags behind generation (observed: 0 after the probe, settled minutes later),
  // so poll for a while; if it still hasn't moved, assume a conservative 1 credit/char.
  let mid = await subscription();
  for (let i = 0; i < 10 && mid.character_count === before.used; i++) {
    await sleep(3000);
    mid = await subscription();
  }
  const spent = mid.character_count - before.used;
  const rate = spent > 0 ? Math.max(spent / probe.input.length, 1) : 1; // never assume cheaper than 1/char
  if (spent === 0) console.log("  (usage counter has not moved yet; assuming 1 credit/char)");
  // Don't trust a lagging counter for the remaining balance either: use our own accounting if lower.
  const remainingNow = Math.min(mid.character_limit - mid.character_count, before.remaining - Math.ceil(probe.input.length * rate));
  const restChars = elChars(ordered);
  const projected = Math.ceil(restChars * rate);
  console.log(`probe: ${probe.input.length} chars cost ${spent} credits → ${rate.toFixed(3)} credits/char. Remaining ${remainingNow}; projected for ${ordered.length} more lines: ${projected}.`);
  elLog.probe = { chars: probe.input.length, credits: spent, rate };

  let todo = ordered;
  const budget = remainingNow - RESERVE;
  if (projected > budget) {
    console.warn(`Projected ${projected} > remaining − ${RESERVE} (${budget}). Generating first_meet lines only, in priority order.`);
    todo = [];
    let acc = 0;
    for (const j of ordered) {
      const cost = Math.ceil(j.input.length * rate);
      if (j.line === "first_meet" && acc + cost <= budget) { todo.push(j); acc += cost; }
      else fallbackToKokoro.push(j);
    }
  }

  // 2) Batch with a small pool and a running budget guard.
  let committed = 0;
  let failures = 0;
  await pool(todo, 2, async (j) => {
    const cost = Math.ceil(j.input.length * rate);
    if (committed + cost > budget) { fallbackToKokoro.push(j); return; }
    committed += cost;
    try {
      await elGenerate(j);
      record(j, j);
      process.stdout.write(`  EL ${j.owner.id}/${j.line} ✓\n`);
    } catch (e: any) {
      failures++;
      console.warn(`  EL ${j.owner.id}/${j.line} failed (${e.status ?? e.message}); Kokoro fallback.`);
      fallbackToKokoro.push(j);
    }
    if (Object.keys(manifest).length % 10 === 0) saveManifest();
  });
  saveManifest();
  await sleep(5000);
  const after = await subscription();
  console.log("  (note: the usage counter can take minutes to settle; re-check with `npx tsx src/eleven-slots.ts`)");
  const used = after.character_count - before.used;
  const made = [probe, ...todo].filter((j) => existsSync(j.file));
  console.log(`ElevenLabs credits after: used ${after.character_count} / ${after.character_limit} (remaining ${after.character_limit - after.character_count}); this run spent ${used} credits on ${made.length} lines / ${elChars(made)} chars (${(used / Math.max(1, elChars(made))).toFixed(3)} credits/char).`);
  elLog.after = { used: after.character_count, limit: after.character_limit, remaining: after.character_limit - after.character_count, spent: used, lines: made.length, chars: elChars(made), failures };
}

// ---- Kokoro ----
async function runKokoro(list: { job: Job; as: Job }[]) {
  const pending = list.filter(({ as }) => !existsSync(as.file));
  for (const { job, as } of list) if (existsSync(as.file)) record(job, as);
  if (!pending.length) { console.log("Kokoro: nothing pending."); return; }
  // kokoro-js bundles its own Transformers.js v3; point its cache at .model-cache too.
  const tjsUrl = pathToFileURL(join(PIPELINE_DIR, "node_modules", "kokoro-js", "node_modules", "@huggingface", "transformers", "dist", "transformers.node.mjs")).href;
  const { env } = await import(tjsUrl);
  env.cacheDir = MODEL_CACHE;
  const { KokoroTTS } = await import("kokoro-js");
  const t0 = Date.now();
  const k = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: KOKORO_DTYPE as any, device: "cpu" });
  console.log(`Kokoro loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s; ${pending.length} lines to synthesize.`);
  const tmp = join(tmpdir(), `votw-kokoro-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  let n = 0;
  for (const { job, as } of pending) {
    const [voice, speed] = as.voice.split("@");
    const audio = await k.generate(as.input, { voice: voice as any, speed: Number(speed) });
    const wav = join(tmp, `${as.owner.id}-${as.line}.wav`);
    await audio.save(wav);
    ensureDir(join(AUDIO_OUT, as.owner.id));
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "48k", as.file]);
    unlinkSync(wav);
    record(job, as);
    if (++n % 10 === 0) { console.log(`  kokoro ${n}/${pending.length}`); saveManifest(); }
  }
  rmSync(tmp, { recursive: true, force: true });
  saveManifest();
}

// ---- run ----
if (!KOKORO_ONLY) await runEleven();
const kList = [
  ...koJobs.map((j) => ({ job: j, as: j })),
  ...fallbackToKokoro.map((j) => ({ job: j, as: makeJob(j.owner, j.line, "kokoro") })),
];
await runKokoro(kList);

// Drop manifest entries whose text changed or whose file vanished; prune stale mp3s per owner.
const live = new Set<string>();
for (const j of jobs) {
  const m = manifest[`${j.owner.id}/${j.line}`];
  if (m && m.text === j.text && existsSync(join(AUDIO_OUT, m.src.replace(/^audio\//, "")))) live.add(m.src);
  else delete manifest[`${j.owner.id}/${j.line}`];
}
for (const k of Object.keys(manifest)) if (!jobs.some((j) => `${j.owner.id}/${j.line}` === k)) delete manifest[k];
let pruned = 0;
for (const dir of existsSync(AUDIO_OUT) ? readdirSync(AUDIO_OUT) : []) {
  for (const f of readdirSync(join(AUDIO_OUT, dir))) {
    if (!live.has(`audio/${dir}/${f}`)) { rmSync(join(AUDIO_OUT, dir, f)); pruned++; }
  }
}
saveManifest();
writeJson(join(PIPELINE_DIR, "build", "audio-run.json"), { at: new Date().toISOString(), eleven: elLog, fallbackToKokoro: fallbackToKokoro.map((j) => `${j.owner.id}/${j.line}`) });
writeRuntime();
const counts = Object.values(manifest).reduce((m, e) => ((m[e.engine] = (m[e.engine] ?? 0) + 1), m), {} as Record<string, number>);
console.log(`done: ${JSON.stringify(counts)}; fallbacks to Kokoro: ${fallbackToKokoro.length}; pruned stale files: ${pruned}`);
