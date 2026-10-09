<p align="center">
  <img src="docs/cover.png" alt="Voices of the Wild: everything outside has something to say. Go find out what." width="100%" />
</p>

<h1 align="center">Voices of the Wild</h1>

<p align="center">
  <b>Point your phone at something outside. An open model works out what it is, and that thing talks back.</b><br/>
  An oak, a crow, a parked car, a puddle, the moon: 81 characters and 13 guardians, 295 captioned voice lines.<br/>
  Then it sends you on a walk. Phones use a small <b>cloud listener</b> running the same open model; laptops can run it <b>entirely on-device</b>.
</p>

<p align="center">
  <a href="https://voices-of-the-wild.netlify.app"><b>▶ Try it live: voices-of-the-wild.netlify.app</b></a><br/>
  <sub>Best on an Android phone in Chrome. No account, no install. About 37 MB of voices downloads in the background on the first visit.</sub>
</p>

<p align="center">
  <img alt="EmbeddingGemma 2" src="https://img.shields.io/badge/model-EmbeddingGemma%202%20(q4)-2f5d3f?style=flat-square" />
  <img alt="Runs on device" src="https://img.shields.io/badge/runs-on%20device%20%C2%B7%20WebGPU-2f5d3f?style=flat-square" />
  <img alt="Offline" src="https://img.shields.io/badge/on--device%20mode-0%20network%20requests-b8892b?style=flat-square" />
  <img alt="Cloud listener" src="https://img.shields.io/badge/phones-cloud%20listener%20on%20Modal-2f5d3f?style=flat-square" />
  <img alt="Voices" src="https://img.shields.io/badge/voices-ElevenLabs%20%2B%20Kokoro-b8892b?style=flat-square" />
  <img alt="MIT" src="https://img.shields.io/badge/licence-MIT-555?style=flat-square" />
</p>

<p align="center">
  <img src="docs/hook.gif" alt="A car is photographed and Parker, the parked car, answers with +200 XP and a captioned line" width="260" />
  &nbsp;&nbsp;
  <img src="docs/quest-chain.gif" alt="The quest chain: walk 500 steps counted by the phone, +75 XP, and the next quest unlocks: meet a vehicle" width="260" />
</p>

<p align="center"><sub>Entry for the DEV Hacktoberfest Open-Source AI Challenge, Week 1: <b>Touch Grass</b>. Demo video (1:55, sound on): <a href="docs/demo.mp4">docs/demo.mp4</a></sub></p>

---

## The idea

Most apps want your eyes on the screen. This one wants the screen off. You only take the phone out for the photo; the rest of the time it is a voice in your ear and a reason to walk down a different street.

1. **Snap** something outdoors.
2. **Match.** EmbeddingGemma 2 turns the photo into 768 numbers and compares them with 717 character descriptions.
3. **Listen.** If it is sure, that character speaks, with live captions. If it isn't, it doesn't guess: a **guardian** asks for a closer look.
4. **Walk.** The next quest is a walk. The phone counts your steps, then unlocks the next thing to find.

<p align="center">
  <img src="docs/screens.jpg" alt="Five phone screens: Pebble Pals answering, Parker the car with an XP pop-up, a finished walk, the community leaderboard, and a miss with a near-miss hint and Skip" width="100%" />
</p>

## The game: a quest chain that makes you move

Every day has a **trail of 5 to 7 quests**, the same for everyone, unlocked one at a time:

> *Meet a vehicle* → **Walk 500 steps** → *Touch grass* → **Walk 1,000 steps** → *Meet a flower* → **Walk 1,500 steps** → …

- **Steps, not minutes.** The accelerometer feeds a small step detector in the browser ([`game/steps.ts`](app/src/game/steps.ts)): a gravity baseline, smoothed peaks with hysteresis, and at least 270 ms between steps, so shaking the phone can't go faster than a running pace. A wake lock keeps the screen on during a walk, because browsers pause motion events when it turns off. A laptop has no sensor, so there the app says it is estimating from time.
- **Every XP gain pops up** above the voice line: *+300 XP · Quest done · Next: Walk 500 steps*.
- **XP:** new voice 100, new Elder 250, finished quest 50, a walk 75 per 500 steps. A different kind from your last find adds +50%. Repeat snaps within 60 s earn nothing.
- **A miss isn't a dead end.** The app says what it half-saw (*"Something among the vehicles stirred…"*), and **Skip −25 XP** moves past a find quest. Walks can't be skipped.
- **Next day** starts tomorrow's trail now and keeps your XP. Streaks stay on the real calendar.
- **Streaks** with one grace day a week, **12 badges**, **5 ranks**, 28 rare gold **Elders**, and an anonymous **community leaderboard**.
- Characters never tell you to touch wildlife, pick things, climb, eat what you find, or step into traffic. Risky things warn you in character.

## How it works

