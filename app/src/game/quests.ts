// Daily Trail: a chain of 5-7 quests per day, seeded from the date, so everyone gets the same trail.
// Quests alternate: find something and listen to it, then walk a number of steps, then find the next thing.
// Only the first unfinished quest is active; the rest unlock one by one.
import { hashString, rng } from "../art/prng";
import { SHORT_NAME } from "../art/emblems";
import type { DayRecord } from "./state";
import { addDays } from "./time";
import type { World } from "./world";

export type QuestKind = "category" | "touch-grass" | "new" | "walk";

export interface Quest {
  id: string;
  kind: QuestKind;
  /** 1-4 words. */
  label: string;
  /** Optional tiny qualifier. */
  note?: string;
  /** Category for category quests (for the emblem), or the icon key. */
  category?: string;
  /** Captures needed, or steps for a walk. */
  need: number;
}

export interface QuestProgress {
  have: number;
  need: number;
  done: boolean;
}

/** Category quests read as actions, 2-4 words. */
export const CATEGORY_QUEST: Record<string, string> = {
  trees: "Meet a tree",
  birds: "Meet a bird",
  animals: "Meet an animal",
  "small-creatures": "Meet a tiny creature",
  flowers: "Meet a flower",
  plants: "Meet a plant",
  "fruits-vegetables": "Meet fruit or veg",
  ground: "Look down: ground",
  sky: "Look up: the sky",
  water: "Find some water",
  vehicles: "Meet a vehicle",
  structures: "Meet a landmark",
  urban: "Meet a street object",
};

/** Kinds you can find on almost any walk, so a chain never blocks on a rare one. */
const COMMON = ["trees", "plants", "flowers", "sky", "ground", "urban", "vehicles", "birds", "structures"];

export const GRASS_ID = "lawn-grass";
export const WALK_STEPS = [500, 1000, 1500] as const;

const walkQuest = (i: number, steps: number): Quest => ({ id: `${i}:walk:${steps}`, kind: "walk", label: `Walk ${steps.toLocaleString("en")} steps`, need: steps });

/** The day's chain, in order. Pure: same date + same world = same quests.
 * `ahead` > 0 is a fast-forwarded trail: the trail of a later day, played today. */
export function questsFor(day: string, world: World, ahead = 0): Quest[] {
  const r = rng(hashString(`trail/${ahead > 0 ? addDays(day, ahead) : day}`));
  const length = 5 + Math.floor(r() * 3); // 5, 6 or 7
  const pool = COMMON.filter((c) => world.categories.includes(c));
  const kinds = pool.length >= 3 ? pool : [...world.categories];
  const quests: Quest[] = [];
  let walks = 0;
  for (let i = 0; quests.length < length; i++) {
    if (i % 2 === 1) {
      quests.push(walkQuest(i, WALK_STEPS[Math.min(walks++, WALK_STEPS.length - 1)]!));
      continue;
    }
    const special = r();
    if (i === 2 && special < 0.3 && world.owners.has(GRASS_ID)) quests.push({ id: `${i}:touch-grass`, kind: "touch-grass", label: "Touch grass", category: "plants", need: 1 });
    else if (i === 4 && special < 0.4) quests.push({ id: `${i}:new`, kind: "new", label: "Meet someone new", need: 1 });
    else {
      const cat = kinds.splice(Math.floor(r() * kinds.length), 1)[0]!;
      quests.push({ id: `${i}:category:${cat}`, kind: "category", label: CATEGORY_QUEST[cat] ?? `Meet: ${SHORT_NAME[cat] ?? cat}`, category: cat, need: 1 });
    }
  }
  return quests;
}

/** The trail being played on `day`, following any fast-forwards. */
export const trailFor = (day: string, record: DayRecord | undefined, world: World): Quest[] => questsFor(day, world, record?.ahead ?? 0);

/** Only find-and-listen quests can be skipped (for a photo that won't match); walks are the point. */
export const canSkip = (q: Quest | undefined): q is Quest => Boolean(q && q.kind !== "walk");

/** The first unfinished quest, or undefined when the trail is done. */
export function activeQuest(quests: Quest[], day: DayRecord | undefined): Quest | undefined {
  return quests.find((q) => !day?.questsDone.includes(q.id));
}

/** Progress of a quest. Only meetings and steps since the previous quest finished count. */
export function questProgress(q: Quest, day: DayRecord | undefined, _world?: World): QuestProgress {
  if (day?.questsDone.includes(q.id)) return { have: q.need, need: q.need, done: true };
  const ev = (day?.events ?? []).slice(day?.legStart ?? 0).filter((e) => e.kind === "species");
  let have = 0;
  switch (q.kind) {
    case "category":
      have = ev.some((e) => e.category === q.category) ? 1 : 0;
      break;
    case "touch-grass":
      have = ev.some((e) => e.id === GRASS_ID) ? 1 : 0;
      break;
    case "new":
      have = ev.filter((e) => e.first).length;
      break;
    case "walk":
      have = day?.steps ?? 0;
      break;
  }
  return { have: Math.min(have, q.need), need: q.need, done: have >= q.need };
}
