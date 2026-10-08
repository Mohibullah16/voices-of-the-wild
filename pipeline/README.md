# Voices of the Wild: build-time pipeline

Turns `data/roster/roster.json` into the files the app reads from `app/public/` (format: `data/CONTRACT.md` §2). It runs on a laptop. Nothing here ships or runs on the phone.

```
npm install
npm run build:all     # embed → calibrate → audio → validate
```

| Script | What it does | Writes |
|---|---|---|
| `embed` | Embeds every description of every character and guardian with EmbeddingGemma 2 (`onnx-community/embeddinggemma-2-ONNX`, `q4`, the same weights as the phone). | `public/data/embeddings.bin`, `embeddings.index.json` |
| `photos` | Fetches about 3 CC0/PD/CC BY/CC BY-SA photos per character from Wikimedia Commons, plus `--negatives` (indoor controls). | `calibration/photos/`, `photos.json`, `ATTRIBUTION.md` |
| `calibrate` | Embeds the photos through the image path and runs the app's own `src/match.ts`. Picks the description prefix and fits thresholds that keep confident wrong names rare. | `build/calibration.json`, `calibration/REPORT.md`, thresholds in `roster.runtime.json` |
| `audio:dry` | Prints the voice cast and character counts. Makes no API calls. | (nothing) |
| `audio` | Voices elders with ElevenLabs Eleven v4 (tags kept) and everyone else with Kokoro-82M (tags stripped). Converts to mono mp3 and measures each duration with ffprobe. | `public/audio/<id>/<line>.<hash8>.mp3`, `build/audio-manifest.json` |
| `runtime` | Rebuilds `roster.runtime.json` from the roster, the audio manifest and the calibration. Every step above also runs it. | `public/data/roster.runtime.json` |
| `validate` | Checks that every `src` exists, every duration is above 0, the embedding rows match the index, dim is 768 and every row is normalised. | (nothing) |
| `credits` | Prints the ElevenLabs usage and limit as numbers only. | (nothing) |

**Rules this follows**
- The ElevenLabs key comes from `week-1/.env` (`elevenlabs-api-key`). It is read inside `src/eleven.ts` and never printed or written anywhere.
- **Budget guard.** The script checks the subscription and renders one probe line, then checks again to get the cost per character. If the projected total is more than the remaining credits minus 500, it voices only `first_meet` lines and gives the rest to Kokoro. The usage counter lags by minutes, so an unmoved counter is treated as 1 credit per character.
- **Idempotent.** File names hash engine, voice, model and text, so files that already exist are skipped. Stale files are pruned.
- Models are cached in `.model-cache/` (gitignored). The ElevenLabs voices are stock or library voices already in the account; none are cloned.
