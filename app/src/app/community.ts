// Anonymous community rankings. Each player is a random id and a generated nickname ("Quiet Kite #4821");
// only XP, voices met and streak are shared. No accounts, no free text. Opt out in About.
import { COMMUNITY_URL } from "../config";
import { streakView } from "../game/streak";
import { dayKey } from "../game/time";
import { saveSettings } from "../store";
import { wantsMock } from "./embedder";
import { state, update } from "./state";

export interface BoardRow { rank: number; name: string; xp: number; voices: number; streak: number; online: boolean }
export interface Board { top: BoardRow[]; me: BoardRow | null; players: number; online: number }

const ADJ = ["Quiet", "Brave", "Gentle", "Swift", "Patient", "Curious", "Sunny", "Steady", "Bright", "Wandering", "Kind", "Lucky", "Calm", "Bold", "Merry", "Wise"];
const NOUN = ["Kite", "Neem", "Myna", "Pebble", "Sparrow", "Banyan", "Lotus", "Gecko", "Crow", "Comet", "Breeze", "Fern", "Heron", "Mango", "Moth", "Willow"];

let board: Board | null = null;
let boardAt = 0;
let loading = false;
let syncTimer = 0;

/** Off in dev/test runs (mock embedder) so scripted sessions never reach the real board. */
const enabled = () => !wantsMock() && state.settings.rankings !== false;

function identity() {
  const s = state.settings;
  if (s.playerId && s.playerName) return { id: s.playerId, name: s.playerName };
  const r = crypto.getRandomValues(new Uint32Array(3));
  const name = `${ADJ[r[0]! % ADJ.length]} ${NOUN[r[1]! % NOUN.length]} #${String(1000 + (r[2]! % 9000))}`;
  state.settings = { ...s, playerId: crypto.randomUUID().toLowerCase(), playerName: name };
  void saveSettings(state.settings);
  return { id: state.settings.playerId!, name };
}

export const playerName = () => (enabled() ? identity().name : state.settings.playerName ?? "");

/** Sends this player's numbers a few seconds after they change (coalesced). */
export function syncScore(delay = 3000) {
  if (!enabled()) return;
  clearTimeout(syncTimer);
  syncTimer = window.setTimeout(async () => {
    if (!navigator.onLine) return;
    const { id, name } = identity();
    const g = state.game;
    const voices = Object.keys(g.met).filter((k) => !state.world?.owners.get(k)?.guardian).length;
    const streak = streakView(g.streak, dayKey(new Date())).count;
    try {
      await fetch(`${COMMUNITY_URL}/score`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name, xp: g.xp, voices, streak }), signal: AbortSignal.timeout(15_000) });
      boardAt = 0; // refresh the board next time it's shown
    } catch {
      /* try again on the next change */
    }
  }, delay);
}

/** The board, refreshed at most every 30 s while it's on screen. */
export function getBoard(): Board | null {
  if (wantsMock()) return null;
  if (!loading && Date.now() - boardAt > 30_000 && navigator.onLine) {
    loading = true;
    const id = state.settings.rankings !== false ? state.settings.playerId ?? "" : "";
    fetch(`${COMMUNITY_URL}/board?id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => (r.ok ? (r.json() as Promise<Board>) : null))
      .then((b) => { if (b) board = b; })
      .catch(() => {})
      .finally(() => { loading = false; boardAt = Date.now(); update(); });
  }
  return board;
}

/** Leave (or rejoin) the rankings. Leaving deletes this player's row on the server. */
export async function setRankings(on: boolean) {
  state.settings = { ...state.settings, rankings: on };
  await saveSettings(state.settings);
  if (!on && state.settings.playerId) {
    await fetch(`${COMMUNITY_URL}/score?id=${encodeURIComponent(state.settings.playerId)}`, { method: "DELETE" }).catch(() => {});
  } else syncScore(0);
  boardAt = 0;
  update();
}
