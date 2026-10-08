# Voices of the Wild: the app

> Everything outside has something to say. Go find out what.

Photograph something outdoors. EmbeddingGemma 2 matches it **on the phone** to one of 91 characters (13 kinds, each with a guardian and six characters). That character speaks a pre-recorded line with live captions and joins your field guide. A small game (daily trail, streak, XP, badges) rewards walking to new places. After a one-time download the app makes **zero network requests**.

Vite + TypeScript + lit-html (3 KB templating with auto-escaping; no framework). Inference in a Web Worker via Transformers.js. Offline via a Workbox service worker plus a first-run downloader.

## Setup

```bash
npm install
npx playwright install chromium   # only for the screenshot / e2e tools
npm run dev                        # http://localhost:5173
```

Dev URL flags (they do nothing in a production build):

| Flag | Effect |
|---|---|
| `?mock` | Use the mock embedder on the real data (scripted outcomes; the screenshot tool uses this) |
| `?fixture` | Use the dev fixture (`src/dev-fixtures/`, built from `../data/roster/roster.json`) instead of `public/data` |
| `?model=real` | With the fixture, still run the real model |
| `?debug` | Top-5 match scores under every encounter (also a switch in About; works in production too) |
| `?threads=N` | ONNX Runtime wasm threads (default 1, see findings) |

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `preview` | Vite. `build` runs the typecheck first. |
| `npm test` | Vitest, 63 tests: matching (`match.test.ts`), game rules (`game/game.test.ts`: quest seeding, streak with grace day, XP incl. anti-spam and variety bonus, badges, the quest chain, step detection), captions guarantee (`ui/captions.guard.test.ts`), collection, card art |
| `npm run typecheck` (= `lint`) | `tsc` for the app and, separately, the service worker |
| `npm run embed` / `audio` / `calibrate` | Delegate to the pipeline package in `../pipeline` (writes `public/data`, `public/audio`) |
| `npm run samples` | Copies 8 CC-licensed calibration photos into `public/samples/` (WebP) with attribution |
| `npm run fixture` / `icons` | Rebuild the dev fixture / render PWA icons, favicon, OG image, DEV cover |
| `npm run screens` | Walks every screen at phone/tablet/desktop, light/dark (`BASE=` dev URL); saves `screenshots/` and fails on overflow, small targets, unnamed controls, uncaptioned voices, console errors |
| `npm run e2e:quests` | Plays a whole day's quest chain on a phone viewport (`BASE=` dev URL): steps from synthetic `devicemotion` walking through the real detector, shaking capped, every XP pop-up visible on top of the voice line |
| `npm run e2e:real` | Acceptance test on a production build in headed Chromium (real WebGPU): real model download, **airplane mode**, reload, real photos and the sample strip, report any network attempt |

## The game (all local, deterministic)

- **Daily trail:** a chain of 3 to 5 quests seeded from the date (same for everyone), unlocked one at a time and alternating *find and listen* (a common kind, sometimes *Touch grass* or *Meet someone new*) with *walk N steps* (500, then 1,000). Only meetings and steps after a quest unlocks count towards it. Finishing the chain extends the **streak** (one grace day per week).
- **XP:** new voice 100, new Elder 250, guardian tip 15, meeting again 10 (once per character per day), whole kind 500, finished quest 50, finished walk 0.15 per step (500 steps = 75). **+50% "New ground"** when the kind differs from the previous encounter. Captures within 60 s of the last one earn nothing unless they are new characters.
- **Ranks:** Wanderer, Scout (600), Trailblazer (2,000), Naturalist (5,000), Keeper of Voices (10,000).
- **Walk quests:** the accelerometer (`devicemotion`) feeds a pure step detector (`game/steps.ts`: gravity baseline, smoothed peaks with hysteresis, ≥270 ms between steps). A screen wake lock keeps motion events flowing. Motion permission is requested inside the tap that starts the walk (iOS, newer Chromium). No sensor (laptop): steps are estimated from time and the walk screen says so.
- **XP pop-up:** every XP gain shows a pop-up above the voice line with the parts, the quest finished and the next one.
- **Kind complete:** the guardian blesses you (its goodbye line, captioned), the emblem turns gold. All 78 characters: the finale.
- **12 badges** with one-line hints; **habitat compass** shows where unmet characters live; **share card** (1080×1350 / 1200×630) drawn offline on a canvas, Web Share API with download fallback.
- **Samples** ("No camera? Try one"): 8 photos that run the real pipeline for judges on laptops. They award nothing and are not collected.

## Architecture

```
                         first visit (online, once)
  ┌─────────────────────────────────────────────────────────────────────┐
  │ Onboarding ─► firstrun.ts ─► Cache "votw-data-<hash>"  data/*        │
  │                            ─► Cache "votw-field-v1"     audio/**, ort/*│
  │            ─► embed/worker.ts (Transformers.js) ─► "transformers-cache"│
  │                 model_q4 + vision_encoder_q4 + tokenizer (pinned rev) │
  │ service worker (Workbox) precaches the shell: html/js/css/fonts/samples│
  └─────────────────────────────────────────────────────────────────────┘
                         every visit after (offline)
  photo ─► image.ts (EXIF-aware, ≤896 px; a copy stays on the phone only if "Keep my photos" is on)
        ─► Web Worker: AutoProcessor(null, image) ─► AutoModel ─► 768-d
           (WebGPU; audio encoder dropped via config.audio_config = null)
        ─► match.ts: category ≥ T? species ≥ T and margin ≥ M? else guardian, else nobody
        ─► <voice-line>: <audio> + Media Session + WebVTT track, waveform, word captions
        ─► store.ts (collection) + game/engine.ts (XP, quests, streak, badges) in IndexedDB
```

