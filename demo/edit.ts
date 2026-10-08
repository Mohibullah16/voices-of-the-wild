// Turns a recorded session (work/session.json + work/frames) into the finished videos.
// The cut list below only chooses which seconds of the real session to keep and how fast to play
// them; every frame on screen and every voice is from the recording. Voices are the app's own MP3s,
// placed at the exact moment the page started playing them (logged from the <audio> element).
//   npx tsx edit.ts
import { chromium, type Browser } from "playwright";
import { copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MARK_PATHS } from "../app/src/art/logo";
import { CATEGORY_IDS, emblemSvg } from "../app/src/art/emblems";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "app");
const work = join(here, "work");
const out = join(here, "out");
const clipsDir = join(here, "clips");
const footageDir = join(here, "..", "showcase", "footage");
const render = join(work, "render");
for (const d of [out, clipsDir, render]) mkdirSync(d, { recursive: true });

type Session = {
  markers: Array<{ name: string; t: number }>;
  audio: Array<{ ev: string; src: string; t: number; ct: number; dur: number }>;
  frames: Array<{ f: string; t: number }>;
  measured: Record<string, any>;
};
const S: Session = JSON.parse(readFileSync(join(work, "session.json"), "utf8"));
const FPS = 30;

// ---- markers ------------------------------------------------------------------------
const m = (name: string, off = 0) => {
  const k = S.markers.find((x) => x.name === name) ?? S.markers.find((x) => x.name.startsWith(name));
  if (!k) throw new Error(`no marker ${name}`);
  return k.t + off;
};
const has = (name: string) => S.markers.some((x) => x.name === name || x.name.startsWith(name));

type Seg = { scene: string; a: number; b: number; speed: number };
const seg = (scene: string, a: number, b: number, speed = 1): Seg => ({ scene, a, b, speed });
const fit = (scene: string, a: number, b: number, seconds: number): Seg => ({ scene, a, b, speed: Math.max(1, (b - a) / 1000 / seconds) });

const encTags = ["enc1", ...((JSON.parse(readFileSync(join(here, "plan.json"), "utf8")).encounters as Array<{ tag: string }>).map((e) => e.tag))];
const nextTap = (i: number) => (i + 1 < encTags.length ? m(`${encTags[i + 1]}-tap`) : m("walkon"));

/** The cut. Real speed unless a speed is given; sped-up parts are flagged on screen. */
function mainCut(): Seg[] {
  const s: Seg[] = [
    seg("onboard", m("onboard-1", -200), m("download", 1300)),
    fit("download", m("download", 1300), m("ready", -300), 3.2),
    seg("ready", m("ready", -300), m("ready", 2400)),
    seg("offline", m("offline", -400), m("home-1", 900)),
    seg("reload", m("reload", -100), m("home-2", 800)),
    seg("home", m("home"), m("vf-tap", 250), 1.15),
    seg("viewfinder", m("vf-tap", 250), m("enc1-tap")),
    seg("enc1-match", m("enc1-tap"), m("enc1-card")),
    seg("enc1", m("enc1-card"), nextTap(0)),
  ];
  encTags.slice(1).forEach((tag, j) => {
    const i = j + 1;
    s.push(seg(`${tag}-match`, m(`${tag}-tap`), m(`${tag}-stir`, 700)));
    s.push(fit(`${tag}-match`, m(`${tag}-stir`, 700), m(`${tag}-card`, -350), 0.9));
    s.push(seg(tag, m(`${tag}-card`, -350), nextTap(i)));
  });
  s.push(seg("walkon", m("walkon"), Math.min(m("walkon", 3600), m("pocket", -300))));
  s.push(seg("pocket", m("pocket", -250), m("pocket", 2200)));
  s.push(seg("guide", m("guide", -150), m("detail", 1500)));
  s.push(seg("share", m("share", -1000), m("share", 2000)));
  s.push(seg("badges", m("badges", -100), m("badges", 2700)));
  return s;
}

/** The GIF: photo → stirring → Elder card → caption, ≤ 8 s (the wait is shortened). */
function gifCut(): Seg[] {
  return [
    seg("gif", m("enc1-tap", -500), m("enc1-stir", 900)),
    fit("gif", m("enc1-stir", 900), m("enc1-card", -250), 0.7),
    seg("gif", m("enc1-card", -250), m("enc1-card", 4300)),
  ];
}

// ---- frame mapping ----------------------------------------------------------------------
type Timeline = { frames: string[]; scenes: Array<{ scene: string; from: number; to: number; speed: number; a: number; b: number }>; duration: number };
function timeline(segs: Seg[]): Timeline {
  const fr = S.frames;
  const at = (t: number) => { let lo = 0, hi = fr.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fr[mid]!.t <= t) lo = mid; else hi = mid - 1; } return fr[lo]!.f; };
  const frames: string[] = [];
  const scenes: Timeline["scenes"] = [];
  let tOut = 0;
  for (const g of segs) {
    const outDur = (g.b - g.a) / 1000 / g.speed;
    const n = Math.round(outDur * FPS);
    for (let k = 0; k < n; k++) frames.push(at(g.a + (k / FPS) * g.speed * 1000));
    scenes.push({ scene: g.scene, from: tOut, to: tOut + n / FPS, speed: g.speed, a: g.a, b: g.b });
    tOut += n / FPS;
  }
  return { frames, scenes, duration: tOut };
}
/** Session time (ms) → output time (s), only inside real-speed parts. */
function toOut(tl: Timeline, t: number): number | null {
  for (const s of tl.scenes) if (t >= s.a && t <= s.b) return s.from + (t - s.a) / 1000 / s.speed;
  return null;
}

