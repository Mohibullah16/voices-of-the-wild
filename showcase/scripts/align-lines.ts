// Word timings for the real character lines (captions). Uses ElevenLabs forced alignment once per clip
// and caches the result next to the copied mp3 (src/generated/align/<file>.json). Falls back to the
// app's own length-based estimate if the API is unavailable. Logs usage numbers only.
//   npx tsx scripts/align-lines.ts [--dry-run]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { CHARACTER_LINES } from "../src/content/lines.ts";
import { el, fmtUsage, SHOWCASE, usage, WEEK1 } from "./eleven.ts";

const DRY = process.argv.includes("--dry-run");
const roster = JSON.parse(readFileSync(join(WEEK1, "app", "public", "data", "roster.runtime.json"), "utf8"));
const ALIGN = join(SHOWCASE, "src", "generated", "align");
mkdirSync(ALIGN, { recursive: true });

function findLine(owner: string, line: string) {
  for (const c of roster.categories) for (const o of [c.guardian, ...c.characters]) if (o.id === owner) return { o, l: o.lines[line] };
  throw new Error(`no line ${owner}/${line}`);
}

const todo = CHARACTER_LINES.map((c) => {
  const { l } = findLine(c.owner, c.line);
  const file = join(WEEK1, "app", "public", l.src);
  return { ...c, file, caption: l.caption as string, out: join(ALIGN, `${basename(l.src)}.json`) };
}).filter((t) => !existsSync(t.out));

if (!todo.length) {
  console.log("All character lines already aligned.");
} else if (DRY) {
  console.log(`Would align ${todo.length} clips: ${todo.map((t) => t.key).join(", ")}`);
} else {
  const before = await usage();
  console.log(`ElevenLabs before: ${fmtUsage(before)}`);
  for (const t of todo) {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(t.file)], { type: "audio/mpeg" }), basename(t.file));
    form.append("text", t.caption);
    try {
      const data: any = await (await el("/v1/forced-alignment", { method: "POST", body: form })).json();
      const words = (data.words ?? [])
        .map((w: any) => ({ text: String(w.text).trim(), start: w.start, end: w.end }))
        .filter((w: any) => w.text);
      writeFileSync(t.out, JSON.stringify({ words, estimated: false }, null, 1));
      console.log(`  ${t.key}: ${words.length} words aligned`);
    } catch (e) {
      console.log(`  ${t.key}: forced alignment failed (${String((e as Error).message).slice(0, 160)}); captions will use estimated timing.`);
    }
  }
  let after = await usage();
  for (let i = 0; i < 4 && after.used === before.used; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    after = await usage();
  }
  console.log(`ElevenLabs after:  ${fmtUsage(after)}; spent ${after.used - before.used} credits.`);
  const logFile = join(SHOWCASE, "credits-log.json");
  const log = existsSync(logFile) ? JSON.parse(readFileSync(logFile, "utf8")) : [];
  log.push({ at: new Date().toISOString(), before: before.used, after: after.used, limit: after.limit, spent: after.used - before.used, what: "forced-alignment", clips: todo.length });
  writeFileSync(logFile, JSON.stringify(log, null, 2));
}
