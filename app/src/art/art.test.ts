import { describe, expect, it } from "vitest";
import roster from "../dev-fixtures/roster.runtime.json";
import { motifFor } from "./motif";
import { CATEGORY_IDS, emblemPaths, PHOTO_HINT, SHORT_NAME } from "./emblems";
import { sigilSvg } from "./sigil";

const owners = roster.categories.flatMap((c) => [{ id: c.guardian.id, cat: c.id }, ...c.characters.map((x) => ({ id: x.id, cat: c.id }))]);

describe("card motifs", () => {
  it("are deterministic", () => {
    expect(motifFor("neem-tree", "trees")).toEqual(motifFor("neem-tree", "trees"));
  });
  it("are unique across all 91 roster cards", () => {
    const seen = new Set(owners.map((o) => motifFor(o.id, o.cat).markup));
    expect(owners.length).toBe(91);
    expect(seen.size).toBe(owners.length);
  });
  it("contain no NaN coordinates", () => {
    for (const o of owners) {
      const m = motifFor(o.id, o.cat);
      expect(m.markup + m.wash).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe("category art", () => {
  it("covers every roster category", () => {
    for (const c of roster.categories) {
      expect(CATEGORY_IDS).toContain(c.id);
      expect(emblemPaths(c.id)).not.toMatch(/r="14"/); // not the fallback
      expect(SHORT_NAME[c.id]).toBeTruthy();
      expect(PHOTO_HINT[c.id]).toBeTruthy();
    }
  });
  it("gives each guardian a distinct sigil", () => {
    const s = new Set(roster.categories.map((c) => sigilSvg(c.id)));
    expect(s.size).toBe(roster.categories.length);
  });
});
