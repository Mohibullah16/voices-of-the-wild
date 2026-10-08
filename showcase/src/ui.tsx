import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, staticFile, useVideoConfig } from "remotion";
import { MARK_PATHS } from "../../app/src/art/logo";
import { emblemPaths } from "../../app/src/art/emblems";
import { motifSvg } from "../../app/src/art/motif";
import { sigilSvg } from "../../app/src/art/sigil";
import assets from "./generated/assets.json";
import { FOOTAGE_SLOTS, type FootageSlot } from "./footage";
import { by, C, DISPLAY, easeInOut, type Layout, PIG, ramp, UI } from "./theme";
import type { CaptionChunk } from "./timeline";

// ---------------------------------------------------------------- background
export const Backdrop: React.FC<{ t: number; light?: number }> = ({ t, light = 0 }) => {
  const dx = Math.sin(t * 0.13) * 6;
  const dy = Math.cos(t * 0.11) * 5;
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 55% at ${68 + dx}% ${28 + dy}%, rgba(165,205,144,0.13), transparent 70%),
            radial-gradient(50% 45% at ${18 - dx}% ${82 - dy}%, rgba(228,192,104,0.07), transparent 70%)`,
        }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 55%, rgba(0,0,0,0.45))" }} />
      {light > 0 ? <AbsoluteFill style={{ background: C.paper, opacity: light }} /> : null}
    </AbsoluteFill>
  );
};

export const Grain: React.FC<{ light?: number }> = ({ light = 0 }) => (
  <AbsoluteFill
    style={{
      backgroundImage: `url(${staticFile("grain.png")})`,
      backgroundSize: "512px 512px",
      opacity: 0.07 + light * 0.05,
      mixBlendMode: light > 0.5 ? "multiply" : "overlay",
      pointerEvents: "none",
    }}
  />
);

// ---------------------------------------------------------------- icons
const ICON: Record<string, string> = {
  camera: `<path d="M3.5 8.5h3.2l1.8-2.8h7l1.8 2.8h3.2v10.8H3.5z"/><circle cx="12" cy="13.6" r="3.6"/>`,
  photo: `<rect x="3" y="4.5" width="18" height="15" rx="2.2"/><path d="M3 16l5.2-5.2 4.3 4.3 3-3L21 17.6"/><circle cx="16" cy="8.8" r="1.5"/>`,
  chip: `<rect x="6" y="6" width="12" height="12" rx="2.2"/><path d="M9.5 2.5v3.5M14.5 2.5v3.5M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/><path d="M9.8 12h4.4"/>`,
  vector: `<path d="M4 19V11M8 19V5M12 19v-9M16 19V8M20 19v-5"/>`,
  match: `<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>`,
  decide: `<path d="M6 3.5v17M6 9.5c0 3 2 4.5 5 4.5h7.5M15.5 11l3 3-3 3"/>`,
  voice: `<path d="M4 10v4M8 6.5v11M12 3.5v17M16 7.5v9M20 10.5v3"/>`,
  airplane: `<path d="M21 15.6 13.6 11V5.4a1.6 1.6 0 0 0-3.2 0V11L3 15.6v1.8l7.4-2.3v4.1l-2 1.5v1.5l3.6-1 3.6 1v-1.5l-2-1.5v-4.1l7.4 2.3z"/>`,
  lock: `<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/><path d="M12 14.5v2.2"/>`,
  flame: `<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.8 3.3-5.7 4-9.4 2 1.3 3.1 3.3 3.1 5.1 1-.6 1.8-1.7 2-3.1 2 1.8 3.9 4.3 3.9 7.4 0 3.5-2.6 6.1-6.5 6.1z"/>`,
  check: `<path d="M5 12.5l4.4 4.4L19 7.4"/>`,
  steps: `<path d="M7.2 3.5c1.7 0 2.6 1.9 2.6 4.4 0 2-.7 3.3-.7 4.6H5.4c0-1.3-.8-2.4-.8-4.6 0-2.5.9-4.4 2.6-4.4zM5.4 15h3.7v1.4a1.85 1.85 0 0 1-3.7 0zM16.8 7.5c1.7 0 2.6 1.9 2.6 4.4 0 2.2-.8 3.3-.8 4.6h-3.7c0-1.3-.7-2.6-.7-4.6 0-2.5.9-4.4 2.6-4.4zM14.9 19h3.7v1.4a1.85 1.85 0 0 1-3.7 0z"/>`,
  book: `<path d="M3.5 5.5h6a2.5 2.5 0 0 1 2.5 2.5v11.5a2.2 2.2 0 0 0-2.2-2.2H3.5zM20.5 5.5h-6A2.5 2.5 0 0 0 12 8v11.5a2.2 2.2 0 0 1 2.2-2.2h6.3z"/>`,
  sparkle: `<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5z"/><path d="M18.5 15.5c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8z"/>`,
  pin: `<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>`,
  wifiOff: `<path d="M3 3l18 18M8.5 16.2a5 5 0 0 1 7 0M5.2 12.8a9.6 9.6 0 0 1 3.7-2.3M15 10.4a9.6 9.6 0 0 1 3.8 2.4M2 9.3a14.5 14.5 0 0 1 4.3-2.8M10.3 5.1A14.6 14.6 0 0 1 22 9.3"/><circle cx="12" cy="19.4" r=".9" fill="currentColor" stroke="none"/>`,
};

