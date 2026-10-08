// One <audio> element for the whole app, so playback survives screen lock and
// shows lock-screen controls via the Media Session API. Every line also has a
// caption; if a voice file is missing we still run the caption on a clock.
import { asset } from "./config";
import type { RuntimeLine } from "./types";
import { captionOf, toWebVTT } from "./captions";

export type PlayEnd = "ended" | "stopped" | "blocked" | "missing";

export interface PlayHandle {
  done: Promise<PlayEnd>;
  stop(): void;
  toggle(): void;
  readonly paused: boolean;
}

export interface PlayOptions {
  title: string;
  subtitle: string;
  onTick?: (fraction: number, seconds: number, duration: number) => void;
  onState?: (s: "playing" | "paused" | "ended") => void;
}

/** Seconds; estimated from the caption when the pipeline has not measured it yet. */
export const lineDuration = (line: RuntimeLine) => (line.duration > 0 ? line.duration : Math.round((line.caption.length / 14 + 0.6) * 10) / 10);

const el = new Audio();
el.preload = "auto";
el.setAttribute("playsinline", "");
let current: { stop(): void } | null = null;

// 0.1 s of silence as a WAV data URI, used to unlock playback inside a user gesture.
function silentWav(): string {
  const rate = 8000, n = 800;
  const buf = new ArrayBuffer(44 + n);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return "data:audio/wav;base64," + btoa(bin);
}
const SILENCE = silentWav();
let unlocked = false;

