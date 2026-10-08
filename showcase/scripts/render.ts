// Renders the finished videos, poster frames and captions.
//   npx tsx scripts/render.ts                 # all three cuts
//   npx tsx scripts/render.ts Vertical Wide   # just these
// Each cut: Remotion (high-quality intermediate) → H.264 High, yuv420p TV range, BT.709, 30 fps, faststart;
// AAC 192k with loudness normalised towards -14 LUFS (social).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SHOWCASE } from "./eleven.ts";

const OUT = join(SHOWCASE, "out");
mkdirSync(OUT, { recursive: true });
const CUTS: Record<string, string> = { Vertical: "9x16", Wide: "16x9", Square: "1x1" };
const which = process.argv.slice(2).filter((a) => CUTS[a]);
const list = which.length ? which : Object.keys(CUTS);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
// Paths are passed relative to showcase/ (the folder name has a space; npx needs a shell on Windows).
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: SHOWCASE, stdio: "inherit", shell: cmd === npx && process.platform === "win32" });

const propsFile = "out/.poster-props.json";
writeFileSync(join(SHOWCASE, propsFile), JSON.stringify({ poster: true }));

for (const comp of list) {
  const tag = CUTS[comp]!;
  const raw = `out/.raw-${tag}.mp4`;
  const final = `out/voices-of-the-wild-${tag}.mp4`;
  console.log(`\n== ${comp} (${tag})`);
  run(npx, ["remotion", "render", "src/index.ts", comp, raw, "--codec=h264", "--audio-codec=aac", "--crf=12", "--jpeg-quality=95", "--concurrency=50%", "--log=error"]);
  run("ffmpeg", ["-v", "error", "-y", "-i", raw, "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-r", "30", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final]);
  rmSync(join(SHOWCASE, raw), { force: true });
  const mb = statSync(join(SHOWCASE, final)).size / 1e6;
  console.log(`   ${final} (${mb.toFixed(1)} MB)`);
  if (mb > 200) console.warn("   WARNING: over LinkedIn's 200 MB limit; raise --crf.");
  run(npx, ["remotion", "still", "src/index.ts", comp, `out/poster-${tag}.png`, "--frame=0", `--props=${propsFile}`, "--log=error"]);
}
rmSync(join(SHOWCASE, propsFile), { force: true });
run(npx, ["tsx", "scripts/srt.ts"]);
