// Pure timeline: which audio plays when, which scene is on screen, and the caption chunks.
// Shared by the Remotion compositions and scripts/srt.ts. No Remotion imports here.
import assets from "./generated/assets.json";
import narration from "./generated/narration.json";

export const FPS = 30;
export type Cut = "long" | "short";
export type SceneId = "hook" | "idea" | "game" | "stack" | "proof" | "cta";

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface AudioEv {
  key: string;
  kind: "narration" | "line";
  src: string;
  /** Absolute start, seconds. */
  at: number;
  /** Seconds trimmed from the start of the source file. */
  trim: number;
  /** Seconds played. */
  dur: number;
  volume: number;
  /** Words with absolute times. */
  words: Word[];
  speaker: string | null;
  speakerNote: string | null;
}

export interface SceneEv {
  id: SceneId;
  at: number;
  end: number;
}

export interface Timeline {
  cut: Cut;
  audio: AudioEv[];
  scenes: SceneEv[];
  total: number;
  /** Named instants (seconds), used to key animations to the spoken words. */
  marks: Record<string, number>;
}

type NarrationLine = (typeof narration.lines)[number];
const nar = (id: string) => {
  const l = narration.lines.find((n) => n.id === id);
  if (!l) throw new Error(`narration "${id}" missing: run npm run narration`);
  return l as NarrationLine;
};
type LineData = { src: string; duration: number; caption: string; words: Word[] | null; name: string; engine: string; tier: string; guardian: boolean; species: string | null };
const line = (key: string) => (assets.lines as Record<string, LineData>)[key]!;

