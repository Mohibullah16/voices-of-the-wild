/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { createReadStream, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

/**
 * Self-hosts the ONNX Runtime Web wasm runtime under /ort/ (dev: served from
 * node_modules, build: emitted into dist/ort/). Transformers.js would otherwise
 * fetch it from jsDelivr at runtime, which breaks the zero-network rule.
 * We ship only the "asyncify" build: Transformers.js picks it for both the
 * WebGPU and the wasm execution providers.
 */
const ORT_DIR = resolve(import.meta.dirname, "node_modules/onnxruntime-web/dist");
export const ORT_FILES = ["ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

function selfHostedOrt(): Plugin {
  return {
    name: "votw-self-hosted-ort",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/\/ort\/([\w.-]+)$/);
        if (!m || !ORT_FILES.includes(m[1]!)) return next();
        res.setHeader("Content-Type", m[1]!.endsWith(".wasm") ? "application/wasm" : "text/javascript");
        createReadStream(resolve(ORT_DIR, m[1]!)).pipe(res);
      });
    },
    generateBundle(_opts, bundle) {
      // ORT also references its wasm via new URL(..., import.meta.url); we always set
      // wasmPaths explicitly, so drop that hashed duplicate (27 MB) from the output.
      for (const key of Object.keys(bundle)) if (/^assets\/ort-wasm-.*\.wasm$/.test(key)) delete bundle[key];
      for (const f of ORT_FILES) {
        this.emitFile({ type: "asset", fileName: `ort/${f}`, source: readFileSync(resolve(ORT_DIR, f)) });
      }
    },
  };
}

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// Dev fixtures are bundled only in dev, or when explicitly requested for a demo build.
const useFixtures = process.env.VITE_USE_FIXTURES === "1";
const hasRealData = existsSync(resolve(import.meta.dirname, "public/data/roster.runtime.json"));
const dataVersion = (() => {
  if (!hasRealData) return "dev";
  const h = createHash("sha256");
  for (const f of ["roster.runtime.json", "embeddings.index.json", "embeddings.bin"]) {
    const p = resolve(import.meta.dirname, "public/data", f);
    if (existsSync(p)) h.update(readFileSync(p));
  }
  return h.digest("hex").slice(0, 10);
})();

export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? "/",
  define: {
    __FIXTURES_ALLOWED__: JSON.stringify(command === "serve" || useFixtures),
    __HAS_REAL_DATA__: JSON.stringify(hasRealData),
    __DATA_VERSION__: JSON.stringify(dataVersion),
  },
  worker: { format: "es" },
  // Cross-origin isolation enables multi-threaded wasm in ONNX Runtime. Mirror these
  // headers on the real host (public/_headers covers Netlify / Cloudflare Pages).
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  plugins: [
    selfHostedOrt(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: false, // hand-written public/manifest.webmanifest
      injectManifest: {
        // App shell only. Field data, voices, the ORT runtime and model weights are
        // fetched by the first-run downloader (with real progress) instead.
        globPatterns: ["**/*.{js,css,html,woff2,svg,png,webp,webmanifest,ico}", "samples/samples.json"],
        globIgnores: ["data/**", "audio/**", "models/**", "ort/**", "screenshots/**", "og-image.png"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
}));
