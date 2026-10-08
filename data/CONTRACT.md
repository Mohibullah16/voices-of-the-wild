# Data contract between pipeline and app

## 1. Roster (source of truth, written by the editor step)
`week-1/data/roster/roster.json`
```jsonc
{
  "version": 1,
  "categories": [
    {
      "id": "trees", "name": "Trees",
      "guardian": {
        "id": "trees-guardian", "name": "The Old Grove", "personality": "...", "voice": "casting note",
        "descriptions": ["..."],
        "lines": { "first_meet": "...", "again": "...", "goodbye": "...", "hint": "..." }
      },
      "characters": [
        {
          "id": "neem-tree", "name": "Granny Neem", "species": "Neem tree", "category": "trees",
          "tier": "elder",            // "elder" = ElevenLabs v4 voice, "common" = Kokoro voice
          "rarity": "common", "habitat": ["street","park"], "caution": false,
          "personality": "...", "voice": "casting note",
          "descriptions": ["3-16 visual descriptions used for embedding, including realistic phone shots (low light, close-up of a part, odd angle, cropped)"],
          "lines": { "first_meet": "...", "again": "...", "goodbye": "..." }   // may contain [v4 tags]
        }
      ]
    }
  ]
}
```
13 categories × (1 guardian + 6 characters). 2 elders per category.

## 2. Build outputs consumed by the app (written by `app/scripts/`)
All under `week-1/app/public/`:
- `data/roster.runtime.json` — roster without `descriptions`; every line becomes
  `{ "text": "with [tags]", "caption": "tags stripped", "src": "audio/<id>/<line>.<hash8>.mp3", "engine": "elevenlabs" | "kokoro", "duration": 3.4 }`.
  Top level also has `"model": { "id": "...", "dtype": "q4", "dim": 768, "prefix": { "image": "", "text": "" } }` and `"thresholds": { "category": { "<catId>": 0.0 }, "species": { "<catId>": 0.0 }, "margin": 0.0, "global_min": 0.0 }`.
- `data/embeddings.bin` — Float32Array, row-major, L2-normalised, `dim` columns.
- `data/embeddings.index.json` — `[{ "row": 0, "owner": "neem-tree", "category": "trees", "guardian": false }]` (one row per description).
- `audio/**.mp3` — voice lines.
- `models/…` — optional self-hosted model files (if absent, the one-time setup step downloads from Hugging Face and caches; zero network after setup).

## 3. Runtime matching (app `src/match.ts`)
1. Embed photo (image) → L2-normalise.
2. `score(owner) = max cos(photo, row)` over that owner's rows.
3. `cat_score(c) = max score over owners in c (incl. guardian)`. Best category c1 must be ≥ `thresholds.category[c1]` (else "nobody wants to talk").
4. Within c1 (non-guardian owners): best s1, runner-up s2. If `s1 ≥ thresholds.species[c1]` and `s1 - s2 ≥ margin` → character s1. Else → guardian of c1 speaking its `hint` line.
5. Return top-5 for a debug panel.
