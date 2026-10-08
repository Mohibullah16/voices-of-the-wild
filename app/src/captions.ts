// Live captions without word timestamps: we estimate when each word is spoken
// from its length plus punctuation pauses, scaled to the clip's real duration.

export interface CaptionWord {
  text: string;
  /** Fraction of the clip (0..1) at which this word starts. */
  start: number;
  end: number;
}

export function timeWords(caption: string): CaptionWord[] {
  const words = caption.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weights = words.map((w) => {
    let wt = w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.2;
    if (/[.!?]["')\]]?$/.test(w)) wt += 3.5; // sentence pause
    else if (/[,;:]["')\]]?$/.test(w)) wt += 1.8;
    else if (/(\.\.\.|…)$/.test(w)) wt += 3;
    return wt;
  });
  // Leave a little lead-in and tail silence, as real TTS clips do.
  const lead = 0.04, tail = 0.06;
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return words.map((text, i) => {
    const start = lead + (acc / total) * (1 - lead - tail);
    acc += weights[i]!;
    const end = lead + (acc / total) * (1 - lead - tail);
    return { text, start, end };
  });
}

/** Index of the word being spoken at `fraction` (0..1), or -1 before the first word. */
export function wordAt(words: CaptionWord[], fraction: number): number {
  if (!words.length || fraction < words[0]!.start) return -1;
  for (let i = words.length - 1; i >= 0; i--) if (fraction >= words[i]!.start) return i;
  return -1;
}

/** Strips v4 performance tags, for data that arrives without a caption. */
export const stripTags = (s: string) => s.replace(/\[[^\]]*\]/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.!?;:])/g, "$1").trim();

/** The caption to show for a line. Never empty while the line has text. */
export const captionOf = (line: { caption?: string; text: string }) => (line.caption ?? "").trim() || stripTags(line.text);

const ts = (s: number) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), sec = Math.floor((ms % 60_000) / 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(sec)}.${p(ms % 1000, 3)}`;
};

/** WebVTT for a line, cued in short phrases from the same word timing the on-screen caption uses. */
export function toWebVTT(caption: string, duration: number, wordsPerCue = 7): string {
  const words = timeWords(caption);
  let out = "WEBVTT\n";
  for (let i = 0, n = 1; i < words.length; i += wordsPerCue, n++) {
    const chunk = words.slice(i, i + wordsPerCue);
    out += `\n${n}\n${ts(chunk[0]!.start * duration)} --> ${ts(chunk.at(-1)!.end * duration)}\n${chunk.map((w) => w.text).join(" ")}\n`;
  }
  return out;
}
