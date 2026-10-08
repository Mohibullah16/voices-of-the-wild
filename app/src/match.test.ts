import { describe, expect, it } from "vitest";
import { cosine, l2normalize, match, prepareQuery, scoreOwners, validateBank } from "./match";
import type { EmbeddingBank, EmbeddingIndexRow, Thresholds } from "./types";

// Tiny 5-d world. Axes: 0 = tree-ish, 1 = bird-ish, 2 = water-ish, 3 = detail, 4 = nothing anyone cares about.
function bank(rows: Array<[owner: string, category: string, guardian: boolean, vec: number[]]>): EmbeddingBank {
  const dim = rows[0]![3].length;
  const vectors = new Float32Array(rows.length * dim);
  const index: EmbeddingIndexRow[] = [];
  rows.forEach(([owner, category, guardian, v], row) => {
    vectors.set(l2normalize(v), row * dim);
    index.push({ row, owner, category, guardian });
  });
  return { dim, vectors, index };
}

const world = bank([
  ["trees-guardian", "trees", true, [1, 0, 0, 0.2, 0]],
  ["neem-tree", "trees", false, [1, 0, 0, 0.6, 0]],
  ["neem-tree", "trees", false, [0.9, 0.1, 0, 0.9, 0]],
  ["peepal-tree", "trees", false, [1, 0, 0, -0.6, 0]],
  ["birds-guardian", "birds", true, [0, 1, 0, 0, 0]],
  ["house-crow", "birds", false, [0, 1, 0, 0.5, 0]],
  ["water-guardian", "water", true, [0, 0, 1, 0, 0]],
]);

const T: Thresholds = {
  category: { trees: 0.5, birds: 0.5, water: 0.5 },
  species: { trees: 0.8, birds: 0.8, water: 0.8 },
  margin: 0.05,
  global_min: 0.2,
};

describe("vector helpers", () => {
  it("normalises to unit length and keeps zero vectors at zero", () => {
    const v = l2normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect([...l2normalize([0, 0])]).toEqual([0, 0]);
  });
  it("computes cosine regardless of magnitude", () => {
    expect(cosine([1, 0], [5, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 2])).toBeCloseTo(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
    expect(() => cosine([1], [1, 2])).toThrow();
  });
  it("truncates Matryoshka embeddings and re-normalises", () => {
    const q = prepareQuery([3, 4, 100, 100], 2);
    expect(q.length).toBe(2);
    expect(q[0]).toBeCloseTo(0.6);
    expect(() => prepareQuery([1, 2], 4)).toThrow(/dims/);
  });
});

describe("scoreOwners", () => {
  it("takes the max over an owner's rows", () => {
    const q = l2normalize([0.9, 0.1, 0, 0.9, 0]);
    const s = scoreOwners(q, world);
    expect(s.get("neem-tree")!.score).toBeCloseTo(1, 5);
    expect(s.get("neem-tree")!.row).toBe(2);
    expect(s.size).toBe(6);
  });
  it("rejects a bank shorter than its index", () => {
    expect(() => scoreOwners(new Float32Array(5), { ...world, vectors: new Float32Array(3) })).toThrow(/too short/);
  });
});

describe("match", () => {
  it("returns the species when it clears threshold and margin", () => {
    const r = match([1, 0, 0, 0.7, 0], world, T);
    expect(r.outcome).toEqual({ kind: "species", owner: "neem-tree", category: "trees", score: expect.any(Number) });
    expect(r.top[0]!.owner).toBe("neem-tree");
    expect(r.top.length).toBeLessThanOrEqual(5);
  });

  it("falls back to the guardian when two species are too close", () => {
    // Equidistant between neem (+0.6) and peepal (-0.6) on the noise axis.
    const r = match([1, 0, 0, 0, 0], world, T);
    expect(r.outcome).toEqual({ kind: "guardian", category: "trees", reason: "low-margin" });
    expect(r.trace.species1!.score - r.trace.species2!.score).toBeLessThan(T.margin);
  });

  it("falls back to the guardian when the best species is below its threshold", () => {
    const strict = { ...T, species: { ...T.species, trees: 1.01 } };
    const r = match([1, 0, 0, 0.7, 0], world, strict);
    expect(r.outcome).toMatchObject({ kind: "guardian", category: "trees", reason: "below-species-threshold" });
  });

  it("counts the guardian's rows toward the category score", () => {
    // Water has only a guardian: category clears, no characters to name.
    const r = match([0, 0, 1, 0, 0], world, T);
    expect(r.outcome).toEqual({ kind: "guardian", category: "water", reason: "no-characters" });
  });

  it("says nobody wants to talk when the best category is below its threshold", () => {
    const r = match([0, 0, 0, 0, 1], world, { ...T, global_min: 0 });
    expect(r.outcome).toEqual({ kind: "nobody", reason: "below-category-threshold" });
    expect(r.top.length).toBe(5);
  });

  it("applies global_min as an absolute floor", () => {
    const r = match([-1, -1, -1, 0, 0], world, T);
    expect(r.outcome).toMatchObject({ kind: "nobody", reason: "below-global-min" });
  });

  it("uses per-category thresholds", () => {
    const loose = { ...T, category: { ...T.category, birds: 0.1 }, species: { ...T.species, birds: 0.1 } };
    const tight = { ...T, category: { ...T.category, birds: 0.99 } };
    const q = [0.1, 0.6, 0, 0.3, 0];
    expect(match(q, world, loose).outcome).toMatchObject({ kind: "species", owner: "house-crow" });
    expect(match(q, world, tight).outcome).toMatchObject({ kind: "nobody" });
  });

  it("treats a lone character in a category as having an unbeatable margin", () => {
    const r = match([0, 1, 0, 0.5, 0], world, T);
    expect(r.outcome).toMatchObject({ kind: "species", owner: "house-crow" });
    expect(r.trace.species2).toBeNull();
  });

  it("is invariant to the photo vector's magnitude", () => {
    const a = match([1, 0, 0, 0.7, 0], world, T);
    const b = match([10, 0, 0, 7, 0], world, T);
    expect(b.outcome).toEqual(a.outcome);
  });

  it("handles an empty bank", () => {
    const r = match([1], { dim: 1, vectors: new Float32Array(0), index: [] }, T);
    expect(r.outcome).toEqual({ kind: "nobody", reason: "empty-bank" });
  });
});

describe("validateBank", () => {
  it("accepts a well-formed bank", () => {
    expect(validateBank(world)).toEqual([]);
  });
  it("reports length, ordering and normalisation problems", () => {
    const bad: EmbeddingBank = {
      dim: 2,
      vectors: new Float32Array([1, 1, 0]),
      index: [
        { row: 1, owner: "a", category: "x", guardian: false },
        { row: 0, owner: "b", category: "x", guardian: false },
      ],
    };
    const p = validateBank(bad).join("\n");
    expect(p).toMatch(/expected 2 rows/);
    expect(p).toMatch(/must be 0..n-1/);
    expect(p).toMatch(/not L2-normalised/);
  });
});
