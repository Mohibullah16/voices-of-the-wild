/// <reference types="vite/client" />

/** True in `vite dev`, or in a build made with VITE_USE_FIXTURES=1. */
declare const __FIXTURES_ALLOWED__: boolean;
/** Whether public/data/roster.runtime.json existed at build time. */
declare const __HAS_REAL_DATA__: boolean;
/** Short content hash of public/data at build time ("dev" without data). */
declare const __DATA_VERSION__: string;

declare module "*.svg?raw" {
  const src: string;
  export default src;
}
