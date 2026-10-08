# Voices of the Wild: 3-minute pitch script

About 420 spoken words, just under 3 minutes at 150 words a minute. Slide numbers are in brackets. Every number is from `pipeline/calibration/REPORT.md`, `app/src/game/rules.ts` or the audio manifest (the one exception, 701 credits across two casts, comes from the audio runs), so it holds up to questions.

Keys in `index.html`: arrows or space to move, **N** for notes, **F** for fullscreen.

---

**0:00 [1] Hook.** *Play Granny Neem's first line from the phone before saying anything.*

> "I'm Granny Neem, everyone's granny. Bitter as the truth, and my leaves keep bugs out of quilts."

That's the neem tree outside my gate. My phone was in airplane mode. This is Voices of the Wild.

**0:15 [2] Problem.** We look at screens, not at the street. The neem by the gate, the myna on the wire, the painted truck at the signal. We walk past all of it, eyes down.

**0:28 [3] Idea.** So point your phone at something outside, and it talks back. Everything outside has something to say. Go find out what.

**0:40 [4, 5] How it plays.** Snap it, hear it, keep it. You photograph a tree, a crow or a bus. A character with a personality of its own answers, with captions, and goes into your field guide. There are 78 of them across 13 kinds of thing, plus a guardian for each kind. 26 are Elders: gold cards with ElevenLabs voices.

**1:02 [6] The game.** The scoring rewards walking, not snapping. A new voice is 100 XP and a new Elder is 250. Meeting a different kind of thing than last time adds half again. Pocket the phone for five minutes and come back, and that's 75 more. Snap the same thing again within a minute and you get nothing. There's a daily trail, a streak, and a badge called Touched Grass.

**1:25 [7] Privacy.** Your photos never leave the phone. The model runs in the browser and the photo is thrown away. After one setup on wifi, the app makes zero network requests.

**1:38 [10, 11] The model.** Under the hood is EmbeddingGemma 2, Google's open-weight embedding model, running on the phone through Transformers.js. Why an embedding model and not a chat model? Because it can't invent a species. It can only choose from characters we wrote. And when it isn't sure, a guardian asks for a closer look instead of guessing.

**2:02 [12, 13, 14] The numbers.** We tested it on 232 real photos covering all 78 characters. The right character comes first 89.2 percent of the time, up from 81.0 after adding one prefix to the descriptions. With the guardian in place, wrong names drop from 12.1 percent to 5.6, and when it does name something, it's right 93.4 percent of the time.

**2:30 [15, 16] The voices.** Each Elder is cast like a part in a play and performed with Eleven v4 audio tags. All 78 Elder lines cost 461 credits for the first cast, plus 240 to re-cast them with English voices, generated at build time, before release. The app never calls ElevenLabs. Kokoro, an open model, voices everyone else.

**2:48 [17, 19] Close.** It isn't perfect. Our test photos came from Wikimedia, not our own streets, so treat those numbers as a ceiling. But the street is right outside. Go outside. Granny Neem has opinions.

---

## If you're short on time

Cut slides 8, 9 and 18 first, then fold 13 and 14 into one sentence: "One prefix added eight points, and the guardian halved the wrong names."

## Numbers for questions

| Claim | Number | Source |
|---|---|---|
| Right character ranked first (raw) | 89.2% (top-5: 98.7%, category: 90.9%) | REPORT.md, headline numbers |
| Prefix experiment | 81.0% raw to 89.2% with `title: {species} \| text: …` | REPORT.md, prefix variants |
| Shipped matcher, cross-validated | 78.9% right name, 14.7% guardian, 5.6% wrong name, 0.9% nobody | REPORT.md |
| Wrong names with no fallback | 12.1% | REPORT.md |
| Precision when it names | 93.4% | REPORT.md |
| Indoor negatives given a name | 0 of 10 | REPORT.md |
| Guardian rescues / cost | 13 wrong names caught, 14 right guesses sent to the guardian | REPORT.md |
| Naive image anchors | top-1 fell to 74.1% (not shipped) | REPORT.md, what's next |
| Cast | 78 characters + 13 guardians = 91 voices; 26 Elders | roster.json |
| Lines | 286: 78 ElevenLabs v4 (Elders), 208 Kokoro-82M | pipeline/build/audio-manifest.json |
| ElevenLabs spend | 461 credits for the first cast of 78 lines, plus 240 for the English recast (809 of a 10,000-credit month at the time of writing, including narration) | the audio runs |
| Model download | about 316 MB at q4, once | app/README.md |
| XP | +100 new, +250 Elder, +50% variety, +75 walk-on (5 min), 0 within 60 s | app/src/game/rules.ts |