| Path | Role |
|---|---|
| `src/match.ts` | CONTRACT.md §3, pure and unit-tested |
| `src/game/*` | Pure game rules (`engine`, `quests`, `streak`, `badges`, `habitats`, `rules`); `src/app/game.ts` glues them to the UI |
| `src/data.ts` | Loads and validates the field data; dev fixture fallback |
| `src/embed/*` | Worker protocol, model loading, warm-up, embedding |
| `src/firstrun.ts`, `src/ui/setup.ts` | Onboarding, field-kit download with byte progress, resume, quota/network errors, data versioning |
| `src/sw.ts` | Precache shell; serve `data/`, `audio/`, `ort/` from our caches |
| `src/audio.ts`, `src/captions.ts`, `src/ui/voice.ts` | The only playback path: caption always rendered and announced, WebVTT cues, caption-only fallback |
| `src/share.ts`, `src/samples.ts` | Share card renderer; sample photos |
| `src/art/*` | Logo, 13 emblems, guardian sigils, deterministic card motifs |
| `src/ui/*` | Trail (home), encounter, walk, moments, field guide, badges, about |

## Offline details

- **Shell:** Workbox precache (~1.4 MB incl. fonts and the 8 sample photos).
- **Field data** lives in `votw-data-<content hash>`; a new deploy gets a new hash. When the app opens online after an update it fetches the new data and any new voice files once (voices are hash-named, so unchanged ones are skipped) and prunes the old data. Offline, the previous kit keeps working.
- **Model:** Transformers.js caches weights in `transformers-cache`. After setup the worker runs with `allowRemoteModels = false`; cache lookups happen before any fetch. The service worker does not cache model files a second time.
- **ONNX Runtime wasm:** self-hosted under `/ort/`, `wasmPaths` points there, `useWasmCache = false`.
- `navigator.storage.persist()` is requested during setup.

## Findings worth knowing (measured, Oct 2026)

- **Verified offline on real hardware:** headed Chromium on the laptop's Intel iGPU (WebGPU), production build, airplane mode via Playwright. Zero network attempts. ~5 s per photo on that iGPU, model load from cache 4 s, first test photo 7 to 11 s.
- **q4 needs WebGPU in the browser.** Every quantized file of this model (q4, q4f16, q8; text and vision) uses `GatherBlockQuantized`, which the ONNX Runtime **wasm** build does not implement. Without WebGPU only fp32 runs (~1.8 GB); setup says so honestly. Node's native CPU runs q4 fine (the pipeline).
- **One wasm thread.** With `numThreads > 1` (cross-origin isolated) session creation hangs inside our module worker on both providers. Default is 1; `?threads=N` to experiment.
- **Transformers.js 4.3.1 drops `revision`** in `get_tokenizer_files` and the image-processor lookup, so offline loads missed the cache. Fixed by pinning the commit inside `env.remotePathTemplate`.

## Download size (q4, WebGPU)

| Part | Size |
|---|---|
| Text backbone `onnx/model_q4.onnx(_data)` | 174 MB (image tokens run through it, so it cannot be skipped) |
| Vision encoder `onnx/vision_encoder_q4.onnx(_data)` | 109 MB |
| `tokenizer.json` | 32 MB |
| ONNX Runtime wasm (asyncify) | 27 MB |
| Field data + 286 voices | ~1.4 MB + ~10 MB |

**Hosting:** the ORT wasm is 26.9 MB, over Cloudflare Pages' 25 MiB per-file cap. Use Netlify, Vercel or GitHub Pages. `public/_headers` sets COOP/COEP and long caching.

## Privacy

Photos are decoded, shrunk and embedded inside the browser, and never uploaded. By default one small copy of your latest photo of each character is kept in IndexedDB on that phone, so it can show on the card; switch it off or delete the photos in About. No backend, no account, no analytics, no third-party script. The field guide and game progress stay in IndexedDB until you export them.

## Accessibility

WCAG 2.2 AA contrast in both themes (text ≥ 4.5:1, UI boundaries ≥ 3:1), landmarks and a skip link, focus moved to the new heading on every view change, a polite log announcing each encounter and every voice's caption, **captions on every playback path** (enforced by a test) with a large-caption setting, keyboard operable, native `<dialog>` for moments, 44 px targets, `prefers-reduced-motion` respected.

## Credits

Voices by **ElevenLabs** (the 26 Elder voices, generated at build time). **Kokoro-82M** (Apache 2.0) for the other 65 voices, guardians included. **EmbeddingGemma 2**, Google DeepMind (Apache 2.0). Transformers.js (Apache 2.0), ONNX Runtime Web (MIT). EB Garamond and Atkinson Hyperlegible Next (SIL OFL). Phosphor Icons (MIT). Sample and calibration photos: Wikimedia Commons contributors (credits in `public/samples/samples.json` and in the app's About screen).
