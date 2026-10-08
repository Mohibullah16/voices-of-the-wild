import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import { motifSvg } from "../../app/src/art/motif";
import { sigilSvg } from "../../app/src/art/sigil";
import assets from "./generated/assets.json";
import { by, C, DISPLAY, easeInOut, type Layout, MONO, PIG, ramp, UI, windowed } from "./theme";
import type { Timeline } from "./timeline";
import { Chip, ElderCard, Emblem, fadeUp, Icon, Mark, Phone, phoneWidth, SoundArcs, Wordmark } from "./ui";

export type SceneProps = { t: number; tl: Timeline; L: Layout; at: number; end: number };

const lines = assets.lines as unknown as Record<string, { owner: string; name: string; species: string | null; category: string; no: number; guardian: boolean; tagged: string; caption: string }>;
const M = assets.matches;
const R = assets.report;
const S = assets.stats;

/** Is anyone speaking in this audio event right now? 0..1, smoothed per word. */
const speaking = (tl: Timeline, key: string, t: number) => {
  const ev = tl.audio.find((a) => a.key === key);
  if (!ev) return 0;
  const w = ev.words.find((x) => t >= x.start - 0.05 && t <= x.end + 0.08);
  if (!w) return 0.15;
  const p = (t - w.start) / Math.max(0.08, w.end - w.start);
  return 0.55 + 0.45 * Math.sin(Math.min(1, Math.max(0, p)) * Math.PI);
};

const Headline: React.FC<{ words: { text: string; italic?: boolean; color?: string }[]; t: number; at: number; size: number; align?: "left" | "center"; width: number; stagger?: number }> = ({
  words,
  t,
  at,
  size,
  align = "left",
  width,
  stagger = 0.11,
}) => (
  <div style={{ width, fontFamily: DISPLAY, fontWeight: 600, fontSize: size, lineHeight: 1.04, letterSpacing: "-0.02em", color: C.ink, textAlign: align }}>
    {words.map((w, i) => {
      const p = ramp(t, at + i * stagger, 0.8);
      return (
        <React.Fragment key={i}>
          <span style={{ display: "inline-block", fontStyle: w.italic ? "italic" : "normal", fontWeight: w.italic ? 500 : 600, color: w.color ?? C.ink, ...fadeUp(p, size * 0.35) }}>{w.text}</span>{" "}
        </React.Fragment>
      );
    })}
  </div>
);

const Eyebrow: React.FC<{ text: string; size: number; color?: string; style?: React.CSSProperties }> = ({ text, size, color = C.moss, style }) => (
  <div style={{ fontFamily: UI, fontWeight: 700, fontSize: size, letterSpacing: "0.14em", textTransform: "uppercase", color, ...style }}>{text}</div>
);

