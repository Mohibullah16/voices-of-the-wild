# Voices of the Wild: Build Plan

> Everything outside has something to say. Go find out what.

**Challenge:** DEV Hacktoberfest Open-Source AI Challenge, Week 1: Touch Grass
**Judged on:** Writing quality (weighted most), relevance to theme, creativity, technical execution, partner tech
**Prize targets:** Best Use of Gemma ($200), Best Use of ElevenLabs ($100)
**Plan written:** Thu 2026-10-08, Asia/Karachi. Dev machine is Windows. Test phone is Android. No Mac.

---

## 0. Open questions (answer these first)

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| 1 | **What is the submission deadline?** The challenge page is dated 2026-10-05. If submissions close a week later, that is about Sun Oct 11 or Mon Oct 12. | Decides whether we follow the 7-day schedule or the compressed one (section 7). | Check the challenge page today. Use the compressed plan until the date is confirmed. |
| 2 | Will the content pipeline add one **category-level "guardian" character** per category (for example "The Old Tree" or "The Flower Bed")? | The fine-grained fallback depends on it (section 3). | Ask the pipeline to add one per category. If it can't, write them by hand: about 10 to 15 short entries. |
| 3 | Are we willing to spend **US$5 to 22** on one month of ElevenLabs? | It decides how many characters get premium voices (section 4). | No. Stay on the free tier and use the hero-subset plan. |
| 4 | Which city or area is the field walk in? | The catalog should favour regional species: neem, peepal, banyan, sheesham, amaltas, gulmohar, bougainvillea, myna, black kite, rose-ringed parakeet. Fewer irrelevant look-alikes means better matching. | Pakistan or South Asia urban parks and roadsides. |
| 5 | Is an iPhone available to borrow? | Without a Mac we can't debug Safari, but we can still smoke-test it. | Android only. Say so honestly in the post. |
| 6 | Does EmbeddingGemma 2 count as "Gemma" for that prize? | It decides which prize category we list. | Yes, since it is part of Google's Gemma family. Confirm with the model card or the challenge FAQ. |

---

## 1. What we're building (one paragraph)

