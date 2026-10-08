// Glue between the pure game engine and the app: persistence, moments, XP pop-ups, walk quests.
import { addSteps, applyEncounter, fastForward, seedFromCollection, skipQuest, type Rewards } from "../game/engine";
import { XP } from "../game/rules";
import { loadGame, saveGame } from "../game/store";
import { buildWorld } from "../game/world";
import { allowMotion, primeMotion, startPedometer, stopPedometer } from "./pedometer";
import { syncScore } from "./community";
import { ensureEmbedder } from "./embedder";
import { announce, state, toast, update, type Moment } from "./state";

export async function initGame() {
  const data = state.data!;
  state.world = buildWorld(data.ordered);
  let g = await loadGame();
  if (Object.keys(g.met).length === 0 && Object.keys(state.collection.entries).length > 0) {
    g = seedFromCollection(g, state.collection.entries, state.world);
    void saveGame(g);
  }
  state.game = g;
}

function momentsFor(r: Rewards): Moment[] {
  const m: Moment[] = [];
  if (r.blessed) m.push({ kind: "blessed", category: r.blessed });
  for (const b of r.badges) m.push({ kind: "badge", id: b.id });
  if (r.rankUp) m.push({ kind: "rank", name: r.rankUp.name });
  if (r.dayComplete) m.push({ kind: "trail", streak: r.streak });
  if (r.finale) m.push({ kind: "finale" });
  return m;
}

let popId = 0;
const POP_MS = 3600;

/** Shows "+XP" at the top of the screen, above the voice line, and says what unlocked next. */
export function popXp(r: Rewards) {
  if (r.xp <= 0) return;
  const pop = {
    id: ++popId,
    xp: r.xp,
    parts: r.parts.map((p) => `${p.label} +${p.xp}`),
    done: r.questsCompleted.map((q) => q.label),
    next: r.questsCompleted.length ? (r.next?.label ?? (r.dayComplete ? "Trail done" : undefined)) : undefined,
  };
  update((s) => s.xpPops.push(pop));
  window.setTimeout(() => update((s) => (s.xpPops = s.xpPops.filter((p) => p.id !== pop.id))), POP_MS);
}

export function gameEncounter(id: string, kind: "species" | "guardian"): Rewards {
  const { state: g, rewards } = applyEncounter(state.game, { id, kind }, state.world!, new Date());
  state.game = g;
  void saveGame(g);
  state.pendingMoments = momentsFor(rewards);
  popXp(rewards);
  if (rewards.xp) syncScore();
  return rewards;
}

/** Skips the active find quest for XP. Returns false when there's nothing to skip. */
export function gameSkip(): boolean {
  const out = skipQuest(state.game, state.world!, new Date());
  if (!out) return false;
  state.game = out.state;
  void saveGame(out.state);
  if (out.cost) syncScore();
  state.pendingMoments = momentsFor(out.rewards);
  releaseMoments();
  const next = out.rewards.next?.label ?? "Trail done";
  toast(`Skipped “${out.skipped.label}”. ${out.cost ? `−${out.cost} XP. ` : ""}Next: ${next}`);
  announce(`Skipped ${out.skipped.label}.${out.cost ? ` Minus ${out.cost} XP.` : ""} Next: ${next}.`);
  return true;
}

/** Starts tomorrow's trail today (XP kept; the streak stays on the real calendar). */
export function gameFastForward() {
  const { state: g, quests } = fastForward(state.game, state.world!, new Date());
  state.game = g;
  void saveGame(g);
  update();
  announce(`Fast-forwarded a day. New trail: ${quests.length} quests. First: ${quests[0]?.label}.`);
}

export const SKIP_COST = XP.skip;

/** Shows moments collected during the last encounter (called once its voice line ends). */
export function releaseMoments() {
  if (!state.pendingMoments?.length) return;
  const next = state.pendingMoments;
  state.pendingMoments = [];
  update((s) => s.moments.push(...next));
}

export function dismissMoment() {
  update((s) => s.moments.shift());
}

// ---- walk quests ------------------------------------------------------------------

let saveTimer = 0;

/** Steps from the pedometer (or the dev hook). Finishes the walk quest when enough were walked. */
export function walkSteps(n: number) {
  const { state: g, rewards } = addSteps(state.game, n, state.world!, new Date());
  if (g === state.game) return;
  state.game = g;
  if (!rewards) {
    // Save at most once a second while walking.
    if (!saveTimer) saveTimer = window.setTimeout(() => { saveTimer = 0; void saveGame(state.game); }, 1000);
    update();
    return;
  }
  void saveGame(g);
  stopPedometer();
  popXp(rewards);
  syncScore();
  // The cloud listener sleeps during a long walk; wake it now so the next photo doesn't wait for a cold start.
  if (rewards.next && rewards.next.kind !== "walk") ensureEmbedder();
  update((s) => (s.listen = { kind: "walk", mode: s.listen.kind === "walk" ? s.listen.mode : "sensor", done: rewards }));
  // Badges and trail-done open a modal; let the XP pop-up be seen first.
  state.pendingMoments = [...(state.pendingMoments ?? []), ...momentsFor(rewards)];
  window.setTimeout(releaseMoments, 2400);
  navigator.vibrate?.([40, 60, 40, 60, 120]);
  announce(`Walk done. Plus ${rewards.xp} XP.${rewards.next ? ` Next: ${rewards.next.label}.` : ""}`);
}

export function startWalk() {
  update((s) => (s.listen = { kind: "walk", mode: "starting", done: null }));
  startPedometer(walkSteps, (mode) => update((s) => { if (s.listen.kind === "walk") s.listen = { ...s.listen, mode }; }));
}

export function stopWalk() {
  stopPedometer();
  void saveGame(state.game);
}

export { allowMotion, primeMotion };