export const Icon: React.FC<{ name: keyof typeof ICON | string; size: number; color?: string; stroke?: number; style?: React.CSSProperties }> = ({
  name,
  size,
  color = "currentColor",
  stroke = 1.6,
  style,
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ color, flex: "none", ...style }}
    dangerouslySetInnerHTML={{ __html: ICON[name] ?? "" }}
  />
);

export const Mark: React.FC<{ size: number; color?: string; draw?: number; stroke?: number }> = ({ size, color = C.moss, draw = 1, stroke = 2.2 }) => (
  <svg
    viewBox="0 0 48 48"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none" }}
  >
    <g
      style={{ strokeDasharray: 140, strokeDashoffset: 140 * (1 - draw) }}
      dangerouslySetInnerHTML={{ __html: MARK_PATHS.replace(/<path /g, '<path pathLength="140" ') }}
    />
  </svg>
);

export const Emblem: React.FC<{ category: string; size: number; color?: string }> = ({ category, size, color = "currentColor" }) => (
  <svg
    viewBox="0 0 48 48"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: "none" }}
    dangerouslySetInnerHTML={{ __html: emblemPaths(category) }}
  />
);

export const Wordmark: React.FC<{ size: number; color?: string; markColor?: string }> = ({ size, color = C.ink, markColor = C.moss }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.35, fontFamily: DISPLAY, fontWeight: 600, fontSize: size, color, letterSpacing: "-0.01em" }}>
    <Mark size={size * 1.25} color={markColor} />
    <span>
      Voices <i style={{ fontWeight: 400, fontSize: "0.82em" }}>of the</i> Wild
    </span>
  </div>
);

// ---------------------------------------------------------------- phone
export type Shot = { key: keyof typeof assets.shots | string; at: number };
const shotSrc = (key: string): string | null => {
  const s = (assets.shots as Record<string, string | null>)[key];
  if (s) return s;
  const fallback = ["encounter", "cardNew", "home"].map((k) => (assets.shots as Record<string, string | null>)[k]).find(Boolean);
  return fallback ?? null;
};

export const phoneWidth = (h: number) => {
  const b = h * 0.016;
  return (h - 2 * b) * (780 / 1688) + 2 * b;
};

/**
 * A phone in the app's palette. Shows real footage for `slot` when showcase/footage/<file> exists,
 * otherwise crossfades through the given screenshots. `children` draw on top of the screen.
 */
export const Phone: React.FC<{
  cx: number;
  top: number;
  h: number;
  t: number;
  shots: Shot[];
  slot?: FootageSlot;
  slotStart?: number;
  rotate?: number;
  opacity?: number;
  scale?: number;
  children?: React.ReactNode;
  screenOverride?: React.ReactNode;
}> = ({ cx, top, h, t, shots, slot, slotStart = 0, rotate = 0, opacity = 1, scale = 1, children, screenOverride }) => {
  const { fps } = useVideoConfig();
  const b = h * 0.016;
  const w = phoneWidth(h);
  const r = w * 0.135;
  const footage = slot ? (assets.footage as Record<string, { src: string; duration: number } | null>)[slot] : null;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - w / 2,
        top,
        width: w,
        height: h,
        borderRadius: r,
        background: "#060a08",
        padding: b,
        boxShadow: `0 0 0 1.5px #2c3a33, 0 ${h * 0.05}px ${h * 0.09}px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)`,
        opacity,
        transform: `rotate(${rotate}deg) scale(${scale})`,
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: r - b, overflow: "hidden", background: C.paper }}>
        {footage ? (
          <Sequence from={Math.round(slotStart * fps)} layout="none">
            <OffthreadVideo
              src={staticFile(footage.src)}
              muted
              trimBefore={Math.round((FOOTAGE_SLOTS[slot!].startAt ?? 0) * fps)}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
            />
          </Sequence>
        ) : screenOverride ? (
          screenOverride
        ) : (
          shots.map((s, i) => {
            const src = shotSrc(s.key);
            if (!src) return null;
            const o = i === 0 ? 1 : ramp(t, s.at, 0.4, easeInOut);
            if (o <= 0) return null;
            return <Img key={i} src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", objectFit: "cover", objectPosition: "top", opacity: o }} />;
          })
        )}
        {children}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- cards
