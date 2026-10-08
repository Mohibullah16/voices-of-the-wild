import { describe, expect, it } from "vitest";
import roster from "../dev-fixtures/roster.runtime.json";
import { flattenOwners } from "../data";
import type { RuntimeRoster } from "../types";
import { BADGES } from "./badges";
import { addSteps, applyEncounter, fastForward, seedFromCollection, skipQuest } from "./engine";
import { compass, primaryPlace } from "./habitats";
import { activeQuest, questProgress, questsFor, trailFor, type Quest } from "./quests";
import { StepDetector } from "./steps";
import { rankFor, RANKS, XP } from "./rules";
import { newGame, type GameState } from "./state";
import { completeDay, streakView } from "./streak";
import { addDays, weekKey } from "./time";
import { buildWorld } from "./world";

const owners = flattenOwners((roster as unknown as RuntimeRoster).categories);
const world = buildWorld(owners);
const at = (iso: string) => new Date(iso);
const T0 = "2026-10-09T09:00:00";
const later = (base: string, ms: number) => new Date(new Date(base).getTime() + ms);

function meet(s: GameState, id: string, when: Date, kind: "species" | "guardian" = "species") {
  return applyEncounter(s, { id, kind }, world, when);
}

describe("daily quest chain", () => {
  it("is the same for everyone on a given date, 5 to 7 long, and changes between days", () => {
    const a = questsFor("2026-10-09", world);
    expect(questsFor("2026-10-09", world)).toEqual(a);
    const lengths = new Set<number>();
    const days = Array.from({ length: 30 }, (_, i) => questsFor(addDays("2026-10-01", i), world));
    for (const qs of days) {
      lengths.add(qs.length);
      expect(qs.length).toBeGreaterThanOrEqual(5);
      expect(qs.length).toBeLessThanOrEqual(7);
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
      // Find, walk, find, walk, find.
      qs.forEach((q, i) => expect(q.kind === "walk").toBe(i % 2 === 1));
      for (const q of qs) expect(q.label.split(" ").length).toBeLessThanOrEqual(4);
    }
    expect([...lengths].sort()).toEqual([5, 6, 7]);
    expect(new Set(days.map((d) => JSON.stringify(d))).size).toBeGreaterThan(15);
  });

  it("walks are 500 steps, then 1,000, then 1,500", () => {
    const qs = Array.from({ length: 30 }, (_, i) => questsFor(addDays("2026-10-01", i), world)).find((q) => q.length === 7)!;
    expect(qs.filter((q) => q.kind === "walk").map((q) => q.need)).toEqual([500, 1000, 1500]);
  });
});

describe("playing the chain", () => {
  const day = "2026-10-09";
  const clock = (n: number) => new Date(`${day}T10:${String(n).padStart(2, "0")}:00`);
  const solve = (q: Quest) => (q.kind === "category" ? world.characters.get(q.category!)![0]! : q.kind === "touch-grass" ? "lawn-grass" : "goat");

  it("unlocks one quest at a time: listen, walk the steps, listen again", () => {
    const quests = questsFor(day, world);
    let s = newGame();
    let n = 0;
    for (const [i, q] of quests.entries()) {
      expect(activeQuest(quests, s.days[day])?.id).toBe(q.id);
      if (q.kind === "walk") {
        // Meeting someone does not walk for you.
        s = applyEncounter(s, { id: "neem-tree", kind: "species" }, world, clock(n++)).state;
        expect(activeQuest(quests, s.days[day])?.id).toBe(q.id);
        const half = addSteps(s, q.need / 2, world, clock(n++));
        expect(half.rewards).toBeNull();
        expect(questProgress(q, half.state.days[day]).have).toBe(q.need / 2);
        const done = addSteps(half.state, q.need, world, clock(n++));
        expect(done.rewards?.questsCompleted.map((x) => x.id)).toEqual([q.id]);
        expect(done.rewards?.xp).toBe(Math.round(q.need * XP.stepXp));
        expect(done.rewards?.next?.id).toBe(quests[i + 1]?.id);
        s = done.state;
      } else {
        const r = applyEncounter(s, { id: solve(q), kind: "species" }, world, clock(n++ + 2));
        expect(r.rewards.questsCompleted.map((x) => x.id)).toEqual([q.id]);
        expect(r.rewards.parts.map((p) => p.label)).toContain("Quest done");
        s = r.state;
      }
    }
    expect(activeQuest(quests, s.days[day])).toBeUndefined();
    expect(s.days[day]!.complete).toBe(true);
    expect(s.streak.count).toBe(1);
    expect(s.wanders).toBe(quests.filter((q) => q.kind === "walk").length);
    expect(s.badges.wanderer).toBeTruthy();
  });

  it("ignores steps when no walk quest is active, and meetings from before the quest unlocked", () => {
    const quests = questsFor(day, world);
    expect(addSteps(newGame(), 800, world, clock(0)).rewards).toBeNull();
    // Meet the third quest's thing first: it must not count once that quest unlocks later.
    const third = quests[2]!;
    let s = applyEncounter(newGame(), { id: solve(third), kind: "species" }, world, clock(0)).state;
    s = applyEncounter(s, { id: solve(quests[0]!), kind: "species" }, world, clock(5)).state;
    s = addSteps(s, quests[1]!.need, world, clock(10)).state;
    expect(activeQuest(quests, s.days[day])?.id).toBe(third.id);
    expect(questProgress(third, s.days[day]).done).toBe(false);
  });
});

