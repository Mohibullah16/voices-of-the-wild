// Runtime matching, exactly per week-1/data/CONTRACT.md section 3.
// Pure functions: no DOM, no I/O. Shared in spirit with the build scripts.
import type { EmbeddingBank, Thresholds } from "./types";

export interface OwnerScore {
  owner: string;
  category: string;
  guardian: boolean;
  score: number;
  /** Row that produced the max. */
  row: number;
}

export interface MatchTrace {
  bestCategory: string | null;
  categoryScore: number;
  categoryThreshold: number;
  globalMin: number;
  species1: OwnerScore | null;
  species2: OwnerScore | null;
  speciesThreshold: number;
  margin: number;
}

export type MatchOutcome =
  | { kind: "species"; owner: string; category: string; score: number }
  | { kind: "guardian"; category: string; reason: "below-species-threshold" | "low-margin" | "no-characters" }
  | { kind: "nobody"; reason: "below-category-threshold" | "below-global-min" | "empty-bank" };

export interface MatchResult {
  outcome: MatchOutcome;
  /** Top-k owners by score, for the debug panel. */
  top: OwnerScore[];
  trace: MatchTrace;
}

/** Returns a new L2-normalised copy. A zero vector stays zero. */
export function l2normalize(v: ArrayLike<number>): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  const out = new Float32Array(v.length);
  if (n === 0) return out;
  const inv = 1 / Math.sqrt(n);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! * inv;
  return out;
}

/** Cosine similarity of two vectors of equal length (not assumed normalised). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`cosine: length mismatch ${a.length} vs ${b.length}`);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

/**
 * Brings a photo embedding to the bank's dimension. EmbeddingGemma 2 is
 * Matryoshka-trained, so a 768-d vector may be truncated to 512/256/128 and
 * re-normalised. Anything else is a contract violation.
 */
export function prepareQuery(photo: ArrayLike<number>, dim: number): Float32Array {
  if (photo.length === dim) return l2normalize(photo);
  if (photo.length > dim) return l2normalize(Array.prototype.slice.call(photo, 0, dim) as number[]);
  throw new Error(`Photo embedding has ${photo.length} dims but the bank has ${dim}.`);
}

/** Step 2: score(owner) = max cosine over that owner's rows. Bank rows are already normalised. */
export function scoreOwners(query: Float32Array, bank: EmbeddingBank): Map<string, OwnerScore> {
  const { dim, vectors, index } = bank;
  if (vectors.length < index.length * dim) {
    throw new Error(`Embedding bank too short: ${vectors.length} floats for ${index.length} rows × ${dim}.`);
  }
  const scores = new Map<string, OwnerScore>();
  for (const entry of index) {
    const base = entry.row * dim;
    let dot = 0;
    for (let i = 0; i < dim; i++) dot += query[i]! * vectors[base + i]!;
    const prev = scores.get(entry.owner);
    if (!prev || dot > prev.score) {
      scores.set(entry.owner, { owner: entry.owner, category: entry.category, guardian: entry.guardian, score: dot, row: entry.row });
    }
  }
  return scores;
}

const byScore = (a: OwnerScore, b: OwnerScore) => b.score - a.score || a.owner.localeCompare(b.owner);

/**
 * Hierarchical match (CONTRACT.md section 3):
 * 1. embed photo, L2-normalise  2. owner score = max over rows
 * 3. category score = max over owners in it (incl. guardian); best must clear thresholds.category[c1]
 * 4. inside c1 (non-guardian): s1 >= thresholds.species[c1] and s1 - s2 >= margin -> s1, else guardian hint
 * 5. top-5 for debugging
 *
 * `global_min` acts as an absolute floor and as the fallback when a category has
 * no entry in `thresholds.category` / `thresholds.species`.
 */
export function match(photo: ArrayLike<number>, bank: EmbeddingBank, thresholds: Thresholds, k = 5): MatchResult {
  const trace: MatchTrace = {
    bestCategory: null,
    categoryScore: -Infinity,
    categoryThreshold: NaN,
    globalMin: thresholds.global_min,
    species1: null,
    species2: null,
    speciesThreshold: NaN,
    margin: thresholds.margin,
  };
  if (bank.index.length === 0) return { outcome: { kind: "nobody", reason: "empty-bank" }, top: [], trace };

  const query = prepareQuery(photo, bank.dim);
  const owners = [...scoreOwners(query, bank).values()].sort(byScore);
  const top = owners.slice(0, k);

  // Step 3: categories.
  const catScore = new Map<string, number>();
  for (const o of owners) if (!catScore.has(o.category)) catScore.set(o.category, o.score); // owners sorted desc
  let c1 = "";
  let c1Score = -Infinity;
  for (const [c, s] of catScore) if (s > c1Score || (s === c1Score && c < c1)) { c1 = c; c1Score = s; }
  const catT = thresholds.category[c1] ?? thresholds.global_min;
  trace.bestCategory = c1;
  trace.categoryScore = c1Score;
  trace.categoryThreshold = catT;

  if (c1Score < thresholds.global_min) return { outcome: { kind: "nobody", reason: "below-global-min" }, top, trace };
  if (c1Score < catT) return { outcome: { kind: "nobody", reason: "below-category-threshold" }, top, trace };

  // Step 4: species inside c1.
  const inCat = owners.filter((o) => o.category === c1 && !o.guardian);
  const s1 = inCat[0] ?? null;
  const s2 = inCat[1] ?? null;
  const spT = thresholds.species[c1] ?? thresholds.global_min;
  trace.species1 = s1;
  trace.species2 = s2;
  trace.speciesThreshold = spT;

  if (!s1) return { outcome: { kind: "guardian", category: c1, reason: "no-characters" }, top, trace };
  if (s1.score < spT) return { outcome: { kind: "guardian", category: c1, reason: "below-species-threshold" }, top, trace };
  const gap = s2 ? s1.score - s2.score : Infinity;
  if (gap < thresholds.margin) return { outcome: { kind: "guardian", category: c1, reason: "low-margin" }, top, trace };
  return { outcome: { kind: "species", owner: s1.owner, category: c1, score: s1.score }, top, trace };
}

/** Sanity checks for a freshly loaded bank. Returns a list of problems (empty = fine). */
export function validateBank(bank: EmbeddingBank): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(bank.dim) || bank.dim <= 0) problems.push(`dim must be a positive integer, got ${bank.dim}`);
  if (bank.vectors.length !== bank.index.length * bank.dim) {
    problems.push(`embeddings.bin has ${bank.vectors.length} floats, expected ${bank.index.length} rows × ${bank.dim}`);
  }
  bank.index.forEach((r, i) => {
    if (r.row !== i) problems.push(`index[${i}].row is ${r.row}; rows must be 0..n-1 in order`);
  });
  // Spot-check normalisation on a few rows.
  for (const i of [0, Math.floor(bank.index.length / 2), bank.index.length - 1]) {
    if (i < 0 || i >= bank.index.length) continue;
    let n = 0;
    for (let d = 0; d < bank.dim; d++) n += bank.vectors[i * bank.dim + d]! ** 2;
    if (Math.abs(Math.sqrt(n) - 1) > 1e-3) problems.push(`row ${i} is not L2-normalised (norm ${Math.sqrt(n).toFixed(4)})`);
  }
  return problems;
}