The user takes a photo of something outdoors. That photo is embedded **on the phone** by EmbeddingGemma 2 and compared with pre-computed embeddings of character descriptions. If a character matches, it speaks: it plays a pre-generated, expressive voice line. After that the screen can go dark while the user listens. Characters belong to habitats (park, roadside, garden, water's edge, and so on), so filling the collection means going somewhere new. After the first install there is no backend and no network: photos never leave the phone.

### Core loop (screen time per encounter: about 10 seconds)

1. Tap **Listen to something**. The native camera opens (`<input type="file" accept="image/*" capture="environment">`).
2. The photo is embedded on-device in about 1 to 5 seconds, with an "...something is stirring" animation and a vibration on match.
3. Result:
   - **Match:** the character's name and a portrait card appear, the `first_meet` line plays (or `again` if the character is already collected), then `goodbye`. Audio keeps playing if the screen locks.
   - **Low confidence at species level:** the category guardian speaks instead, with a hint like "Come closer, show me a leaf."
   - **No match:** a "Nobody here wants to talk. Try something alive, or something old." state.
4. The collection screen groups characters by habitat ("Water's Edge 2/9"). Locked silhouettes are teasers that pull the user to new places.

---

## 2. Architecture

```
LAPTOP (build time, online)                       PHONE (runtime, offline)
─────────────────────────────                     ───────────────────────────────────
data/characters/*.json ──► embed-characters ──►   character-embeddings.bin + index.json
  (match descriptions)     (EmbeddingGemma 2,      │
                            text side)             ▼
                                                   photo ─► EmbeddingGemma 2 vision (q4,
data/characters/*.json ──► generate-audio ──►              WebGPU/wasm) ─► 768-d vector
  (voice lines + v4 tags)  (ElevenLabs v4 heroes,          │
                            Kokoro for the rest)            ▼
                              │                    cosine vs all descriptions
                              ▼                    → hierarchical match (section 3)
                           audio/<id>/<line>.mp3 ─►  → play mp3, save to IndexedDB
calibration/photos ──► calibrate ──► thresholds.json ─► (shipped)
```

### Runtime stack

| Piece | Choice | Why |
|---|---|---|
| Build tool | **Vite + vanilla TypeScript** | There are three screens, so a framework isn't worth it. Fast dev server, static output, types for the matching math. |
| Embedding | **Transformers.js** + `onnx-community/embeddinggemma-2-ONNX`, `dtype: "q4"`, `device: "webgpu"` with a `wasm` fallback | Open weights, runs in the browser, and the same library runs in Node for the build scripts, so laptop and phone use the same code path. |
| Backup runtime | LiteRT web (WASM) with `litert-community/embeddinggemma-2-740m-litert-lm` | Use only if the spike fails with Transformers.js. |
| Offline | Service worker: Workbox through `vite-plugin-pwa` (`injectManifest`) for the app shell, plus a **hand-written first-run downloader** that puts model, embedding and audio files into Cache API with a progress bar | Workbox precache isn't designed for files over 100 MB (default `maximumFileSizeToCacheInBytes` is 2 MB) and has no user-facing progress. |
| Storage | IndexedDB (through `idb-keyval`) for the collection and optional 128 px thumbnails. `navigator.storage.persist()` is requested on first run. | Survives restarts. The persist request lowers the chance of eviction. |
| Audio | A plain `<audio>` element plus the Media Session API | Playback continues with the screen off and shows lock-screen controls. |
| Runtime TTS | **None.** Kokoro runs at build time instead (section 4). | In-browser TTS would add 80 to 300 MB and seconds of latency on a mid-range phone, with no benefit because the lines are fixed. |

### Offline config (as decided)

```ts
env.allowRemoteModels = false;
env.localModelPath = "/models/";
env.backends.onnx.wasm.wasmPaths = "/ort/";
```

**Acceptance test:** install on wifi, switch to airplane mode, force-close and restart the app, walk outside, collect 5 characters. Chrome DevTools (remote, through `chrome://inspect`) must show **zero** network requests.

### Things the spike must confirm (each changes the design)

- **Vision-only loading.** The phone never embeds text, so it should download only the vision encoder (about 109 MB), not the text model (about 175 MB). Check whether `AutoModel` loads lazily per modality. If it doesn't, load the vision ONNX session directly. Payoff: the first-run download drops from about 300 MB to about 120 MB.
- **Task prefixes.** EmbeddingGemma v1 expected prefixes such as `task: search result | query: ...` and `title: none | text: ...`. Check the v2 model card. Then test the descriptions three ways (raw text, document prefix, and `"a photo of ..."`) and keep whichever gives the best photo-to-text ranking.
- **Laptop/phone parity.** Embed the same 3 photos on the phone and on the laptop (Node) and check that the cosine between them is above 0.99. Without that, calibrating on the laptop is meaningless.
- **Text-side dtype.** Compare q4 text embeddings with fp32 text embeddings on the calibration set. Use fp32 on the laptop if it ranks better; the text side never runs on the phone.
- **Hosting file limits.** Cloudflare Pages caps files at 25 MB and GitHub Pages at 100 MB. Check the ONNX file sizes, including the `.onnx_data` external-data files. If any file is too large, either host on Netlify or Vercel, or let the first-run downloader fetch the model **once** from the Hugging Face CDN at a pinned revision, store it in Cache API, and set `allowRemoteModels = false` from then on.

---

## 3. Matching, and the fine-grained risk

**The honest risk:** zero-shot photo-to-text matching handles "tree vs bird vs lamp post" well. It will often fail on "neem vs peepal" or "marigold vs zinnia". Photo-to-text cosine scores are also lower and more compressed than text-to-text scores, so a single global threshold won't work.

### Algorithm (hierarchical, with a fallback)

```
e = normalize(embed(photo))
desc_score[d]  = e · d                          (every description vector)
char_score[c]  = max over c's descriptions
cat_score[k]   = max over characters in k (+ the guardian's descriptions)

1. Category: k1, k2 = top two categories
   if cat_score[k1] < T_cat or cat_score[k1] - cat_score[k2] < M_cat:  → "nobody here"
2. Species within k1: s1, s2 = top two characters
   if char_score[s1] >= T_sp[k1] and margin >= M_sp[k1]:              → species character
   else:                                                              → guardian of k1
```

`T_cat`, `M_cat`, `T_sp[k]` and `M_sp[k]` come from `thresholds.json`, which the calibration script produces **per category**.

### Mitigations, in order of value for effort

1. **The guardian fallback turns uncertainty into content.** The guardian doesn't pretend to be sure. It says something like "We trees don't give our names to strangers. Show me a leaf." That guides the next photo and never gives a confident wrong answer.
2. **Visual descriptions, not encyclopedia text.** The pipeline should describe what a camera sees ("heart-shaped leaf with a long dripping tail", "pale grey smooth bark"), with 3 to 6 descriptions per character covering whole plant, close-up and bark or petal.
3. **Per-category photo hints** shown on the capture button, for example "Trees: get a leaf in the frame" or "Birds: fill the frame". Close-ups are much easier to separate.
4. **Image anchors (the strongest lever).** Because the embedding space is shared, add 2 to 5 reference *photo* embeddings per hero character next to its text descriptions. Image-to-image similarity separates fine-grained classes far better than image-to-text. Sources: our own photos, or CC-licensed photos from Wikimedia or iNaturalist. Only the vectors ship, but credit the sources anyway.
5. **Regional catalog.** Matching gets easier when the candidate set holds only species the user can actually meet. Weight the catalog toward Pakistan and South Asia.
6. **Test-time augmentation (cheap).** Embed the full frame and a center crop, then use the max score. This roughly doubles inference time, so measure the cost in the spike first.
7. **Calibration.** Take about 30 real photos (more if time allows) across categories, label them in `calibration/labels.csv`, and run `scripts/calibrate.ts` to get a per-category confusion matrix, the score distributions and the chosen thresholds. **That confusion matrix goes in the write-up** as an honest result.

**Out of scope:** fine-tuning. It is possible with open weights, so mention it in the write-up as "what's next".

---

## 4. ElevenLabs budget

### The maths

Assume about 1 credit per character for Eleven v4 (**verify on the pricing page**; the inline `[tags]` count as characters).

| Item | Estimate |
|---|---|
| Average line, including tags | about 110 characters |
| Lines per character | 3 (`first_meet`, `again`, `goodbye`) |
| Credits per character | about 330 |
| Free tier | 10,000 credits a month, which covers **about 27 characters** after keeping about 1k for retries |
| 300 characters | about 100,000 credits, or **10 times the free tier** |

**Note:** using one voice per category does **not** save credits. Billing is per character of text, not per voice. Shared voices only save the effort of designing voices.

### Options

| Option | ElevenLabs coverage | Cost | Notes |
|---|---|---|---|
| A. **Hero subset on ElevenLabs, Kokoro for the rest (at build time)** | about 25 to 27 characters | Free | Kokoro-82M (Apache 2.0) runs in Node on the laptop, outputs mp3, and needs nothing at runtime. Tags are stripped for Kokoro. |
| B. Very short lines (at most 60 characters) | about 50 characters | Free | Hurts writing quality and charm, which are the things we're judged on. |
| C. Unique `first_meet`, shared `again`/`goodbye` per category | about 70 characters | Free | Characters feel less individual on repeat visits. |
| D. Paid month: Starter (about $5, 30k credits) or Creator (about $22, 100k) | about 80 or about 300 | $5 to $22 | Verify current prices. Removes the two-tier voice system. |

### Recommendation: A, plus D-Starter if the user agrees to $5

- **Heroes on ElevenLabs:** all category **guardians** (they are heard most because of the fallback), plus about 12 to 15 species we are likely to meet on the demo walk.
- **Everyone else:** Kokoro, with a few distinct voices per category, rendered at build time.
- **Game framing:** heroes are **"Elder voices"**, a rare tier with a gold card border. The quality gap then reads as a feature rather than a seam.
- If $5 is approved, raise the hero count to about 80 and stop there.
- **Attribution:** a "Voices by ElevenLabs" credit on the about screen and in the post (the free tier requires it). Stock voices only.

### `generate-audio.ts` rules

- **Dry run first.** Count the credits a run will use before spending any, and refuse to run if it exceeds the remaining quota.
- **Idempotent.** Each filename includes a hash of its text, so unchanged lines are never regenerated.
- **Small files.** Request `mp3_22050_32`, which is about 4 KB per second. 900 lines of about 6 seconds each is about 22 MB in total.
- **Retries.** Retry with backoff. Write a manifest of what was generated, with which engine and which voice.

---

## 5. Repo structure

```
week-1/                          # becomes the public repo "voices-of-the-wild"
  PLAN.md  GUIDE.md  SUBMISSION_TEMPLATE.md
  data/                          # produced by the content pipeline; we only read it
    catalog.json
    characters/<category>.json   # id, name, descriptions[], personality, lines{first_meet,again,goodbye}
  app/
    index.html
    vite.config.ts
    src/
      main.ts                    # screens: first-run, capture, encounter, collection
      model.ts                   # load/warm EmbeddingGemma 2 vision, embedImage()
      match.ts                   # cosine, hierarchical match, thresholds
      audio.ts                   # playback + Media Session
      store.ts                   # IndexedDB collection
      firstrun.ts                # download manager with progress → Cache API
      sw.ts                      # service worker (injectManifest)
    public/
      models/...                 # fetched by scripts/fetch-model.ts (gitignored)
      ort/...                    # onnxruntime-web wasm files
      audio/<id>/<line>.mp3      # generated (gitignored or LFS)
      characters.runtime.json    # slim: id, name, category, habitat, tier, captions, audio paths
      character-embeddings.bin   # Float32 (or Int8) vectors
      character-embeddings.json  # index: descriptionRow → characterId, category
      thresholds.json
  scripts/                       # Node + tsx, sharing match.ts with the app
    validate-data.ts             # schema-check pipeline output; fail loudly
    fetch-model.ts               # download pinned model revision → app/public/models
    embed-characters.ts          # text (+ optional image anchors) → embeddings
    calibrate.ts                 # photos + labels.csv → confusion matrix, thresholds.json
    generate-audio.ts            # --engine elevenlabs|kokoro --dry-run
  calibration/
    labels.csv                   # filename,category,characterId
    photos/                      # gitignored (keep a few for the post)
```

**Embeddings format:** 300 characters × about 4 descriptions × 768 dims as Float32 is about 3.7 MB in binary, but about 10 MB as JSON. Ship the binary plus a small JSON index.

**Windows toolchain:**
- Node 20+ and `tsx`
- `winget install Gyan.FFmpeg` (Kokoro WAV to mp3)
- `winget install Google.PlatformTools` (adb)

**Phone dev loop:** `adb reverse tcp:5173 tcp:5173` makes the phone's `http://localhost:5173` a secure context, so camera, service worker and WebGPU all work without certificates. Debug it with `chrome://inspect` on the laptop.

---

## 6. Feasibility spike (Day 0, today, before anything else)

**Goal:** on a real Android phone, go from photo to embedding to 5 descriptions to printed scores.

1. `npm create vite@latest app -- --template vanilla-ts`, then add `@huggingface/transformers`.
2. Put 5 hand-written descriptions on one page (neem tree, a flower, a crow, a lamp post, a puddle). Embed them in the browser for the spike only, to save time.
3. Use a file input with capture, call `processor(null, image)` then `model(...)` to get `sentence_embedding`, and show cosine scores plus timings.
4. Over adb reverse, take 10 real photos outside the house.

**Write down:**

| Measurement | Pass | Worry |
|---|---|---|
| Model download size (vision only?) | ≤ 150 MB | > 300 MB |
| Cold load to ready | ≤ 20 s | > 60 s |
| Embed time, WebGPU / wasm | ≤ 3 s / ≤ 10 s | > 15 s |
| Correct description ranked first | ≥ 8/10 photos | ≤ 5/10 |
| Memory or tab crash | none | any |
| Prefix variant that ranks best | recorded | none helps |

**Go/no-go:**
- **Pass:** continue with the plan.
- **Slow on WebGPU or wasm:** try LiteRT web.
- **Wrong rankings:** move image anchors (section 3, mitigation 4) from optional to required.
- **Crashes:** try a smaller dtype or vision-only loading. If it still crashes, rescope.

---

## 7. Schedule (assumes about 7 days; deadline still unknown)

| Day | Date | Work | Done when |
|---|---|---|---|
| 0 | Thu Oct 8 | **Spike** (section 6). Check the deadline. Send the pipeline the guardian request and the visual-description guidance. | Scores printed on the phone. Go/no-go decided. |
| 1 | Fri Oct 9 | `validate-data`, `fetch-model`, `embed-characters` (laptop). Parity check. Shoot and label about 30 calibration photos on a walk. `calibrate` v1. | `thresholds.json` exists. Confusion matrix seen. |
| 2 | Sat Oct 10 | Core app flow: capture, match, encounter screen, audio. Hero list chosen. `generate-audio --dry-run`, then ElevenLabs for heroes and Kokoro for the rest. | Can collect a character end-to-end online. |
| 3 | Sun Oct 11 | Offline: first-run download screen, service worker, IndexedDB collection, `storage.persist()`. Collection screen by habitat. Deploy. | **Airplane-mode acceptance test passes.** |
| 4 | Mon Oct 12 | **Field walk #1** (the real "touch grass" outing): 2 or more habitats, notes on every miss. Retune descriptions, add image anchors for the worst confusions, recalibrate. | 5+ characters collected offline. Miss list fixed or explained. |
| 5 | Tue Oct 13 | Polish: card art (simple illustrated silhouettes or emoji glyphs), Elder tier styling, about and credits screen. Record the demo walk video. Screenshots. Cover image (1000×420). | Video and assets ready. |
| 6 | Wed Oct 14 | **Write the post** (most heavily judged). Export the DevRelay session. Proofread on mobile. Publish. | Post live with required tags. |
| 7 | Thu Oct 15 | Buffer. | |

### Compressed plan (if the deadline is Sun Oct 11 or Mon Oct 12)

| Day | Work |
|---|---|
| Thu | Spike |
| Fri | Embed and calibrate, core flow, audio for heroes only |
| Sat | Offline and deploy, then field walk in the afternoon |
| Sun | Video, write-up, publish |

**Drop from the compressed plan:** Kokoro (ship heroes only, about 25 characters, and say so honestly), image anchors, thumbnails, and test-time augmentation.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deadline sooner than assumed | Med | High | Confirm today. Compressed plan ready. |
| Fine-grained confusion (neem vs peepal) | High | Med | Guardian fallback, image anchors, photo hints, per-category thresholds (section 3) |
| Vision model too slow or crashes on a mid-range Android | Med | High | Spike first. Wasm fallback, then LiteRT. Vision-only loading. |
| Whole model loads (about 300 MB) instead of vision only | Med | Med | Load the vision session directly. Clear progress UI. Wifi-only first run. |
| Hosting caps on file size | Med | Med | Netlify or Vercel, or a one-time HF CDN fetch into Cache API (section 2) |
| Browser evicts cached model | Low | High | `storage.persist()`, install as PWA, check in the acceptance test |
| Laptop and phone embeddings differ | Low | High | Parity check on Day 1 |
| ElevenLabs credits run out mid-run | Med | Med | Dry-run quota check, idempotent hashes, Kokoro fallback |
| Pipeline data late or inconsistent | Med | High | `validate-data` with clear errors. Spike and app run against a 20-character subset. |
| iOS untested (no Mac) | High | Low | State Android-only in the post. Smoke-test a borrowed iPhone if possible. |
| Photos of people or private property | Low | Med | Usually falls into the "nobody here" state. Photos are never stored or sent. Mention it in the post. |
| User safety while listening | Low | Med | "Look up, not down" copy. Short lines. Suggest one earbud. |

---

## 9. Demo and write-up plan

Writing is weighted most heavily, so the post gets a full day and a story arc instead of a feature list.

### Working title ideas

- "I put my phone in airplane mode and a neem tree complained to me about the heat"
- "Voices of the Wild: everything outside has something to say"

### Story spine, mapped to the template

| Template section | Content |
|---|---|
| **What I Built** | Open on the walk: airplane mode on, the first photo, a voice. Then the game: habitats, the collection, locked silhouettes pulling you to the canal or the old graveyard. The screen is on for about 10 seconds per encounter; the rest is listening. |
| **Demo** | Deployed PWA link, plus a 60 to 90 second video of the phone screen and the outdoor audio, with the airplane-mode icon visible. Optional: narrate the video intro in an Elder voice, which also strengthens the ElevenLabs entry. |
| **Code** | GitHub repo embed. |
| **How I Built It** | Diagram from section 2. EmbeddingGemma 2 running in the browser with Transformers.js. Why text embeddings are pre-computed. The hierarchical match. **The calibration confusion matrix**, including what failed and how the guardian fallback handles it. The ElevenLabs v4 tags pipeline and Elder-tier budgeting. |
| **Why Does Open Innovation Matter?** | Photos never leave the phone. There's no server, no account and no API key at runtime. It works on a trail with no signal. Open weights (Apache 2.0) can be redistributed inside a PWA. Running costs are zero, forever. A closed vision API would need signal, cost per photo, and see every photo. Be honest that the voices are a closed service, used once at build time, and explain why that trade-off still keeps the runtime fully open and offline. |
| **My Agent Session** | DevRelay export of the build session (the spike and calibration decisions are the interesting part). |
| **Prize Categories** | Best Use of Gemma, Best Use of ElevenLabs |

### Assets to capture along the way

**Screenshots:**
- First-run "Get ready for the trail" progress screen
- Capture screen with a photo hint
- Encounter card (normal and Elder)
- Guardian fallback
- "Nobody here"
- Collection by habitat
- Airplane-mode status bar
- DevTools Network panel showing 0 requests

**Other material:**
- Raw spike numbers (load time, embed time, scores) from Day 0. These are good prose material.
- The 2 or 3 funniest or most surprising encounters from the field walk, and one honest failure.
- Cover image at 1000×420.

### Before publishing

- Add ElevenLabs attribution.
- Credit image-anchor photo sources.
- Fill in the AI Disclosure field.
- Add tags `#devchallenge` and `#hf26challenge` (plus up to 2 more, for example `#webdev` and `#machinelearning`).

---

## 10. Definition of done

- [ ] Airplane-mode acceptance test passes on a real Android phone (5 characters collected, 0 network requests)
- [ ] At least 2 habitats visited on a real walk, with notes
- [ ] Calibration confusion matrix and thresholds committed
- [ ] Every shipped character has 3 audio lines, and Elder heroes use ElevenLabs v4
- [ ] Public repo with README, licenses (Apache 2.0 model, attribution notes)
- [ ] Deployed PWA, a demo video, and the DEV post published with the DevRelay session
