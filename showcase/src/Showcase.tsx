import React, { useMemo } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import assets from "./generated/assets.json";
import { Cta, Game, Hook, Idea, Proof, type SceneProps, Stack } from "./scenes";
import { by, ramp, useLayout, useT } from "./theme";
import { buildTimeline, captionChunks, type Cut, FPS, type SceneId } from "./timeline";
import { Backdrop, Captions, Grain, Wordmark } from "./ui";
import { C, UI } from "./theme";

export type ShowcaseProps = { cut: Cut; poster?: boolean };

const SCENES: Record<SceneId, React.FC<SceneProps>> = { hook: Hook, idea: Idea, game: Game, stack: Stack, proof: Proof, cta: Cta };
const FADE = 0.45;

const CSS = `
.motif{width:100%;height:100%;display:block}
.motif .wash{fill:var(--pig);opacity:.32}
.motif .lines .ink-2{opacity:.55}
.motif .lines .dot,.motif .lines .seed{fill:currentColor;stroke:none}
.motif .lines .hole{fill:#f1eee3;stroke:currentColor}
.card-art{display:block}
.card-art .sigil{width:64%;height:auto;margin:4% auto 0;display:block}
`;

/** When `poster` is set, freeze on a designed frame (the hook, card visible, no captions). */
export const POSTER_TIME = 3.4;

export const Showcase: React.FC<ShowcaseProps> = ({ cut, poster }) => {
  const L = useLayout();
  const { fps } = useVideoConfig();
  const live = useT();
  const t = poster ? POSTER_TIME : live;
  const tl = useMemo(() => buildTimeline(cut), [cut]);
  const chunks = useMemo(() => captionChunks(tl, by(L, 48, 30, 36)), [tl, L]);
  const cta = tl.scenes.find((s) => s.id === "cta")!;
  const light = ramp(t, cta.at - 0.1, 0.8);

  return (
    <AbsoluteFill>
      <style>{CSS}</style>
      <Backdrop t={t} light={light} />
      {tl.scenes.map((s, i) => {
        const last = i === tl.scenes.length - 1;
        const end = last ? tl.total + 1 : s.end + FADE;
        if (t < s.at - 0.01 || t > end) return null;
        const o = i === 0 ? 1 : Math.min(ramp(t, s.at, FADE), last ? 1 : 1 - ramp(t, s.end, FADE));
        const Scene = SCENES[s.id];
        return (
          <AbsoluteFill key={s.id} style={{ opacity: s.id === "cta" ? 1 : o }}>
            <Scene t={t} tl={tl} L={L} at={s.at} end={s.end} />
          </AbsoluteFill>
        );
      })}
      <Grain light={light} />
      <Captions chunks={chunks} t={t} L={L} hidden={poster || t >= cta.at} />
      {poster ? (
        <div style={{ position: "absolute", left: 0, right: 0, top: by(L, 940, 1560, 950), display: "flex", justifyContent: "center", alignItems: "center", gap: 28 }}>
          <Wordmark size={by(L, 40, 46, 36)} />
          <div style={{ padding: "10px 22px", borderRadius: 999, border: `1.5px solid ${C.rule}`, fontFamily: UI, fontWeight: 700, fontSize: by(L, 24, 26, 20), color: C.ink2 }}>#hf26challenge</div>
        </div>
      ) : null}

      {poster ? null : (
        <>
          {tl.audio.map((a, i) => (
            <Sequence key={i} from={Math.round(a.at * FPS)} durationInFrames={Math.ceil(a.dur * FPS)} layout="none">
              <Audio src={staticFile(a.src)} trimBefore={Math.round(a.trim * FPS)} volume={a.volume} />
            </Sequence>
          ))}
          {assets.ambient ? (
            <Audio
              src={staticFile(assets.ambient.src)}
              volume={(f) =>
                interpolate(f / fps, [0, 1.5, tl.total - 2, tl.total], [0, 0.9, 0.9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
              }
            />
          ) : null}
        </>
      )}
    </AbsoluteFill>
  );
};
