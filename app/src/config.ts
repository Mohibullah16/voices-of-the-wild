// App-wide constants.

export const BASE = import.meta.env.BASE_URL;
/** Absolute URL for a path relative to the app base (works from workers too). */
export const asset = (path: string) => new URL(BASE + path.replace(/^\//, ""), self.location.origin).href;

export const MODEL_ID = "onnx-community/embeddinggemma-2-ONNX";
/** Pinned Hugging Face revision (commit sha) so laptop and phone use identical weights. */
export const MODEL_REVISION = "daa72c51243991dfcaf9f9137d2c573d8f7790c0";

/** Approximate one-time download sizes, in bytes, for honest messaging before setup. */
export const SIZES = {
  /** WebGPU: q4 text backbone + q4 vision encoder + tokenizer + small json. */
  model: 174_028_800 + 108_957_696 + 32_170_510 + 1_000_000,
  /** CPU fallback: the wasm build has no GatherBlockQuantized kernel, so only full precision runs there. */
  modelCpu: 1_084_170_240 + 671_026_176 + 32_170_510 + 1_000_000,
  ort: 26_900_000,
  audioPerLine: 30_000,
};

/** Cache API bucket holding field data, voices and the ORT runtime. Model weights live in Transformers.js' own cache. */
export const FIELD_CACHE = "votw-field-v1";
/** Field data is versioned by content hash (set at build time), so a new deploy never serves stale embeddings. */
export const DATA_VERSION = __DATA_VERSION__;
export const DATA_CACHE = `votw-data-${DATA_VERSION}`;
export const MODEL_CACHE = "transformers-cache";

/** Exactly what Transformers.js fetches for this model (measured), per path. Streamed into its cache by the background kit. */
export const MODEL_FILES = {
  webgpu: [
    { file: "config.json", bytes: 5_000 }, { file: "preprocessor_config.json", bytes: 2_000 }, { file: "tokenizer_config.json", bytes: 20_000 },
    { file: "chat_template.jinja", bytes: 2_000 }, { file: "processor_config.json", bytes: 2_000 }, { file: "tokenizer.json", bytes: 32_170_510 },
    { file: "onnx/model_q4.onnx", bytes: 500_000 }, { file: "onnx/vision_encoder_q4.onnx", bytes: 200_000 },
    { file: "onnx/vision_encoder_q4.onnx_data", bytes: 108_957_696 }, { file: "onnx/model_q4.onnx_data", bytes: 174_028_800 },
  ],
  cpu: [
    { file: "config.json", bytes: 5_000 }, { file: "preprocessor_config.json", bytes: 2_000 }, { file: "tokenizer_config.json", bytes: 20_000 },
    { file: "chat_template.jinja", bytes: 2_000 }, { file: "processor_config.json", bytes: 2_000 }, { file: "tokenizer.json", bytes: 32_170_510 },
    { file: "onnx/model.onnx", bytes: 400_000 }, { file: "onnx/vision_encoder.onnx", bytes: 100_000 },
    { file: "onnx/vision_encoder.onnx_data", bytes: 671_026_176 }, { file: "onnx/model.onnx_data", bytes: 1_084_170_240 },
  ],
} as const;

/**
 * Cloud listener (listener/ in the repo, on Modal): the same EmbeddingGemma 2 q4 model on a server, for phones
 * that can't hold it on their GPU. Receives one downscaled JPEG, returns 768 numbers, stores nothing.
 */
export const LISTENER_URL = "https://mohibazhar16--votw-listener-listener.modal.run";

/** Anonymous community rankings (listener/community.py, on Modal). */
export const COMMUNITY_URL = "https://mohibazhar16--votw-listener-community.modal.run";

export const ORT_FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"] as const;

/** Longest side of the photo we hand to the model. The processor resizes anyway; this bounds memory. */
export const PHOTO_MAX_SIDE = 896;