```
photo ─► downscale in the browser ─► EmbeddingGemma 2 (q4, WebGPU → wasm) ─► 768-d vector
                                                                                 │
           717 descriptions, embedded at build time with the same model ◄────────┘ cosine
                                                                                 │
        category threshold ─► species threshold + margin ─► character │ guardian │ nobody
                                                                                 │
                         pre-recorded voice line + captions ◄────────────────────┘
```

| | |
|---|---|
| **Matching** | [`onnx-community/embeddinggemma-2-ONNX`](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX) at `q4` with [Transformers.js](https://github.com/huggingface/transformers.js). Score per character is the max over its descriptions; hierarchical (category, then species); a guardian answers when the margin is thin. |
| **Voices** | **ElevenLabs Eleven v4** performs the 28 Elders (84 lines). **Kokoro-82M**, open source, voices the other 211 lines. Both run at build time only; the app never calls either. |
| **Two listeners** | **On-device** (default on laptops): the model runs in the browser on WebGPU. **Cloud** (default on phones): EmbeddingGemma 2 q4 needs more GPU memory than phones give a browser tab, so phones send one shrunk JPEG (~100 KB) to [`listener/`](listener/), the same model and pinned revision on [Modal](https://modal.com), and get the 768 numbers back in ~3 s. Same matches either way (checked on the calibration photos). Switch in About. |
| **Offline** | In on-device mode the model, vectors, voices, fonts and icons are cached by a service worker and `allowRemoteModels = false`. The acceptance test goes to airplane mode, reloads and collects a character: **0 network attempts**. The cloud listener needs a connection. |
| **Fast first run** | No setup wall: you're on the trail in under a second while the field kit downloads in the background (37 MB on phones with the cloud listener, ~350 MB with the on-device model). The GPU is only used at the first photo. |
| **Privacy** | No account, no analytics, no third-party scripts. The cloud listener decodes the photo in memory, returns the numbers and keeps nothing. Matching, voices and your collection always stay on the device; an optional small copy of your latest photo per character stays in IndexedDB for the card. |
| **Accessibility** | WCAG 2.2 AA target: captions for every line, full keyboard and screen-reader support, `prefers-reduced-motion`, 44 px touch targets, one-handed on a phone. |

### Calibration

On **244 real Wikimedia photos**, cross-validated, with thresholds tuned to be forgiving: the right character is named **77.9%** of the time, a guardian asks for a closer look **12.7%**, a wrong name **7.8%**, and "nobody" on a real thing **1.6%**. Whenever it names someone, it is right **90.9%** of the time. Full report: [pipeline/calibration/REPORT.md](pipeline/calibration/REPORT.md) · photo credits: [ATTRIBUTION.md](pipeline/calibration/ATTRIBUTION.md).

## Run it

```bash
cd app
npm install
npm test          # 65 unit tests: matching, quest chain, step detector, streaks, badges, captions
npm run dev       # http://localhost:5173  (add ?mock to script outcomes, ?debug for match scores)
npm run build     # typecheck + production PWA in dist/
```

| Folder | What |
|---|---|
| [`app/`](app/README.md) | The PWA: Vite, TypeScript, lit-html, Workbox. Tests and end-to-end tools in `app/tools/`. |
| [`pipeline/`](pipeline/README.md) | Build-time scripts: description embeddings, calibration, voice generation (idempotent, `--dry-run`). |
| [`data/`](data/CONTRACT.md) | The character roster, the writing spec and the data contract. |
| [`listener/`](listener/README.md) | The cloud listener: a tiny Node server running the same EmbeddingGemma 2 (`server.mjs`), deployed on Modal (`modal_app.py`). Check it with `npx tsx app/tools/listener-check.ts`. |
| [`showcase/`](showcase/README.md) | The showcase video, built with Remotion from the real app screens and voice files. |
| [`demo/`](demo/README.md), [`pitch/`](pitch/) | Screen-recording pipeline and the pitch deck. |

Regenerating Elder voices needs an ElevenLabs key in `week-1/.env` as `elevenlabs-api-key` (gitignored). Nothing else needs a key.

## Credits

Voices by **ElevenLabs** (Eleven v4). **Kokoro-82M** (Apache 2.0). **EmbeddingGemma 2** by Google DeepMind (Apache 2.0). **Transformers.js** (Apache 2.0) and **ONNX Runtime Web** (MIT). Icons by **Phosphor** (MIT). Fonts: **EB Garamond** and **Atkinson Hyperlegible Next** (SIL OFL). Calibration and sample photos from Wikimedia Commons, credited in [ATTRIBUTION.md](pipeline/calibration/ATTRIBUTION.md).

Code licensed [MIT](LICENSE).

## Commit timeline

Built 5 to 12 Oct 2026 for the DEV Hacktoberfest Week 1 challenge. Any commit after Mon 12 Oct 06:59 UTC is listed below.

### Post-deadline changes

None.
