// Game state: everything is local, deterministic and serialisable.

export interface DayEvent {
  id: string;
  category: string;
  kind: "species" | "guardian";
  first: boolean;
  /** Local hour 0-23 when it happened. */
  hour: number;
}

export interface DayRecord {
  events: DayEvent[];
  /** Primary habitats of characters met that day. */
  habitats: string[];
  /** True once a walk quest was finished that day. */
  wandered: boolean;
  questsDone: string[];
  /** Index into events where the active quest began; earlier meetings belong to earlier quests. */
  legStart: number;
  /** Steps walked towards the active walk quest. */
  steps: number;
  complete: boolean;
}

export interface Streak {
  count: number;
  best: number;
  lastDay?: string;
  /** Week key (Monday) in which the grace day was spent. */
  graceWeek?: string;
}

export interface GameState {
  version: 1;
  xp: number;
  /** Everyone met at least once (characters and guardians). */
  met: Record<string, string>;
  /** Day on which a repeat meeting last paid XP, per character. */
  repeatPaid: Record<string, string>;
  lastCategory?: string;
  lastCaptureAt?: number;
  /** Walk quests finished, all time. */
  wanders: number;
  badges: Record<string, string>;
  blessed: Record<string, string>;
  streak: Streak;
  days: Record<string, DayRecord>;
  onboarded: boolean;
}

export const newGame = (): GameState => ({
  version: 1,
  xp: 0,
  met: {},
  repeatPaid: {},
  wanders: 0,
  badges: {},
  blessed: {},
  streak: { count: 0, best: 0 },
  days: {},
  onboarded: false,
});

export const newDay = (): DayRecord => ({ events: [], habitats: [], wandered: false, questsDone: [], legStart: 0, steps: 0, complete: false });

/** Deep-ish copy so rule functions stay pure. */
export function cloneGame(s: GameState): GameState {
  return structuredClone(s);
}
