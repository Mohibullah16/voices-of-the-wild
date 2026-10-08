// The field kit, downloaded in the background while the player already looks around.
// Order: field notes and the runtime (small, needed to match), then the model weights, then the voices.
// Model files are streamed straight into Transformers.js' own cache under the exact URLs it looks up, so
// nothing is created on the GPU and nothing large is held in memory. The GPU is only used at the first photo.
import { MODEL_FILES, MODEL_ID, MODEL_REVISION } from "../config";
import { audioPaths } from "../data";
import {
  downloadKit, downloadModelFiles, hasWebGPU, KitError, modelCached, modelIsSelfHosted, planKit, requestPersistence, type KitProgress,
} from "../firstrun";
import { saveSettings } from "../store";
import { useCloud, wantsMock } from "./embedder";
import { announce, state, toast, update } from "./state";

export type KitStatus =
  | { phase: "idle" | "done" }
  | { phase: "running"; loaded: number; total: number; stage: "notes" | "model" | "voices" }
  | { phase: "error"; code: string; message: string };

let run: Promise<void> | null = null;
let lastPaint = 0;

/** At most a few repaints a second: progress must not make the phone busy. */
function paint(force = false) {
  const now = performance.now();
  if (!force && now - lastPaint < 250) return;
  lastPaint = now;
  update();
}

const sumKit = (p: KitProgress) => p.data.loaded + p.runtime.loaded + p.voices.loaded;

/** Starts (or joins) the background download. Resolves when everything is on the device. */
export function startKit(): Promise<void> {
  if (state.settings.setupDone) {
    state.kit = { phase: "done" };
    return Promise.resolve();
  }
  if (run) return run;
  run = download().catch((err) => {
    run = null;
    const code = err instanceof KitError ? err.code : "unknown";
    state.kit = { phase: "error", code, message: (err as Error).message };
    announce("The download stopped.");
    paint(true);
    throw err;
  });
  return run;
}

async function download() {
  const data = state.data!;
  const m = data.roster.model;
  const mock = wantsMock();
  const cloud = useCloud();
  void requestPersistence();
  const phone = matchMedia("(pointer: coarse)").matches;
  const webgpu = mock || cloud || (await hasWebGPU());
  // Without WebGPU only the full-precision model runs (~1.8 GB in memory): fine on a laptop, not on a phone.
  if (!webgpu && phone) {
    throw new KitError("webgpu", "This browser didn’t offer the phone’s graphics chip (WebGPU). Update Chrome and try again.");
  }
  const selfHosted = !mock && !cloud && (await modelIsSelfHosted(m.id || MODEL_ID));
  const id = m.id || MODEL_ID;
  const rev = m.revision ?? MODEL_REVISION;
  const model = mock || cloud || selfHosted ? [] : MODEL_FILES[webgpu ? "webgpu" : "cpu"].map((f) => ({
    url: `https://huggingface.co/${id}/resolve/${encodeURIComponent(rev)}/${f.file}`,
    bytes: f.bytes,
  }));
  const modelTotal = model.reduce((n, f) => n + f.bytes, 0);
  const all = planKit(audioPaths(data.roster), data.source === "real");
  const notes = all.filter((f) => f.group !== "voices");
  const voices = all.filter((f) => f.group === "voices");
  const voiceGuess = voices.length * 30_000;
  const notesGuess = 27_000_000 + 1_300_000;
  const total = notesGuess + modelTotal + voiceGuess;
  let done = 0;
  const set = (stage: "notes" | "model" | "voices", loaded: number) => {
    state.kit = { phase: "running", loaded: Math.min(total, done + loaded), total, stage };
    paint();
  };
  set("notes", 0);
  paint(true);

  const k1 = await downloadKit(notes, (p) => set("notes", sumKit(p)));
  done += Math.max(notesGuess, sumKit(k1));
  if (model.length) {
    let got = 0;
    await downloadModelFiles(model, (n) => { got += n; set("model", got); });
    if (!(await modelCached())) {
      throw new KitError("quota", "The model downloaded but the browser would not keep it. This usually means storage is full or the tab is private.");
    }
    done += modelTotal;
  }
  // Voices: many small files, so progress counts files (bytes alone sit at 99% while the last ones land).
  await downloadKit(voices, (p) => set("voices", (p.voices.done / Math.max(1, p.voices.files)) * voiceGuess), undefined, 8);

  // "Offline" is only true once the service worker has the app shell too.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(r, 60_000))]);
  }
  state.settings = { ...state.settings, setupDone: true, started: true, modelSource: selfHosted ? "local" : "remote" };
  await saveSettings(state.settings);
  state.kit = { phase: "done" };
  run = null;
  paint(true);
  if (cloud) {
    toast("Ready. Photos are read by the cloud listener.");
    announce("Ready. Voices are on this phone; photos are read by the cloud listener.");
  } else {
    toast("Ready. Everything is downloaded.");
    announce("Ready. Everything is downloaded.");
  }
}

/** Percent for display, 0-99 while running. */
export function kitPercent(): number {
  const k = state.kit;
  if (k.phase === "done") return 100;
  if (k.phase !== "running") return 0;
  return Math.min(99, Math.floor((k.loaded / Math.max(1, k.total)) * 100));
}
