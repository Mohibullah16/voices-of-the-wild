// Shareable card, drawn on a canvas from the same SVG art as the app. Fully offline:
// Web Share API with files where supported, otherwise a PNG download.
import { emblemSvg, SHORT_NAME } from "./art/emblems";
import { MARK_PATHS } from "./art/logo";
import { motifSvg, MOTIF_W, MOTIF_H } from "./art/motif";
import { sigilSvg } from "./art/sigil";
import { captionOf } from "./captions";
import { photoUrl } from "./photos";
import type { Owner, RuntimeLine } from "./types";

export type ShareFormat = "portrait" | "wide";
export const SHARE_SIZES: Record<ShareFormat, [number, number]> = { portrait: [1080, 1350], wide: [1200, 630] };

const PAPER = "#f1eee3", RAISED = "#f8f6ef", INK = "#1c2420", INK2 = "#444c46", MOSS = "#2d5b3c", RULE = "#cdc6b2";
const PIG: Record<string, string> = {
  trees: "#7fa27a", birds: "#7e9db5", animals: "#b59a7a", "small-creatures": "#a9a36a", flowers: "#c98d9a", plants: "#8db08a",
  "fruits-vegetables": "#d2a55a", ground: "#a08c78", sky: "#8fb2c9", water: "#6e9fa6", vehicles: "#c7896b", structures: "#a99a86", urban: "#8c9196",
};

function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function urlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read your photo."));
    img.src = url;
  });
}