type CardLine = { owner: string; name: string; species: string | null; category: string; no: number; guardian: boolean };

/** The app's collectible card (light paper, gold foil for Elders). */
export const ElderCard: React.FC<{ line: CardLine; w: number; t: number; sheenAt?: number; style?: React.CSSProperties; tagNew?: boolean; photo?: string }> = ({
  line,
  photo,
  w,
  t,
  sheenAt = 0,
  style,
  tagNew = true,
}) => {
  const s = w / 380;
  const sheen = ramp(t, sheenAt, 1.6, easeInOut);
  const art = line.guardian ? sigilSvg(line.category, 120) : motifSvg(line.owner, line.category);
  return (
    <div
      style={{
        width: w,
        borderRadius: 14 * s,
        padding: 6 * s,
        background: `linear-gradient(135deg, ${"#c9a03c"}, ${"#f0d98f"} 38%, ${"#a77d1f"} 62%, ${"#f0d98f"} 86%, ${"#c9a03c"})`,
        boxShadow: `0 ${30 * s}px ${60 * s}px -${20 * s}px rgba(0,0,0,0.55)`,
        position: "relative",
        ...style,
      }}
    >
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 9 * s, background: C.paperRaised, border: `1px solid rgba(167,125,31,0.6)`, color: C.inkL }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${10 * s}px ${14 * s}px ${8 * s}px`, fontFamily: UI, fontWeight: 600, fontSize: 13 * s, color: C.ink2L }}>
          <span>No. {String(line.no).padStart(3, "0")}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 * s }}>
            <Emblem category={line.category} size={20 * s} />
            {CATEGORY_LABEL[line.category] ?? line.category}
          </span>
        </div>
        <div
          className="card-art"
          style={{ margin: `0 ${10 * s}px`, borderRadius: 8 * s, overflow: "hidden", aspectRatio: "240 / 150", background: C.paper, border: `1px solid ${C.ruleL}`, color: C.inkL, ["--pig" as string]: PIG[line.category] }}
          dangerouslySetInnerHTML={photo ? undefined : { __html: art }}
        >
          {photo ? <Img src={staticFile(photo)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
        </div>
        <div style={{ padding: `${12 * s}px ${16 * s}px ${16 * s}px` }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 34 * s, letterSpacing: "-0.015em", lineHeight: 1.05 }}>{line.name}</div>
          <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 18 * s, color: C.ink2L, marginTop: 2 * s }}>{line.species ?? ""}</div>
          <div style={{ display: "flex", gap: 6 * s, marginTop: 10 * s }}>
            {tagNew ? <Tag s={s} bg={C.mossSoftL} color={C.mossL} border={C.mossL} text="New in your field guide" /> : null}
            <Tag s={s} bg={C.goldSoftL} color={C.goldL} border="rgba(125,94,16,0.7)" text="Elder voice" />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)",
            backgroundSize: "260% 100%",
            backgroundPosition: `${120 - sheen * 160}% 0`,
            mixBlendMode: "soft-light",
            opacity: sheen > 0 && sheen < 1 ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
};

const Tag: React.FC<{ s: number; bg: string; color: string; border: string; text: string }> = ({ s, bg, color, border, text }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      minHeight: 28 * s,
      padding: `${2 * s}px ${10 * s}px`,
      borderRadius: 999,
      fontFamily: UI,
      fontWeight: 600,
      fontSize: 12.5 * s,
      border: `1px solid ${border}`,
      color,
      background: bg,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </span>
);

export const CATEGORY_LABEL: Record<string, string> = {
  trees: "Trees",
  birds: "Birds",
  animals: "Animals",
  "small-creatures": "Small creatures",
  flowers: "Flowers",
  plants: "Plants",
  "fruits-vegetables": "Fruit & veg",
  ground: "Ground",
  sky: "Sky",
  water: "Water",
  vehicles: "Vehicles",
  structures: "Structures",
  urban: "Street objects",
};

// ---------------------------------------------------------------- pills / chips
export const Chip: React.FC<{ icon?: string; text: React.ReactNode; size: number; color?: string; bg?: string; border?: string; style?: React.CSSProperties }> = ({
  icon,
  text,
  size,
  color = C.ink,
  bg = "rgba(21,32,27,0.92)",
  border = C.rule,
  style,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.45,
      padding: `${size * 0.42}px ${size * 0.8}px`,
      borderRadius: 999,
      background: bg,
      border: `1.5px solid ${border}`,
      fontFamily: UI,
      fontWeight: 600,
      fontSize: size,
      color,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {icon ? <Icon name={icon} size={size * 1.25} color={color} /> : null}
    {text}
  </div>
);

// ---------------------------------------------------------------- captions
export const Captions: React.FC<{ chunks: CaptionChunk[]; t: number; L: Layout; hidden?: boolean }> = ({ chunks, t, L, hidden }) => {
  if (hidden) return null;
  const c = chunks.find((x) => t >= x.start && t < x.end);
  if (!c) return null;
  const o = Math.min(ramp(t, c.start, 0.12), 1 - ramp(t, c.end - 0.1, 0.1));
  const size = by(L, 44, 50, 40);
  const cy = by(L, 985, 1590, 975);
  const maxW = by(L, 1500, 960, 980);
  const isLine = !!c.speaker;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: cy, display: "flex", justifyContent: "center", transform: "translateY(-50%)", opacity: o }}>
      <div
        style={{
          maxWidth: maxW,
          padding: `${size * 0.38}px ${size * 0.7}px ${size * 0.45}px`,
          borderRadius: size * 0.5,
          background: "rgba(8,13,11,0.84)",
          border: `1.5px solid ${isLine ? "rgba(228,192,104,0.35)" : "rgba(233,229,214,0.1)"}`,
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        {isLine ? (
          <div style={{ fontFamily: UI, fontWeight: 700, fontSize: size * 0.48, letterSpacing: "0.08em", textTransform: "uppercase", color: c.speakerNote?.includes("Kokoro") ? C.moss : C.gold, marginBottom: size * 0.14 }}>
            {c.speaker} <span style={{ opacity: 0.75, fontWeight: 600 }}>· {c.speakerNote}</span>
          </div>
        ) : null}
        <div style={{ fontFamily: UI, fontWeight: 600, fontSize: size, lineHeight: 1.28, color: "#f3efe2" }}>
          {c.words.map((w, i) => {
            const active = t >= w.start && t < (c.words[i + 1]?.start ?? c.end);
            return (
              <React.Fragment key={i}>
                <span
                  style={{
                    textDecoration: active ? "underline" : "none",
                    textDecorationColor: isLine ? C.gold : C.moss,
                    textDecorationThickness: size * 0.07,
                    textUnderlineOffset: size * 0.2,
                  }}
                >
                  {w.text}
                </span>
                {i < c.words.length - 1 ? " " : ""}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** Sound arcs from the logo, breathing while someone speaks. */
export const SoundArcs: React.FC<{ size: number; level: number; color?: string; style?: React.CSSProperties; flip?: boolean }> = ({ size, level, color = C.gold, style, flip }) => (
  <svg viewBox="0 0 40 60" width={size * 0.66} height={size} fill="none" stroke={color} strokeLinecap="round" style={{ transform: flip ? "scaleX(-1)" : undefined, ...style }}>
    {[0, 1, 2].map((i) => (
      <path
        key={i}
        d={`M${6 + i * 11} ${18 - i * 8}C${12 + i * 13} ${24 - i * 6} ${12 + i * 13} ${36 + i * 6} ${6 + i * 11} ${42 + i * 8}`}
        strokeWidth={2.4}
        opacity={Math.max(0.12, Math.min(1, level * 1.4 - i * 0.28))}
      />
    ))}
  </svg>
);

export const fadeUp = (p: number, dist = 26): React.CSSProperties => ({ opacity: p, transform: `translateY(${(1 - p) * dist}px)` });
