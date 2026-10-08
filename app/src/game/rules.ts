// XP and ranks. The numbers reward walking and variety, not rapid snapping.

export const XP = {
  newCharacter: 100,
  newElder: 250,
  guardianHint: 15,
  repeat: 10, // once per character per day
  categoryComplete: 500,
  quest: 50, // each finished find-and-listen quest
  stepXp: 0.15, // per step of a finished walk quest: 500 steps = 75
  varietyBonus: 0.5, // +50% when the category differs from the previous encounter
  spamWindowMs: 60_000, // captures within this window of the last one earn nothing (new characters excepted)
} as const;

export interface Rank {
  index: number;
  name: string;
  min: number;
}

export const RANKS: Rank[] = [
  { index: 0, name: "Wanderer", min: 0 },
  { index: 1, name: "Scout", min: 600 },
  { index: 2, name: "Trailblazer", min: 2000 },
  { index: 3, name: "Naturalist", min: 5000 },
  { index: 4, name: "Keeper of Voices", min: 10000 },
];

export function rankFor(xp: number): { rank: Rank; next?: Rank; progress: number } {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1]!.min) i++;
  const rank = RANKS[i]!;
  const next = RANKS[i + 1];
  const progress = next ? (xp - rank.min) / (next.min - rank.min) : 1;
  return { rank, next, progress: Math.max(0, Math.min(1, progress)) };
}
