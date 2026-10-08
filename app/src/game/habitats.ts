// Habitat compass: group raw habitat tags into places a person can actually go.
import type { World } from "./world";

export type Place = "street" | "park" | "market" | "water" | "beach" | "sky" | "countryside" | "old-city" | "ground";

export const PLACE_LABEL: Record<Place, string> = {
  street: "Street",
  park: "Park",
  market: "Market",
  water: "Water",
  beach: "Beach",
  sky: "Sky",
  countryside: "Country",
  "old-city": "Old town",
  ground: "Ground",
};

const TAGS: Record<string, Place> = {
  street: "street", roadside: "street", median: "street", highway: "street", road: "street", wires: "street", building: "street",
  rooftop: "street", "water-tank": "street", eaves: "street", walls: "street", wall: "street", fence: "street", construction: "street",
  railway: "street", outskirts: "street", square: "street",
  park: "park", garden: "park", lawn: "park", hedge: "park", trees: "park", tree: "park", vine: "park", palms: "park", forest: "park",
  market: "market", cart: "market",
  pond: "water", fountain: "water", canal: "water", river: "water", riverbank: "water", wetland: "water", drain: "water", water: "water",
  harbor: "water", mangrove: "water", mudflat: "water",
  coast: "beach", beach: "beach", sea: "beach", "tide-pool": "beach",
  sky: "sky",
  village: "countryside", farm: "countryside", field: "countryside", desert: "countryside", scrub: "countryside", wasteland: "countryside",
  mountain: "countryside", hill: "countryside", landfill: "countryside",
  historic: "old-city", landmark: "old-city", "old-city": "old-city", ruins: "old-city",
  ground: "ground", stones: "ground", rocks: "ground",
};

export const placeOf = (tag: string): Place | undefined => TAGS[tag];

/** The first recognisable place of a character, used for "different places" quests. */
export function primaryPlace(habitat: string[]): Place | undefined {
  for (const h of habitat) {
    const p = TAGS[h];
    if (p) return p;
  }
  return undefined;
}

/** Places that still hide characters you haven't met, most first. */
export function compass(world: World, met: Record<string, unknown>): Array<{ place: Place; remaining: number }> {
  const counts = new Map<Place, number>();
  for (const o of world.owners.values()) {
    if (o.guardian || met[o.id]) continue;
    const places = new Set(o.habitat.map((h) => TAGS[h]).filter(Boolean) as Place[]);
    for (const p of places) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()].map(([place, remaining]) => ({ place, remaining })).sort((a, b) => b.remaining - a.remaining || a.place.localeCompare(b.place));
}
