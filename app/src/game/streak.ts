// Streak of completed Daily Trails, with one grace day per week.
import type { Streak } from "./state";
import { addDays, daysBetween, weekKey } from "./time";

/** Records that `day`'s trail was completed. */
export function completeDay(s: Streak, day: string): Streak {
  if (s.lastDay === day) return s;
  if (s.lastDay && daysBetween(s.lastDay, day) < 1) return s; // clock went backwards; ignore
  let { count, graceWeek } = s;
  if (!s.lastDay) count = 1;
  else {
    const gap = daysBetween(s.lastDay, day);
    const missed = addDays(day, -1);
    if (gap === 1) count += 1;
    else if (gap === 2 && graceWeek !== weekKey(missed)) {
      count += 1;
      graceWeek = weekKey(missed);
    } else count = 1;
  }
  return { count, best: Math.max(s.best, count), lastDay: day, graceWeek };
}

export type StreakView = { count: number; state: "done-today" | "alive" | "at-risk" | "none" };

/** What to show today: is the streak still alive, and does today still need doing? */
export function streakView(s: Streak, today: string): StreakView {
  if (!s.lastDay || s.count === 0) return { count: 0, state: "none" };
  const gap = daysBetween(s.lastDay, today);
  if (gap <= 0) return { count: s.count, state: "done-today" };
  if (gap === 1) return { count: s.count, state: "alive" };
  if (gap === 2 && s.graceWeek !== weekKey(addDays(today, -1))) return { count: s.count, state: "at-risk" };
  return { count: 0, state: "none" };
}
