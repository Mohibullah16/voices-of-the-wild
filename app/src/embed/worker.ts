// Inference worker: EmbeddingGemma 2 image path via Transformers.js.
// Loads only what an image embedding needs: the vision encoder + the text
// backbone (image soft tokens run through it) + the processor. The audio
// encoder is dropped by nulling `audio_config`, per the model card.
import { AutoConfig, AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import type { InitMessage, WorkerIn, WorkerOut } from "./protocol";

const post = (m: WorkerOut, transfer: Transferable[] = []) => {
  if (m.type === "status" || m.type === "ready" || m.type === "error") console.info("[embed]", JSON.stringify(m).slice(0, 300));
  (self as unknown as Worker).postMessage(m, transfer);
};

type Model = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
let model: Model | null = null;
let processor: Processor | null = null;
let device: "webgpu" | "wasm" = "wasm";

function classify(err: unknown): Extract<WorkerOut, { type: "error" }>["code"] {
  const msg = String((err as Error)?.message ?? err);
  const name = (err as Error)?.name ?? "";
  if ((err as { code?: string })?.code === "webgpu") return "webgpu";
  if (name === "QuotaExceededError" || /quota/i.test(msg)) return "quota";
  if (/allowRemoteModels=false|local_files_only|not found locally/i.test(msg)) return "not-cached";
  if (/Failed to fetch|NetworkError|network|ERR_INTERNET|Load failed/i.test(msg)) return "network";
  return "unknown";
}

function configureEnv(m: InitMessage) {
  env.useBrowserCache = true; // weights are cached in "transformers-cache"
  env.useWasmCache = false; // ORT wasm comes from /ort/, cached by our service worker
  env.localModelPath = new URL("models/", m.base).href;
  env.allowLocalModels = m.source !== "remote";
  env.allowRemoteModels = m.source === "remote";
  // Pin the Hugging Face revision in the URL template itself. Transformers.js 4.3.1 drops the
  // `revision` option in some lookups (get_tokenizer_files, image-processor metadata), which then
  // miss the cache offline. With the commit in the template every lookup resolves to one URL.
  env.remotePathTemplate = `{model}/resolve/${encodeURIComponent(m.revision || "main")}/`;
  const onnx = env.backends.onnx as { wasm?: { wasmPaths?: unknown; numThreads?: number } };
  if (onnx.wasm) {
    onnx.wasm.wasmPaths = {
      mjs: new URL("ort/ort-wasm-simd-threaded.asyncify.mjs", m.base).href,
      wasm: new URL("ort/ort-wasm-simd-threaded.asyncify.wasm", m.base).href,
    };
    // One thread by default: with several, ORT hangs while creating the session inside this
    // module worker (seen with both the WebGPU and wasm providers). ?threads=N to experiment.
    onnx.wasm.numThreads = m.threads && m.threads > 0 && self.crossOriginIsolated ? m.threads : 1;
    console.info(`[embed] wasm threads: ${onnx.wasm.numThreads}, isolated: ${self.crossOriginIsolated}`);
  }
}

async function webgpuUsable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

/**
 * q4 on WebGPU (the model card's recommendation). Every quantized variant of this model
 * (q4, q4f16, q8, text and vision) uses GatherBlockQuantized, which the ONNX Runtime
 * wasm (CPU) build does not implement, so the CPU fallback must load full precision.
 */
export function dtypeFor(d: "webgpu" | "wasm", m: Pick<InitMessage, "dtype" | "wasmDtype">) {
  if (d === "webgpu") return { model: m.dtype, vision_encoder: m.dtype };
  return m.wasmDtype ?? { model: "fp32", vision_encoder: "fp32" };
}

async function load(m: InitMessage) {
  configureEnv(m);
  const t0 = performance.now();
  const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === "progress" && p.file) post({ type: "progress", file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
    else if (p.status === "done" && p.file) post({ type: "file-done", file: p.file });
  };
  const common = { progress_callback }; // revision is pinned via env.remotePathTemplate

  post({ type: "status", stage: "config" });
  const config = await AutoConfig.from_pretrained(m.modelId, common);
  (config as unknown as { audio_config: unknown }).audio_config = null;
  processor = await AutoProcessor.from_pretrained(m.modelId, common);

  let fallbackReason: string | undefined;
  const tryDevice = async (d: "webgpu" | "wasm") => {
    post({ type: "status", stage: "weights", device: d });
    return AutoModel.from_pretrained(m.modelId, {
      ...common,
      config,
      device: d,
      dtype: dtypeFor(d, m) as never,
    });
  };

  if (m.preferWebGPU && (await webgpuUsable())) {
    try {
      model = await tryDevice("webgpu");
      device = "webgpu";
    } catch (err) {
      if (classify(err) !== "unknown") throw err; // network / quota problems are not a WebGPU problem
      fallbackReason = `WebGPU failed to start (${String((err as Error)?.message ?? err).slice(0, 140)}).`;
    }
  } else if (m.preferWebGPU) {
    fallbackReason = "This browser has no WebGPU.";
  }
  if (!model && m.allowCpu === false) {
    throw Object.assign(new Error(fallbackReason ?? "WebGPU is not available."), { code: "webgpu" });
  }
  if (!model) {
    console.info("[embed] creating wasm session…");
    model = await tryDevice("wasm");
    console.info(`[embed] wasm session ready after ${Math.round(performance.now() - t0)} ms`);
    device = "wasm";
  }
  const loadMs = performance.now() - t0;

  // No separate warm-up pass: on some phones it stalled the GPU ("tuning up" at 99%). The first real photo warms it.
  post({ type: "ready", device, loadMs, warmupMs: 0, fallbackReason });
}

async function embed(data: Uint8ClampedArray, width: number, height: number): Promise<Float32Array> {
  if (!model || !processor) throw new Error("Model not loaded");
  const image = new RawImage(data, width, height, 4).rgb();
  const inputs = await (processor as unknown as (t: null, i: RawImage) => Promise<Record<string, unknown>>)(null, image);
  const out = (await (model as unknown as (x: unknown) => Promise<{ sentence_embedding: { data: Float32Array } }>)(inputs));
  return new Float32Array(out.sentence_embedding.data);
}

let queue: Promise<void> = Promise.resolve();

self.addEventListener("message", (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if (m.type === "init") {
    queue = queue.then(() =>
      load(m).catch((err) => post({ type: "error", code: classify(err), message: String((err as Error)?.message ?? err) })),
    );
  } else if (m.type === "embed") {
    queue = queue.then(async () => {
      try {
        const t = performance.now();
        const vector = await embed(new Uint8ClampedArray(m.data), m.width, m.height);
        post({ type: "embedding", id: m.id, vector, ms: performance.now() - t }, [vector.buffer]);
      } catch (err) {
        post({ type: "error", id: m.id, code: classify(err), message: String((err as Error)?.message ?? err) });
      }
    });
  }
});
