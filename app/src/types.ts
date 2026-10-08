// Runtime data shapes. Mirrors week-1/data/CONTRACT.md section 2.

export type Engine = "elevenlabs" | "kokoro";

export interface RuntimeLine {
  /** Line with v4 performance tags, e.g. "[cackles] Granny Neem, friend!" */
  text: string;
  /** Tags stripped: what we show as the caption. */
  caption: string;
  /** Relative to the app base, e.g. "audio/neem-tree/first_meet.1a2b3c4d.mp3" */
  src: string;
  engine: Engine;
  /** Seconds. */
  duration: number;
}

export type LineKey = "first_meet" | "again" | "goodbye" | "hint";

export interface RuntimeGuardian {
  id: string;
  name: string;
  personality?: string;
  voice?: string;
  tier?: "elder" | "common";
  lines: { first_meet: RuntimeLine; again: RuntimeLine; goodbye: RuntimeLine; hint: RuntimeLine };
}

export interface RuntimeCharacter {
  id: string;
  name: string;
  species: string;
  category: string;
  tier: "elder" | "common";
  rarity?: "common" | "uncommon" | "rare" | string;
  habitat: string[];
  caution: boolean;
  personality?: string;
  voice?: string;
  lines: { first_meet: RuntimeLine; again: RuntimeLine; goodbye: RuntimeLine };
}

export interface RuntimeCategory {
  id: string;
  name: string;
  guardian: RuntimeGuardian;
  characters: RuntimeCharacter[];
}

export interface Thresholds {
  category: Record<string, number>;
  species: Record<string, number>;
  margin: number;
  global_min: number;
}

export interface ModelInfo {
  id: string;
  dtype: string;
  dim: number;
  prefix: { image: string; text: string };
  revision?: string;
}

export interface RuntimeRoster {
  version: number;
  /** Present only on the dev fixture. */
  fixture?: boolean;
  model: ModelInfo;
  thresholds: Thresholds;
  /** Attribution strings written by the pipeline. */
  credits?: Record<string, unknown>;
  categories: RuntimeCategory[];
}

export interface EmbeddingIndexRow {
  row: number;
  owner: string;
  category: string;
  guardian: boolean;
}

/** Everything the matcher needs. */
export interface EmbeddingBank {
  dim: number;
  /** Row-major, L2-normalised, `index.length * dim` floats. */
  vectors: Float32Array;
  index: EmbeddingIndexRow[];
}

/** A character or a guardian, flattened for UI use. */
export interface Owner {
  id: string;
  name: string;
  /** Common name; guardians use their category name. */
  species: string;
  category: string;
  guardian: boolean;
  elder: boolean;
  caution: boolean;
  habitat: string[];
  rarity: string;
  personality?: string;
  lines: Partial<Record<LineKey, RuntimeLine>>;
  /** 1-based catalogue number across the whole field guide. */
  number: number;
}