// ---- voices ---------------------------------------------------------------------------------
type LineInfo = { who: string; caption: string; engine: string; key: string };
const roster = JSON.parse(readFileSync(join(app, "public", "data", "roster.runtime.json"), "utf8"));
const lines = new Map<string, LineInfo>();
for (const c of roster.categories) for (const o of [c.guardian, ...c.characters]) for (const [key, l] of Object.entries<any>(o.lines)) if (l?.src) lines.set(l.src, { who: o.name, caption: l.caption, engine: l.engine, key });

type Play = { src: string; file: string; start: number; stop: number; info: LineInfo };
function plays(): Play[] {
  const out: Play[] = [];
  let cur: Play | null = null;
  for (const e of S.audio) {
    const path = new URL(e.src).pathname.replace(/^\//, "");
    if (e.ev === "playing") {
      if (cur && cur.src === path) continue;
      if (cur) out.push(cur);
      const info = lines.get(path);
      if (!info) { cur = null; continue; }
      cur = { src: path, file: join(app, "public", path), start: e.t - e.ct * 1000, stop: Infinity, info };
    } else if (cur && (e.ev === "ended" || e.ev === "pause" || e.ev === "emptied" || e.ev === "error")) {
      if (path === cur.src || e.ev === "emptied") { cur.stop = e.t; out.push(cur); cur = null; }
    }
  }
  if (cur) out.push(cur);
  return out.filter((p) => existsSync(p.file));
}
type Piece = { p: Play; off: number; dur: number; at: number; fadeIn: boolean; fadeOut: boolean };
function pieces(tl: Timeline, ps: Play[]): Piece[] {
  const res: Piece[] = [];
  for (const p of ps) {
    const fileDur = probeDur(p.file);
    const end = Math.min(p.stop, p.start + fileDur * 1000);
    for (const s of tl.scenes) {
      if (s.speed !== 1) continue;
      const a = Math.max(s.a, p.start), b = Math.min(s.b, end);
      if (b - a < 80) continue;
      res.push({ p, off: (a - p.start) / 1000, dur: (b - a) / 1000, at: s.from + (a - s.a) / 1000, fadeIn: a > p.start + 30, fadeOut: b < end - 30 });
    }
  }
  return res;
}
const durCache = new Map<string, number>();
function probeDur(f: string) {
  if (!durCache.has(f)) {
    const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
    durCache.set(f, parseFloat(r.stdout));
  }
  return durCache.get(f)!;
}

function ff(args: string[]) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed: " + args.slice(-1)[0]);
}

