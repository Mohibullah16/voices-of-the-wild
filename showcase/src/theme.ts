// The app's tokens (app/src/styles/app.css): night-forest dark for the film, warm paper for cards and the close.
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export const C = {
  bg: "#0e1613",
  raised: "#15201b",
  sunk: "#0a110e",
  ink: "#e9e5d6",
  ink2: "#bcc2b4",
  ink3: "#9aa396",
  rule: "#26342d",
  ruleStrong: "#5f7468",
  moss: "#a5cd90",
  mossSoft: "#1c2c22",
  gold: "#e4c068",
  goldSoft: "#2a2414",
  foil1: "#b88f33",
  foil2: "#f3d98a",
  foil3: "#8a6a1d",
  caution: "#f39b7d",
  // light (paper) theme
  paper: "#f1eee3",
  paperRaised: "#f8f6ef",
  paperSunk: "#e6e1d2",
  inkL: "#1c2420",
  ink2L: "#444c46",
  ruleL: "#cdc6b2",
  mossL: "#2d5b3c",
  mossSoftL: "#dde6d4",
  goldL: "#7d5e10",
  goldSoftL: "#f2e7c6",
};

export const PIG: Record<string, string> = {
  trees: "#7fa27a",
  birds: "#7e9db5",
  animals: "#b59a7a",
  "small-creatures": "#a9a36a",
  flowers: "#c98d9a",
  plants: "#8db08a",
  "fruits-vegetables": "#d2a55a",
  ground: "#a08c78",
  sky: "#8fb2c9",
  water: "#6e9fa6",
  vehicles: "#c7896b",
  structures: "#a99a86",
  urban: "#8c9196",
};

export const DISPLAY = '"EB Garamond", "Iowan Old Style", Georgia, serif';
export const UI = '"Atkinson Hyperlegible Next", system-ui, sans-serif';
export const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 → 1 between `at` and `at + dur` seconds, eased. */
export const ramp = (t: number, at: number, dur = 0.6, ease = easeOut) =>
  interpolate(t, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });

/** Visible window with fades: 0 before `from`, 1 inside, 0 after `to`. */
export const windowed = (t: number, from: number, to: number, fade = 0.35) =>
  Math.min(ramp(t, from, fade), 1 - ramp(t, to - fade * 0.5, fade, easeInOut));

export const useT = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return f / fps;
};

export type Layout = { W: number; H: number; portrait: boolean; square: boolean; wide: boolean };
export const useLayout = (): Layout => {
  const { width: W, height: H } = useVideoConfig();
  const portrait = H > W * 1.2;
  const square = !portrait && W < H * 1.2;
  return { W, H, portrait, square, wide: !portrait && !square };
};

/** Pick by layout. */
export const by = <T,>(L: Layout, wide: T, portrait: T, square: T): T => (L.portrait ? portrait : L.square ? square : wide);
