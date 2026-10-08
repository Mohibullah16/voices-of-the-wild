// Applies game events to state and reports every reward. Pure: (state, event, world, now) -> new state + rewards.
import { BADGES, newlyEarned, type Badge } from "./badges";
import { primaryPlace } from "./habitats";
import { activeQuest, canSkip, questProgress, trailFor, type Quest } from "./quests";
import { rankFor, XP, type Rank } from "./rules";
import { cloneGame, newDay, type GameState } from "./state";
import { completeDay } from "./streak";
import { dayKey } from "./time";
import type { World } from "./world";

export interface XpPart {
  label: string;
  xp: number;
}

export interface Rewards {
  xp: number;
  parts: XpPart[];
  /** True when the capture came too soon after the last one to earn XP. */
  tooSoon: boolean;
  questsCompleted: Quest[];
  /** The quest that is active after this event (undefined when the day's trail is done). */
  next?: Quest;
  dayComplete: boolean;
  streak: number;
  badges: Badge[];
  rankUp?: Rank;
  blessed?: string; // category completed by this meeting
  finale: boolean; // every character met
}

const emptyRewards = (): Rewards => ({ xp: 0, parts: [], tooSoon: false, questsCompleted: [], dayComplete: false, streak: 0, badges: [], finale: false });

function settle(prev: GameState, s: GameState, world: World, day: string, r: Rewards, now: Date): Rewards {
  // The quest chain: finish the active quest, unlock the next, repeat while the next is already met.
  const d = s.days[day]!;
  const quests = trailFor(day, d, world);
  for (let q = activeQuest(quests, d); q && questProgress(q, d, world).done; q = activeQuest(quests, d)) {
    d.questsDone.push(q.id);
    r.questsCompleted.push(q);
    const part = q.kind === "walk" ? { label: `Walked ${q.need.toLocaleString("en")} steps`, xp: Math.round(q.need * XP.stepXp) } : { label: "Quest done", xp: XP.quest };
    r.parts.push(part);
    r.xp += part.xp;
    s.xp += part.xp;
    if (q.kind === "walk") {
      d.wandered = true;
      s.wanders += 1;
    }
    d.legStart = d.events.length;
    d.steps = 0;
  }
  r.next = activeQuest(quests, d);
  if (!d.complete && !r.next) {
    d.complete = true;
    s.streak = completeDay(s.streak, day);
    r.dayComplete = true;
  }
  r.streak = s.streak.count;
  // Badges.
  const nowIso = now.toISOString();
  for (const b of newlyEarned(s, world)) {
    s.badges[b.id] = nowIso;
    r.badges.push(b);
  }
  // Rank.
  const before = rankFor(prev.xp).rank;
  const after = rankFor(s.xp).rank;
  if (after.index > before.index) r.rankUp = after;
  return r;
}

export interface EncounterInput {
  id: string;
  kind: "species" | "guardian";
}