describe("skip and fast-forward", () => {
  const day = "2026-10-09";
  const clock = (n: number) => new Date(`${day}T11:${String(n).padStart(2, "0")}:00`);

  it("skipping a find quest costs 25 XP (never below 0) and unlocks the next; walks can't be skipped", () => {
    const quests = questsFor(day, world);
    let s = applyEncounter(newGame(), { id: "goat", kind: "species" }, world, clock(0)).state; // earn some XP
    const before = s.xp;
    const sk = skipQuest(s, world, clock(1))!;
    expect(sk.skipped.id).toBe(quests[0]!.id);
    expect(sk.cost).toBe(XP.skip);
    expect(sk.state.xp).toBe(before - XP.skip);
    expect(sk.rewards.next?.kind).toBe("walk");
    expect(sk.state.days[day]!.skipped).toEqual([quests[0]!.id]);
    expect(skipQuest(sk.state, world, clock(2))).toBeNull(); // the walk
    // XP floor.
    const broke = skipQuest(newGame(), world, clock(3))!;
    expect(broke.state.xp).toBe(0);
    expect(broke.cost).toBe(0);
  });

  it("fast-forward plays the next day's trail today, keeps XP, and doesn't fake the streak", () => {
    let s = applyEncounter(newGame(), { id: "goat", kind: "species" }, world, clock(0)).state;
    const xp = s.xp;
    const ff = fastForward(s, world, clock(1));
    expect(ff.quests).toEqual(questsFor(addDays(day, 1), world));
    expect(ff.state.xp).toBe(xp);
    expect(trailFor(day, ff.state.days[day], world)).toEqual(ff.quests);
    expect(activeQuest(ff.quests, ff.state.days[day])?.id).toBe(ff.quests[0]!.id);
    // Finish the fast-forwarded trail by skipping finds and walking: the streak counts today once.
    s = ff.state;
    for (let n = 2, guard = 0; activeQuest(trailFor(day, s.days[day], world), s.days[day]) && guard < 20; guard++) {
      const q = activeQuest(trailFor(day, s.days[day], world), s.days[day])!;
      s = q.kind === "walk" ? addSteps(s, q.need, world, clock(n++)).state : skipQuest(s, world, clock(n++))!.state;
    }
    expect(s.days[day]!.complete).toBe(true);
    expect(s.streak.count).toBe(1);
    s = fastForward(s, world, clock(40)).state;
    expect(s.days[day]!.ahead).toBe(2);
    expect(s.streak.count).toBe(1);
    expect(s.streak.lastDay).toBe(day);
  });
});

describe("step detector", () => {
  const run = (hz: number, amp: number, seconds: number, noise = 0.15) => {
    const det = new StepDetector();
    let steps = 0;
    for (let t = 0; t < seconds * 1000; t += 20) {
      const bounce = amp * Math.max(0, Math.sin((2 * Math.PI * hz * t) / 1000)) ** 2;
      steps += det.push(0.3, 9.81 + bounce + (Math.sin(t * 0.37) * noise), 0.4, t);
    }
    return steps;
  };

  it("counts walking at about 2 steps a second", () => {
    const n = run(2, 4, 30);
    expect(n).toBeGreaterThanOrEqual(56);
    expect(n).toBeLessThanOrEqual(61);
  });

  it("counts nothing while the phone lies still", () => {
    expect(run(2, 0, 30)).toBe(0);
  });

  it("caps shaking at a running pace", () => {
    expect(run(9, 6, 10)).toBeLessThanOrEqual(38);
  });
});

