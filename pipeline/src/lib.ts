// Shared helpers for the build-time pipeline. No secrets in here.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PIPELINE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const WEEK1 = resolve(PIPELINE_DIR, "..");
export const ROSTER_PATH = join(WEEK1, "data", "roster", "roster.json");
export const PUBLIC_DIR = join(WEEK1, "app", "public");
export const DATA_OUT = join(PUBLIC_DIR, "data");
export const AUDIO_OUT = join(PUBLIC_DIR, "audio");
export const MODEL_CACHE = join(PIPELINE_DIR, ".model-cache");
export const CAL_DIR = join(PIPELINE_DIR, "calibration");
export const PHOTOS_DIR = join(CAL_DIR, "photos");
export const BUILD_DIR = join(PIPELINE_DIR, "build"); // intermediate manifests (tracked, small)

export const MODEL_ID = "onnx-community/embeddinggemma-2-ONNX";
export const MODEL_DTYPE = "q4";
export const DIM = 768;

export type LineKey = "first_meet" | "again" | "goodbye" | "hint";

export interface RosterOwner {
  id: string;
  name: string;
  species?: string;
  category?: string;
  tier?: "elder" | "common";
  rarity?: string;
  habitat?: string[];
  caution?: boolean;
  personality?: string;
  voice?: string;
  descriptions: string[];
  lines: Partial<Record<LineKey, string>>;
}
export interface RosterCategory {
  id: string;
  name: string;
  guardian: RosterOwner;
  characters: RosterOwner[];
}
export interface Roster {
  version: number;
  categories: RosterCategory[];
}

export function loadRoster(): Roster {
  return JSON.parse(readFileSync(ROSTER_PATH, "utf8"));
}

/** Every owner (guardian first, then characters) with its category and guardian flag. */
export function owners(roster: Roster): { owner: RosterOwner; category: string; guardian: boolean }[] {
  const out: { owner: RosterOwner; category: string; guardian: boolean }[] = [];
  for (const c of roster.categories) {
    out.push({ owner: c.guardian, category: c.id, guardian: true });
    for (const ch of c.characters) out.push({ owner: ch, category: c.id, guardian: false });
  }
  return out;
}

/** Remove [performance tags] and tidy whitespace/punctuation left behind. */
export function stripTags(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.;:]+/, "")
    .trim();
}

export function sha8(s: string): string {
  return createHash("sha1").update(s).digest("hex").slice(0, 8);
}

export function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

export function writeJson(p: string, data: unknown) {
  ensureDir(dirname(p));
  writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export function readJson<T>(p: string, fallback: T): T {
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : fallback;
}

export function l2(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  const out = new Float32Array(v.length);
  const inv = n > 0 ? 1 / Math.sqrt(n) : 0;
  for (let i = 0; i < v.length; i++) out[i] = v[i]! * inv;
  return out;
}

/** Description prefix variants tried during calibration. */
export const TEXT_PREFIXES: Record<string, (desc: string, title: string) => string> = {
  raw: (d) => d,
  doc_none: (d) => `title: none | text: ${d}`,
  doc_title: (d, t) => `title: ${t} | text: ${d}`,
  search_query: (d) => `task: search result | query: ${d}`,
  classification: (d) => `task: classification | query: ${d}`,
};
/** The literal prefix string the app would prepend (for roster.runtime.json `model.prefix.text`). */
export const PREFIX_LITERAL: Record<string, string> = {
  raw: "",
  doc_none: "title: none | text: ",
  doc_title: "title: {title} | text: ",
  search_query: "task: search result | query: ",
  classification: "task: classification | query: ",
};
export const DEFAULT_PREFIX = "doc_none"; // model card: asymmetric retrieval, documents without a title

/** Pipeline state shared between steps (prefix choice + thresholds from calibration). */
export const CALIBRATION_JSON = join(BUILD_DIR, "calibration.json");
export const AUDIO_MANIFEST = join(BUILD_DIR, "audio-manifest.json");
