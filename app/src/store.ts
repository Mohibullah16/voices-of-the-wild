// Collection + settings in IndexedDB (idb-keyval). Pure helpers are exported
// separately so they can be unit-tested without a browser.
import { get, set, del } from "idb-keyval";

export interface Encounter {
  firstMet: string; // ISO date-time
  lastMet: string;
  timesMet: number;
}

export interface Collection {
  version: 1;
  entries: Record<string, Encounter>;
}

export interface Settings {
  setupDone: boolean;
  /** Where the model came from during setup. */
  modelSource?: "local" | "remote";
  /** Hash of the roster the field kit was downloaded for. */
  fieldKitVersion?: string;
  lastDevice?: "webgpu" | "wasm" | "mock";
  debug: boolean;
  /** Captions are always shown; this makes them larger. */
  largeCaptions: boolean;
  /** Keep your latest photo of each character on this phone and show it on the card. Never uploaded. */
  keepPhotos: boolean;
  theme: "system" | "light" | "dark";
}

const K_COLLECTION = "votw:collection";
const K_SETTINGS = "votw:settings";

export const emptyCollection = (): Collection => ({ version: 1, entries: {} });
export const defaultSettings = (): Settings => ({ setupDone: false, debug: false, largeCaptions: false, keepPhotos: true, theme: "system" });

/** Records an encounter. Returns the updated collection and whether this was the first meeting. */
export function recordEncounter(c: Collection, id: string, now = new Date()): { collection: Collection; first: boolean } {
  const iso = now.toISOString();
  const prev = c.entries[id];
  const entry: Encounter = prev
    ? { ...prev, lastMet: iso, timesMet: prev.timesMet + 1 }
    : { firstMet: iso, lastMet: iso, timesMet: 1 };
  return { collection: { ...c, entries: { ...c.entries, [id]: entry } }, first: !prev };
}

const isIso = (s: unknown): s is string => typeof s === "string" && !Number.isNaN(Date.parse(s));

/** Validates an imported file. Throws with a human message on garbage. */
export function parseCollection(raw: unknown, knownIds?: Set<string>): Collection {
  const obj = raw as { app?: unknown; collection?: unknown };
  const c = (obj && typeof obj === "object" && "collection" in obj ? obj.collection : raw) as Partial<Collection> | null;
  if (!c || typeof c !== "object" || typeof c.entries !== "object" || c.entries === null) {
    throw new Error("This file is not a Voices of the Wild field guide.");
  }
  const entries: Record<string, Encounter> = {};
  for (const [id, e] of Object.entries(c.entries as Record<string, Partial<Encounter>>)) {
    if (knownIds && !knownIds.has(id)) continue;
    if (!e || !isIso(e.firstMet) || !isIso(e.lastMet) || !Number.isFinite(e.timesMet) || (e.timesMet ?? 0) < 1) continue;
    entries[id] = { firstMet: e.firstMet, lastMet: e.lastMet, timesMet: Math.floor(e.timesMet!) };
  }
  return { version: 1, entries };
}

/** Union of two collections: earliest first meeting, latest last meeting, larger count. */
export function mergeCollections(a: Collection, b: Collection): Collection {
  const entries: Record<string, Encounter> = { ...a.entries };
  for (const [id, e] of Object.entries(b.entries)) {
    const x = entries[id];
    entries[id] = x
      ? {
          firstMet: Date.parse(e.firstMet) < Date.parse(x.firstMet) ? e.firstMet : x.firstMet,
          lastMet: Date.parse(e.lastMet) > Date.parse(x.lastMet) ? e.lastMet : x.lastMet,
          timesMet: Math.max(e.timesMet, x.timesMet),
        }
      : e;
  }
  return { version: 1, entries };
}

export function exportPayload(c: Collection, now = new Date()) {
  return { app: "voices-of-the-wild", exportedAt: now.toISOString(), collection: c };
}

// ---- persistence -----------------------------------------------------------

export async function loadCollection(): Promise<Collection> {
  try {
    return parseCollection((await get(K_COLLECTION)) ?? emptyCollection());
  } catch {
    return emptyCollection();
  }
}
export const saveCollection = (c: Collection) => set(K_COLLECTION, c);
export const clearCollection = () => del(K_COLLECTION);

export async function loadSettings(): Promise<Settings> {
  try {
    return { ...defaultSettings(), ...((await get(K_SETTINGS)) ?? {}) };
  } catch {
    return defaultSettings();
  }
}
export const saveSettings = (s: Settings) => set(K_SETTINGS, s);
