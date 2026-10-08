// UI-side handle on the embedder. Two implementations share one interface:
// the real EmbeddingGemma 2 worker, and (dev fixture only) a mock.
import type { InitMessage, ModelSource, WorkerOut } from "./protocol";
import type { EmbeddingBank, RuntimeCategory, Thresholds } from "../types";

export type Device = "webgpu" | "wasm" | "mock" | "cloud";

export interface LoadInfo {
  device: Device;
  loadMs: number;
  warmupMs: number;
  fallbackReason?: string;
}

export interface LoadProgress {
  files: Record<string, { loaded: number; total: number; done: boolean }>;
  stage: string;
  device?: "webgpu" | "wasm";
}

export interface Embedder {
  readonly kind: "model" | "mock" | "cloud";
  device: Device;
  load(onProgress?: (p: LoadProgress) => void): Promise<LoadInfo>;
  embed(img: ImageData): Promise<{ vector: Float32Array; ms: number }>;
  dispose(): void;
}

export class EmbedError extends Error {
  constructor(public code: Extract<WorkerOut, { type: "error" }>["code"], message: string) {
    super(message);
  }
}

export class ModelEmbedder implements Embedder {
  readonly kind = "model" as const;
  device: Device = "wasm";
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: { vector: Float32Array; ms: number }) => void; reject: (e: Error) => void }>();
  private loading: Promise<LoadInfo> | null = null;
  private embedded = false;

  constructor(private opts: Omit<InitMessage, "type">) {}

  static options(base: string, modelId: string, revision: string, dtype: string, source: ModelSource): Omit<InitMessage, "type"> {
    const phone = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    return { base, modelId, revision, dtype, source, preferWebGPU: true, allowCpu: !phone };
  }

  load(onProgress?: (p: LoadProgress) => void): Promise<LoadInfo> {
    if (this.loading) return this.loading;
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "embeddinggemma" });
    const progress: LoadProgress = { files: {}, stage: "config" };
    this.loading = new Promise<LoadInfo>((resolve, reject) => {
      this.worker!.onmessage = (ev: MessageEvent<WorkerOut>) => {
        const m = ev.data;
        switch (m.type) {
          case "progress":
            progress.files[m.file] = { loaded: m.loaded, total: m.total, done: false };
            onProgress?.(progress);
            break;
          case "file-done": {
            const f = progress.files[m.file];
            if (f) f.done = true;
            onProgress?.(progress);
            break;
          }
          case "status":
            progress.stage = m.stage;
            if (m.device) progress.device = m.device;
            onProgress?.(progress);
            break;
          case "ready":
            this.device = m.device;
            resolve({ device: m.device, loadMs: m.loadMs, warmupMs: m.warmupMs, fallbackReason: m.fallbackReason });
            break;
          case "embedding": {
            const p = this.pending.get(m.id);
            this.pending.delete(m.id);
            p?.resolve({ vector: m.vector, ms: m.ms });
            break;
          }
          case "error": {
            const err = new EmbedError(m.code, m.message);
            if (m.id !== undefined) {
              const p = this.pending.get(m.id);
              this.pending.delete(m.id);
              p?.reject(err);
            } else {
              this.loading = null;
              reject(err);
            }
            break;
          }
        }
      };
      this.worker!.onerror = (e) => reject(new EmbedError("unknown", e.message || "The inference worker crashed."));
      this.worker!.postMessage({ type: "init", ...this.opts } satisfies InitMessage);
    });
    return this.loading;
  }

  async embed(img: ImageData) {
    await this.load();
    const id = this.nextId++;
    const copy = new Uint8ClampedArray(img.data); // keep caller's ImageData intact
    // A stalled GPU never answers: give up after a bounded wait (the first photo also compiles the shaders).
    const limit = this.embedded ? 60_000 : 120_000;
    return new Promise<{ vector: Float32Array; ms: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new EmbedError("webgpu", "The phone’s graphics chip did not answer in time."));
      }, limit);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); this.embedded = true; resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.worker!.postMessage({ type: "embed", id, width: img.width, height: img.height, data: copy.buffer }, [copy.buffer]);
    });
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
  }
}

/** Dev fixture embedder. Simulates latency so the stirring animation is visible. */
export class MockEmbedder implements Embedder {
  readonly kind = "mock" as const;
  device: Device = "mock";
  constructor(private world: () => { bank: EmbeddingBank; categories: RuntimeCategory[]; thresholds: Thresholds }) {}
  async load(onProgress?: (p: LoadProgress) => void): Promise<LoadInfo> {
    // Simulated download so the setup screen can be exercised without 300 MB.
    if (onProgress) {
      const sizes: Record<string, number> = { "tokenizer.json": 32_170_510, "onnx/model_q4.onnx_data": 174_028_800, "onnx/vision_encoder_q4.onnx_data": 108_957_696 };
      const p: LoadProgress = { files: {}, stage: "weights", device: "wasm" };
      for (let t = 1; t <= 20; t++) {
        for (const [f, total] of Object.entries(sizes)) p.files[f] = { loaded: Math.round((total * t) / 20), total, done: t === 20 };
        onProgress(p);
        await new Promise((r) => setTimeout(r, 90));
      }
      onProgress({ ...p, stage: "warmup" });
      await new Promise((r) => setTimeout(r, 300));
    }
    return { device: "mock", loadMs: 0, warmupMs: 0 };
  }
  async embed(img: ImageData) {
    if (!__FIXTURES_ALLOWED__) throw new Error("The mock embedder exists only in development builds.");
    const fx = await import("../dev-fixtures/fixture");
    const t = performance.now();
    await new Promise((r) => setTimeout(r, 1400));
    const w = this.world();
    return { vector: fx.mockEmbed(img, w.bank, w.categories, w.thresholds), ms: performance.now() - t };
  }
  dispose() {}
}

/**
 * The cloud listener: sends one downscaled JPEG (~100 KB) to the server running the same open model and
 * gets the 768-number embedding back. Matching, voices and the collection stay on the phone.
 */
export class CloudEmbedder implements Embedder {
  readonly kind = "cloud" as const;
  device: Device = "cloud";
  constructor(private url: string) {}

  async load(): Promise<LoadInfo> {
    const t0 = performance.now();
    // Wakes the server if it was asleep; harmless if it's awake.
    const res = await fetch(`${this.url}/health`, { signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (!res?.ok) throw new EmbedError("network", "The cloud listener can't be reached. Check your connection.");
    return { device: "cloud", loadMs: performance.now() - t0, warmupMs: 0 };
  }

  async embed(img: ImageData) {
    const t0 = performance.now();
    const canvas = new OffscreenCanvas(img.width, img.height);
    canvas.getContext("2d")!.putImageData(img, 0, 0);
    const jpeg = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
    let res: Response;
    try {
      res = await fetch(`${this.url}/embed`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg, signal: AbortSignal.timeout(60_000) });
    } catch {
      throw new EmbedError("network", navigator.onLine
        ? "The cloud listener didn't answer. Try again in a moment."
        : "You're offline, and the cloud listener needs a connection. Switch the listener to “On this phone” in About to listen offline.");
    }
    if (!res.ok) throw new EmbedError("unknown", `The cloud listener couldn't read that photo (${res.status}).`);
    const { vector } = (await res.json()) as { vector: number[] };
    return { vector: Float32Array.from(vector), ms: performance.now() - t0 };
  }

  dispose() {}
}