/** Same estimate the app uses when there are no word timings. */
function estimate(caption: string, duration: number): Word[] {
  const ws = caption.split(/\s+/).filter(Boolean);
  const weights = ws.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.2 + (/[.!?]$/.test(w) ? 3.5 : /[,;:]$/.test(w) ? 1.8 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return ws.map((text, i) => {
    const s = 0.04 + (acc / total) * 0.9;
    acc += weights[i]!;
    return { text, start: s * duration, end: (0.04 + (acc / total) * 0.9) * duration };
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildTimeline(cut: Cut): Timeline {
  const audio: AudioEv[] = [];
  const scenes: SceneEv[] = [];
  const marks: Record<string, number> = {};
  let t = 0;

  const say = (id: string, opts: { from?: string; until?: string; lead?: number; gap?: number; volume?: number } = {}) => {
    const n = nar(id);
    const words = n.words as Word[];
    const fromIdx = opts.from ? words.findIndex((w) => w.text.replace(/[^\w']/g, "") === opts.from) : 0;
    if (fromIdx < 0) throw new Error(`word ${opts.from} not in ${id}`);
    const trim = opts.from ? Math.max(0, words[fromIdx]!.start - 0.06) : 0;
    let end = n.duration;
    let kept = words.slice(fromIdx);
    if (opts.until) {
      const u = kept.findIndex((w) => w.text.replace(/[^\w']/g, "") === opts.until);
      kept = kept.slice(0, u + 1);
      end = Math.min(n.duration, kept.at(-1)!.end + 0.25);
    }
    const at = t + (opts.lead ?? 0);
    const dur = end - trim;
    audio.push({
      key: id,
      kind: "narration",
      src: n.src,
      at,
      trim,
      dur,
      volume: opts.volume ?? 1,
      words: kept.map((w) => ({ text: w.text, start: at + w.start - trim, end: at + Math.min(w.end, end) - trim })),
      speaker: null,
      speakerNote: null,
    });
    t = at + dur + (opts.gap ?? 0.3);
    return audio.at(-1)!;
  };

  const play = (key: string, opts: { lead?: number; gap?: number; volume?: number } = {}) => {
    const l = line(key);
    const at = t + (opts.lead ?? 0);
    const words = l.words ?? estimate(l.caption, l.duration);
    const engine = l.engine === "elevenlabs" ? "ElevenLabs Eleven v4" : "Kokoro, open-source TTS";
    const who = l.guardian ? "Guardian" : l.tier === "elder" ? "Elder" : "Character";
    audio.push({
      key,
      kind: "line",
      src: l.src,
      at,
      trim: 0,
      dur: l.duration,
      volume: opts.volume ?? 1,
      words: words.map((w) => ({ text: w.text, start: at + w.start, end: at + w.end })),
      speaker: l.name,
      speakerNote: `${who} · ${engine}`,
    });
    t = at + l.duration + (opts.gap ?? 0.35);
    return audio.at(-1)!;
  };

  const scene = (id: SceneId, body: () => void) => {
    const at = t;
    body();
    scenes.push({ id, at, end: t });
  };
  const wordAt = (ev: AudioEv, w: string, fallback = 0) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const hit = ev.words.find((x) => norm(x.text) === norm(w));
    return hit ? hit.start : ev.at + fallback;
  };

  const long = cut === "long";

  scene("hook", () => {
    const neem = play("neem", { lead: long ? 0.3 : 0.15, gap: long ? 0.4 : 0.25 });
    marks.hookVoice = neem.at;
    marks.hookName = wordAt(neem, "Granny");
  });
  scene("idea", () => {
    const idea = long ? say("idea", { gap: 0.35 }) : say("idea", { from: "Point", gap: 0.3 });
    marks.ideaSnap = wordAt(idea, "Point");
    marks.ideaMatch = wordAt(idea, "works");
    marks.ideaSpeak = wordAt(idea, "talks");
    marks.ideaEnd = idea.at + idea.dur;
  });
  scene("game", () => {
    const g = long ? say("game", { gap: 0.3 }) : say("game", { from: "three", gap: 0.3 });
    marks.gameQuests = wordAt(g, "three");
    marks.gameWalk = wordAt(g, "walk");
    marks.gameStreak = wordAt(g, "streaks");
    marks.gameElders = wordAt(g, "rare");
    if (long) {
      const grass = play("grass", { gap: 0.4 });
      marks.grassVoice = grass.at;
      marks.grassDone = grass.at + 0.6;
    } else marks.grassDone = marks.gameQuests + 0.5;
  });
  scene("stack", () => {
    const s1 = long ? say("stack1", { gap: 0.35 }) : say("stack1", { from: "The", gap: 0.3 });
    marks.stackIn = s1.at - 0.2;
    marks.stPhoto = wordAt(s1, "photo");
    marks.stGemma = wordAt(s1, "EmbeddingGemma");
    marks.stBrowser = wordAt(s1, "browser");
    const s2 = say("stack2", { gap: long ? 0.35 : 0.3 });
    marks.stVector = s2.at;
    marks.stMatch = wordAt(s2, "matched");
    marks.stDecide = wordAt(s2, "Not");
    marks.stGuardian = wordAt(s2, "guardian");
    if (long) {
      const hint = play("guardianHint", { gap: 0.35 });
      marks.hintVoice = hint.at;
      marks.hintEnd = hint.at + hint.dur;
    }
    const s3 = say("stack3", { gap: long ? 0.4 : 0.3 });
    marks.stVoice = s3.at;
    marks.stKokoro = wordAt(s3, "open-source");
    marks.stOffline = wordAt(s3, "After");
    marks.stPhotos = wordAt(s3, "photos");
  });
  scene("proof", () => {
    if (long) {
      const p = say("proof", { gap: 0.9 });
      marks.proofStart = p.at;
      marks.proofTop1 = wordAt(p, "eighty-nine", 2.5);
      marks.proofPrecision = wordAt(p, "names", 6);
      marks.proofVoices = p.at + p.dur - 0.6;
    } else {
      marks.proofStart = t;
      marks.proofTop1 = t + 0.2;
      marks.proofPrecision = t + 0.7;
      t += 3.8;
    }
  });
  scene("cta", () => {
    const c = say("cta", { lead: long ? 0.6 : 0.4, gap: long ? 1.8 : 1.1 });
    marks.ctaLine2 = wordAt(c, "Go");
    marks.ctaEnd = c.at + c.dur;
  });

  const total = Math.round(t * FPS) / FPS;
  return { cut, audio, scenes, total, marks };
}

export interface CaptionChunk {
  text: string;
  words: Word[];
  start: number;
  end: number;
  speaker: string | null;
  speakerNote: string | null;
}

/** Splits each audio event into readable caption chunks (one or two short lines). */
export function captionChunks(tl: Timeline, maxChars: number): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  for (const ev of tl.audio) {
    let cur: Word[] = [];
    const flush = () => {
      if (!cur.length) return;
      out.push({ text: cur.map((w) => w.text).join(" "), words: cur, start: cur[0]!.start - 0.08, end: cur.at(-1)!.end + 0.2, speaker: ev.speaker, speakerNote: ev.speakerNote });
      cur = [];
    };
    ev.words.forEach((w, i) => {
      const len = [...cur, w].map((x) => x.text).join(" ").length;
      const endsSentence = /[.!?]$/.test(w.text) || !ev.words[i + 1];
      const tiny = w.text.replace(/[^p{L}p{N}]/gu, "").length <= 2; // never orphan "2," or "a"
      if (cur.length && len > maxChars && !((endsSentence || tiny) && len <= maxChars * 1.35)) flush();
      cur.push(w);
      const next = ev.words[i + 1];
      const strong = /[.!?]$/.test(w.text);
      const soft = /[,:;]$/.test(w.text);
      const curLen = cur.map((x) => x.text).join(" ").length;
      if (strong && next) flush();
      else if (soft && curLen > maxChars * 0.45 && next) flush();
    });
    flush();
  }
  // No overlaps: a chunk ends when the next one starts.
  for (let i = 0; i < out.length - 1; i++) out[i]!.end = Math.min(out[i]!.end, out[i + 1]!.start);
  return out;
}
