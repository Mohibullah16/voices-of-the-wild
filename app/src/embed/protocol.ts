// Messages between the UI thread and the inference worker.

export type ModelSource = "local" | "remote" | "cache";

export interface InitMessage {
  type: "init";
  /** Absolute URL of the app base, e.g. "https://example.org/votw/". */
  base: string;
  modelId: string;
  revision: string;
  dtype: string;
  /**
   * local  = self-hosted under {base}models/ (no remote fetches at all)
   * remote = one-time download from Hugging Face during setup
   * cache  = after setup: only what is already cached, zero network
   */
  source: ModelSource;
  preferWebGPU: boolean;
  /**
   * May the worker fall back to the CPU (wasm) path? That path needs full-precision weights (~1.8 GB),
   * which a phone cannot hold, so phones say no and get a clear message instead.
   */
  allowCpu?: boolean;
  /** wasm threads; 0 = automatic. */
  threads?: number;
  /** Per-component dtypes for the CPU (wasm) fallback. Default fp32 for both (see dtypeFor in worker.ts). */
  wasmDtype?: { model: string; vision_encoder: string };
}

export interface EmbedMessage {
  type: "embed";
  id: number;
  width: number;
  height: number;
  /** RGBA bytes, transferred. */
  data: ArrayBuffer;
}

export type WorkerIn = InitMessage | EmbedMessage;

export type WorkerOut =
  | { type: "progress"; file: string; loaded: number; total: number }
  | { type: "file-done"; file: string }
  | { type: "status"; stage: "config" | "weights" | "session" | "warmup"; device?: "webgpu" | "wasm"; note?: string }
  | { type: "ready"; device: "webgpu" | "wasm"; loadMs: number; warmupMs: number; fallbackReason?: string }
  | { type: "embedding"; id: number; vector: Float32Array; ms: number }
  | { type: "error"; id?: number; code: "quota" | "network" | "not-cached" | "webgpu" | "unknown"; message: string };