/** Viewfinder on the phone before the photo: the neem's card motif behind corner brackets. */
const Viewfinder: React.FC<{ t: number; flashAt: number }> = ({ t, flashAt }) => {
  const flash = Math.min(ramp(t, flashAt - 0.05, 0.08), 1 - ramp(t, flashAt + 0.08, 0.3));
  const zoom = 1.08 - ramp(t, 0, 1.2) * 0.08;
  return (
    <AbsoluteFill style={{ background: "#16231c" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom * 1.6}) translateY(4%)`, color: "#a5cd90", opacity: 0.85, ["--pig" as string]: PIG.trees }} dangerouslySetInnerHTML={{ __html: motifSvg("neem-tree", "trees") }} />
      <AbsoluteFill style={{ background: "radial-gradient(70% 60% at 50% 45%, transparent 40%, rgba(0,0,0,0.55))" }} />
      {[
        [8, 22, "0 0"],
        [92, 22, "1 0"],
        [8, 74, "0 1"],
        [92, 74, "1 1"],
      ].map(([x, y, k], i) => {
        const [fx, fy] = (k as string).split(" ").map(Number);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: "13%",
              aspectRatio: "1",
              transform: `translate(${fx ? -100 : 0}%, ${fy ? -100 : 0}%)`,
              borderColor: "rgba(255,255,255,0.9)",
              borderStyle: "solid",
              borderWidth: 0,
              borderTopWidth: fy ? 0 : 4,
              borderBottomWidth: fy ? 4 : 0,
              borderLeftWidth: fx ? 0 : 4,
              borderRightWidth: fx ? 4 : 0,
              borderRadius: 6,
            }}
          />
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "9%", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "19%", aspectRatio: "1", borderRadius: "50%", border: "5px solid rgba(255,255,255,0.9)", display: "grid", placeItems: "center" }}>
          <div style={{ width: "78%", aspectRatio: "1", borderRadius: "50%", background: "#f6f3e9", transform: `scale(${1 - flash * 0.12})` }} />
        </div>
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
};

// ================================================================ 1. HOOK
export const Hook: React.FC<SceneProps> = ({ t, tl, L, at }) => {
  const m = tl.marks;
  const flashAt = at + 1.0;
  const ph = by(L, { cx: 1370, top: 50, h: 820 }, { cx: 540, top: 590, h: 830 }, { cx: 800, top: 56, h: 760 });
  const pw = phoneWidth(ph.h);
  const enter = ramp(t, at, 0.9);
  const level = speaking(tl, "neem", t);
  const head = by(
    L,
    { left: 150, top: 300, size: 112, width: 900, align: "left" as const },
    { left: 70, top: 285, size: 96, width: 940, align: "center" as const },
    { left: 64, top: 230, size: 70, width: 470, align: "left" as const },
  );
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: head.left, top: head.top }}>
        <Headline
          t={t}
          at={at + 0.2}
          size={head.size}
          width={head.width}
          align={head.align}
          words={[{ text: "This" }, { text: "neem" }, { text: "tree" }, { text: "just" }, { text: "talked", italic: true, color: C.gold }, { text: "to" }, { text: "me." }]}
        />
        {!L.portrait ? (
          <div style={{ marginTop: head.size * 0.45, ...fadeUp(ramp(t, m.hookName ?? at + 2, 0.8)) }}>
            <div style={{ fontFamily: UI, fontSize: by(L, 32, 30, 26), color: C.ink2, lineHeight: 1.45, maxWidth: head.width * 0.9 }}>
              Granny Neem, an Elder of the trees. Voiced with ElevenLabs Eleven v4, matched on the phone.
            </div>
          </div>
        ) : null}
      </div>
      <Phone
        cx={ph.cx}
        top={ph.top + (1 - enter) * 60}
        h={ph.h}
        t={t}
        opacity={enter}
        slot="hook"
        slotStart={at}
        shots={[{ key: "cardNew", at: flashAt + 0.05 }]}
        screenOverride={t < flashAt + 0.45 ? <Viewfinder t={t - at} flashAt={1.0} /> : undefined}
      />
      <SoundArcs size={by(L, 150, 120, 120)} level={t > m.hookVoice! ? level : 0} style={{ position: "absolute", left: ph.cx + pw / 2 + 24, top: ph.top + ph.h * 0.3 }} />
      {L.square ? null : <SoundArcs size={by(L, 150, 120, 120)} flip level={t > m.hookVoice! ? level : 0} style={{ position: "absolute", left: ph.cx - pw / 2 - 24 - by(L, 99, 79, 79), top: ph.top + ph.h * 0.3 }} />}
    </AbsoluteFill>
  );
};

// ================================================================ 2. IDEA
const STEPS = [
  { icon: "camera", title: "Snap", desc: "Point at something outside", mark: "ideaSnap" },
  { icon: "sparkle", title: "Match", desc: "Recognised on the phone", mark: "ideaMatch" },
  { icon: "voice", title: "Speak", desc: "It talks back, in its own voice", mark: "ideaSpeak" },
  { icon: "book", title: "Collect", desc: "It joins your field guide", mark: "ideaEnd" },
];

export const Idea: React.FC<SceneProps> = ({ t, tl, L, at }) => {
  const m = tl.marks;
  const ph = by(L, { cx: 1370, top: 50, h: 820 }, { cx: 540, top: 640, h: 790 }, { cx: 800, top: 56, h: 760 });
  const enter = ramp(t, at, 0.8);
  const stepAt = (k: string) => (k === "ideaEnd" ? m.ideaEnd! - 0.5 : m[k]!);
  const active = STEPS.reduce((acc, s, i) => (t >= stepAt(s.mark) ? i : acc), -1);
  if (L.portrait) {
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", top: 290, left: 0, right: 0, display: "flex", justifyContent: "center", ...fadeUp(enter) }}>
          <Wordmark size={58} />
        </div>
        <div style={{ position: "absolute", top: 410, left: 60, right: 60, display: "flex", justifyContent: "space-between" }}>
          {STEPS.map((s, i) => {
            const p = ramp(t, stepAt(s.mark), 0.6);
            const on = i === active;
            return (
              <div key={s.title} style={{ width: 222, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, ...fadeUp(p, 20) }}>
                <div style={{ width: 104, height: 104, borderRadius: "50%", display: "grid", placeItems: "center", border: `2.5px solid ${on ? C.gold : C.ruleStrong}`, background: on ? C.goldSoft : C.raised }}>
                  {s.icon === "voice" ? <Mark size={58} color={on ? C.gold : C.moss} /> : <Icon name={s.icon} size={52} color={on ? C.gold : C.moss} />}
                </div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 44, color: on ? C.gold : C.ink }}>{s.title}</div>
              </div>
            );
          })}
        </div>
        <Phone cx={ph.cx} top={ph.top + (1 - enter) * 50} h={ph.h} t={t} opacity={enter} slot="capture" slotStart={at} shots={[{ key: "home", at }, { key: "encounter", at: m.ideaMatch! + 0.6 }]} />
      </AbsoluteFill>
    );
  }
  const col = by(L, { left: 150, top: 150, title: 66, desc: 32, gap: 162, icon: 112 }, { left: 0, top: 0, title: 0, desc: 0, gap: 0, icon: 0 }, { left: 64, top: 120, title: 50, desc: 25, gap: 150, icon: 92 });
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: col.left, top: col.top - 40, ...fadeUp(enter) }}>
        <Wordmark size={by(L, 50, 50, 40)} />
      </div>
      {STEPS.map((s, i) => {
        const p = ramp(t, stepAt(s.mark), 0.7);
        const on = i === active;
        return (
          <div key={s.title} style={{ position: "absolute", left: col.left, top: col.top + 90 + i * col.gap, display: "flex", alignItems: "center", gap: col.icon * 0.32, ...fadeUp(p, 24) }}>
            <div style={{ width: col.icon, height: col.icon, borderRadius: "50%", display: "grid", placeItems: "center", border: `2.5px solid ${on ? C.gold : C.ruleStrong}`, background: on ? C.goldSoft : C.raised }}>
              {s.icon === "voice" ? <Mark size={col.icon * 0.56} color={on ? C.gold : C.moss} /> : <Icon name={s.icon} size={col.icon * 0.5} color={on ? C.gold : C.moss} />}
            </div>
            <div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: col.title, color: on ? C.gold : C.ink, lineHeight: 1 }}>{s.title}</div>
              <div style={{ fontFamily: UI, fontSize: col.desc, color: C.ink2, marginTop: 6 }}>{s.desc}</div>
            </div>
          </div>
        );
      })}
      <Phone cx={ph.cx} top={ph.top + (1 - enter) * 50} h={ph.h} t={t} opacity={enter} slot="capture" slotStart={at} shots={[{ key: "home", at }, { key: "encounter", at: m.ideaMatch! + 0.6 }]} />
    </AbsoluteFill>
  );
};

// ================================================================ 3. GAME
export const Game: React.FC<SceneProps> = ({ t, tl, L, at }) => {
  const m = tl.marks;
  const long = tl.cut === "long";
  const card = long ? lines.grass! : lines.neem!;
  const enter = ramp(t, at, 0.8);
  const ph = by(L, { cx: 640, top: 130, h: 790 }, { cx: 300, top: 560, h: 780 }, { cx: 285, top: 150, h: 700 });
  const cardBox = by(L, { cx: 1330, top: 250, w: 470 }, { cx: 790, top: 700, w: 440 }, { cx: 775, top: 250, w: 420 });
  const cardIn = ramp(t, m.gameElders! - 0.2, 0.9);
  const chips = [
    { icon: "check", text: "3–5 quests a day", at: m.gameQuests! },
    { icon: "steps", text: "Walk steps to unlock", at: m.gameWalk! },
    { icon: "sparkle", text: "Rare gold Elders", at: m.gameElders!, gold: true },
  ];
  const chipSize = by(L, 34, 34, 28);
  const grassDone = ramp(t, m.grassDone!, 0.6);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          top: by(L, 60, 300, 52),
          left: by(L, 0, 0, 0),
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: chipSize * 0.6,
          flexWrap: "wrap",
          padding: L.portrait ? "0 40px" : 0,
        }}
      >
        {chips.map((c) => (
          <div key={c.text} style={fadeUp(ramp(t, c.at - 0.1, 0.6), 18)}>
            <Chip icon={c.icon} text={c.text} size={chipSize} color={c.gold ? C.gold : C.ink} border={c.gold ? "rgba(228,192,104,0.55)" : C.rule} bg={c.gold ? C.goldSoft : "rgba(21,32,27,0.92)"} />
          </div>
        ))}
      </div>
      <Phone cx={ph.cx} top={ph.top + (1 - enter) * 50} h={ph.h} t={t} opacity={enter} slot="trail" slotStart={at} shots={[{ key: "home", at }]} />
      <div style={{ position: "absolute", left: cardBox.cx - cardBox.w / 2, top: cardBox.top, transform: `rotate(${3 - cardIn * 1}deg) translateY(${(1 - cardIn) * 80}px)`, opacity: cardIn }}>
        <ElderCard line={card} w={cardBox.w} t={t} sheenAt={m.gameElders! + 0.5} photo={long ? "photos/lawn-grass.jpg" : "photos/neem-tree.jpg"} />
        {long ? (
          <div style={{ position: "absolute", left: "50%", bottom: -by(L, 92, 92, 80), transform: `translateX(-50%) scale(${0.9 + grassDone * 0.1})`, opacity: grassDone }}>
            <Chip
              text={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <Emblem category="plants" size={chipSize * 1.2} color={C.moss} /> Touch grass <Icon name="check" size={chipSize * 1.1} color={C.moss} stroke={2.4} />
                </span>
              }
              size={chipSize}
              color={C.ink}
              border="rgba(165,205,144,0.55)"
              bg={C.mossSoft}
            />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ================================================================ 4. STACK
const NODES = [
  { id: "photo", icon: "photo", label: "Photo", mark: "stPhoto" },
  { id: "gemma", icon: "chip", label: "Gemma", mark: "stGemma" },
  { id: "vector", icon: "vector", label: "768-d", mark: "stVector" },
  { id: "match", icon: "match", label: "Match", mark: "stMatch" },
  { id: "decide", icon: "decide", label: "Decide", mark: "stDecide" },
  { id: "voice", icon: "voice", label: "Voice", mark: "stVoice" },
  { id: "offline", icon: "airplane", label: "Offline", mark: "stOffline" },
];

export const Stack: React.FC<SceneProps> = ({ t, tl, L, at, end }) => {
  const m = tl.marks;
  const rail = by(L, { y: 112, x0: 230, x1: 1690, r: 38, label: 24 }, { y: 330, x0: 110, x1: 970, r: 40, label: 24 }, { y: 92, x0: 95, x1: 985, r: 32, label: 20 });
  const railIn = ramp(t, m.stackIn!, 0.7);
  const times = NODES.map((n) => m[n.mark]!);
  const active = times.reduce((acc, tt, i) => (t >= tt ? i : acc), -1);
  const step = (rail.x1 - rail.x0) / (NODES.length - 1);
  const fill = interpolate(t, times, times.map((_, i) => i / (NODES.length - 1)), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const panel = by(L, { x: 160, y: 250, w: 1600, h: 640 }, { x: 60, y: 470, w: 960, h: 960 }, { x: 60, y: 175, w: 960, h: 680 });
  const until = (i: number) => (i + 1 < times.length ? times[i + 1]! : end);
  const guardianDemo = tl.cut === "long" && m.hintVoice !== undefined;
  return (
    <AbsoluteFill>
      {/* rail */}
      <div style={{ opacity: railIn }}>
        <div style={{ position: "absolute", left: rail.x0, top: rail.y - 1.5, width: rail.x1 - rail.x0, height: 3, background: C.rule, borderRadius: 2 }} />
        <div style={{ position: "absolute", left: rail.x0, top: rail.y - 1.5, width: (rail.x1 - rail.x0) * Math.max(0, fill), height: 3, background: C.moss, borderRadius: 2 }} />
        {NODES.map((n, i) => {
          const p = ramp(t, times[i]! - 0.15, 0.5);
          const on = i === active;
          const done = i < active;
          const col = on ? C.gold : done ? C.moss : C.ink3;
          return (
            <div key={n.id} style={{ position: "absolute", left: rail.x0 + i * step - rail.r, top: rail.y - rail.r, width: rail.r * 2, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: rail.r * 2,
                  height: rail.r * 2,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  background: on ? C.goldSoft : C.raised,
                  border: `2.5px solid ${on ? C.gold : done ? C.moss : C.rule}`,
                  transform: `scale(${1 + (on ? 0.12 : 0) * p})`,
                  boxShadow: on ? `0 0 ${rail.r}px rgba(228,192,104,0.25)` : "none",
                }}
              >
                <Icon name={n.icon} size={rail.r * 1.05} color={p > 0 ? col : C.ruleStrong} />
              </div>
              <div style={{ marginTop: 10, fontFamily: UI, fontWeight: 700, fontSize: rail.label, color: p > 0 ? col : C.ruleStrong, whiteSpace: "nowrap" }}>{n.label}</div>
            </div>
          );
        })}
      </div>
      {/* panels */}
      <div style={{ position: "absolute", left: panel.x, top: panel.y, width: panel.w, height: panel.h }}>
        <Panel o={windowed(t, times[0]!, until(0))}>
          <PhotoPanel L={L} t={t} at={times[0]!} />
        </Panel>
        <Panel o={windowed(t, times[1]!, until(1))}>
          <GemmaPanel L={L} t={t} at={times[1]!} browserAt={m.stBrowser!} />
        </Panel>
        <Panel o={windowed(t, times[2]!, until(2))}>
          <VectorPanel L={L} t={t} at={times[2]!} w={panel.w} />
        </Panel>
        <Panel o={windowed(t, times[3]!, until(3))}>
          <MatchPanel L={L} t={t} at={times[3]!} w={panel.w} />
        </Panel>
        <Panel o={windowed(t, times[4]!, guardianDemo ? m.hintVoice! + 2.6 : until(4))}>
          <DecidePanel L={L} t={t} at={times[4]!} guardianAt={m.stGuardian!} />
        </Panel>
        {guardianDemo ? (
          <Panel o={windowed(t, m.hintVoice! + 2.6, until(4))}>
            <GuardianDemo L={L} t={t} at={m.hintVoice! + 2.6} tl={tl} />
          </Panel>
        ) : null}
        <Panel o={windowed(t, times[5]!, until(5))}>
          <VoicePanel L={L} t={t} at={times[5]!} kokoroAt={m.stKokoro!} />
        </Panel>
        <Panel o={windowed(t, times[6]!, end + 1)}>
          <OfflinePanel L={L} t={t} at={times[6]!} photosAt={m.stPhotos!} />
        </Panel>
      </div>
    </AbsoluteFill>
  );
};

const Panel: React.FC<{ o: number; children: React.ReactNode }> = ({ o, children }) =>
  o <= 0.001 ? null : <div style={{ position: "absolute", inset: 0, opacity: o, transform: `translateY(${(1 - o) * 18}px)` }}>{children}</div>;

const PanelTitle: React.FC<{ L: Layout; t: number; at: number; title: React.ReactNode; sub?: React.ReactNode; align?: "left" | "center" }> = ({ L, t, at, title, sub, align = "left" }) => (
  <div style={{ textAlign: align }}>
    <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: by(L, 84, 78, 64), lineHeight: 1.02, letterSpacing: "-0.02em", color: C.ink, ...fadeUp(ramp(t, at, 0.7)) }}>{title}</div>
    {sub ? <div style={{ fontFamily: UI, fontSize: by(L, 32, 32, 26), color: C.ink2, marginTop: 14, lineHeight: 1.4, ...fadeUp(ramp(t, at + 0.15, 0.7)) }}>{sub}</div> : null}
  </div>
);

const PhotoPanel: React.FC<{ L: Layout; t: number; at: number }> = ({ L, t, at }) => {
  const tile = by(L, 520, 620, 420);
  const tileEl = (
    <div style={{ width: tile, height: tile * 0.75, borderRadius: 28, overflow: "hidden", position: "relative", border: `2px solid ${C.rule}`, ...fadeUp(ramp(t, at, 0.8)) }}>
      <AbsoluteFill style={{ background: "#16231c", color: C.moss, transform: "scale(1.5)", ["--pig" as string]: PIG.trees }} dangerouslySetInnerHTML={{ __html: motifSvg("neem-tree", "trees") }} />
      <div style={{ position: "absolute", left: 18, bottom: 16 }}>
        <Chip icon="camera" text="photo.jpg · on this phone" size={by(L, 22, 24, 18)} />
      </div>
    </div>
  );
  const text = (
    <PanelTitle
      L={L}
      t={t}
      at={at + 0.1}
      align={L.portrait ? "center" : "left"}
      title={<>Your photo</>}
      sub={
        <>
          Decoded and shrunk in the browser.
          <br />
          Never uploaded. Kept on your phone only.
        </>
      }
    />
  );
  return L.portrait ? (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 50, paddingTop: 40 }}>
      {tileEl}
      {text}
    </div>
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: by(L, 90, 0, 50), height: "100%" }}>
      {tileEl}
      {text}
    </div>
  );
};

const GemmaPanel: React.FC<{ L: Layout; t: number; at: number; browserAt: number }> = ({ L, t, at, browserAt }) => {
  const chips = [
    { icon: "lock", text: "Open weights · Apache 2.0", at: at + 0.6 },
    { icon: "photo", text: "Multimodal: text + images, one space", at: at + 1.2 },
    { icon: "chip", text: "Transformers.js + WebGPU", at: browserAt - 0.8 },
    { icon: "sparkle", text: "q4 · runs in the browser", at: browserAt },
  ];
  const size = by(L, 32, 32, 25);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: L.portrait ? "center" : "flex-start", gap: by(L, 40, 50, 30), paddingTop: by(L, 40, 70, 20) }}>
      <Eyebrow text="Google DeepMind · released Sep 2026" size={by(L, 24, 24, 20)} style={fadeUp(ramp(t, at, 0.6))} />
      <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: by(L, 130, 104, 96), lineHeight: 0.95, letterSpacing: "-0.03em", color: C.ink, textAlign: L.portrait ? "center" : "left", ...fadeUp(ramp(t, at + 0.05, 0.8)) }}>
        Embedding<span style={{ color: C.gold }}>Gemma 2</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: size * 0.6, justifyContent: L.portrait ? "center" : "flex-start", maxWidth: by(L, 1500, 960, 960) }}>
        {chips.map((c) => (
          <div key={c.text} style={fadeUp(ramp(t, c.at, 0.6), 16)}>
            <Chip icon={c.icon} text={c.text} size={size} />
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: by(L, 24, 24, 20), color: C.ink3, ...fadeUp(ramp(t, at + 1.6, 0.6)) }}>{S.modelId} · {S.dtype}</div>
    </div>
  );
};

const VectorPanel: React.FC<{ L: Layout; t: number; at: number; w: number }> = ({ L, t, at, w }) => {
  const v = M.named.vector as number[];
  const n = L.wide ? v.length : v.length / 2;
  const vals = L.wide ? v : Array.from({ length: n }, (_, i) => (v[2 * i]! + v[2 * i + 1]!) / 2);
  const max = Math.max(...vals.map(Math.abs));
  const bw = w / n;
  const hh = by(L, 170, 230, 150);
  const sweep = ramp(t, at + 0.2, 1.4, easeInOut);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: L.portrait ? "center" : "flex-start", gap: by(L, 36, 50, 26), paddingTop: by(L, 20, 60, 0) }}>
      <PanelTitle L={L} t={t} at={at} align={L.portrait ? "center" : "left"} title={<>768 numbers</>} sub="One photo becomes one vector. This is the real one for a neem tree." />
      <svg width={w} height={hh * 2} style={{ overflow: "visible" }}>
        <line x1={0} x2={w} y1={hh} y2={hh} stroke={C.rule} strokeWidth={1.5} />
        {vals.map((x, i) => {
          const p = Math.min(1, Math.max(0, sweep * 1.25 - (i / n) * 0.25));
          const h = Math.sign(x) * Math.sqrt(Math.abs(x) / max) * hh * 0.95 * p;
          return <rect key={i} x={i * bw} width={Math.max(1, bw * 0.62)} y={h > 0 ? hh - h : hh} height={Math.abs(h)} fill={x > 0 ? C.moss : C.gold} opacity={0.9} />;
        })}
      </svg>
      <div style={{ fontFamily: MONO, fontSize: by(L, 26, 26, 21), color: C.ink2, ...fadeUp(ramp(t, at + 1.2, 0.6)) }}>
        [{v.slice(0, L.wide ? 6 : 4).map((x) => x.toFixed(4)).join(", ")}, … ] · 768-d
      </div>
    </div>
  );
};

const MatchPanel: React.FC<{ L: Layout; t: number; at: number; w: number }> = ({ L, t, at, w }) => {
  const top = M.named.top;
  const lo = 0.6,
    hi = 0.8;
  const barW = by(L, 820, 520, 470);
  const nameW = by(L, 420, 300, 300);
  const fs = by(L, 34, 32, 26);
  const thr = M.named.speciesThreshold as number;
  const x = (s: number) => ((s - lo) / (hi - lo)) * barW;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: L.portrait ? "center" : "flex-start", gap: by(L, 34, 50, 22), paddingTop: by(L, 0, 40, 0) }}>
      <PanelTitle
        L={L}
        t={t}
        at={at}
        align={L.portrait ? "center" : "left"}
        title={<>Cosine match</>}
        sub={`Against ${S.rows} descriptions of ${S.owners} characters, embedded ahead of time. Real scores for a real neem photo.`}
      />
      <div style={{ position: "relative", paddingTop: 34 }}>
        <div style={{ position: "absolute", left: nameW + x(thr), top: 0, bottom: -12, borderLeft: `2px dashed ${C.gold}`, opacity: ramp(t, at + 1.4, 0.5) }}>
          <div style={{ position: "absolute", top: -6, left: 10, fontFamily: UI, fontWeight: 700, fontSize: fs * 0.62, color: C.gold, whiteSpace: "nowrap" }}>trees threshold {thr.toFixed(3)}</div>
        </div>
        {top.map((o, i) => {
          const p = ramp(t, at + 0.4 + i * 0.16, 0.7);
          const win = i === 0;
          return (
            <div key={o.id} style={{ display: "flex", alignItems: "center", height: fs * 1.9, ...fadeUp(p, 12) }}>
              <div style={{ width: nameW, fontFamily: UI, fontWeight: win ? 700 : 600, fontSize: fs, color: win ? C.gold : C.ink2, whiteSpace: "nowrap", overflow: "hidden" }}>
                {o.name}
                {o.guardian ? <span style={{ fontWeight: 400, fontSize: fs * 0.7, color: C.ink3 }}> guardian</span> : null}
              </div>
              <div style={{ width: barW, height: fs * 0.62, background: C.raised, borderRadius: 99, position: "relative" }}>
                <div style={{ width: x(o.score) * p, height: "100%", background: win ? C.gold : C.ruleStrong, borderRadius: 99 }} />
              </div>
              <div style={{ width: 120, textAlign: "right", fontFamily: MONO, fontSize: fs * 0.9, color: win ? C.gold : C.ink2 }}>{o.score.toFixed(3)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const DecidePanel: React.FC<{ L: Layout; t: number; at: number; guardianAt: number }> = ({ L, t, at, guardianAt }) => {
  const named = M.named,
    g = M.guardian,
    nb = M.nobody;
  const cols = [
    {
      head: "Sure",
      outcome: "It speaks",
      color: C.moss,
      icon: "voice",
      ex: `Neem photo → ${named.ownerName}, ${named.s1!.score.toFixed(3)}. Clears ${named.speciesThreshold!.toFixed(3)} by a wide margin.`,
      at: at + 0.2,
    },
    {
      head: "Not sure",
      outcome: "A guardian asks for a closer look",
      color: C.gold,
      icon: "match",
      ex: `Hibiscus photo → ${g.s1!.name} ${g.s1!.score.toFixed(3)} vs ${g.s2!.name} ${g.s2!.score.toFixed(3)}. Too close to call, so ${g.ownerName} asks.`,
      at: guardianAt - 0.7,
    },
    {
      head: "Nothing",
      outcome: "“Nobody wants to talk”",
      color: C.ink3,
      icon: "wifiOff",
      ex: `Indoor photo → best ${nb.categoryScore.toFixed(3)}, under the ${nb.categoryThreshold.toFixed(3)} floor.`,
      at: guardianAt + 0.1,
    },
  ];
  const fs = by(L, 30, 30, 23);
  const focus = ramp(t, guardianAt, 0.6);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: by(L, 36, 44, 22), alignItems: L.portrait ? "center" : "flex-start" }}>
      <PanelTitle L={L} t={t} at={at} align={L.portrait ? "center" : "left"} title={<>Category, then character</>} sub="Thresholds were calibrated on real photos. A wrong name costs the most." />
      <div style={{ display: "flex", flexDirection: L.portrait ? "column" : "row", gap: by(L, 28, 22, 18), width: "100%" }}>
        {cols.map((c, i) => {
          const p = ramp(t, c.at, 0.7);
          const hl = i === 1 ? focus : 0;
          return (
            <div
              key={c.head}
              style={{
                flex: 1,
                padding: by(L, 30, 28, 20),
                borderRadius: 22,
                background: hl > 0.5 ? C.goldSoft : C.raised,
                border: `2px solid ${hl > 0.5 ? "rgba(228,192,104,0.7)" : C.rule}`,
                transform: `scale(${1 + hl * 0.03})`,
                ...fadeUp(p, 20),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Icon name={c.icon} size={fs * 1.4} color={c.color} />
                <Eyebrow text={c.head} size={fs * 0.72} color={c.color} />
              </div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: fs * 1.45, color: C.ink, marginTop: 10, lineHeight: 1.1 }}>{c.outcome}</div>
              <div style={{ fontFamily: UI, fontSize: fs * 0.8, color: C.ink2, marginTop: 12, lineHeight: 1.4 }}>{c.ex}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const GuardianDemo: React.FC<{ L: Layout; t: number; at: number; tl: Timeline }> = ({ L, t, at, tl }) => {
  const ph = by(L, { cx: 1180, top: -30, h: 700 }, { cx: 540, top: 20, h: 900 }, { cx: 680, top: -10, h: 640 });
  const sw = phoneWidth(ph.h) - 2 * ph.h * 0.016;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: by(L, 120, 0, 120), width: by(L, 700, 960, 400) }}>
        {!L.portrait ? (
          <PanelTitle L={L} t={t} at={at} title={<>Old Corner</>} sub={<>Guardian of street objects. When the match isn't sure, a guardian asks for a better photo. Voiced by Kokoro.</>} />
        ) : null}
      </div>
      <Phone
        cx={ph.cx}
        top={ph.top}
        h={ph.h}
        t={t}
        slot="guardian"
        slotStart={at}
        shots={[]}
        opacity={ramp(t, at, 0.6)}
        screenOverride={<GuardianScreen t={t} tl={tl} scale={sw / 390} />}
      />
    </AbsoluteFill>
  );
};

/** The app's guardian-hint screen, drawn with the app's own sigil and tokens, captions synced to the real line. */
const GuardianScreen: React.FC<{ t: number; tl: Timeline; scale: number }> = ({ t, tl, scale }) => {
  const ev = tl.audio.find((a) => a.key === "guardianHint");
  const g = lines.guardianHint!;
  const words = ev?.words ?? [];
  const elapsed = ev ? Math.max(0, Math.min(ev.dur, t - ev.at)) : 0;
  const bars = Array.from({ length: 34 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));
  const played = ev ? elapsed / ev.dur : 0;
  return (
    <div style={{ width: 390, height: 844, transform: `scale(${scale})`, transformOrigin: "0 0", background: C.paper, color: C.inkL, fontFamily: UI }}>
      <div style={{ height: 60, display: "flex", alignItems: "center", padding: "0 18px", borderBottom: `1px solid ${C.ruleL}` }}>
        <Wordmark size={19} color={C.inkL} markColor={C.mossL} />
      </div>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, padding: "12px 14px", borderRadius: 14, background: C.paperRaised, border: `1px solid ${C.ruleL}` }}>
          <Icon name="match" size={22} color={C.ink2L} />
          <div style={{ fontSize: 14, lineHeight: 1.4 }}>
            <b>Not sure who this is yet.</b>
            <br />
            The guardian of street objects has a tip for your next photo.
          </div>
        </div>
        <div style={{ borderRadius: 14, padding: 6, background: C.paperSunk }}>
          <div style={{ borderRadius: 9, background: C.paperRaised, border: `1px solid ${C.ruleL}`, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px 7px", fontSize: 12, fontWeight: 600, color: C.ink2L }}>
              <span>No. {String(g.no).padStart(3, "0")}</span>
              <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                <Emblem category="urban" size={17} /> Street objects
              </span>
            </div>
            <div
              className="card-art"
              style={{ margin: "0 10px", borderRadius: 8, aspectRatio: "240 / 150", background: `radial-gradient(circle at 50% 55%, #dfe0dc 0%, ${C.paper} 70%)`, border: `1px solid ${C.ruleL}`, color: C.inkL, overflow: "hidden" }}
              dangerouslySetInnerHTML={{ __html: sigilSvg("urban", 120) }}
            />
            <div style={{ padding: "10px 14px 14px" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 27, lineHeight: 1.05 }}>{g.name}</div>
              <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 16, color: C.ink2L }}>Guardian of street objects</div>
              <div style={{ display: "inline-flex", marginTop: 8, padding: "2px 10px", minHeight: 24, alignItems: "center", borderRadius: 99, border: `1px solid #857e69`, fontSize: 12, fontWeight: 600, color: C.ink2L }}>Guardian</div>
            </div>
          </div>
        </div>
        <div style={{ borderRadius: 18, background: C.paperRaised, border: `1px solid ${C.ruleL}`, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: C.ink2L }}>
            <span>{g.name}</span>
            <span>A tip</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.inkL, display: "grid", placeItems: "center", flex: "none" }}>
              <div style={{ display: "flex", gap: 4 }}>
                <div style={{ width: 4, height: 14, background: C.paper, borderRadius: 1 }} />
                <div style={{ width: 4, height: 14, background: C.paper, borderRadius: 1 }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2.5, height: 34, flex: 1 }}>
              {bars.map((b, i) => (
                <div key={i} style={{ width: 3, height: 34 * b, borderRadius: 2, background: i / bars.length < played ? C.mossL : "#b8b19c" }} />
              ))}
            </div>
          </div>
          <div style={{ fontSize: 15.5, lineHeight: 1.45 }}>
            {words.map((w, i) => {
              const active = t >= w.start && t < (words[i + 1]?.start ?? w.end + 0.3);
              return (
                <React.Fragment key={i}>
                  <span style={{ textDecoration: active ? "underline" : "none", textDecorationColor: C.mossL, textDecorationThickness: 2, textUnderlineOffset: 4 }}>{w.text}</span>{" "}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const VoicePanel: React.FC<{ L: Layout; t: number; at: number; kokoroAt: number }> = ({ L, t, at, kokoroAt }) => {
  const neem = lines.neem!;
  const fs = by(L, 30, 30, 23);
  const tagged = neem.tagged.replace(/(\[[^\]]+\])/g, "§$1§").split("§");
  const kokoroLine = (lines.guardianHint ?? lines.grass)!.caption;
  const cards = [
    {
      title: "Eleven v4",
      by: "ElevenLabs",
      who: `${S.elders} Elders · ${S.elevenLines} lines`,
      color: C.gold,
      bg: C.goldSoft,
      border: "rgba(228,192,104,0.55)",
      quote: (
        <>
          {tagged.map((s, i) =>
            s.startsWith("[") ? (
              <span key={i} style={{ color: C.gold, fontWeight: 700 }}>
                {s}
              </span>
            ) : (
              <span key={i}>{s}</span>
            ),
          )}
        </>
      ),
      at: at + 0.3,
    },
    {
      title: "Kokoro-82M",
      by: "open source · Apache 2.0",
      who: `Guardians and the rest · ${S.kokoroLines} lines`,
      color: C.moss,
      bg: C.mossSoft,
      border: "rgba(165,205,144,0.5)",
      quote: <>{kokoroLine.length > 90 ? kokoroLine.slice(0, kokoroLine.indexOf(".", 20) + 1) : kokoroLine}</>,
      at: kokoroAt,
    },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: by(L, 34, 44, 22), alignItems: L.portrait ? "center" : "flex-start" }}>
      <PanelTitle L={L} t={t} at={at} align={L.portrait ? "center" : "left"} title={<>Every voice, pre-recorded</>} sub="Generated once at build time and shipped as MP3s. Never called from the app." />
      <div style={{ display: "flex", flexDirection: L.portrait ? "column" : "row", gap: by(L, 30, 26, 18), width: "100%" }}>
        {cards.map((c) => (
          <div key={c.title} style={{ flex: 1, padding: by(L, 34, 32, 22), borderRadius: 22, background: c.bg, border: `2px solid ${c.border}`, ...fadeUp(ramp(t, c.at, 0.7), 20) }}>
            <div style={{ display: "flex", flexDirection: L.wide ? "row" : "column", alignItems: L.wide ? "baseline" : "flex-start", justifyContent: "space-between", gap: L.wide ? 16 : 2 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: fs * 1.9, color: c.color }}>{c.title}</div>
              <div style={{ fontFamily: UI, fontWeight: 600, fontSize: fs * 0.75, color: C.ink2, whiteSpace: "nowrap" }}>{c.by}</div>
            </div>
            <div style={{ fontFamily: UI, fontWeight: 700, fontSize: fs * 0.85, color: C.ink, marginTop: 6 }}>{c.who}</div>
            <div style={{ fontFamily: MONO, fontSize: fs * 0.78, color: C.ink2, marginTop: 16, lineHeight: 1.45 }}>{c.quote}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const OfflinePanel: React.FC<{ L: Layout; t: number; at: number; photosAt: number }> = ({ L, t, at, photosAt }) => {
  const ph = by(L, { cx: 1320, top: -40, h: 700 }, { cx: 540, top: 430, h: 560 }, { cx: 740, top: -20, h: 620 });
  const fs = by(L, 40, 40, 30);
  const rows = [
    { icon: "airplane", text: "After setup: zero network requests", at: at + 0.1, color: C.moss },
    { icon: "lock", text: "Photos never leave the phone", at: photosAt - 0.1, color: C.gold },
  ];
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: L.portrait ? 0 : undefined, top: by(L, 120, 0, 130), width: by(L, 820, 960, 470), display: "flex", flexDirection: "column", gap: by(L, 34, 26, 24), alignItems: L.portrait ? "center" : "flex-start" }}>
        {rows.map((r) => (
          <div key={r.text} style={{ display: "flex", alignItems: "center", gap: fs * 0.6, ...fadeUp(ramp(t, r.at, 0.7)) }}>
            <div style={{ width: fs * 2.2, height: fs * 2.2, borderRadius: "50%", display: "grid", placeItems: "center", background: C.raised, border: `2px solid ${r.color}`, flex: "none" }}>
              <Icon name={r.icon} size={fs * 1.15} color={r.color} />
            </div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: fs * 1.25, color: C.ink, lineHeight: 1.08 }}>{r.text}</div>
          </div>
        ))}
        <div style={{ fontFamily: UI, fontSize: fs * 0.66, color: C.ink2, lineHeight: 1.45, maxWidth: by(L, 760, 900, 440), textAlign: L.portrait ? "center" : "left", ...fadeUp(ramp(t, at + 1.0, 0.7)) }}>
          Model, descriptions, voices and fonts are cached on the first run. Then airplane mode is fine.
        </div>
      </div>
      <Phone cx={ph.cx} top={ph.top} h={ph.h} t={t} slot="offline" slotStart={at} shots={[{ key: "ready", at }, { key: "offline", at: at + 2.6 }]} opacity={ramp(t, at + 0.2, 0.7)} />
    </AbsoluteFill>
  );
};

// ================================================================ 5. PROOF
export const Proof: React.FC<SceneProps> = ({ t, tl, L, at }) => {
  const m = tl.marks;
  const long = tl.cut === "long";
  const tiles = [
    { value: R.top1, fmt: (v: number) => `${v.toFixed(1)}%`, label: "right character ranked first", sub: `${R.photos} real photos · ${R.charactersCovered} characters`, at: long ? m.proofStart! + 0.3 : m.proofTop1! - 0.4, gold: true },
    { value: R.precisionNamed, fmt: (v: number) => `${v.toFixed(1)}%`, label: "right when it names someone", sub: "cross-validated", at: m.proofPrecision! - 0.2, gold: true },
    { value: R.negativesNobody, fmt: (v: number) => `${Math.round(v)} / ${R.negatives}`, label: "indoor photos got “nobody wants to talk”", sub: `${R.negativesNamed} were given a name`, at: long ? m.proofStart! + 1.7 : m.proofPrecision! + 0.4 },
    ...(long
      ? [{ value: R.wrongWithFallback, fmt: (v: number) => `${R.wrongNoFallback}% → ${v.toFixed(1)}%`, label: "wrong names, halved by the guardian fallback", sub: "cross-validated", at: m.proofStart! + 3.1 }]
      : []),
  ].sort((a, b) => a.at - b.at);
  const grid = by(L, { x: 130, y: 210, w: 1660, cols: 4 }, { x: 70, y: 400, w: 940, cols: 2 }, { x: 60, y: 170, w: 960, cols: long ? 2 : 3 });
  const tileW = (grid.w - (grid.cols - 1) * 26) / grid.cols;
  const big = by(L, 92, 104, L.square && !long ? 64 : 76);
  const voicesAt = long ? m.proofPrecision! + 1.2 : at + 99;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: by(L, 110, 300, 80), textAlign: "center", ...fadeUp(ramp(t, at, 0.6)) }}>
        <Eyebrow text={`Calibration · ${R.photos} real photos · ${R.charactersCovered} characters`} size={by(L, 26, 26, 21)} />
      </div>
      <div style={{ position: "absolute", left: grid.x, top: grid.y, width: grid.w, display: "flex", flexWrap: "wrap", gap: 26 }}>
        {tiles.map((tile) => {
          const p = ramp(t, tile.at, 0.7);
          const v = tile.value * ramp(t, tile.at, 1.1);
          return (
            <div key={tile.label} style={{ width: tileW, minHeight: by(L, 330, 360, long ? 300 : 340), padding: by(L, 30, 34, 24), borderRadius: 24, background: C.raised, border: `2px solid ${tile.gold ? "rgba(228,192,104,0.45)" : C.rule}`, boxSizing: "border-box", ...fadeUp(p, 24) }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: tile.fmt(v).length > 9 ? big * 0.62 : big, lineHeight: 1, color: tile.gold ? C.gold : C.ink, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{tile.fmt(v)}</div>
              <div style={{ fontFamily: UI, fontWeight: 700, fontSize: by(L, 29, 32, 24), color: C.ink, marginTop: 18, lineHeight: 1.3 }}>{tile.label}</div>
              <div style={{ fontFamily: UI, fontSize: by(L, 24, 26, 20), color: C.ink3, marginTop: 8 }}>{tile.sub}</div>
            </div>
          );
        })}
      </div>
      {long ? (
        <div style={{ position: "absolute", left: grid.x, width: grid.w, top: by(L, 600, 1240, 830), display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center", ...fadeUp(ramp(t, voicesAt, 0.7)) }}>
          <Chip icon="voice" text={`${S.lines} voice lines · ${S.audioMinutes} min`} size={by(L, 30, 30, 24)} />
          <Chip icon="sparkle" text={`${assets.voiceBuild.elevenLines} Eleven v4 lines for ${assets.voiceBuild.elevenCredits} credits`} size={by(L, 30, 30, 24)} color={C.gold} border="rgba(228,192,104,0.5)" bg={C.goldSoft} />
          <Chip icon="lock" text={`${S.kokoroLines} Kokoro lines, open source`} size={by(L, 30, 30, 24)} color={C.moss} border="rgba(165,205,144,0.5)" bg={C.mossSoft} />
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: by(L, long ? 720 : 620, long ? 1400 : 1240, long ? 930 : 560),
          textAlign: "center",
          fontFamily: UI,
          fontSize: by(L, 22, 24, 19),
          color: C.ink3,
          padding: "0 60px",
          ...fadeUp(ramp(t, at + 0.8, 0.6)),
        }}
      >
        Wikimedia Commons photos, q4 weights on CPU. Phone snapshots are harder: read these as an upper bound.
      </div>
    </AbsoluteFill>
  );
};

// ================================================================ 6. CTA (paper)
export const Cta: React.FC<SceneProps> = ({ t, tl, L, at }) => {
  const m = tl.marks;
  const ev = tl.audio.find((a) => a.key === "cta")!;
  const first = ev.words.filter((w) => w.start < m.ctaLine2!);
  const brk = first.findIndex((w) => w.text.toLowerCase().startsWith("outside"));
  const second = ev.words.filter((w) => w.start >= m.ctaLine2!);
  const size = by(L, 100, 92, 78);
  const word = (w: { text: string; start: number }, i: number, italic = false) => (
    <React.Fragment key={i}>
      <span style={{ display: "inline-block", ...fadeUp(ramp(t, w.start - 0.06, 0.55), size * 0.25), fontStyle: italic ? "italic" : "normal", fontWeight: italic ? 500 : 600 }}>{w.text}</span>{" "}
    </React.Fragment>
  );
  const tail = Math.min(m.ctaEnd!, m.ctaLine2! + 0.5);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: C.inkL }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: by(L, 28, 40, 22), padding: "0 70px", textAlign: "center", marginTop: by(L, -40, -60, -40) }}>
        <Mark size={by(L, 120, 150, 100)} color={C.mossL} draw={ramp(t, at + 0.1, 1.4, easeInOut)} stroke={2} />
        <div style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: 1.06, letterSpacing: "-0.02em", maxWidth: by(L, 1500, 960, 960) }}>{first.map((w, i) => (
            <React.Fragment key={i}>
              {word(w, i)}
              {i === brk ? <br /> : null}
            </React.Fragment>
          ))}</div>
        <div style={{ fontFamily: DISPLAY, fontSize: size * 0.9, lineHeight: 1.06, color: C.mossL }}>{second.map((w, i) => word(w, i, true))}</div>
        <div style={{ display: "flex", flexDirection: L.portrait ? "column" : "row", alignItems: "center", gap: by(L, 22, 22, 16), marginTop: by(L, 24, 40, 14), ...fadeUp(ramp(t, tail, 0.7)) }}>
          <Wordmark size={by(L, 40, 46, 34)} color={C.inkL} markColor={C.mossL} />
          <div style={{ padding: `${by(L, 12, 14, 10)}px ${by(L, 24, 28, 20)}px`, borderRadius: 999, background: C.mossL, color: "#f6f3e9", fontFamily: UI, fontWeight: 700, fontSize: by(L, 28, 32, 24) }}>Built for #hf26challenge</div>
        </div>
        <div style={{ fontFamily: UI, fontSize: by(L, 21, 23, 18), color: C.ink2L, lineHeight: 1.5, maxWidth: by(L, 1400, 900, 900), ...fadeUp(ramp(t, tail + 0.3, 0.7)) }}>
          DEV Hacktoberfest Open-Source AI Challenge
          <br />
          Voices by ElevenLabs · Kokoro-82M · EmbeddingGemma 2 by Google DeepMind (Apache 2.0) · Transformers.js
        </div>
      </div>
    </AbsoluteFill>
  );
};
