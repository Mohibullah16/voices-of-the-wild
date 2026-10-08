# Showcase video

Motion-graphic showcase for Voices of the Wild, built with [Remotion](https://www.remotion.dev) (React → MP4). Everything in it is real: the character voices are the app's own MP3s, the match scores come from the app's `match()` run on a calibration photo against the shipped embedding bank, and the numbers come from `pipeline/calibration/REPORT.md` and `app/public/data/roster.runtime.json`.

| Output | Size | Length | For |
|---|---|---|---|
| `out/voices-of-the-wild-9x16.mp4` + `.srt` + `out/poster-9x16.png` | 1080×1920 | 68.0 s | LinkedIn, Reels, Shorts |
| `out/voices-of-the-wild-16x9.mp4` + `.srt` + `out/poster-16x9.png` | 1920×1080 | 99.4 s | DEV embed, YouTube |
| `out/voices-of-the-wild-1x1.mp4` + `.srt` + `out/poster-1x1.png` | 1080×1080 | 68.0 s | Feed square |

H.264 High (yuv420p, BT.709, 30 fps, faststart) + AAC 48 kHz 192k, loudness normalised (single-pass loudnorm aiming at −14 LUFS; measures about −15). Captions are burned in; the `.srt` files carry the same cues.

## Re-render

```bash
cd week-1/showcase
npm install                # once
npm run render             # assets → all three cuts → posters → .srt
npm run render:9x16        # or one cut: render:16x9, render:1x1
npm run studio             # preview and scrub in the browser
```

`npm run render` re-runs `npm run assets` first, so new app screenshots, new footage and roster changes are picked up automatically. Nothing calls ElevenLabs during a render.

## Swap in real screen recordings

The phone in each scene plays a real recording when one exists and falls back to the app screenshots otherwise. Slots are defined in [`src/footage.ts`](src/footage.ts):

| File to drop in `footage/` | Scene | Needs at least |
|---|---|---|
| `hook.mp4` | Hook: camera on the neem, then Granny Neem's card | 9 s |
| `capture.mp4` | The idea: Listen → capture → encounter | 10 s |
| `trail.mp4` | The game: home trail, quests, streak | 13 s |
| `guardian.mp4` | Guardian fallback (16:9 only) | 8 s |
| `offline.mp4` | Airplane mode on, an encounter still works | 11 s |

Steps:
1. Record the phone screen in portrait (e.g. Android screen recorder, 720×1560 or 1080×2340). Trim each clip so the action starts at 0 s, or set `startAt` in `src/footage.ts`.
2. Save it as `showcase/footage/<name>.mp4` using the names above.
3. `npm run render` (or `npm run render:9x16`).

Recordings play muted, because the real voice lines are already mixed in on the timeline. To change which seconds of a clip are used, edit `startAt` for that slot in `src/footage.ts` (that is the one-line change). Delete the file to go back to screenshots.

## How it fits together

| Path | What |
|---|---|
| `src/content/narration.ts` | Narration script (Brian, `eleven_v4`), 909 characters |
| `src/content/lines.ts` | Which real character lines are used: Granny Neem (Elder, ElevenLabs), Lawn Larry (Elder, ElevenLabs), Old Corner (guardian, Kokoro) |
| `src/timeline.ts` | Audio placement, scene timing and caption chunks for the `long` (16:9) and `short` (9:16, 1:1) cuts |
| `src/scenes.tsx`, `src/ui.tsx`, `src/theme.ts` | Scenes, phone frame, cards, captions; the app's tokens, fonts, logo, emblems, sigils and card motifs (imported from `app/src/art`) |
| `scripts/narration.ts` | Generates narration (hash-named, cached, `--dry-run`, 1,500-credit hard cap) and the ambient bed |
| `scripts/align-lines.ts` | Word timings for the character lines (ElevenLabs forced alignment, cached) |
| `scripts/assets.ts` | Copies fonts, screenshots, lines and footage into `public/`; runs the real match; writes `src/generated/assets.json` |
| `scripts/render.ts`, `scripts/srt.ts` | Final renders, loudness pass, posters, captions |
| `credits-log.json` | ElevenLabs usage before/after each generation run (numbers only) |

To change the narration: edit `src/content/narration.ts`, run `npm run narration:dry`, then `npm run narration`. Only changed lines are regenerated. The ElevenLabs key is read from `week-1/.env` (`elevenlabs-api-key`) and is never printed or written.

## Credits used

| Run | Credits |
|---|---|
| Narration, 7 lines / 914 characters, `eleven_v4` | 93 |
| Ambient bed, 7 s sound effect (looped to 100 s with crossfades) | included above |
| Forced alignment for 4 character-line runs (3 used) | 4 |
| Narration re-run after the English-neutral rewrite (1 line, 148 characters: "a rickshaw" became "a bus") | 9 |
| **Total** | **106** (account: 461 → 558 before the rewrite; 809 of 10,000 after the English recast and this re-run) |

## Credits

Voices by ElevenLabs (Eleven v4 narration and Elder lines, sound effects). Kokoro-82M (Apache 2.0) for guardian lines. EmbeddingGemma 2 by Google DeepMind (Apache 2.0). EB Garamond and Atkinson Hyperlegible Next (SIL OFL). Remotion is free for individuals and small teams; larger companies need a company licence.
