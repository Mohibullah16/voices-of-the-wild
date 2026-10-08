/** FNV-1a 32-bit. Stable across platforms. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Rng {
  (): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
}

export function rng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());
  next.pick = (xs) => xs[Math.floor(next() * xs.length)]!;
  next.chance = (p) => next() < p;
  return next;
}

/** Rounds coordinates so the SVG stays compact and deterministic. */
export const f = (n: number) => (Math.round(n * 10) / 10).toString();
