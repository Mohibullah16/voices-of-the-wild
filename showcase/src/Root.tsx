import React from "react";
import { Composition } from "remotion";
import { loadFonts } from "./fonts";
import { Showcase, type ShowcaseProps } from "./Showcase";
import { buildTimeline, FPS } from "./timeline";

loadFonts();

const frames = (cut: "long" | "short") => Math.round(buildTimeline(cut).total * FPS);

export const Root: React.FC = () => (
  <>
    {/* LinkedIn / Reels / Shorts: 1080×1920, short cut (≤ 60 s). */}
    <Composition id="Vertical" component={Showcase} width={1080} height={1920} fps={FPS} durationInFrames={frames("short")} defaultProps={{ cut: "short" } as ShowcaseProps} />
    {/* DEV / YouTube: 1920×1080, long cut (60 to 90 s). */}
    <Composition id="Wide" component={Showcase} width={1920} height={1080} fps={FPS} durationInFrames={frames("long")} defaultProps={{ cut: "long" } as ShowcaseProps} />
    {/* Feed square: 1080×1080, short cut. */}
    <Composition id="Square" component={Showcase} width={1080} height={1080} fps={FPS} durationInFrames={frames("short")} defaultProps={{ cut: "short" } as ShowcaseProps} />
  </>
);
