/// <reference lib="webworker" />
// Service worker (vite-plugin-pwa injectManifest).
// - App shell (HTML, JS, CSS, fonts, icons) is precached by Workbox.
// - Field data, voices and the ONNX Runtime wasm are served cache-first from
//   the field-kit cache filled by the first-run downloader (src/firstrun.ts).
// - Model weights are cached by Transformers.js in "transformers-cache"; we let
//   those requests pass through untouched to avoid storing 300 MB twice.
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;


self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

const scope = new URL(self.registration.scope);
const fieldPath = /^(data|audio|ort)\//;

registerRoute(
  ({ url, request }) => request.method === "GET" && url.origin === scope.origin && fieldPath.test(url.pathname.slice(scope.pathname.length)),
  async ({ request, url }) => {
    // Any of our caches: votw-data-<version> (field data) or votw-field-v1 (voices, runtime).
    const hit = await caches.match(url.href, { ignoreSearch: true });
    if (hit) return hit;
    // Not downloaded yet (first run, or a new file after an update): go to the network.
    return fetch(request);
  },
);

// Single-page app: every navigation gets the precached index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL(`${scope.pathname}index.html`)));
