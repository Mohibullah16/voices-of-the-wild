// Loads the field data (roster + embedding bank). Real pipeline output first;
// the dev fixture only when allowed (vite dev, or VITE_USE_FIXTURES=1) and the
// real files are missing.
import { asset } from "./config";
import { validateBank } from "./match";
import type { EmbeddingBank, EmbeddingIndexRow, Owner, RuntimeCategory, RuntimeRoster } from "./types";

export interface FieldData {
  source: "real" | "fixture";
  roster: RuntimeRoster;
  bank: EmbeddingBank;
  categories: RuntimeCategory[];
  owners: Map<string, Owner>;
  /** Owners in field-guide order (category order, guardian first). */
  ordered: Owner[];
  problems: string[];
}

export class FieldDataMissing extends Error {}

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(asset(path));
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/html")) return null; // SPA fallback, not our file
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function loadReal(): Promise<{ roster: RuntimeRoster; bank: EmbeddingBank } | null> {
  const roster = await fetchJson<RuntimeRoster>("data/roster.runtime.json");
  if (!roster) return null;
  const index = await fetchJson<EmbeddingIndexRow[]>("data/embeddings.index.json");
  if (!index) throw new FieldDataMissing("data/embeddings.index.json is missing.");
  const res = await fetch(asset("data/embeddings.bin"));
  if (!res.ok) throw new FieldDataMissing("data/embeddings.bin is missing.");
  const vectors = new Float32Array(await res.arrayBuffer());
  return { roster, bank: { dim: roster.model.dim, vectors, index } };
}

export function flattenOwners(categories: RuntimeCategory[]): Owner[] {
  const out: Owner[] = [];
  let n = 1;
  for (const cat of categories) {
    const g = cat.guardian;
    // Elder is a character tier (2 per category). Guardians are Elders only if the roster says so.
    const gElder = g.tier === "elder";
    out.push({
      id: g.id,
      name: g.name,
      species: `Guardian of ${cat.name}`,
      category: cat.id,
      guardian: true,
      elder: gElder,
      caution: false,
      habitat: [],
      rarity: "guardian",
      personality: g.personality,
      lines: g.lines,
      number: n++,
    });
    for (const c of cat.characters) {
      out.push({
        id: c.id,
        name: c.name,
        species: c.species,
        category: cat.id,
        guardian: false,
        elder: c.tier === "elder",
        caution: Boolean(c.caution),
        habitat: c.habitat ?? [],
        rarity: c.rarity ?? "common",
        personality: c.personality,
        lines: c.lines,
        number: n++,
      });
    }
  }
  return out;
}

export function validateRoster(roster: RuntimeRoster, bank: EmbeddingBank): string[] {
  const problems = [...validateBank(bank)];
  const ids = new Set<string>();
  for (const cat of roster.categories) {
    for (const o of [cat.guardian, ...cat.characters]) {
      if (ids.has(o.id)) problems.push(`duplicate id ${o.id}`);
      ids.add(o.id);
    }
    if (!cat.guardian.lines.hint) problems.push(`${cat.guardian.id} has no hint line`);
  }
  for (const r of bank.index) if (!ids.has(r.owner)) problems.push(`embedding row ${r.row} belongs to unknown owner ${r.owner}`);
  return problems;
}

export async function loadFieldData(): Promise<FieldData> {
  let source: FieldData["source"] = "real";
  const forceFixture = __FIXTURES_ALLOWED__ && new URLSearchParams(location.search).has("fixture");
  let loaded = forceFixture ? null : await loadReal();
  if (__FIXTURES_ALLOWED__ && !loaded) {
    const fx = await import("./dev-fixtures/fixture");
    loaded = fx.loadFixture();
    source = "fixture";
  }
  if (!loaded) throw new FieldDataMissing("The field data has not been generated yet (public/data/roster.runtime.json).");
  const { roster, bank } = loaded;
  const ordered = flattenOwners(roster.categories);
  const problems = validateRoster(roster, bank);
  if (problems.length) console.warn("[field data]", problems);
  return { source, roster, bank, categories: roster.categories, owners: new Map(ordered.map((o) => [o.id, o])), ordered, problems };
}

/** Every audio file referenced by the roster (relative paths). */
export function audioPaths(roster: RuntimeRoster): string[] {
  const set = new Set<string>();
  for (const cat of roster.categories) {
    for (const o of [cat.guardian, ...cat.characters]) for (const l of Object.values(o.lines)) if (l?.src) set.add(l.src);
  }
  return [...set];
}
