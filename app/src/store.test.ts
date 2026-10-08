import { describe, expect, it } from "vitest";
import { emptyCollection, exportPayload, mergeCollections, parseCollection, recordEncounter } from "./store";
import { stripTags, timeWords, wordAt } from "./captions";

describe("collection", () => {
  it("records first and repeat meetings", () => {
    const t1 = new Date("2026-10-09T08:00:00Z");
    const t2 = new Date("2026-10-10T09:30:00Z");
    const a = recordEncounter(emptyCollection(), "neem-tree", t1);
    expect(a.first).toBe(true);
    const b = recordEncounter(a.collection, "neem-tree", t2);
    expect(b.first).toBe(false);
    expect(b.collection.entries["neem-tree"]).toEqual({ firstMet: t1.toISOString(), lastMet: t2.toISOString(), timesMet: 2 });
  });

  it("round-trips through export/import and drops unknown or broken entries", () => {
    let c = recordEncounter(emptyCollection(), "neem-tree").collection;
    c = recordEncounter(c, "ghost").collection;
    const payload = JSON.parse(JSON.stringify(exportPayload(c)));
    payload.collection.entries.broken = { firstMet: "nope", lastMet: "nope", timesMet: 1 };
    const back = parseCollection(payload, new Set(["neem-tree", "broken"]));
    expect(Object.keys(back.entries)).toEqual(["neem-tree"]);
  });

  it("rejects files that are not field guides", () => {
    expect(() => parseCollection({ hello: 1 })).toThrow(/not a Voices of the Wild/);
    expect(() => parseCollection(null)).toThrow();
  });

  it("merges by earliest first meeting, latest last meeting and larger count", () => {
    const a = { version: 1 as const, entries: { x: { firstMet: "2026-10-02T00:00:00.000Z", lastMet: "2026-10-03T00:00:00.000Z", timesMet: 2 } } };
    const b = { version: 1 as const, entries: { x: { firstMet: "2026-10-01T00:00:00.000Z", lastMet: "2026-10-02T00:00:00.000Z", timesMet: 5 } } };
    expect(mergeCollections(a, b).entries.x).toEqual({ firstMet: "2026-10-01T00:00:00.000Z", lastMet: "2026-10-03T00:00:00.000Z", timesMet: 5 });
  });
});

describe("captions", () => {
  it("strips v4 tags", () => {
    expect(stripTags("[cackles] Granny Neem, friend! [sighs]")).toBe("Granny Neem, friend!");
  });
  it("spreads words monotonically across the clip", () => {
    const w = timeWords("Hmm, a visitor. I'm the shade over every street.");
    expect(w.length).toBe(9);
    for (let i = 1; i < w.length; i++) expect(w[i]!.start).toBeGreaterThan(w[i - 1]!.start);
    expect(w[0]!.start).toBeGreaterThan(0);
    expect(w.at(-1)!.end).toBeLessThan(1);
    expect(wordAt(w, 0)).toBe(-1);
    expect(wordAt(w, 0.999)).toBe(8);
  });
  it("gives sentence ends a longer pause than plain words", () => {
    const w = timeWords("Stop. Go on and on");
    const stop = w[0]!.end - w[0]!.start;
    const go = w[1]!.end - w[1]!.start;
    expect(stop).toBeGreaterThan(go * 1.5);
  });
});
