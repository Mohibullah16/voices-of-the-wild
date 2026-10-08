// Generates the narration with ElevenLabs (eleven_v4) at build time.
//   npx tsx scripts/narration.ts --dry-run   # count characters, call nothing
//   npx tsx scripts/narration.ts             # generate missing lines only (hash-named, idempotent)
//   npx tsx scripts/narration.ts --ambient   # also generate the optional ambient bed (sound effects API)
// Logs usage numbers only. Hard cap: refuses to spend more than 1,500 credits in one run.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NARRATION, NARRATION_MODEL, NARRATOR } from "../src/content/narration.ts";
import { el, fmtUsage, SHOWCASE, usage } from "./eleven.ts";

const DRY = process.argv.includes("--dry-run");
const AMBIENT = process.argv.includes("--ambient");
const HARD_CAP = 1500;
const MAX_NARRATION_CHARS = 1200;
const AMBIENT_SECONDS = 7;
const AMBIENT_PROMPT =
  "Gentle outdoor morning ambience in a quiet city park: soft breeze through leaves, a few distant birds chirping, very calm, no music, no voices, no traffic.";

const OUT = join(SHOWCASE, "public", "narration");
const GEN = join(SHOWCASE, "src", "generated");
mkdirSync(OUT, { recursive: true });
mkdirSync(GEN, { recursive: true });

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);
const stripTags = (s: string) => s.replace(/\[[^\]]*\]\s*/g, "").replace(/\s+/g, " ").trim();
const probeDuration = (file: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

interface Word {
  text: string;
  start: number;
  end: number;
}

/** Character alignment → words, with [tags] removed. */
function wordsFromAlignment(al: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  let inTag = false;
  al.characters.forEach((ch, i) => {
    if (ch === "[") inTag = true;
    if (inTag) {
      if (ch === "]") inTag = false;
      return;
    }
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    const s = al.character_start_times_seconds[i]!;
    const e = al.character_end_times_seconds[i]!;
    if (!cur) cur = { text: ch, start: s, end: e };
    else {
      cur.text += ch;
      cur.end = e;
    }
  });
  if (cur) words.push(cur);
  return words;
}

/** Fallback when no alignment is available: spread words by character count. */
function estimateWords(caption: string, duration: number): Word[] {
  const ws = caption.split(" ");
  const total = ws.reduce((n, w) => n + w.length + 1, 0);
  let t = 0.15;
  const span = duration - 0.3;
  return ws.map((w) => {
    const d = ((w.length + 1) / total) * span;
    const out = { text: w, start: t, end: t + d };
    t += d;
    return out;
  });
}

const jobs = NARRATION.map((n) => {
  const h = hash(`${NARRATION_MODEL}|${NARRATOR.id}|${n.text}`);
  return { ...n, hash: h, mp3: join(OUT, `${n.id}.${h}.mp3`), align: join(OUT, `${n.id}.${h}.align.json`) };
});
const totalChars = jobs.reduce((n, j) => n + j.text.length, 0);
const pending = jobs.filter((j) => !existsSync(j.mp3));
const pendingChars = pending.reduce((n, j) => n + j.text.length, 0);
console.log(`Narration: ${jobs.length} lines, ${totalChars} chars total (limit ${MAX_NARRATION_CHARS}); pending ${pending.length} lines / ${pendingChars} chars.`);
if (totalChars > MAX_NARRATION_CHARS) throw new Error(`Narration is ${totalChars} chars; keep it ≤ ${MAX_NARRATION_CHARS}.`);

const ambientFile = join(SHOWCASE, "public", "ambient", `ambient.${hash(`${AMBIENT_SECONDS}|${AMBIENT_PROMPT}`)}.mp3`);
const ambientPending = AMBIENT && !existsSync(ambientFile);

if (DRY) {
  console.log(`Dry run: would spend at most ~${pendingChars} credits on narration${ambientPending ? ` + ambient (${AMBIENT_SECONDS}s)` : ""}. No API calls made.`);
} else if (pending.length || ambientPending) {
  const before = await usage();
  console.log(`ElevenLabs before: ${fmtUsage(before)}`);
  // Conservative: assume 1 credit per character for TTS, 40 credits per second for sound effects.
  const worst = pendingChars + (ambientPending ? AMBIENT_SECONDS * 40 : 0);
  if (worst > HARD_CAP) throw new Error(`Worst case ${worst} credits exceeds the ${HARD_CAP}-credit cap. Stopping.`);
  if (worst > before.remaining) throw new Error(`Worst case ${worst} credits exceeds remaining ${before.remaining}. Stopping.`);

  for (const j of pending) {
    let words: Word[] | null = null;
    let audio: Buffer;
    try {
      const res = await el(`/v1/text-to-speech/${NARRATOR.id}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: j.text, model_id: NARRATION_MODEL }),
      });
      const data: any = await res.json();
      audio = Buffer.from(data.audio_base64, "base64");
      const al = data.alignment ?? data.normalized_alignment;
      if (al?.characters?.length) words = wordsFromAlignment(al);
    } catch (e) {
      console.log(`  ${j.id}: timestamps endpoint failed (${String((e as Error).message).slice(0, 120)}); using the plain endpoint.`);
      const res = await el(`/v1/text-to-speech/${NARRATOR.id}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: j.text, model_id: NARRATION_MODEL }),
      });
      audio = Buffer.from(await res.arrayBuffer());
    }
    writeFileSync(j.mp3, audio);
    writeFileSync(j.align, JSON.stringify({ words, estimated: !words }, null, 1));
    console.log(`  ${j.id}: ${j.text.length} chars → ${probeDuration(j.mp3).toFixed(2)} s${words ? " (aligned)" : " (estimated timing)"}`);
  }

  if (ambientPending) {
    mkdirSync(join(SHOWCASE, "public", "ambient"), { recursive: true });
    const res = await el(`/v1/sound-generation?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: AMBIENT_PROMPT, duration_seconds: AMBIENT_SECONDS, prompt_influence: 0.6, loop: true }),
    });
    writeFileSync(ambientFile, Buffer.from(await res.arrayBuffer()));
    console.log(`  ambient: ${probeDuration(ambientFile).toFixed(2)} s`);
  }

  // The usage counter can lag; poll briefly so the logged number is real.
  let after = await usage();
  for (let i = 0; i < 6 && after.used === before.used; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    after = await usage();
  }
  console.log(`ElevenLabs after:  ${fmtUsage(after)}; this run spent ${after.used - before.used} credits.`);
  const logFile = join(SHOWCASE, "credits-log.json");
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, "utf8")) : [];
  log.push({ at: new Date().toISOString(), before: before.used, after: after.used, limit: after.limit, spent: after.used - before.used, lines: pending.length, chars: pendingChars, ambient: ambientPending });
  writeFileSync(logFile, JSON.stringify(log, null, 2));
} else {
  console.log("Nothing to generate; all narration is cached.");
}

if (!DRY) {
  // Manifest for the compositions.
  const manifest = jobs
    .filter((j) => existsSync(j.mp3))
    .map((j) => {
      const duration = probeDuration(j.mp3);
      const caption = stripTags(j.text);
      const al = existsSync(j.align) ? JSON.parse(readFileSync(j.align, "utf8")) : { words: null };
      return { id: j.id, src: `narration/${j.id}.${j.hash}.mp3`, duration, caption, words: (al.words as Word[] | null) ?? estimateWords(caption, duration), estimated: !al.words };
    });
  const ambient = existsSync(ambientFile) ? { src: `ambient/${ambientFile.split(/[\\/]/).pop()}`, duration: probeDuration(ambientFile) } : null;
  writeFileSync(join(GEN, "narration.json"), JSON.stringify({ narrator: NARRATOR.name, model: NARRATION_MODEL, lines: manifest, ambient }, null, 1));
  console.log(`Wrote src/generated/narration.json (${manifest.length} lines${ambient ? " + ambient" : ""}).`);
}
