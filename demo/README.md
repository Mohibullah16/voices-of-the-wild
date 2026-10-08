# Demo walkthrough

A screen recording of the real app, cut into a 16:9 and a 9:16 video, a GIF, and per-scene clips.
Nothing is scripted: the production build runs in headed Chromium with the real EmbeddingGemma 2
on WebGPU, the real field-kit download, airplane mode, and the app's own voice files.

| Output | What |
|---|---|
| `out/walkthrough-16x9.mp4` | 1920×1080, phone centred, labels left, large captions right |
| `out/walkthrough-9x16.mp4` | 1080×1920, labels on top (the app's own captions are large enough here) |
| `out/walkthrough.srt` | Every voice line, timed to the cut |
| `out/demo.gif` | The money moment: photo → stirring → Elder card → caption (the wait is shortened) |
| `clips/*.mp4` | Raw scenes at real speed, phone only, with their voices |
| `../showcase/footage/0*.mp4` | Trimmed phone-only clips for the motion-graphics video |

## Re-record

```bash
# 1. a fresh production build, served on a free port
cd week-1/app && npm run build && npx vite preview --port 4180 --strictPort

# 2. in week-1/demo (once: npm install)
BASE=http://localhost:4180 npx tsx probe.ts            # optional: which photos the in-browser model names (≈25 min for all 232)
BASE=http://localhost:4180 npx tsx record.ts           # one continuous take, ≈6 min incl. the ~320 MB download
npx tsx edit.ts                                         # cut, overlays, audio mux, GIF, clips (≈5 min)
```

- Keep the Chromium window visible while recording (an occluded window may stop painting).
- `record.ts` uses a **fresh browser profile every take**, so onboarding and the download are real.
- Photos come from `plan.json` (calibration photos from `pipeline/calibration/photos`). Pick ones whose
  outcome `probe.ts` confirmed in the browser (`work/probe-all.json`). The take prints what each photo
  really matched; if one does not match on camera, change the photo, never the result.

## How it works

- **Frames:** CDP `Page.startScreencast` at device-pixel size (780×1688) with a timestamp per frame.
- **Audio:** an init script hooks `HTMLMediaElement.play` and logs `playing`/`pause`/`ended` with
  `Date.now()`. `edit.ts` places the same MP3 from `app/public/audio` at that moment in the cut
  (Playwright's own video has no sound). Voices are only placed in real-speed parts.
- **Camera:** the viewfinder shot uses Chromium's fake camera (`--use-file-for-fake-video-capture`)
  playing a calibration photo with a slight drift; the app grabs a frame exactly as from a phone camera.
  The other photos go through the Listen button's file input (Playwright's file chooser).
- **Share:** `navigator.canShare` is removed so the app takes its own download path instead of opening
  the Windows share sheet; the downloaded PNG is the card shown beside the phone.
- **The cut** (`mainCut()` in `edit.ts`) only picks spans of the session and their speed. Anything
  faster than real time carries an on-screen "N× speed" chip. The download is sped up; later
  "stirring" waits are shortened (their real time is printed in the label).
- **Labels** use measured numbers from `work/session.json` (`measured`): match times, download time,
  first-test-photo time, and the number of network requests after airplane mode.
