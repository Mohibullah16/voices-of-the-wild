// Tiny app store: one mutable state object, one render scheduler.
import type { FieldData } from "../data";
import type { Embedder, LoadInfo } from "../embed/client";
import type { MatchResult } from "../match";
import type { Collection, Settings } from "../store";
import type { LineKey } from "../types";
import type { Rewards } from "../game/engine";
import { newGame, type GameState } from "../game/state";
import type { World } from "../game/world";
import type { PedometerMode } from "./pedometer";

export type Route =
  | { name: "listen" }
  | { name: "guide" }
  | { name: "detail"; id: string }
  | { name: "badges" }
  | { name: "about" };

export type ListenState =
  | { kind: "idle" }
  | { kind: "viewfinder"; error?: string }
  | { kind: "stirring"; preview: string; waking: boolean }
  | {
      kind: "result";
      preview: string;
      result: MatchResult;
      /** Owner who speaks (character or guardian); null for "nobody". */
      ownerId: string | null;
      line: LineKey | null;
      first: boolean;
      embedMs: number;
      leaving: boolean;
      seq: number;
      rewards: Rewards | null;
      /** A built-in sample photo: real matching, no collection, no XP. */
      sample: boolean;
    }
  /** A walk quest: steps counted on this phone. `done` holds the rewards once the steps are walked. */
  | { kind: "walk"; mode: PedometerMode; done: Rewards | null }
  | { kind: "error"; message: string };

export type EmbedderStatus = { state: "idle" | "loading" | "ready" | "error"; info?: LoadInfo; error?: { code: string; message: string } };

export interface AppState {
  phase: "boot" | "setup" | "app" | "fatal";
  fatal?: string;
  data?: FieldData;
  collection: Collection;
  settings: Settings;
  route: Route;
  listen: ListenState;
  embedder?: Embedder;
  embedderStatus: EmbedderStatus;
  online: boolean;
  toast?: string;
  game: GameState;
  world?: World;
  /** Big moments waiting to be shown (badge, rank-up, blessing, finale, trail done). */
  moments: Moment[];
  /** Moments held back until the current voice line finishes. */
  pendingMoments?: Moment[];
  /** XP pop-ups, shown above everything (including a playing voice line) for a few seconds. */
  xpPops: XpPop[];
}

export interface XpPop {
  id: number;
  xp: number;
  parts: string[];
  /** Quests just finished, and the one that unlocked. */
  done: string[];
  next?: string;
}

export type Moment =
  | { kind: "badge"; id: string }
  | { kind: "rank"; name: string }
  | { kind: "blessed"; category: string }
  | { kind: "trail"; streak: number }
  | { kind: "finale" };

export const state: AppState = {
  phase: "boot",
  collection: { version: 1, entries: {} },
  settings: { setupDone: false, debug: false, largeCaptions: false, keepPhotos: true, theme: "system" },
  route: { name: "listen" },
  listen: { kind: "idle" },
  embedderStatus: { state: "idle" },
  online: navigator.onLine,
  game: newGame(),
  moments: [],
  xpPops: [],
};

let renderFn: () => void = () => {};
let queued = false;
export function setRenderer(fn: () => void) {
  renderFn = fn;
}
/** Schedules a re-render on the next microtask (coalesces bursts of updates). */
export function update(mutator?: (s: AppState) => void) {
  mutator?.(state);
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    renderFn();
  });
}

// ---- routing (hash based: works offline and on any static host) -------------

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (h.startsWith("guide/")) return { name: "detail", id: decodeURIComponent(h.slice(6)) };
  if (h === "guide") return { name: "guide" };
  if (h === "about") return { name: "about" };
  if (h === "badges") return { name: "badges" };
  return { name: "listen" };
}
export function hrefFor(r: Route): string {
  switch (r.name) {
    case "listen": return "#/";
    case "guide": return "#/guide";
    case "detail": return `#/guide/${encodeURIComponent(r.id)}`;
    case "about": return "#/about";
    case "badges": return "#/badges";
  }
}
export const navigate = (r: Route) => { location.hash = hrefFor(r); };

// ---- announcements for screen readers ---------------------------------------

export function announce(text: string) {
  // A polite log: messages queue in order instead of overwriting each other.
  const el = document.getElementById("announcer");
  if (!el) return;
  const p = document.createElement("p");
  p.textContent = text;
  el.append(p);
  while (el.childElementCount > 4) el.firstElementChild?.remove();
}

let toastTimer = 0;
export function toast(text: string) {
  clearTimeout(toastTimer);
  update((s) => (s.toast = text));
  toastTimer = window.setTimeout(() => update((s) => (s.toast = undefined)), 3200);
}
