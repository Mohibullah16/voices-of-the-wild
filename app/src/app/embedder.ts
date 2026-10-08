// Owns the single embedder instance for the app's lifetime.
import { BASE, MODEL_ID, MODEL_REVISION } from "../config";
import { MockEmbedder, ModelEmbedder, type Embedder } from "../embed/client";
import type { ModelSource } from "../embed/protocol";
import { state, update } from "./state";

/** Dev only: the fixture uses the mock unless ?model=real; ?mock forces it on real data too (for screenshots). */
export const wantsMock = () => {
  if (!__FIXTURES_ALLOWED__) return false;
  const q = new URLSearchParams(location.search);
  return q.has("mock") || (state.data?.source === "fixture" && q.get("model") !== "real");
};

export function createEmbedder(source: ModelSource): Embedder {
  if (wantsMock()) return new MockEmbedder(() => ({ bank: state.data!.bank, categories: state.data!.categories, thresholds: state.data!.roster.thresholds }));
  const m = state.data!.roster.model;
  const base = new URL(BASE, location.href).href;
  const opts = ModelEmbedder.options(base, m.id || MODEL_ID, m.revision ?? MODEL_REVISION, m.dtype || "q4", source);
  // Diagnostics: ?threads=N, ?gpu=off (force the CPU path), ?wasmdtype=fp16|q8|fp32.
  const q = new URLSearchParams(location.search);
  const threads = Number(q.get("threads"));
  if (threads > 0) opts.threads = threads;
  if (q.get("gpu") === "off") Object.assign(opts, { preferWebGPU: false, allowCpu: true });
  const wd = q.get("wasmdtype");
  if (wd) opts.wasmDtype = { model: wd, vision_encoder: wd };
  return new ModelEmbedder(opts);
}

/** Frees the model (and the GPU memory it holds). The next photo loads it again from the cache. */
export function releaseEmbedder() {
  state.embedder?.dispose();
  state.embedder = undefined;
  state.embedderStatus = { state: "idle" };
}

/** Adopts an already-loaded embedder (from setup) or lazily starts one from the local cache. */
export function adoptEmbedder(e: Embedder, info?: import("../embed/client").LoadInfo) {
  if (state.embedder && state.embedder !== e) state.embedder.dispose();
  state.embedder = e;
  state.embedderStatus = info ? { state: "ready", info } : { state: "loading" };
}

export function ensureEmbedder(): Embedder {
  if (!state.embedder || state.embedderStatus.state === "error") {
    state.embedder?.dispose();
    const e = createEmbedder("cache");
    state.embedder = e;
    state.embedderStatus = { state: "loading" };
    e.load().then(
      (info) => update((s) => (s.embedderStatus = { state: "ready", info })),
      (err: { code?: string; message?: string }) =>
        update((s) => (s.embedderStatus = { state: "error", error: { code: err.code ?? "unknown", message: err.message ?? String(err) } })),
    );
  }
  return state.embedder;
}