/** Call synchronously inside a tap/click so later async playback is allowed. */
export function unlockAudio() {
  if (unlocked) return;
  try {
    el.src = SILENCE;
    const p = el.play();
    p?.then(() => { unlocked = true; }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function stopAll() {
  current?.stop();
  current = null;
}

function setMediaSession(opts: PlayOptions, handle: PlayHandle) {
  const ms = navigator.mediaSession;
  if (!ms || typeof MediaMetadata === "undefined") return;
  ms.metadata = new MediaMetadata({
    title: opts.title,
    artist: opts.subtitle,
    album: "Voices of the Wild",
    artwork: [
      { src: asset("icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: asset("icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  });
  try {
    ms.setActionHandler("play", () => handle.paused && handle.toggle());
    ms.setActionHandler("pause", () => !handle.paused && handle.toggle());
    ms.setActionHandler("stop", () => handle.stop());
  } catch {
    /* some actions unsupported */
  }
}

let trackUrl = "";
/** Attaches a WebVTT captions track for the line, so the platform also knows what is being said. */
function setCaptionTrack(line: RuntimeLine, duration: number) {
  el.querySelectorAll("track").forEach((t) => t.remove());
  if (trackUrl) URL.revokeObjectURL(trackUrl);
  trackUrl = URL.createObjectURL(new Blob([toWebVTT(captionOf(line), duration)], { type: "text/vtt" }));
  const t = document.createElement("track");
  t.kind = "captions";
  t.srclang = "en";
  t.label = "English";
  t.default = true;
  t.src = trackUrl;
  el.append(t);
}

/** Plays a line. Resolves when it ends, is stopped, is blocked, or (caption-only) when its clock runs out. */
export function playLine(line: RuntimeLine, opts: PlayOptions): PlayHandle {
  stopAll();
  let finished = false;
  let raf = 0;
  let clock: { start: number; offset: number; paused: boolean } | null = null; // caption-only mode
  let resolveDone!: (e: PlayEnd) => void;
  const done = new Promise<PlayEnd>((r) => (resolveDone = r));
  const est = lineDuration(line);
  const duration = () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : est);

  const tick = () => {
    if (finished) return;
    if (clock) {
      const t = clock.paused ? clock.offset : clock.offset + (performance.now() - clock.start) / 1000;
      opts.onTick?.(Math.min(1, t / est), t, est);
      if (t >= est) return finish("missing");
    } else {
      opts.onTick?.(Math.min(1, el.currentTime / duration()), el.currentTime, duration());
    }
    raf = requestAnimationFrame(tick);
  };

  const cleanup = () => {
    cancelAnimationFrame(raf);
    el.removeEventListener("ended", onEnded);
    el.removeEventListener("error", onError);
    el.removeEventListener("timeupdate", onTime);
    el.removeEventListener("pause", onPause);
    el.removeEventListener("play", onPlay);
  };
  function finish(e: PlayEnd) {
    if (finished) return;
    finished = true;
    cleanup();
    if (e !== "stopped") opts.onTick?.(1, duration(), duration());
    opts.onState?.("ended");
    if (navigator.mediaSession) navigator.mediaSession.playbackState = "none";
    if (current === handle) current = null;
    resolveDone(e);
  }
  const onEnded = () => finish("ended");
  const onTime = () => !clock && opts.onTick?.(Math.min(1, el.currentTime / duration()), el.currentTime, duration());
  const onPause = () => !finished && opts.onState?.("paused");
  const onPlay = () => opts.onState?.("playing");
  const startClock = () => {
    // Voice file missing (pipeline not run yet, or a bad path): run the caption anyway.
    clock = { start: performance.now(), offset: 0, paused: false };
    opts.onState?.("playing");
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  };
  const onError = () => !finished && !clock && startClock();

  const handle: PlayHandle = {
    done,
    stop() {
      if (!clock) el.pause();
      finish("stopped");
    },
    toggle() {
      if (finished) return;
      if (clock) {
        if (clock.paused) { clock.start = performance.now(); clock.paused = false; opts.onState?.("playing"); }
        else { clock.offset += (performance.now() - clock.start) / 1000; clock.paused = true; opts.onState?.("paused"); }
      } else if (el.paused) void el.play();
      else el.pause();
    },
    get paused() {
      return clock ? clock.paused : el.paused;
    },
  };
  current = handle;

  el.addEventListener("ended", onEnded);
  el.addEventListener("error", onError);
  el.addEventListener("timeupdate", onTime);
  el.addEventListener("pause", onPause);
  el.addEventListener("play", onPlay);
  setMediaSession(opts, handle);
  try { setCaptionTrack(line, est); } catch { /* captions are also always on screen */ }
  if (!line.src) {
    startClock();
    return handle;
  }
  el.src = asset(line.src);
  el.currentTime = 0;
  el.play().then(
    () => {
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing";
      raf = requestAnimationFrame(tick);
    },
    (err: DOMException) => {
      if (finished || clock) return;
      if (err?.name === "NotAllowedError") finish("blocked");
      else startClock();
    },
  );
  return handle;
}

// ---- waveform peaks ----------------------------------------------------------

const peakCache = new Map<string, Promise<number[]>>();

function pseudoPeaks(seedText: string, n: number): number[] {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
    const env = Math.sin((Math.PI * (i + 0.5)) / n) ** 0.6;
    out.push(0.25 + 0.75 * env * (0.45 + 0.55 * ((h & 0xffff) / 0xffff)));
  }
  return out;
}

/** Real peaks from the decoded file when available, else a stable stand-in shaped by the text. */
export function peaksFor(line: RuntimeLine, n = 48): Promise<number[]> {
  const key = `${line.src}|${n}`;
  let p = peakCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        if (!line.src) throw new Error("no audio yet");
        const res = await fetch(asset(line.src));
        if (!res.ok || (res.headers.get("content-type") ?? "").includes("text/html")) throw new Error("missing");
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        void ctx.close();
        const data = buf.getChannelData(0);
        const size = Math.floor(data.length / n);
        const peaks: number[] = [];
        for (let i = 0; i < n; i++) {
          let m = 0;
          for (let j = i * size; j < (i + 1) * size; j += 8) m = Math.max(m, Math.abs(data[j]!));
          peaks.push(m);
        }
        const max = Math.max(...peaks, 1e-3);
        return peaks.map((x) => 0.12 + 0.88 * (x / max));
      } catch {
        return pseudoPeaks(line.text, n);
      }
    })();
    peakCache.set(key, p);
  }
  return p;
}
