// The static facts the game rules need, derived once from the roster.
import type { Owner } from "../types";

export interface WorldOwner {
  id: string;
  category: string;
  guardian: boolean;
  elder: boolean;
  caution: boolean;
  habitat: string[];
}

export interface World {
  owners: Map<string, WorldOwner>;
  /** Non-guardian character ids per category. */
  characters: Map<string, string[]>;
  categories: string[];
  /** Characters only (guardians excluded). */
  totalCharacters: number;
}

export function buildWorld(owners: Iterable<Pick<Owner, keyof WorldOwner>>): World {
  const map = new Map<string, WorldOwner>();
  const characters = new Map<string, string[]>();
  const categories: string[] = [];
  for (const o of owners) {
    map.set(o.id, { id: o.id, category: o.category, guardian: o.guardian, elder: o.elder, caution: o.caution, habitat: o.habitat });
    if (!characters.has(o.category)) {
      characters.set(o.category, []);
      categories.push(o.category);
    }
    if (!o.guardian) characters.get(o.category)!.push(o.id);
  }
  let total = 0;
  for (const ids of characters.values()) total += ids.length;
  return { owners: map, characters, categories, totalCharacters: total };
}