function renderAudio(tl: Timeline, ps: Piece[], file: string, extra = 0) {
  const total = tl.duration + extra;
  if (!ps.length) return ff(["-f", "lavfi", "-t", total.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo", "-c:a", "pcm_s16le", file]);
  const args: string[] = ["-f", "lavfi", "-t", total.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo"];
  const f: string[] = [];
  ps.forEach((q, i) => {
    args.push("-ss", q.off.toFixed(3), "-t", q.dur.toFixed(3), "-i", q.p.file);
    const fades = [q.fadeIn ? `afade=t=in:d=0.06` : "", q.fadeOut ? `afade=t=out:st=${Math.max(0, q.dur - 0.25).toFixed(3)}:d=0.25` : ""].filter(Boolean).join(",");
    const ms = Math.round(q.at * 1000);
    f.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo${fades ? "," + fades : ""},adelay=${ms}|${ms}[a${i}]`);
  });
  f.push(`[0:a]${ps.map((_, i) => `[a${i}]`).join("")}amix=inputs=${ps.length + 1}:normalize=0:duration=first,alimiter=limit=0.95[out]`);
  ff([...args, "-filter_complex", f.join(";"), "-map", "[out]", "-c:a", "pcm_s16le", file]);
}

function renderPhone(tl: Timeline, file: string, audioFile?: string) {
  const seq = join(work, "seq");
  rmSync(seq, { recursive: true, force: true });
  mkdirSync(seq, { recursive: true });
  tl.frames.forEach((f, i) => linkSync(join(work, "frames", f), join(seq, `${String(i).padStart(6, "0")}.jpg`)));
  const a = ["-framerate", String(FPS), "-i", join(seq, "%06d.jpg")];
  if (audioFile) a.push("-i", audioFile);
  ff([...a, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-r", String(FPS),
    ...(audioFile ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []), "-movflags", "+faststart", file]);
}

// ---- captions (SRT + burned-in chunks) --------------------------------------------------------
type Cue = { from: number; to: number; who: string; text: string };
function cues(ps: Piece[]): Cue[] {
  const res: Cue[] = [];
  for (const q of ps) {
    const fileDur = probeDur(q.p.file);
    const words = q.p.info.caption.split(/\s+/);
    // chunks of up to ~8 words, broken at punctuation where possible
    const chunks: string[][] = [];
    let curr: string[] = [];
    for (const w of words) {
      curr.push(w);
      if (curr.length >= 8 || (curr.length >= 4 && /[.,!?;:]$/.test(w))) { chunks.push(curr); curr = []; }
    }
    if (curr.length) chunks.length && curr.length < 3 ? chunks[chunks.length - 1]!.push(...curr) : chunks.push(curr);
    const chars = chunks.map((c) => c.join(" ").length + 4);
    const total = chars.reduce((x, y) => x + y, 0);
    const speak = Math.max(0.5, fileDur - 0.35); // trailing silence
    let acc = 0;
    chunks.forEach((c, i) => {
      const s = (acc / total) * speak, e = ((acc + chars[i]!) / total) * speak;
      acc += chars[i]!;
      const a = Math.max(s, q.off), b = Math.min(e, q.off + q.dur);
      if (b - a < 0.25) return;
      res.push({ from: q.at + (a - q.off), to: q.at + (b - q.off), who: q.p.info.who, text: c.join(" ") });
    });
  }
  return res.sort((x, y) => x.from - y.from);
}
const srtTime = (t: number) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), mi = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`; };
function writeSrt(cs: Cue[], file: string, extra: Array<{ from: number; to: number; text: string }> = []) {
  const all = [...cs.map((c) => ({ from: c.from, to: c.to, text: `${c.who}: ${c.text}` })), ...extra].sort((a, b) => a.from - b.from);
  writeFileSync(file, all.map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text}\n`).join("\n"));
}

// ---- overlay art ---------------------------------------------------------------------------------
const fontUrl = (p: string) => pathToFileURL(join(app, "node_modules", p)).href;
const FONTS = `
@font-face { font-family: "EB Garamond"; src: url(${fontUrl("@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2")}) format("woff2"); font-weight: 400 800; }
@font-face { font-family: "EB Garamond"; font-style: italic; src: url(${fontUrl("@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-italic.woff2")}) format("woff2"); font-weight: 400 800; }
@font-face { font-family: "Atkinson"; src: url(${fontUrl("@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-400-normal.woff2")}) format("woff2"); font-weight: 400; }
@font-face { font-family: "Atkinson"; src: url(${fontUrl("@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-600-normal.woff2")}) format("woff2"); font-weight: 600; }
@font-face { font-family: "Atkinson"; src: url(${fontUrl("@fontsource/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-700-normal.woff2")}) format("woff2"); font-weight: 700; }
* { margin: 0; box-sizing: border-box; } html, body { background: transparent; }
body { font-family: "Atkinson", sans-serif; color: #f1eee3; -webkit-font-smoothing: antialiased; }`;
const ph = (name: string) => readFileSync(join(app, "node_modules", "@phosphor-icons", "core", "assets", "regular", `${name}.svg`), "utf8").replace("<svg ", '<svg fill="currentColor" ');
const phf = (name: string) => readFileSync(join(app, "node_modules", "@phosphor-icons", "core", "assets", "fill", `${name}-fill.svg`), "utf8").replace("<svg ", '<svg fill="currentColor" ');
const mark = (size: number, color: string) => `<svg viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${MARK_PATHS}</svg>`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let browser: Browser;
let pngN = 0;
async function png(html: string, w: number, h: number, name?: string, transparent = true): Promise<string> {
  const file = join(render, `${name ?? `o${pngN++}`}.png`);
  const htmlFile = file.replace(/\.png$/, ".html");
  writeFileSync(htmlFile, `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}</style></head><body style="width:${w}px;height:${h}px;overflow:hidden">${html}</body></html>`);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(pathToFileURL(htmlFile).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: file, omitBackground: transparent });
  await page.close();
  return file;
}

const C = { bg1: "#16231d", bg2: "#0b120f", paper: "#f1eee3", paperDim: "#bcc2b4", moss: "#a5cd90", gold: "#e4c068", ink: "#1c2420", rule: "#2b3a32" };

function background(w: number, h: number) {
  const rings = Array.from({ length: 9 }, (_, i) => `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${180 + i * 120}" fill="none" stroke="#a5cd90" stroke-opacity="${0.05 - i * 0.004}" stroke-width="1.4"/>`).join("");
  return `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, ${C.bg1} 0%, ${C.bg2} 75%)"></div>
  <svg style="position:absolute;inset:0" width="${w}" height="${h}">${rings}</svg>`;
}

type Geo = { W: number; H: number; appW: number; appH: number; statusH: number; bezel: number; x: number; y: number };
function phoneGeo(W: number, H: number, appW: number, y: number | null): Geo {
  const appH = Math.round((appW * 1688) / 780 / 2) * 2;
  const statusH = Math.round((44 * appW) / 390);
  const bezel = Math.round((15 * appW) / 390);
  const pw = appW + bezel * 2, phh = statusH + appH + bezel * 2;
  return { W, H, appW, appH, statusH, bezel, x: Math.round((W - pw) / 2), y: y ?? Math.round((H - phh) / 2) };
}
/** Device frame with a transparent screen; the status bar shows Wi-Fi or airplane mode. */
function bezelHtml(g: Geo, offline: boolean) {
  const k = g.appW / 390;
  const pw = g.appW + g.bezel * 2, phh = g.statusH + g.appH + g.bezel * 2;
  const r = 52 * k, ri = 40 * k;
  const icons = offline
    ? `<span style="display:inline-flex;align-items:center;gap:${4 * k}px;background:#2d5b3c;color:#f6f3e9;border-radius:99px;padding:${2 * k}px ${8 * k}px;font-size:${12 * k}px;font-weight:700">${phf("airplane").replace("<svg ", `<svg width="${14 * k}" height="${14 * k}" `)} Airplane</span>`
    : `${ph("cell-signal-full").replace("<svg ", `<svg width="${16 * k}" height="${16 * k}" `)}${ph("wifi-high").replace("<svg ", `<svg width="${16 * k}" height="${16 * k}" `)}`;
  return `<div style="position:absolute;left:${g.x}px;top:${g.y}px;width:${pw}px;height:${phh}px">
    <div style="position:absolute;inset:0;border-radius:${r}px;background:#101512;box-shadow:0 ${30 * k}px ${80 * k}px rgba(0,0,0,.55), inset 0 0 0 ${1.5 * k}px #3a463f;
      -webkit-mask: radial-gradient(#000 0 0) ; "></div>
    <div style="position:absolute;left:${g.bezel}px;top:${g.bezel}px;width:${g.appW}px;height:${g.statusH + g.appH}px;border-radius:${ri}px;
      box-shadow:0 0 0 ${g.bezel + 2}px #101512;"></div>
    <div style="position:absolute;left:${g.bezel}px;top:${g.bezel}px;width:${g.appW}px;height:${g.statusH}px;background:#f1eee3;border-radius:${ri}px ${ri}px 0 0;
      display:flex;align-items:center;justify-content:space-between;padding:${6 * k}px ${26 * k}px 0;color:#1c2420;font-weight:700;font-size:${15 * k}px">
      <span>9:41</span>
      <span style="position:absolute;left:50%;top:${9 * k}px;transform:translateX(-50%);width:${110 * k}px;height:${30 * k}px;border-radius:${16 * k}px;background:#101512"></span>
      <span style="display:inline-flex;gap:${5 * k}px;align-items:center">${icons}${ph("battery-high").replace("<svg ", `<svg width="${20 * k}" height="${20 * k}" `)}</span>
    </div>
  </div>`;
}
// The screen hole: the bezel PNG is drawn over the video, so cut the screen out of the frame with an SVG mask.
function bezelSvgMask(g: Geo, offline: boolean) {
  const k = g.appW / 390;
  const pw = g.appW + g.bezel * 2, phh = g.statusH + g.appH + g.bezel * 2;
  const r = 52 * k, ri = 40 * k;
  const base = bezelHtml(g, offline);
  // replace the two plain layers by one SVG frame with a rounded hole
  const frame = `<svg style="position:absolute;left:${g.x}px;top:${g.y}px;filter:drop-shadow(0 ${24 * k}px ${50 * k}px rgba(0,0,0,.5))" width="${pw}" height="${phh}">
      <path fill-rule="evenodd" fill="#101512" d="M${r},0 H${pw - r} A${r},${r} 0 0 1 ${pw},${r} V${phh - r} A${r},${r} 0 0 1 ${pw - r},${phh} H${r} A${r},${r} 0 0 1 0,${phh - r} V${r} A${r},${r} 0 0 1 ${r},0 Z
        M${g.bezel + ri},${g.bezel} H${pw - g.bezel - ri} A${ri},${ri} 0 0 1 ${pw - g.bezel},${g.bezel + ri} V${phh - g.bezel - ri} A${ri},${ri} 0 0 1 ${pw - g.bezel - ri},${phh - g.bezel} H${g.bezel + ri} A${ri},${ri} 0 0 1 ${g.bezel},${phh - g.bezel - ri} V${g.bezel + ri} A${ri},${ri} 0 0 1 ${g.bezel + ri},${g.bezel} Z"/>
      <path fill="none" stroke="#3d4a42" stroke-width="${1.6 * k}" d="M${r},0.8 H${pw - r} A${r - 0.8},${r - 0.8} 0 0 1 ${pw - 0.8},${r} V${phh - r} A${r - 0.8},${r - 0.8} 0 0 1 ${pw - r},${phh - 0.8} H${r} A${r - 0.8},${r - 0.8} 0 0 1 0.8,${phh - r} V${r} A${r - 0.8},${r - 0.8} 0 0 1 ${r},0.8 Z"/>
    </svg>`;
  const status = base.slice(base.indexOf(`<div style="position:absolute;left:${g.bezel}px;top:${g.bezel}px;width:${g.appW}px;height:${g.statusH}px`));
  return `<div style="position:absolute;inset:0">${frame}<div style="position:absolute;left:${g.x}px;top:${g.y}px">${status}</div>`;
}

type Label = { from: number; to: number; kicker?: string; title: string; sub?: string; icon?: string };

function labelHtml(l: Label, size: "wide" | "tall") {
  const big = size === "wide" ? 54 : 58, small = size === "wide" ? 27 : 30, kick = size === "wide" ? 20 : 22;
  const align = size === "wide" ? "left" : "center";
  return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:${size === "wide" ? "flex-start" : "center"};text-align:${align};gap:${size === "wide" ? 14 : 10}px">
    ${l.kicker ? `<div style="display:inline-flex;align-items:center;gap:10px;color:${C.moss};font-weight:700;font-size:${kick}px;letter-spacing:.14em;text-transform:uppercase">${l.icon ? (l.icon.startsWith("<") ? l.icon : ph(l.icon).replace("<svg ", `<svg width="${kick + 8}" height="${kick + 8}" `)) : ""}${esc(l.kicker)}</div>` : ""}
    <div style="font-family:'EB Garamond';font-weight:500;font-size:${big}px;line-height:1.06;color:${C.paper}">${esc(l.title)}</div>
    ${l.sub ? `<div style="font-size:${small}px;line-height:1.35;color:${C.paperDim};max-width:${size === "wide" ? 560 : 960}px">${esc(l.sub)}</div>` : ""}
  </div>`;
}
function captionHtml(c: Cue, size: "wide" | "tall") {
  const fs = size === "wide" ? 46 : 44;
  return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:${size === "wide" ? "flex-start" : "center"};gap:12px;text-align:${size === "wide" ? "left" : "center"}">
    <div style="display:inline-flex;align-items:center;gap:10px;color:${C.gold};font-weight:700;font-size:${size === "wide" ? 22 : 24}px;letter-spacing:.08em;text-transform:uppercase">${ph("waveform").replace("<svg ", `<svg width="30" height="30" `)}${esc(c.who)}</div>
    <div style="font-family:'EB Garamond';font-size:${fs}px;line-height:1.18;color:${C.paper}">${esc(c.text)}</div></div>`;
}
function pillHtml(text: string, icon: string, color: string, fg: string, fs: number) {
  return `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="display:inline-flex;align-items:center;gap:10px;background:${color};color:${fg};border-radius:99px;padding:8px 20px 8px 14px;font-weight:700;font-size:${fs}px;white-space:nowrap">${ph(icon).replace("<svg ", `<svg width="${fs + 8}" height="${fs + 8}" `)}${esc(text)}</span></div>`;
}
function endCardHtml(w: number, h: number) {
  const tall = h > w;
  const emb = CATEGORY_IDS.map((c) => `<span style="color:${C.moss};opacity:.85">${emblemSvg(c, tall ? 52 : 46)}</span>`).join("");
  return `${background(w, h)}<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${tall ? 40 : 30}px;text-align:center;padding:0 80px">
    ${mark(tall ? 150 : 120, C.moss)}
    <div style="font-family:'EB Garamond';font-weight:500;font-size:${tall ? 104 : 96}px;line-height:1;color:${C.paper}">Voices <i style="font-weight:400">of the</i> Wild</div>
    <div style="font-family:'EB Garamond';font-style:italic;font-size:${tall ? 50 : 46}px;line-height:1.25;color:${C.paperDim};max-width:${tall ? 900 : 1300}px">Everything outside has something to say.<br>Go find out what.</div>
    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:${tall ? 18 : 22}px;max-width:${tall ? 700 : 1100}px;margin-top:10px">${emb}</div>
    <div style="font-size:${tall ? 26 : 22}px;color:${C.paperDim};letter-spacing:.04em">EmbeddingGemma 2 on-device · Voices by ElevenLabs + Kokoro · Works offline</div>
  </div>`;
}

// ---- labels from the session (measured numbers only) ---------------------------------------------
function labelsFor(tl: Timeline): Label[] {
  const sc = (name: string) => tl.scenes.filter((s) => s.scene === name);
  const span = (name: string) => { const x = sc(name); return x.length ? { from: x[0]!.from, to: x.at(-1)!.to } : null; };
  const ms = S.measured;
  const L: Label[] = [];
  const add = (name: string, l: Omit<Label, "from" | "to">, pad = [0.15, -0.1], extend?: string) => {
    const a = span(name), b = extend ? span(extend) : a;
    if (a && b) L.push({ ...l, from: a.from + pad[0]!, to: b.to + pad[1]! });
  };
  const sec = (x: number) => `${(x / 1000).toFixed(1)} s`;
  const est = String(ms.downloadEstimate ?? "").replace(/, Wi-Fi/, "");
  add("onboard", { kicker: "First run", title: "One download, once", sub: est ? `${est}: the open model, 286 voice lines, the field notes.` : undefined, icon: "download-simple" });
  const dl = sc("download")[0];
  add("download", { kicker: `Sped up ${Math.round(dl?.speed ?? 1)}×`, title: "EmbeddingGemma 2", sub: `Open weights, q4, cached in the browser. Took ${sec(ms.downloadMs)} on home Wi-Fi.`, icon: "fast-forward" });
  const warm = /First test photo\s*\|?\s*([\d.]+ s)/.exec(String(ms.ready ?? ""))?.[1];
  add("ready", { kicker: "Ready", title: "Now: no network at all", sub: warm ? `WebGPU on this laptop. First test photo: ${warm}.` : "WebGPU on this laptop.", icon: "check-circle" });
  add("offline", { kicker: "Airplane mode", title: "Runs offline", sub: "Network switched off for the rest of the video.", icon: "airplane" }, [0.15, -0.1], "reload");
  add("home", { kicker: "The trail", title: "Today’s quests", sub: "Streak, XP, and where to go next.", icon: "compass" });
  const e1 = ms.enc1 ?? {};
  add("viewfinder", { kicker: "Private", title: "The photo never leaves the phone", sub: "Embedded in the browser, never uploaded.", icon: "lock-simple" });
  add("enc1-match", { kicker: "On-device match", title: `${sec(e1.stirToCardMs ?? 0)}, real time`, sub: "EmbeddingGemma 2 on WebGPU, laptop integrated GPU. No server.", icon: "cpu" });
  add("enc1", { kicker: "ElevenLabs v4 voice", title: `${e1.name ?? "An Elder"} speaks`, sub: "Elder voices are generated at build time and ship with the app. Captions follow each word.", icon: "waveform" });
  for (const tag of encTags.slice(1)) {
    const e = ms[tag] ?? {};
    const k = sc(`${tag}-match`).find((s) => s.speed > 1);
    const matchLabel = { kicker: "On-device match", title: `${sec(e.stirToCardMs ?? 0)}`, sub: `Real time on WebGPU${k ? `, shown ${k.speed.toFixed(0)}× faster` : ""}.`, icon: "cpu" };
    add(`${tag}-match`, matchLabel);
    if (e.guardian) add(tag, { kicker: "Honest fallback", title: "Not sure? A guardian gives a tip", sub: "When the top two are too close to call, the app names no one. Kokoro voice (open source).", icon: "binoculars" });
    else if (e.caution) add(tag, { kicker: "Safety", title: "Some things warn you off", sub: "Look, don’t touch. Characters never ask you to touch, pick or climb.", icon: "warning" });
    else add(tag, { kicker: "Variety bonus", title: "New ground: +50% XP", sub: "A different kind of thing than the last one.", icon: "plant" });
  }
  add("walkon", { kicker: "Walk on", title: "Then the phone goes away", sub: "A goodbye line, a pocket screen. Coming back after 5 min pays a bonus.", icon: "footprints" }, [0.15, -0.1], "pocket");
  add("guide", { kicker: "Collection", title: "Field guide", sub: "91 voices in 13 kinds. Locked ones hint where to look.", icon: "book-open" });
  add("share", { kicker: "Share card", title: "Drawn offline, on a canvas", sub: "Web Share where available, a PNG download otherwise.", icon: "share-network" });
  add("badges", { kicker: "Game", title: "12 badges, 5 ranks", sub: "XP rewards walking and variety, not rapid snapping.", icon: "medal" });
  return L;
}

// ---- compose -------------------------------------------------------------------------------------
type Over = { file: string; x: number; y: number; from: number; to: number; fade?: number };
function compose(o: { W: number; H: number; geo: Geo; phone: string; audio: string; overlays: Over[]; bg: string; bezelOn: string; bezelOff: string; offlineAt: number; endCard: string; endDur: number; total: number; file: string }) {
  const args = ["-loop", "1", "-framerate", String(FPS), "-t", o.total.toFixed(3), "-i", o.bg, "-i", o.phone,
    "-loop", "1", "-framerate", String(FPS), "-t", o.total.toFixed(3), "-i", o.bezelOn,
    "-loop", "1", "-framerate", String(FPS), "-t", o.total.toFixed(3), "-i", o.bezelOff,
    "-loop", "1", "-framerate", String(FPS), "-t", o.total.toFixed(3), "-i", o.endCard];
  const g = o.geo;
  const f: string[] = [
    `[1:v]scale=${g.appW}:${g.appH}:flags=lanczos,setsar=1[ph]`,
    `[0:v][ph]overlay=${g.x + g.bezel}:${g.y + g.bezel + g.statusH}:eof_action=pass[v0]`,
    `[v0][2:v]overlay=0:0:enable='lt(t,${o.offlineAt.toFixed(3)})'[v1]`,
    `[v1][3:v]overlay=0:0:enable='gte(t,${o.offlineAt.toFixed(3)})'[v2]`,
  ];
  let last = "v2";
  o.overlays.forEach((ov, i) => {
    const idx = 6 + i;
    args.push("-loop", "1", "-framerate", String(FPS), "-t", o.total.toFixed(3), "-i", ov.file);
    const d = ov.fade ?? 0.25;
    f.push(`[${idx}:v]format=rgba,fade=t=in:st=${ov.from.toFixed(3)}:d=${d}:alpha=1,fade=t=out:st=${(ov.to - d).toFixed(3)}:d=${d}:alpha=1[o${i}]`);
    f.push(`[${last}][o${i}]overlay=${ov.x}:${ov.y}:enable='between(t,${ov.from.toFixed(3)},${ov.to.toFixed(3)})'[w${i}]`);
    last = `w${i}`;
  });
  const endAt = o.total - o.endDur;
  f.push(`[4:v]format=rgba,fade=t=in:st=${endAt.toFixed(3)}:d=0.6:alpha=1[end]`);
  f.push(`[${last}][end]overlay=0:0:enable='gte(t,${endAt.toFixed(3)})',format=yuv420p[vout]`);
  args.push("-i", o.audio);
  const audioIdx = 6 + o.overlays.length;
  f.push(`[${audioIdx}:a]apad,atrim=0:${o.total.toFixed(3)},afade=t=out:st=${(o.total - 0.8).toFixed(3)}:d=0.8[aout]`);
  const script = join(render, `graph-${o.W}x${o.H}.txt`);
  writeFileSync(script, f.join(";\n"));
  ff([...args, "-filter_complex_script", script, "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", o.total.toFixed(3), "-movflags", "+faststart", o.file]);
}

// ---- main ------------------------------------------------------------------------------------------
browser = await chromium.launch();
const tl = timeline(mainCut());
const ps = plays();
const pcs = pieces(tl, ps);
console.log(`cut: ${tl.duration.toFixed(1)} s, ${tl.frames.length} frames, ${pcs.length} voice pieces`);
for (const s of tl.scenes) console.log(`  ${s.scene.padEnd(16)} ${s.from.toFixed(2).padStart(6)} → ${s.to.toFixed(2).padStart(6)}  ×${s.speed.toFixed(2)}`);
for (const q of pcs) console.log(`  voice ${q.p.info.who} (${q.p.info.key}) at ${q.at.toFixed(2)} s for ${q.dur.toFixed(2)} s from +${q.off.toFixed(2)}`);

const END = 4.2;
const total = tl.duration + END;
const phoneMp4 = join(work, "phone-main.mp4");
const audioWav = join(work, "audio-main.wav");
renderPhone(tl, phoneMp4);
renderAudio(tl, pcs, audioWav, END);
const cs = cues(pcs);
const labels = labelsFor(tl);
const offlineAt = (() => { const t = toOut(tl, m("offline")); return t ?? tl.scenes.find((s) => s.scene === "offline")!.from; })();
const leaks = (S.measured.offlineNetworkAttempts ?? []).length;
writeSrt(cs, join(out, "walkthrough.srt"));

const speedChips = tl.scenes.filter((s) => s.speed > 1.3 && s.to - s.from > 0.3);

for (const fmt of ["16x9", "9x16"] as const) {
  const wide = fmt === "16x9";
  const W = wide ? 1920 : 1080, H = wide ? 1080 : 1920;
  const geo = wide ? phoneGeo(W, H, 432, null) : phoneGeo(W, H, 640, 236);
  const bg = await png(background(W, H), W, H, `bg-${fmt}`, false);
  const bezelOn = await png(bezelSvgMask(geo, false), W, H, `bezel-on-${fmt}`);
  const bezelOff = await png(bezelSvgMask(geo, true), W, H, `bezel-off-${fmt}`);
  const endCard = await png(endCardHtml(W, H), W, H, `end-${fmt}`, false);
  const overlays: Over[] = [];
  const phoneRight = geo.x + geo.appW + geo.bezel * 2;
  // labels
  for (const [i, l] of labels.entries()) {
    const box = wide ? { w: 600, h: 420, x: 120, y: 330 } : { w: 1000, h: 236, x: 40, y: 0 };
    overlays.push({ file: await png(labelHtml(l, wide ? "wide" : "tall"), box.w, box.h, `label-${fmt}-${i}`), x: box.x, y: box.y, from: l.from, to: l.to });
  }
  // network status pill: before airplane mode / after
  const pillW = wide ? 600 : 1000, pillH = 70;
  const pillPos = wide ? { x: 120, y: 120 } : { x: 40, y: H - 150 };
  const pillAlign = (html: string) => (wide ? html.replace("justify-content:center", "justify-content:flex-start") : html);
  overlays.push({ file: await png(pillAlign(pillHtml("Online: first run only", "wifi-high", "#26342d", C.paperDim, wide ? 22 : 26)), pillW, pillH, `pill-on-${fmt}`), ...pillPos, from: 0.2, to: offlineAt });
  overlays.push({ file: await png(pillAlign(pillHtml(leaks === 0 ? "Airplane mode · 0 network requests" : "Airplane mode", "airplane", "#a5cd90", C.ink, wide ? 22 : 26)), pillW, pillH, `pill-off-${fmt}`), ...pillPos, from: offlineAt, to: tl.duration });
  // fast-forward chips
  for (const [i, s] of speedChips.entries()) {
    const file = await png(pillHtml(`${s.speed >= 10 ? Math.round(s.speed) : s.speed.toFixed(1)}× speed`, "fast-forward", "#e4c068", C.ink, wide ? 22 : 26), 300, 70, `ff-${fmt}-${i}`);
    overlays.push(wide ? { file, x: phoneRight + 40, y: 120, from: s.from, to: s.to, fade: 0.08 } : { file, x: W - 330, y: H - 150, from: s.from, to: s.to, fade: 0.08 });
  }
  // big captions (16:9 only; on 9:16 the app's own captions are large enough)
  if (wide) {
    for (const [i, c] of cs.entries()) {
      overlays.push({ file: await png(captionHtml(c, "wide"), 620, 420, `cap-${i}`), x: phoneRight + 70, y: 330, from: c.from, to: c.to, fade: 0.12 });
    }
  }
  // the share card the app produced
  const card = join(work, "share-card.png");
  const shareScene = tl.scenes.find((s) => s.scene === "share");
  if (existsSync(card) && shareScene) {
    const from = shareScene.from + 1.3, to = shareScene.to + (tl.scenes.find((s) => s.scene === "badges")?.to ?? shareScene.to) - shareScene.to - 0.2;
    const cw = wide ? 430 : 520;
    const f = await png(`<div style="padding:30px"><img src="${pathToFileURL(card).href}" style="width:${cw}px;border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.55);transform:rotate(${wide ? 2.5 : 3}deg)"></div>`, cw + 60, Math.round(cw * 1350 / 1080) + 80, `share-${fmt}`);
    overlays.push(wide ? { file: f, x: phoneRight + 90, y: 200, from, to } : { file: f, x: W - cw - 40, y: H - Math.round(cw * 1.25) - 260, from, to });
  }
  compose({ W, H, geo, phone: phoneMp4, audio: audioWav, overlays, bg, bezelOn, bezelOff, offlineAt, endCard, endDur: END, total, file: join(out, `walkthrough-${fmt}.mp4`) });
  console.log(`wrote walkthrough-${fmt}.mp4`);
}

// ---- GIF -----------------------------------------------------------------------------------------
{
  const g = timeline(gifCut());
  const mp4 = join(work, "gif-src.mp4");
  renderPhone(g, mp4);
  const gif = join(out, "demo.gif");
  for (const [w, fps, colors] of [[360, 12, 128], [320, 12, 96], [300, 10, 80]] as const) {
    ff(["-i", mp4, "-vf", `fps=${fps},scale=${w}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`, "-loop", "0", gif]);
    const size = statSync(gif).size;
    console.log(`gif ${w}px ${fps}fps ${colors} colors: ${(size / 1e6).toFixed(2)} MB, ${g.duration.toFixed(1)} s`);
    if (size <= 6e6) break;
  }
}

// ---- raw scene clips (real speed, phone only, with their voices) + showcase footage ---------------
{
  const scene = (name: string, a: number, b: number) => [seg(name, a, b)];
  const clipDefs: Array<[string, Seg[]]> = [
    ["onboard", [seg("onboard", m("onboard-1", -300), m("download", 2500)), fit("download", m("download", 2500), m("ready", -300), 3), seg("ready", m("ready", -300), m("ready", 2500))]],
    ["offline", scene("offline", m("offline", -1000), m("home-2", 2500))],
    ["home", scene("home", m("home"), m("vf-tap", 300))],
    ["encounter-elder", scene("enc1", m("vf-tap"), nextTap(0))],
    ...encTags.slice(1).map((tag, j): [string, Seg[]] => [`encounter-${tag}`, scene(tag, m(`${tag}-tap`, -200), nextTap(j + 1))]),
    ["walkon-pocket", scene("walkon", m("walkon", -300), m("guide", -200))],
    ["guide-share-badges", scene("guide", m("guide", -300), m("end"))],
  ];
  const made = new Map<string, string>();
  for (const [name, segs] of clipDefs) {
    const t = timeline(segs);
    const wav = join(work, `clip-${name}.wav`);
    renderAudio(t, pieces(t, ps), wav);
    const file = join(clipsDir, `${name}.mp4`);
    renderPhone(t, file, wav);
    made.set(name, file);
    console.log(`clip ${name}: ${t.duration.toFixed(1)} s`);
  }
  // Showcase footage: trimmed, phone only.
  mkdirSync(footageDir, { recursive: true });
  const guardianTag = encTags.find((t) => S.measured[t]?.guardian);
  const footage: Array<[string, Seg[]]> = [
    ["01-onboard.mp4", [seg("x", m("onboard-1", -200), m("download", 1300)), fit("x", m("download", 1300), m("ready", -300), 2.5), seg("x", m("ready", -300), m("ready", 2200))]],
    ["02-encounter-elder.mp4", [seg("x", m("vf", 300), nextTap(0))]],
    ...(guardianTag ? [["03-guardian.mp4", [seg("x", m(`${guardianTag}-tap`, -100), m(`${guardianTag}-voice-end`, 700))]] as [string, Seg[]]] : []),
    ["04-guide.mp4", [seg("x", m("guide", -150), m("end"))]],
    ["05-game.mp4", [seg("x", m("home", 0), m("vf-tap", 200)), seg("x", m("enc1-voice-end", -1500), nextTap(0))]],
    ["06-offline.mp4", [seg("x", m("ready", 200), m("home-2", 3000))]],
  ];
  for (const [name, segs] of footage) {
    const t = timeline(segs);
    const wav = join(work, `foot-${name}.wav`);
    renderAudio(t, pieces(t, ps), wav);
    renderPhone(t, join(footageDir, name), wav);
    console.log(`footage ${name}: ${t.duration.toFixed(1)} s`);
  }
}

writeFileSync(join(work, "edit-report.json"), JSON.stringify({ total, scenes: tl.scenes, labels, cues: cs, offlineAt, measured: S.measured }, null, 1));
await browser.close();
console.log(`done: ${total.toFixed(1)} s`);
