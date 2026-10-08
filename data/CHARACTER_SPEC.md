# Character file spec

One file per catalog category: `week-1/data/characters/<category-id>.json`.
Source of items: `week-1/data/catalog.json` (use each item's `visual_cues`, `lookalikes`, `habitat`, `caution`).
Context: `week-1/PLAN.md` (sections 1 and 3 explain the matching and the guardian fallback).

## How the data is used
- `descriptions` are embedded with **EmbeddingGemma 2** (text side). A user's outdoor phone photo is embedded (image side) and compared by cosine similarity. A character's score = max over its descriptions. Matching is hierarchical: category first, then species; if the species margin is weak, the category **guardian** speaks instead.
- `lines` are turned into audio once at build time (ElevenLabs Eleven v4 for "elder" heroes, open-source Kokoro for the rest). v4 understands inline tags in square brackets, e.g. `[sighs]`, `[laughs]`, `[whispers]`, `[groans slowly]`, `[excited]`, `[light rain]`. Kokoro ignores/strips tags, so every line must still read well with the tags removed.

## Schema
```json
{
  "category": "trees",
  "guardian": {
    "id": "trees-guardian",
    "name": "The Old Grove",
    "personality": "One or two sentences: temperament, quirks, speech style.",
    "voice": "Short casting note for picking a stock voice: age, gender-neutral ok, pace, texture.",
    "descriptions": ["4-6 broad descriptions covering the whole category as a camera sees it"],
    "lines": {
      "first_meet": "...",
      "again": "...",
      "goodbye": "...",
      "hint": "Line used when the species is uncertain. Tells the user what to photograph next (a leaf, the flower, the bark, closer, wider)."
    }
  },
  "characters": [
    {
      "id": "<catalog item id, unchanged>",
      "name": "A character name, e.g. 'Nani Neem'",
      "species": "<catalog item name>",
      "personality": "One or two sentences.",
      "voice": "Casting note.",
      "elder_candidate": false,
      "descriptions": [
        "3-5 descriptions, each 8-25 words"
      ],
      "lines": { "first_meet": "...", "again": "...", "goodbye": "..." }
    }
  ]
}
```

## Writing the `descriptions` (most important for matching)
- Describe **what a phone camera sees**, literally: shape, colour, texture, parts, size, typical setting and framing. Write them like photo captions: "a close-up photo of small serrated leaflets on a thin stem".
- Cover **different shots of the same thing**: whole thing at a distance, close-up of the distinctive part (leaf/flower/bark/beak/wing/texture), and typical setting.
- **Discriminate against lookalikes**: at least one description must state the feature that separates this item from each id in its `lookalikes` (e.g. peepal's long drip-tip heart-shaped leaf vs banyan's oval leaf and aerial roots).
- No personality, no names, no metaphors in descriptions. Do not mention the character.
- Keep descriptions in English.

## Writing the `lines` (judged on writing quality — make them good)
- Each item becomes a **distinct, funny or touching character** with a point of view rooted in real facts about the thing (biology, local culture, how people treat it in Karachi/Pakistan where relevant). Avoid generic "I am a tree, I give oxygen".
- `first_meet`: introduce itself, one real/interesting fact delivered in character. `again`: recognises the returning user. `goodbye`: sends them off, ideally nudging them to go find something else outside (look up, go to water, etc.).
- **Max 140 characters per line including tags** (budget: audio credits are per character). 1-2 tags per line, placed where delivery changes.
- English, with occasional light Urdu/Roman-Urdu words where natural for South Asian items (e.g. "beta", "yaar", "chalo") — sparingly, must be understandable.
- For `caution: true` items, the character must itself warn the user to keep distance / not touch / not eat, in character.
- Never encourage picking, climbing, disturbing animals, trespassing, or eating anything found.
- `elder_candidate: true` for at most 3 items per category: the most common/iconic ones a user in Karachi is likely to meet on a first walk (these may get premium ElevenLabs voices).

## Validation
Before finishing, validate the file parses (`node -e` or `python -I`), every catalog item in the category has exactly one character with the same id, ids are unchanged, every line ≤ 140 characters, every character has 3–5 descriptions.
