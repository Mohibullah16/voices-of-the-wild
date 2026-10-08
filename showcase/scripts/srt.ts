// Writes .srt captions that match the burned-in ones (same timeline, same chunking).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTimeline, captionChunks, type Cut } from "../src/timeline.ts";
import { SHOWCASE } from "./eleven.ts";

const ts = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
};

const OUT = join(SHOWCASE, "out");
mkdirSync(OUT, { recursive: true });
const jobs: [string, Cut, number][] = [
  ["9x16", "short", 30],
  ["16x9", "long", 48],
  ["1x1", "short", 36],
];
for (const [tag, cut, max] of jobs) {
  const tl = buildTimeline(cut);
  const chunks = captionChunks(tl, max);
  let prevSpeaker: string | null = null;
  const body = chunks
    .map((c, i) => {
      const label = c.speaker && c.speaker !== prevSpeaker ? `[${c.speaker}] ` : "";
      prevSpeaker = c.speaker;
      return `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${label}${c.text}\n`;
    })
    .join("\n");
  const file = join(OUT, `voices-of-the-wild-${tag}.srt`);
  writeFileSync(file, body);
  console.log(`${file}: ${chunks.length} cues, ${tl.total.toFixed(1)} s`);
}