const standalone = (inner: string, pig: string) =>
  inner
    .replace("<svg ", `<svg xmlns="http://www.w3.org/2000/svg" style="color:${INK}" `)
    .replace(/(<svg[^>]*>)/, `$1<style>.wash{fill:${pig};opacity:.32}.ink-2{opacity:.55}.dot,.seed{fill:${INK};stroke:none}.hole{fill:${PAPER};stroke:${INK}}</style>`);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else cur = t;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1]!;
    while (ctx.measureText(`${last}…`).width > maxW && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function renderShareCard(owner: Owner, line: RuntimeLine | undefined, format: ShareFormat, metOn?: string): Promise<Blob> {
  const [W, H] = SHARE_SIZES[format];
  await Promise.all([
    document.fonts.load('600 80px "EB Garamond"'),
    document.fonts.load('italic 400 40px "EB Garamond"'),
    document.fonts.load('400 36px "Atkinson Hyperlegible Next"'),
    document.fonts.load('700 30px "Atkinson Hyperlegible Next"'),
  ]).catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const pig = PIG[owner.category] ?? "#a08c78";

  // Paper with a faint fleck.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < (W * H) / 900; i++) {
    ctx.fillStyle = `rgba(80,70,50,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
  }

  const portrait = format === "portrait";
  const pad = portrait ? 72 : 48;
  // Card frame (gold foil for Elders).
  const cx = pad, cy = pad, cw = portrait ? W - pad * 2 : Math.round(W * 0.5), ch = H - pad * 2;
  if (owner.elder) {
    const g = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
    g.addColorStop(0, "#c9a03c"); g.addColorStop(0.38, "#f0d98f"); g.addColorStop(0.62, "#a77d1f"); g.addColorStop(0.86, "#f0d98f"); g.addColorStop(1, "#c9a03c");
    ctx.fillStyle = g;
  } else ctx.fillStyle = "#e6e1d2";
  roundRect(ctx, cx, cy, cw, ch, 28);
  ctx.fill();
  const inset = 12;
  ctx.fillStyle = RAISED;
  roundRect(ctx, cx + inset, cy + inset, cw - inset * 2, ch - inset * 2, 20);
  ctx.fill();

  // Top row: number and kind.
  const ix = cx + inset + 28, iw = cw - inset * 2 - 56;
  ctx.fillStyle = INK2;
  ctx.font = `700 ${portrait ? 30 : 22}px "Atkinson Hyperlegible Next", sans-serif`;
  ctx.textBaseline = "top";
  ctx.fillText(`No. ${String(owner.number).padStart(3, "0")}`, ix, cy + inset + 26);
  const kind = SHORT_NAME[owner.category] ?? owner.category;
  const kw = ctx.measureText(kind).width;
  ctx.fillText(kind, ix + iw - kw, cy + inset + 26);
  const em = await svgImage(standalone(emblemSvg(owner.category, 48), pig));
  const es = portrait ? 40 : 30;
  ctx.drawImage(em, ix + iw - kw - es - 10, cy + inset + 20, es, es);

  // Art.
  const ay = cy + inset + (portrait ? 84 : 64);
  const aw = iw, ah = Math.round((aw * MOTIF_H) / MOTIF_W);
  ctx.fillStyle = PAPER;
  roundRect(ctx, ix, ay, aw, ah, 14);
  ctx.fill();
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  roundRect(ctx, ix, ay, aw, ah, 14);
  ctx.clip();
  if (owner.guardian) {
    const sg = await svgImage(standalone(sigilSvg(owner.category, 400), pig));
    const s = ah * 0.86;
    ctx.drawImage(sg, ix + (aw - s) / 2, ay + (ah - s) / 2, s, s);
  } else if (photoUrl(owner.id)) {
    // Your own photo, cropped to fill the art area.
    const im = await urlImage(photoUrl(owner.id)!);
    const k = Math.max(aw / im.naturalWidth, ah / im.naturalHeight);
    const w = im.naturalWidth * k, h = im.naturalHeight * k;
    ctx.drawImage(im, ix + (aw - w) / 2, ay + (ah - h) / 2, w, h);
  } else {
    const mo = await svgImage(standalone(motifSvg(owner.id, owner.category).replace(/class="motif[^"]*"/, `width="${aw}" height="${ah}"`), pig));
    ctx.drawImage(mo, ix, ay, aw, ah);
  }
  ctx.restore();

  // Name and species.
  let ty = ay + ah + (portrait ? 44 : 24);
  ctx.fillStyle = INK;
  ctx.font = `600 ${portrait ? 92 : 58}px "EB Garamond", Georgia, serif`;
  ctx.fillText(owner.name, ix, ty, iw);
  ty += portrait ? 100 : 64;
  ctx.fillStyle = INK2;
  ctx.font = `italic 400 ${portrait ? 44 : 30}px "EB Garamond", Georgia, serif`;
  ctx.fillText(owner.species, ix, ty, iw);
  ty += portrait ? 64 : 40;
  if (owner.elder) {
    ctx.font = `700 ${portrait ? 28 : 20}px "Atkinson Hyperlegible Next", sans-serif`;
    const label = "Elder voice";
    const lw = ctx.measureText(label).width + 36;
    ctx.fillStyle = "#f2e7c6";
    roundRect(ctx, ix, ty, lw, portrait ? 48 : 34, 999);
    ctx.fill();
    ctx.strokeStyle = "#7d5e10";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#7d5e10";
    ctx.fillText(label, ix + 18, ty + (portrait ? 10 : 7));
    ty += portrait ? 76 : 52;
  }

  // The line, as a quotation (caption text, never the tagged text).
  const quoteX = portrait ? ix : cx + cw + 48;
  const quoteW = portrait ? iw : W - quoteX - pad;
  let qy = portrait ? ty + 8 : pad + 70;
  if (line) {
    ctx.fillStyle = INK;
    ctx.font = `400 ${portrait ? 38 : 32}px "Atkinson Hyperlegible Next", sans-serif`;
    const lines = wrap(ctx, `“${captionOf(line)}”`, quoteW, portrait ? 4 : 6);
    for (const l of lines) {
      ctx.fillText(l, quoteX, qy);
      qy += portrait ? 54 : 46;
    }
  }

  // Footer: mark, wordmark, date.
  const fy = portrait ? cy + ch - inset - 76 : H - pad - 50;
  const fx = portrait ? ix : quoteX;
  const mark = await svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="${MOSS}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${MARK_PATHS}</svg>`);
  ctx.drawImage(mark, fx, fy, 44, 44);
  ctx.fillStyle = INK;
  ctx.font = `600 34px "EB Garamond", Georgia, serif`;
  ctx.fillText("Voices of the Wild", fx + 56, fy + 4);
  if (metOn) {
    ctx.fillStyle = INK2;
    ctx.font = `400 24px "Atkinson Hyperlegible Next", sans-serif`;
    const t = `Met ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(metOn))}`;
    ctx.fillText(t, (portrait ? ix + iw : W - pad) - ctx.measureText(t).width, fy + 10);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not draw the card."))), "image/png"));
}

/** Shares the card where the platform can, otherwise downloads it. Returns what happened. */
export async function shareCard(owner: Owner, line: RuntimeLine | undefined, format: ShareFormat, metOn?: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const blob = await renderShareCard(owner, line, format, metOn);
  const name = `${owner.id}-${format}.png`;
  const file = new File([blob], name, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (format === "portrait" && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: owner.name, text: `I met ${owner.name} (${owner.species}) in Voices of the Wild.` });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
