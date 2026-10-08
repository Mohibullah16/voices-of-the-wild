// Real character lines from the app (week-1/app/public/audio), mixed into the showcase.
// `assets` copies them into public/lines/ and aligns their words for captions.

export const CHARACTER_LINES = [
  { key: "neem", owner: "neem-tree", line: "first_meet" },
  { key: "grass", owner: "lawn-grass", line: "again" },
  { key: "guardianHint", owner: "urban-guardian", line: "hint" },
] as const;

export type LineKey = (typeof CHARACTER_LINES)[number]["key"];