/** A character spoke (species) or a guardian gave a tip. */
export function applyEncounter(prev: GameState, ev: EncounterInput, world: World, now: Date): { state: GameState; rewards: Rewards } {
  const s = cloneGame(prev);
  const r = emptyRewards();
  const owner = world.owners.get(ev.id);
  if (!owner) return { state: s, rewards: r };
  const day = dayKey(now);
  const d = (s.days[day] ??= newDay());
  const t = now.getTime();
  const first = !s.met[ev.id];
  const tooSoon = s.lastCaptureAt !== undefined && t - s.lastCaptureAt < XP.spamWindowMs && !first;

  // Base XP.
  let base = 0;
  let label = "";
  if (ev.kind === "guardian") {
    base = XP.guardianHint;
    label = "Guardian’s tip";
  } else if (first) {
    base = owner.elder ? XP.newElder : XP.newCharacter;
    label = owner.elder ? "New Elder" : "New voice";
  } else if (s.repeatPaid[ev.id] !== day) {
    base = XP.repeat;
    label = "Met again";
    if (!tooSoon) s.repeatPaid[ev.id] = day;
  }
  if (tooSoon) {
    base = 0;
    r.tooSoon = true;
  }
  if (base > 0) {
    r.parts.push({ label, xp: base });
    if (s.lastCategory && s.lastCategory !== owner.category) r.parts.push({ label: "New ground", xp: Math.round(base * XP.varietyBonus) });
  }

  // Record the meeting.
  if (first) s.met[ev.id] = now.toISOString();
  d.events.push({ id: ev.id, category: owner.category, kind: ev.kind, first, hour: now.getHours() });
  const place = ev.kind === "species" ? primaryPlace(owner.habitat) : undefined;
  if (place && !d.habitats.includes(place)) d.habitats.push(place);
  s.lastCategory = owner.category;
  s.lastCaptureAt = t;

  // Category complete: all characters of this kind met.
  if (first && ev.kind === "species" && !s.blessed[owner.category]) {
    const all = world.characters.get(owner.category) ?? [];
    if (all.length && all.every((id) => s.met[id])) {
      s.blessed[owner.category] = now.toISOString();
      r.blessed = owner.category;
      r.parts.push({ label: "Kind complete", xp: XP.categoryComplete });
    }
  }
  r.xp = r.parts.reduce((n, p) => n + p.xp, 0);
  s.xp += r.xp;
  const metChars = [...world.owners.values()].filter((o) => !o.guardian && s.met[o.id]).length;
  r.finale = first && ev.kind === "species" && metChars === world.totalCharacters;
  return { state: s, rewards: settle(prev, s, world, day, r, now) };
}

/** Steps counted while a walk quest is active. Steps outside a walk quest are ignored. */
export function addSteps(prev: GameState, steps: number, world: World, now: Date): { state: GameState; rewards: Rewards | null } {
  const day = dayKey(now);
  const q = activeQuest(trailFor(day, prev.days[day], world), prev.days[day]);
  if (!q || q.kind !== "walk" || steps <= 0) return { state: prev, rewards: null };
  const s = cloneGame(prev);
  const d = (s.days[day] ??= newDay());
  d.steps = Math.min(q.need, (d.steps ?? 0) + Math.round(steps));
  const r = settle(prev, s, world, day, emptyRewards(), now);
  return { state: s, rewards: r.questsCompleted.length ? r : null };
}

/** Gives up on the active find quest for XP.skip (a photo that won't match, nothing of that kind nearby).
 * Walk quests can't be skipped. Returns null when there's nothing to skip. */
export function skipQuest(prev: GameState, world: World, now: Date): { state: GameState; rewards: Rewards; skipped: Quest; cost: number } | null {
  const day = dayKey(now);
  const q = activeQuest(trailFor(day, prev.days[day], world), prev.days[day]);
  if (!canSkip(q)) return null;
  const s = cloneGame(prev);
  const d = (s.days[day] ??= newDay());
  const cost = Math.min(XP.skip, s.xp);
  s.xp -= cost;
  d.questsDone.push(q.id);
  (d.skipped ??= []).push(q.id);
  d.legStart = d.events.length;
  d.steps = 0;
  const r = settle(prev, s, world, day, emptyRewards(), now);
  return { state: s, rewards: r, skipped: q, cost };
}

/** Starts the next day's trail now, keeping XP and collection. The streak still follows the real calendar
 * (one finished trail per real day), so fast-forwarding can't fake a streak. */
export function fastForward(prev: GameState, world: World, now: Date): { state: GameState; quests: Quest[] } {
  const s = cloneGame(prev);
  const day = dayKey(now);
  const d = (s.days[day] ??= newDay());
  d.ahead = (d.ahead ?? 0) + 1;
  d.questsDone = [];
  d.skipped = [];
  d.legStart = d.events.length;
  d.steps = 0;
  d.complete = false;
  return { state: s, quests: trailFor(day, d, world) };
}

/** Seeds a fresh game from an existing collection (players who met characters before the game layer). */
export function seedFromCollection(s: GameState, entries: Record<string, { firstMet: string }>, world: World, now = new Date()): GameState {
  const out = cloneGame(s);
  for (const [id, e] of Object.entries(entries)) if (world.owners.has(id) && !out.met[id]) out.met[id] = e.firstMet;
  for (const b of BADGES) if (!out.badges[b.id] && b.earned(out, world)) out.badges[b.id] = now.toISOString();
  return out;
}
