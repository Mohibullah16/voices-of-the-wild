// Cloud listener for Voices of the Wild.
// Phones that can't hold EmbeddingGemma 2 on their GPU send a downscaled photo here and get back the
// 768-number embedding. Same open model, same pinned revision, same q4 weights as the on-device path.
// Matching, voices and the collection stay on the phone. Photos are decoded in memory, embedded and
// dropped: nothing is written to disk and nothing about the image is logged.
import { createServer } from "node:http";
import { AutoConfig, AutoModel, AutoProcessor, RawImage, env } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/embeddinggemma-2-ONNX";
const REVISION = "daa72c51243991dfcaf9f9137d2c573d8f7790c0";
const PORT = Number(process.env.PORT ?? 7860);
const MAX_BYTES = 1_500_000;
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "https://voices-of-the-wild.netlify.app,http://localhost:5173,http://localhost:4173")
  .split(",").map((s) => s.trim());

env.remotePathTemplate = `{model}/resolve/${REVISION}/`;
if (process.env.MODEL_CACHE) env.cacheDir = process.env.MODEL_CACHE;

let ready = null;
async function load() {
  const t0 = Date.now();
  const config = await AutoConfig.from_pretrained(MODEL_ID);
  config.audio_config = null;
  const processor = await AutoProcessor.from_pretrained(MODEL_ID);
  const model = await AutoModel.from_pretrained(MODEL_ID, { config, device: "cpu", dtype: "q4" });
  console.log(`model ready in ${Date.now() - t0} ms`);
  return { processor, model };
}
const getModel = () => (ready ??= load());

// One photo at a time: a small CPU box is fastest without contention, and memory stays flat.
let queue = Promise.resolve();
function embed(bytes) {
  const run = queue.then(async () => {
    const { processor, model } = await getModel();
    const image = (await RawImage.fromBlob(new Blob([bytes]))).rgb();
    const inputs = await processor(null, image);
    const { sentence_embedding } = await model(inputs);
    return Array.from(sentence_embedding.data);
  });
  queue = run.catch(() => {});
  return run;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  // The app is cross-origin isolated (COEP require-corp); this lets it read our responses.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.writeHead(204).end();
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (req.method === "GET" && (path === "/" || path === "/health")) {
    void getModel();
    return send(res, 200, { ok: true, model: MODEL_ID, revision: REVISION, dtype: "q4", loaded: Boolean(ready) });
  }
  if (req.method === "POST" && path === "/embed") {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BYTES) return send(res, 413, { error: "photo too large" });
      chunks.push(c);
    }
    const t0 = Date.now();
    try {
      const vector = await embed(Buffer.concat(chunks));
      return send(res, 200, { vector, ms: Date.now() - t0 });
    } catch (err) {
      console.error("embed failed:", String(err?.message ?? err).slice(0, 200));
      return send(res, 500, { error: "could not read that photo" });
    }
  }
  send(res, 404, { error: "not found" });
}).listen(PORT, () => {
  console.log(`listener on :${PORT}`);
  void getModel(); // load at boot so the first photo is quick
});
