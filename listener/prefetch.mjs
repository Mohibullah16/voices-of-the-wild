// Build step: downloads the pinned model into the image's cache.
import { AutoConfig, AutoModel, AutoProcessor, env } from "@huggingface/transformers";
env.cacheDir = process.env.MODEL_CACHE;
env.remotePathTemplate = "{model}/resolve/daa72c51243991dfcaf9f9137d2c573d8f7790c0/";
const id = "onnx-community/embeddinggemma-2-ONNX";
const config = await AutoConfig.from_pretrained(id);
config.audio_config = null;
await AutoProcessor.from_pretrained(id);
await AutoModel.from_pretrained(id, { config, device: "cpu", dtype: "q4" });
console.log("model baked");