describe("XP rules", () => {
  it("pays 100 for a new character and 250 for a new Elder", () => {
    const elder = owners.find((o) => o.elder && !o.guardian)!;
    const common = owners.find((o) => !o.elder && !o.guardian && o.category === elder.category)!;
    const a = meet(newGame(), common.id, at(T0));
    expect(a.rewards.xp).toBe(XP.newCharacter);
    const b = meet(newGame(), elder.id, at(T0));
    expect(b.rewards.xp).toBe(XP.newElder);
  });

  it("pays 15 for a guardian tip", () => {
    expect(meet(newGame(), "trees-guardian", at(T0), "guardian").rewards.xp).toBe(XP.guardianHint);
  });

  it("pays a repeat meeting 10 XP once per character per day", () => {
    let s = meet(newGame(), "neem-tree", at(T0)).state;
    const r1 = meet(s, "neem-tree", later(T0, 5 * 60_000));
    expect(r1.rewards.xp).toBe(XP.repeat);
    const r2 = meet(r1.state, "neem-tree", later(T0, 15 * 60_000));
    expect(r2.rewards.xp).toBe(0);
    const r3 = meet(r2.state, "neem-tree", at("2026-10-10T09:00:00"));
    expect(r3.rewards.xp).toBe(XP.repeat);
  });

  it("adds a 50% variety bonus when the kind differs from the previous encounter", () => {
    let s = meet(newGame(), "neem-tree", at(T0)).state; // trees
    const crow = meet(s, "house-crow", later(T0, 10 * 60_000)); // birds, an Elder: 250 + 125
    expect(crow.rewards.parts.map((p) => p.label)).toContain("New ground");
    expect(crow.rewards.xp).toBe(XP.newElder * 1.5);
    s = crow.state;
    const sparrow = meet(s, "house-sparrow", later(T0, 20 * 60_000)); // birds again: no bonus
    expect(sparrow.rewards.xp).toBe(XP.newCharacter);
  });

  it("pays nothing for repeat captures within 60 seconds, but new characters still count", () => {
    let s = meet(newGame(), "neem-tree", at(T0)).state;
    const spam = meet(s, "neem-tree", later(T0, 20_000));
    expect(spam.rewards.tooSoon).toBe(true);
    expect(spam.rewards.xp).toBe(0);
    // The repeat XP for today was not spent by the spam capture.
    expect(meet(spam.state, "neem-tree", later(T0, 5 * 60_000)).rewards.xp).toBe(XP.repeat);
    const fresh = meet(s, "peepal-tree", later(T0, 20_000));
    expect(fresh.rewards.tooSoon).toBe(false);
    expect(fresh.rewards.xp).toBe(XP.newCharacter);
  });

  it("pays 500 and blesses the kind when all its characters are met", () => {
    const ids = world.characters.get("water")!;
    let s = newGame();
    let last: ReturnType<typeof meet> | undefined;
    ids.forEach((id, i) => {
      last = meet(s, id, later(T0, i * 10 * 60_000));
      s = last.state;
    });
    expect(last!.rewards.blessed).toBe("water");
    expect(last!.rewards.parts.find((p) => p.label === "Kind complete")?.xp).toBe(XP.categoryComplete);
    expect(s.blessed.water).toBeTruthy();
    expect(s.badges.blessed).toBeTruthy();
  });

  it("ranks up at the thresholds", () => {
    expect(rankFor(0).rank.name).toBe("Wanderer");
    expect(rankFor(RANKS[1]!.min).rank.name).toBe("Scout");
    expect(rankFor(10_000).rank.name).toBe("Keeper of Voices");
    expect(rankFor(10_000).next).toBeUndefined();
    let s: GameState = { ...newGame(), xp: RANKS[1]!.min - 50 };
    const r = meet(s, "neem-tree", at(T0));
    expect(r.rewards.rankUp?.name).toBe("Scout");
  });

  it("reaches the finale after every character", () => {
    let s = newGame();
    let n = 0;
    let last: ReturnType<typeof meet> | undefined;
    for (const ids of world.characters.values()) for (const id of ids) {
      last = meet(s, id, later(T0, n++ * 61_000));
      s = last.state;
    }
    expect(last!.rewards.finale).toBe(true);
    expect(Object.keys(s.blessed)).toHaveLength(world.categories.length);
  });
});

