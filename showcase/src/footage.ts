// Real screen-recording slots. Drop a phone recording into showcase/footage/ with the file name below,
// run `npm run assets`, then re-render. Empty slots fall back to the current app screenshots.
// Recordings should be portrait (e.g. 1080×2340 or 720×1560) and at least `seconds` long; they play
// muted (the real voice lines are mixed separately) starting `startAt` seconds into the file.
export const FOOTAGE_SLOTS = {
  /** Hook: the camera on a neem tree, then Granny Neem's card and caption. */
  hook: { file: "hook.mp4", seconds: 9, startAt: 0 },
  /** The idea: Listen screen → capture → "something is stirring". */
  capture: { file: "capture.mp4", seconds: 10, startAt: 0 },
  /** The game: the quest chain. Meet something, XP pop-up, walk the steps, the next quest unlocks. */
  trail: { file: "trail.mp4", seconds: 18, startAt: 0 },
  /** Guardian fallback: a guardian asking for a closer look. */
  guardian: { file: "guardian.mp4", seconds: 8, startAt: 0 },
  /** Offline proof: airplane mode on, an encounter still works. */
  offline: { file: "offline.mp4", seconds: 11, startAt: 0 },
} as const;

export type FootageSlot = keyof typeof FOOTAGE_SLOTS;
