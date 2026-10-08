// Persists the game in IndexedDB. Everything stays on the device.
import { get, set } from "idb-keyval";
import { newGame, type GameState } from "./state";

const KEY = "votw:game";

export async function loadGame(): Promise<GameState> {
  try {
    const g = (await get(KEY)) as GameState | undefined;
    return g && g.version === 1 ? { ...newGame(), ...g } : newGame();
  } catch {
    return newGame();
  }
}

export const saveGame = (g: GameState) => set(KEY, g).catch(() => {});
