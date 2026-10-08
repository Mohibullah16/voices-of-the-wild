// First-run "field kit" downloader. Puts field data, voices and the ONNX
// Runtime wasm into Cache API with real byte progress, resumable (files
// already cached are skipped), with honest quota and network errors.
// The model weights are fetched by Transformers.js itself (see embed/worker.ts)
// into its own cache; this module only verifies they landed.
import { asset, DATA_CACHE, FIELD_CACHE, MODEL_CACHE, ORT_FILES, SIZES } from "./config";

export type KitGroup = "data" | "voices" | "runtime";
export interface KitFile { path: string; group: KitGroup; optional?: boolean }

export interface GroupProgress { loaded: number; total: number; files: number; done: number; missing: number }
export type KitProgress = Record<KitGroup, GroupProgress>;

export class KitError extends Error {
  constructor(public code: "quota" | "network" | "webgpu" | "unknown", message: string) {
    super(message);
  }
}

export function planKit(audio: string[], includeData: boolean): KitFile[] {
  const files: KitFile[] = [];
  if (includeData) for (const p of ["data/roster.runtime.json", "data/embeddings.index.json", "data/embeddings.bin"]) files.push({ path: p, group: "data" });
  for (const f of ORT_FILES) files.push({ path: `ort/${f}`, group: "runtime" });
  for (const a of audio) files.push({ path: a, group: "voices", optional: true });
  return files;
}

export function estimateBytes(files: KitFile[], webgpu: boolean, embeddingBytes = 1_300_000): number {
  return files.reduce((n, f) => n + (f.group === "voices" ? SIZES.audioPerLine : f.group === "runtime" ? SIZES.ort / ORT_FILES.length : embeddingBytes / 3), 0) + (webgpu ? SIZES.model : SIZES.modelCpu);
}

const isQuota = (e: unknown) => (e as DOMException)?.name === "QuotaExceededError" || /quota/i.test(String((e as Error)?.message));

async function fetchWithProgress(url: string, onBytes: (n: number) => void, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(url, { cache: "no-cache", signal });
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/html") && !url.endsWith(".html")) throw Object.assign(new Error("Not found"), { status: 404 });
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength);
    return new Response(buf, { headers: res.headers });
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onBytes(value.byteLength);
  }
  return new Response(new Blob(chunks as BlobPart[], { type }), { headers: { "content-type": type } });
}

export async function downloadKit(files: KitFile[], onProgress: (p: KitProgress) => void, signal?: AbortSignal, parallel = 4): Promise<KitProgress> {
  const fieldCache = await caches.open(FIELD_CACHE);
  const dataCache = await caches.open(DATA_CACHE);
  const progress: KitProgress = {
    data: { loaded: 0, total: 0, files: 0, done: 0, missing: 0 },
    voices: { loaded: 0, total: 0, files: 0, done: 0, missing: 0 },
    runtime: { loaded: 0, total: 0, files: 0, done: 0, missing: 0 },
  };
  for (const f of files) {
    progress[f.group].files++;
    progress[f.group].total += f.group === "voices" ? SIZES.audioPerLine : f.group === "runtime" ? SIZES.ort / ORT_FILES.length : 400_000;
  }
  onProgress(progress);

  let i = 0;
  const worker = async () => {
    while (i < files.length) {
      const f = files[i++]!;
      const g = progress[f.group];
      const url = asset(f.path);
      const cache = f.group === "data" ? dataCache : fieldCache;
      if (await cache.match(url)) {
        g.done++;
        g.loaded += 0;
        onProgress(progress);
        continue;
      }
      let attempt = 0;
      for (;;) {
        try {
          const res = await fetchWithProgress(url, (n) => { g.loaded += n; onProgress(progress); }, signal);
          await cache.put(url, res);
          g.done++;
          break;
        } catch (err) {
          if (signal?.aborted) throw err;
          if (isQuota(err)) throw new KitError("quota", "This phone ran out of storage for the field kit.");
          const status = (err as { status?: number }).status;
          if (status === 404 && f.optional) { g.missing++; g.done++; break; }
          if (status === 404) throw new KitError("unknown", `${f.path} is missing on the server.`);
          if (++attempt >= 3) throw new KitError("network", "The download stopped. Check your connection and try again; finished files are kept.");
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
      onProgress(progress);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  await pruneOldData();
  // Snap totals to what really arrived so the bars end at 100%.
  for (const g of Object.values(progress)) g.total = Math.max(g.loaded, 1);
  onProgress(progress);
  return progress;
}

/**
 * Streams model files straight into Transformers.js' cache (same URLs it looks up), so the
 * 300 MB never sits in memory and nothing touches the GPU. Files already cached are skipped.
 */
export async function downloadModelFiles(files: { url: string; bytes: number }[], onBytes: (n: number) => void) {
  const cache = await caches.open(MODEL_CACHE);
  for (const f of files) {
    if (await cache.match(f.url)) { onBytes(f.bytes); continue; }
    for (let attempt = 1; ; attempt++) {
      let got = 0;
      try {
        const res = await fetch(f.url, { mode: "cors" });
        if (!res.ok || !res.body) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
        const counted = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, ctl) { got += chunk.byteLength; onBytes(chunk.byteLength); ctl.enqueue(chunk); },
        }));
        await cache.put(f.url, new Response(counted, { headers: res.headers }));
        break;
      } catch (err) {
        onBytes(-got);
        if (isQuota(err)) throw new KitError("quota", "This phone ran out of storage for the listening model.");
        if (attempt >= 3) throw new KitError("network", "The download stopped. Check your connection; finished files are kept and it picks up where it left off.");
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
}

/** Drops field data from older deploys so the service worker can only find the current version. */
export async function pruneOldData() {
  for (const name of await caches.keys()) {
    if (name === DATA_CACHE) continue;
    if (name.startsWith("votw-data-")) await caches.delete(name);
    else if (name === FIELD_CACHE) {
      const c = await caches.open(name);
      for (const req of await c.keys()) if (/\/data\//.test(new URL(req.url).pathname)) await c.delete(req);
    }
  }
}

/** True when this deploy's field data is already on the device. */
export async function dataCached(): Promise<boolean> {
  try {
    return Boolean(await (await caches.open(DATA_CACHE)).match(asset("data/roster.runtime.json")));
  } catch {
    return false;
  }
}

/** Is the model self-hosted next to the app? (public/models/<id>/config.json) */
export async function modelIsSelfHosted(modelId: string): Promise<boolean> {
  try {
    const res = await fetch(asset(`models/${modelId}/config.json`), { method: "GET", cache: "no-cache" });
    return res.ok && (res.headers.get("content-type") ?? "").includes("json");
  } catch {
    return false;
  }
}

/** After load: confirm the big weight files are really in Cache API (quota errors there are swallowed by the library). */
export async function modelCached(): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const keys = await cache.keys();
    const data = keys.filter((k) => /\.onnx_data$/.test(k.url));
    return data.length >= 2;
  } catch {
    return false;
  }
}

export interface StorageInfo { quota?: number; usage?: number; free?: number; persisted?: boolean }
export async function storageInfo(): Promise<StorageInfo> {
  const out: StorageInfo = {};
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      out.quota = est.quota;
      out.usage = est.usage;
      if (est.quota != null && est.usage != null) out.free = est.quota - est.usage;
    }
    out.persisted = await navigator.storage?.persisted?.();
  } catch {
    /* ignore */
  }
  return out;
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function hasWebGPU(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return Boolean(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
/** Megabytes with a non-breaking space, locale-formatted. */
export const mb = (bytes: number) => `${nf.format(Math.max(0, bytes / 1_000_000))} MB`;
