// Twelve badges. Locked ones show as silhouettes with a one-line hint.
import type { GameState } from "./state";
import type { World } from "./world";

export type BadgeIcon = "sparkle" | "leaf" | "sunHorizon" | "moon" | "crown" | "mapPin" | "flame" | "buildings" | "binoculars" | "sealCheck" | "walk" | "star";

export interface Badge {
  id: string;
  name: string;
  hint: string;
  icon: BadgeIcon;
  earned(s: GameState, w: World): boolean;
}

const metChars = (s: GameState, w: World) => Object.keys(s.met).map((id) => w.owners.get(id)).filter((o) => o && !o.guardian);

export const BADGES: Badge[] = [
  { id: "first-voice", name: "First Voice", hint: "Get anything to talk to you.", icon: "sparkle", earned: (s, w) => metChars(s, w).length >= 1 },
  { id: "touched-grass", name: "Touched Grass", hint: "Find a lawn.", icon: "leaf", earned: (s) => Boolean(s.met["lawn-grass"]) },
  { id: "golden-hour", name: "Golden Hour", hint: "Catch a sunset.", icon: "sunHorizon", earned: (s) => Boolean(s.met["sunset"]) },
  { id: "night-shift", name: "Night Shift", hint: "Look up at the moon.", icon: "moon", earned: (s) => Boolean(s.met["crescent-moon"] || s.met["full-moon"]) },
  {
    id: "elder-pair", name: "Both Elders", hint: "Meet both Elders of one kind.", icon: "crown",
    earned: (s, w) => w.categories.some((c) => {
      const elders = (w.characters.get(c) ?? []).filter((id) => w.owners.get(id)?.elder);
      return elders.length >= 2 && elders.every((id) => s.met[id]);
    }),
  },
  { id: "five-habitats", name: "Five Places", hint: "Meet things in 5 places in one day.", icon: "mapPin", earned: (s) => Object.values(s.days).some((d) => new Set(d.habitats).size >= 5) },
  { id: "streak-7", name: "Seven Days", hint: "Finish the trail 7 days running.", icon: "flame", earned: (s) => s.streak.best >= 7 },
  { id: "street-smart", name: "Street Smart", hint: "Meet 3 street objects.", icon: "buildings", earned: (s, w) => metChars(s, w).filter((o) => o!.category === "urban").length >= 3 },
  { id: "kept-distance", name: "Kept Your Distance", hint: "Meet something that warns you off.", icon: "binoculars", earned: (s, w) => metChars(s, w).some((o) => o!.caution) },
  { id: "blessed", name: "Blessed", hint: "Complete a whole kind.", icon: "sealCheck", earned: (s) => Object.keys(s.blessed).length >= 1 },
  { id: "wanderer", name: "Wanderer", hint: "Finish a walk quest.", icon: "walk", earned: (s) => s.wanders >= 1 },
  { id: "elder-circle", name: "Elder Circle", hint: "Meet 10 Elders.", icon: "star", earned: (s, w) => metChars(s, w).filter((o) => o!.elder).length >= 10 },
];

/** Badges earned by `s` that it hasn't been awarded yet. */
export function newlyEarned(s: GameState, w: World): Badge[] {
  return BADGES.filter((b) => !s.badges[b.id] && b.earned(s, w));
}
