// EmbeddingGemma 2 in Node via Transformers.js — same model id and dtype as the phone.
import { AutoConfig, AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";
import { DIM, MODEL_CACHE, MODEL_DTYPE, MODEL_ID, ensureDir, l2 } from "./lib.ts";

ensureDir(MODEL_CACHE);
env.cacheDir = MODEL_CACHE;

export interface Embedder {
  embedTexts(texts: string[], batch?: number): Promise<Float32Array[]>;
  embedImageFile(path: string): Promise<Float32Array>;
}

function rows(t: { data: ArrayLike<number>; dims: number[] }): Float32Array[] {
  const [n, d] = t.dims as [number, number];
  if (d !== DIM) throw new Error(`expected ${DIM} dims, got ${d}`);
  const out: Float32Array[] = [];
  for (let i = 0; i < n; i++) out.push(l2(Array.prototype.slice.call(t.data, i * d, (i + 1) * d) as number[]));
  return out;
}

export async function loadEmbedder(opts: { vision: boolean }): Promise<Embedder> {
  const config: any = await AutoConfig.from_pretrained(MODEL_ID);
  config.audio_config = null;
  if (!opts.vision) config.vision_config = null;
  const processor: any = await AutoProcessor.from_pretrained(MODEL_ID);
  const model: any = await AutoModel.from_pretrained(MODEL_ID, { config, device: "cpu", dtype: MODEL_DTYPE as any });

  return {
    async embedTexts(texts, batch = 16) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batch) {
        const chunk = texts.slice(i, i + batch);
        const inputs = await processor(chunk);
        const { sentence_embedding } = await model(inputs);
        out.push(...rows(sentence_embedding));
      }
      return out;
    },
    async embedImageFile(path) {
      const image = await RawImage.read(path);
      const inputs = await processor(null, image);
      const { sentence_embedding } = await model(inputs);
      return rows(sentence_embedding)[0]!;
    },
  };
}
