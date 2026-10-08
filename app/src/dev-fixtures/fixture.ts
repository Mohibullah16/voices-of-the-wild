// DEV ONLY. Never imported by a production build unless VITE_USE_FIXTURES=1.
// Synthesises a contract-shaped embedding bank for the roster fixture, plus a
// mock embedder that steers photos into the three real outcomes (species,
// guardian hint, nobody) so the whole flow can be exercised without the model.
import rosterJson from "./roster.runtime.json";
import indexJson from "./embeddings.index.json";
import type { EmbeddingBank, EmbeddingIndexRow, RuntimeRoster, Thresholds } from "../types";
import { l2normalize, match } from "../match";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianVector(seed: number, dim: number): Float32Array {
  const rnd = mulberry32(seed);
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i += 2) {
    const u = Math.max(rnd(), 1e-9), w = rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    v[i] = r * Math.cos(2 * Math.PI * w);
    if (i + 1 < dim) v[i + 1] = r * Math.sin(2 * Math.PI * w);
  }
  return l2normalize(v);
}

let cached: { roster: RuntimeRoster; bank: EmbeddingBank } | null = null;

export function loadFixture() {
  if (cached) return cached;
  const roster = rosterJson as unknown as RuntimeRoster;
  const index = indexJson as EmbeddingIndexRow[];
  const dim = roster.model.dim;
  const vectors = new Float32Array(index.length * dim);
  for (const r of index) vectors.set(gaussianVector(9001 + r.row * 7919, dim), r.row * dim);
  cached = { roster, bank: { dim, vectors, index } };
  return cached;
}

export type MockPlan = { kind: "auto" } | { kind: "species"; owner?: string } | { kind: "guardian"; category?: string } | { kind: "nobody" };
let plan: MockPlan = { kind: "auto" };
export const setMockPlan = (p: MockPlan) => { plan = p; };
export const getMockPlan = () => plan;

function hashPixels(img: ImageData): number {
  let h = 2166136261;
  const step = Math.max(4, Math.floor(img.data.length / 4096) * 4);
  for (let i = 0; i < img.data.length; i += step) h = Math.imul(h ^ img.data[i]!, 16777619);
  return h >>> 0;
}

/**
 * Fake "embedding" that lands in the requested outcome under the given thresholds (fixture or
 * real calibrated ones). It blends a target row with noise and searches the blend weight with the
 * real matcher, so the app downstream sees exactly what a real photo would produce.
 */
export function mockEmbed(img: ImageData, bank: EmbeddingBank, categories: RuntimeRoster["categories"], thresholds: Thresholds): Float32Array {
  const { dim, vectors, index } = bank;
  const seed = hashPixels(img);
  const rnd = mulberry32(seed);
  const noise = gaussianVector(seed ^ 0x5bd1e995, dim);
  const row = (i: number) => vectors.subarray(i * dim, (i + 1) * dim);
  const blend = (target: Float32Array, w: number) => {
    const v = new Float32Array(dim);
    for (let i = 0; i < dim; i++) v[i] = target[i]! * w + noise[i]! * (1 - w);
    return v;
  };

  let kind = plan.kind;
  if (kind === "auto") {
    const r = rnd();
    kind = r < 0.62 ? "species" : r < 0.87 ? "guardian" : "nobody";
  }
  if (kind === "nobody") return noise;

  if (kind === "guardian") {
    const cat = (plan.kind === "guardian" && plan.category) || categories[Math.floor(rnd() * categories.length)]!.id;
    const g = index.find((r) => r.category === cat && r.guardian) ?? index.find((r) => r.category === cat)!;
    for (let w = 1; w >= 0.2; w -= 0.02) {
      const v = blend(row(g.row), w);
      const out = match(v, bank, thresholds).outcome;
      if (out.kind === "guardian" && out.category === cat) return v;
    }
    return blend(row(g.row), 0.6);
  }

  const owners = index.filter((r) => !r.guardian);
  const wantedId = plan.kind === "species" ? plan.owner : undefined;
  const pick = (wantedId ? owners.find((r) => r.owner === wantedId) : undefined) ?? owners[Math.floor(rnd() * owners.length)]!;
  for (let w = 0.6; w <= 1.0001; w += 0.04) {
    const v = blend(row(pick.row), w);
    const out = match(v, bank, thresholds).outcome;
    if (out.kind === "species" && out.owner === pick.owner) return v;
  }
  return row(pick.row).slice();
}