describe("streak", () => {
  it("counts consecutive days and resets after a gap", () => {
    let s = completeDay({ count: 0, best: 0 }, "2026-10-05");
    s = completeDay(s, "2026-10-06");
    expect(s.count).toBe(2);
    expect(completeDay(s, "2026-10-06")).toBe(s); // same day twice
    s = completeDay(s, "2026-10-10");
    expect(s.count).toBe(1);
    expect(s.best).toBe(2);
  });

  it("forgives one missed day per week", () => {
    let s = completeDay({ count: 0, best: 0 }, "2026-10-05"); // Mon
    s = completeDay(s, "2026-10-07"); // missed Tue: grace
    expect(s.count).toBe(2);
    expect(s.graceWeek).toBe(weekKey("2026-10-06"));
    s = completeDay(s, "2026-10-09"); // missed Thu, same week: no second grace
    expect(s.count).toBe(1);
    let t = completeDay({ count: 0, best: 0 }, "2026-10-05");
    t = completeDay(t, "2026-10-07");
    t = completeDay(t, "2026-10-08");
    t = completeDay(t, "2026-10-13"); // Mon of the next week: missed 9-12, too long
    expect(t.count).toBe(1);
  });

  it("shows whether today still needs doing", () => {
    const s = completeDay({ count: 0, best: 0 }, "2026-10-08");
    expect(streakView(s, "2026-10-08").state).toBe("done-today");
    expect(streakView(s, "2026-10-09").state).toBe("alive");
    expect(streakView(s, "2026-10-10").state).toBe("at-risk");
    expect(streakView(s, "2026-10-12")).toEqual({ count: 0, state: "none" });
  });

});

describe("badges", () => {
  it("are twelve, each with a hint", () => {
    expect(BADGES).toHaveLength(12);
    for (const b of BADGES) expect(b.hint.length).toBeGreaterThan(5);
  });

  it("unlock from play", () => {
    let s = newGame();
    const r = meet(s, "lawn-grass", at(T0));
    expect(r.rewards.badges.map((b) => b.id)).toEqual(expect.arrayContaining(["first-voice", "touched-grass"]));
    s = r.state;
    s = meet(s, "sunset", later(T0, 2 * 60_000)).state;
    s = meet(s, "crescent-moon", later(T0, 4 * 60_000)).state;
    expect(s.badges["golden-hour"]).toBeTruthy();
    expect(s.badges["night-shift"]).toBeTruthy();
    const caution = owners.find((o) => o.caution)!;
    expect(meet(s, caution.id, later(T0, 6 * 60_000)).rewards.badges.map((b) => b.id)).toContain("kept-distance");
  });

  it("Both Elders needs both Elders of one kind", () => {
    const elders = world.characters.get("trees")!.filter((id) => world.owners.get(id)!.elder);
    let s = meet(newGame(), elders[0]!, at(T0)).state;
    expect(s.badges["elder-pair"]).toBeUndefined();
    s = meet(s, elders[1]!, later(T0, 5 * 60_000)).state;
    expect(s.badges["elder-pair"]).toBeTruthy();
  });

  it("Five Places needs five different places in one day", () => {
    let s = newGame();
    const picks = ["neem-tree", "sea-waves", "sunset", "mango-fruit", "frere-hall", "pebbles", "goat"];
    const places = new Set<string>();
    picks.forEach((id, i) => {
      s = meet(s, id, later(T0, i * 5 * 60_000)).state;
      const p = primaryPlace(world.owners.get(id)!.habitat);
      if (p) places.add(p);
    });
    expect(Boolean(s.badges["five-habitats"])).toBe(places.size >= 5);
  });
});

describe("habitat compass and migration", () => {
  it("lists places that still hide unmet characters, most first", () => {
    const c = compass(world, {});
    expect(c.length).toBeGreaterThan(3);
    for (let i = 1; i < c.length; i++) expect(c[i - 1]!.remaining).toBeGreaterThanOrEqual(c[i]!.remaining);
    const allMet = Object.fromEntries(owners.map((o) => [o.id, "x"]));
    expect(compass(world, allMet)).toEqual([]);
  });

  it("seeds a new game from an existing collection", () => {
    const s = seedFromCollection(newGame(), { "neem-tree": { firstMet: "2026-10-01T10:00:00.000Z" }, ghost: { firstMet: "x" } }, world);
    expect(Object.keys(s.met)).toEqual(["neem-tree"]);
    expect(s.badges["first-voice"]).toBeTruthy();
    expect(s.xp).toBe(0);
  });
});
