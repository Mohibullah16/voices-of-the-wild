// Deterministic card motifs. Every character gets a unique plate drawn from
// its id + category: each category has its own visual grammar (growth rings,
// petal rosettes, feather barbs, contour maps...) and the id seeds the
// parameters. 94 unique cards, zero hand-drawn duplicates.
import { f, hashString, rng, type Rng } from "./prng";

export const MOTIF_W = 240;
export const MOTIF_H = 150;
const W = MOTIF_W, H = MOTIF_H;

type Gen = (r: Rng) => string;

const path = (d: string, cls = "") => `<path ${cls ? `class="${cls}" ` : ""}d="${d}"/>`;

/** Closed wobbly loop around (cx, cy). */
function loop(r: Rng, cx: number, cy: number, rx: number, ry: number, wob: number, phase = r() * 6.28, steps = 40): string {
  const h1 = r.range(0.4, 1), h2 = r.range(0.2, 0.6), k = r.int(2, 4);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const n = 1 + wob * (h1 * Math.sin(k * t + phase) + h2 * Math.sin((k + 3) * t - phase * 1.7)) / 2;
    pts.push([cx + Math.cos(t) * rx * n, cy + Math.sin(t) * ry * n]);
  }
  return smoothClosed(pts);
}

/** Catmull-Rom → cubic Bézier for a closed loop. */
function smoothClosed(p: Array<[number, number]>): string {
  const n = p.length;
  let d = `M${f(p[0]![0])} ${f(p[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n]!, p1 = p[i]!, p2 = p[(i + 1) % n]!, p3 = p[(i + 2) % n]!;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}

function smoothOpen(p: Array<[number, number]>): string {
  let d = `M${f(p[0]![0])} ${f(p[0]![1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]!, p1 = p[i]!, p2 = p[i + 1]!, p3 = p[Math.min(p.length - 1, i + 2)]!;
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

const GEN: Record<string, Gen> = {
  // Cross-section of a trunk: growth rings, a heart, radial checks.
  trees(r) {
    const cx = r.range(70, 170), cy = r.range(60, 95), rings = r.int(7, 11);
    const ph = r() * 6.28;
    let s = "";
    for (let i = 1; i <= rings; i++) {
      const rad = 7 + i * r.range(9, 12);
      s += path(loop(r, cx, cy, rad * 1.08, rad * 0.9, 0.06 + i * 0.006, ph + i * 0.15), i % 3 === 0 ? "ink-2" : "");
    }
    for (let k = 0; k < r.int(2, 4); k++) {
      const a = r() * Math.PI * 2, r0 = r.range(10, 30), r1 = r0 + r.range(40, 90);
      s += path(`M${f(cx + Math.cos(a) * r0)} ${f(cy + Math.sin(a) * r0)}L${f(cx + Math.cos(a + 0.05) * r1)} ${f(cy + Math.sin(a + 0.05) * r1)}`, "ink-2");
    }
    return s + `<circle cx="${f(cx)}" cy="${f(cy)}" r="2.2" class="dot"/>`;
  },

  // A flower head seen from above: layered petals around a seeded disc.
  flowers(r) {
    const cx = r.range(80, 160), cy = r.range(62, 88), n = r.int(5, 9), layers = r.int(2, 3);
    let s = "";
    for (let L = layers; L >= 1; L--) {
      const len = 18 + L * r.range(14, 20), wid = r.range(0.35, 0.6), off = L * 0.5 + r() ;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + off;
        const tip = [cx + Math.cos(a) * len, cy + Math.sin(a) * len];
        const l = [cx + Math.cos(a - wid) * len * 0.55, cy + Math.sin(a - wid) * len * 0.55];
        const rr = [cx + Math.cos(a + wid) * len * 0.55, cy + Math.sin(a + wid) * len * 0.55];
        s += path(`M${f(cx)} ${f(cy)}Q${f(l[0]!)} ${f(l[1]!)} ${f(tip[0]!)} ${f(tip[1]!)}Q${f(rr[0]!)} ${f(rr[1]!)} ${f(cx)} ${f(cy)}`, L === 1 ? "" : "ink-2");
      }
    }
    // Phyllotaxis disc.
    for (let i = 1; i < 34; i++) {
      const a = i * 2.39996, d = 1.6 * Math.sqrt(i);
      s += `<circle cx="${f(cx + Math.cos(a) * d)}" cy="${f(cy + Math.sin(a) * d)}" r=".7" class="dot"/>`;
    }
    return s;
  },

  // Fern fronds: curving rachis with alternating pinnae.
  plants(r) {
    let s = "";
    const fronds = r.int(2, 3);
    for (let k = 0; k < fronds; k++) {
      const x0 = r.range(40, 200), y0 = H + 4, bend = r.range(-0.9, 0.9), len = r.range(110, 150);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push([x0 + bend * 60 * t * t + Math.sin(t * 3) * 6 * bend, y0 - len * t]);
      }
      s += path(smoothOpen(pts));
      for (let i = 1; i < 12; i++) {
        const [x, y] = pts[i]!, [nx, ny] = pts[i + 1]!;
        const ang = Math.atan2(ny - y, nx - x), size = (1 - i / 13) * r.range(16, 24);
        for (const side of [-1, 1]) {
          const a = ang + side * r.range(1.0, 1.25);
          s += path(`M${f(x)} ${f(y)}Q${f(x + Math.cos(a - side * 0.4) * size * 0.6)} ${f(y + Math.sin(a - side * 0.4) * size * 0.6)} ${f(x + Math.cos(a) * size)} ${f(y + Math.sin(a) * size)}`, i % 2 ? "" : "ink-2");
        }
      }
    }
    return s;
  },

  // A contour feather: shaft and barbs, plus a few distant flight marks.
  birds(r) {
    const x0 = r.range(40, 70), y0 = r.range(120, 140), x1 = r.range(170, 205), y1 = r.range(18, 40);
    const mx = (x0 + x1) / 2 + r.range(-14, 14), my = (y0 + y1) / 2 + r.range(-12, 12);
    let s = path(`M${f(x0)} ${f(y0)}Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}`);
    const N = r.int(16, 24);
    const at = (t: number) => [(1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1] as const;
    for (let i = 3; i < N; i++) {
      const t = i / N;
      const [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.01));
      const ang = Math.atan2(y2 - y, x2 - x), len = Math.sin(Math.PI * Math.min(1, t * 1.05)) * r.range(26, 38);
      for (const side of [-1, 1]) {
        const a = ang + side * r.range(0.65, 0.95);
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        s += path(`M${f(x)} ${f(y)}Q${f(x + Math.cos(a - side * 0.3) * len * 0.5)} ${f(y + Math.sin(a - side * 0.3) * len * 0.5)} ${f(ex)} ${f(ey)}`, i % 4 === 0 ? "" : "ink-2");
      }
    }
    for (let k = 0; k < r.int(2, 4); k++) {
      const x = r.range(150, 225), y = r.range(90, 135), w = r.range(5, 9);
      s += path(`M${f(x - w)} ${f(y)}Q${f(x - w / 2)} ${f(y - w * 0.6)} ${f(x)} ${f(y)}Q${f(x + w / 2)} ${f(y - w * 0.6)} ${f(x + w)} ${f(y)}`);
    }
    return s;
  },

  // Honeycomb fragment and a wandering dotted trail.
  "small-creatures"(r) {
    const R = r.range(11, 15), ox = r.range(20, 60), oy = r.range(14, 30);
    let s = "";
    const hex = (cx: number, cy: number) => {
      let d = "";
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        d += `${i ? "L" : "M"}${f(cx + Math.cos(a) * R)} ${f(cy + Math.sin(a) * R)}`;
      }
      return d + "Z";
    };
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 5; col++) {
        if (!r.chance(0.55)) continue;
        const cx = ox + col * R * Math.sqrt(3) + (row % 2) * R * Math.sqrt(3) / 2, cy = oy + row * R * 1.5;
        s += path(hex(cx, cy), r.chance(0.3) ? "" : "ink-2");
      }
    let x = r.range(30, 90), y = r.range(110, 140), a = r.range(-0.6, 0.2);
    for (let i = 0; i < 26; i++) {
      a += r.range(-0.45, 0.45);
      x += Math.cos(a) * 7; y += Math.sin(a) * 4;
      if (x > W - 10 || y < 10 || y > H - 6) break;
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="${i % 3 ? 0.9 : 1.4}" class="dot"/>`;
    }
    return s;
  },

  // A trail of paw prints along a gentle curve.
  animals(r) {
    let s = "";
    const steps = r.int(5, 7), y0 = r.range(110, 130), y1 = r.range(25, 50);
    const sc = r.range(0.75, 1);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const x = 30 + t * 180, y = y0 + (y1 - y0) * t + Math.sin(t * 5) * 6, side = i % 2 ? -1 : 1;
      const px = x, py = y + side * 10;
      const rot = -30 + t * 10;
      s += `<g transform="translate(${f(px)} ${f(py)}) rotate(${f(rot + 90)}) scale(${f(sc)})">`;
      s += path("M0 6C-5 6 -7 2 -5.5 -0.5C-4 -3 -2 -3.6 0 -3.6C2 -3.6 4 -3 5.5 -0.5C7 2 5 6 0 6Z");
      for (const [tx, ty] of [[-7, -5], [-2.6, -10], [2.6, -10], [7, -5]] as const) s += `<ellipse cx="${tx}" cy="${ty}" rx="1.9" ry="2.6"/>`;
      s += `</g>`;
    }
    return s;
  },

  // Spoked wheels and road dashes.
  vehicles(r) {
    let s = "";
    const wheels = r.int(2, 3), R = r.range(22, 32), y = r.range(80, 100);
    const gap = (W - 60) / wheels;
    for (let i = 0; i < wheels; i++) {
      const cx = 40 + gap * i + gap / 2 + r.range(-8, 8), spokes = r.int(6, 12), rot = r() * 6.28;
      s += `<circle cx="${f(cx)}" cy="${f(y)}" r="${f(R)}"/><circle cx="${f(cx)}" cy="${f(y)}" r="${f(R - 4)}" class="ink-2"/><circle cx="${f(cx)}" cy="${f(y)}" r="3"/>`;
      for (let k = 0; k < spokes; k++) {
        const a = rot + (k / spokes) * Math.PI * 2;
        s += path(`M${f(cx + Math.cos(a) * 3)} ${f(y + Math.sin(a) * 3)}L${f(cx + Math.cos(a) * (R - 4))} ${f(y + Math.sin(a) * (R - 4))}`, "ink-2");
      }
    }
    const roadY = y + R + 8;
    s += path(`M8 ${f(roadY)}H${W - 8}`);
    for (let x = 14 + r.range(0, 10); x < W - 20; x += 26) s += path(`M${f(x)} ${f(roadY + 9)}H${f(x + 12)}`, "ink-2");
    for (let k = 0; k < 3; k++) {
      const yy = y - R + 10 + k * 9;
      s += path(`M${f(6 + k * 4)} ${f(yy)}H${f(26 + k * 2)}`, "ink-2");
    }
    return s;
  },

  // Ripples from one to three drops, over a band of slow waves.
  water(r) {
    let s = "";
    const drops = r.int(1, 3);
    for (let d = 0; d < drops; d++) {
      const cx = r.range(50, 190), cy = r.range(45, 85), rings = r.int(4, 7);
      for (let i = 1; i <= rings; i++) {
        const rad = i * r.range(8, 11);
        s += `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rad * 1.6)}" ry="${f(rad * 0.55)}" class="${i > rings - 2 ? "ink-2" : ""}"/>`;
      }
    }
    for (let k = 0; k < 4; k++) {
      const y = 112 + k * 9, amp = r.range(2, 4), per = r.range(26, 40), ph = r() * 40;
      let d = `M0 ${f(y)}`;
      for (let x = 0; x <= W; x += per / 2) d += `Q${f(x + per / 4)} ${f(y + (((x + ph) / (per / 2)) % 2 < 1 ? -amp : amp))} ${f(x + per / 2)} ${f(y)}`;
      s += path(d, k % 2 ? "ink-2" : "");
    }
    return s;
  },

  // A low sun or moon, rays, stacked cloud contours, a few stars.
  sky(r) {
    let s = "";
    const cx = r.range(40, 200), cy = r.range(30, 60), R = r.range(12, 18);
    const moon = r.chance(0.4);
    if (moon) {
      s += path(`M${f(cx + R * 0.3)} ${f(cy - R)}A${f(R)} ${f(R)} 0 1 0 ${f(cx + R * 0.3)} ${f(cy + R)}A${f(R * 0.8)} ${f(R * 0.8)} 0 1 1 ${f(cx + R * 0.3)} ${f(cy - R)}Z`);
      for (let i = 0; i < r.int(5, 9); i++) {
        const x = r.range(10, W - 10), y = r.range(8, 70), z = r.range(1.5, 3);
        s += path(`M${f(x - z)} ${f(y)}H${f(x + z)}M${f(x)} ${f(y - z)}V${f(y + z)}`, "ink-2");
      }
    } else {
      s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}"/>`;
      const n = r.int(10, 16);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        s += path(`M${f(cx + Math.cos(a) * (R + 5))} ${f(cy + Math.sin(a) * (R + 5))}L${f(cx + Math.cos(a) * (R + 11 + (i % 2) * 6))} ${f(cy + Math.sin(a) * (R + 11 + (i % 2) * 6))}`, "ink-2");
      }
    }
    for (let k = 0; k < r.int(2, 3); k++) {
      const by = r.range(92, 132), bx = r.range(10, 120), bw = r.range(80, 120);
      let d = `M${f(bx)} ${f(by)}`;
      let x = bx;
      while (x < bx + bw) {
        const w = r.range(14, 26);
        d += `A${f(w / 2)} ${f(w / 2.4)} 0 0 1 ${f(x + w)} ${f(by)}`;
        x += w;
      }
      s += path(d + `H${f(bx)}`, k ? "ink-2" : "");
    }
    return s;
  },

  // A topographic map: nested contours around one or two summits.
  ground(r) {
    let s = "";
    const peaks = r.int(1, 2);
    for (let p = 0; p < peaks; p++) {
      const cx = r.range(60, 180), cy = r.range(50, 100), ph = r() * 6.28, n = r.int(6, 9);
      for (let i = 1; i <= n; i++) s += path(loop(r, cx, cy, i * 11, i * 7, 0.12 + i * 0.01, ph + i * 0.2), i % 4 === 0 ? "" : "ink-2");
    }
    for (let k = 0; k < 3; k++) s += path(`M0 ${f(140 - k * 5)}H${W}`, "ink-2");
    return s;
  },

  // Brick courses with gaps, crossed by a sagging wire.
  urban(r) {
    let s = "";
    const bh = r.range(10, 13), bw = r.range(26, 34), top = r.range(60, 80);
    for (let y = top; y < H; y += bh) {
      const off = ((y - top) / bh) % 2 ? bw / 2 : 0;
      s += path(`M0 ${f(y)}H${W}`, "ink-2");
      for (let x = -off; x < W; x += bw) if (r.chance(0.85)) s += path(`M${f(x)} ${f(y)}V${f(y + bh)}`, "ink-2");
    }
    const holes = r.int(1, 3);
    for (let i = 0; i < holes; i++) {
      const x = r.range(20, W - 50), y = top + bh * r.int(1, 4);
      s += `<rect x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(bh)}" class="hole"/>`;
    }
    const sag = r.range(14, 30), y0 = r.range(12, 30);
    s += path(`M0 ${f(y0)}Q${W / 2} ${f(y0 + sag * 2)} ${W} ${f(y0 + r.range(-6, 6))}`);
    s += path(`M0 ${f(y0 + 8)}Q${W / 2} ${f(y0 + 8 + sag * 2.2)} ${W} ${f(y0 + 10)}`, "ink-2");
    const bx = r.range(60, 180);
    s += path(`M${f(bx)} ${f(y0 + sag - 2)}l-4 6m4 -6l4 6`, "");
    return s;
  },

  // An arcade: a run of arches under a shallow dome.
  structures(r) {
    let s = "";
    const n = r.int(4, 7), base = r.range(126, 138), aw = (W - 40) / n, ah = r.range(34, 52);
    s += path(`M14 ${f(base)}H${W - 14}`);
    for (let i = 0; i < n; i++) {
      const x = 20 + i * aw;
      const pointed = r.chance(0.5);
      const top = base - ah;
      s += pointed
        ? path(`M${f(x + 4)} ${f(base)}V${f(top + 10)}Q${f(x + 4)} ${f(top)} ${f(x + aw / 2)} ${f(top - 8)}Q${f(x + aw - 4)} ${f(top)} ${f(x + aw - 4)} ${f(top + 10)}V${f(base)}`)
        : path(`M${f(x + 4)} ${f(base)}V${f(top + 6)}A${f(aw / 2 - 4)} ${f(aw / 2 - 4)} 0 0 1 ${f(x + aw - 4)} ${f(top + 6)}V${f(base)}`);
    }
    const domeY = base - ah - 16, dw = r.range(60, 110), dx = r.range(40, W - 40 - dw);
    s += path(`M${f(dx)} ${f(domeY)}C${f(dx)} ${f(domeY - dw * 0.55)} ${f(dx + dw)} ${f(domeY - dw * 0.55)} ${f(dx + dw)} ${f(domeY)}Z`, "ink-2");
    s += path(`M${f(dx + dw / 2)} ${f(domeY - dw * 0.42)}V${f(domeY - dw * 0.42 - 12)}`);
    return s;
  },

  // A cut fruit: segments radiating from the core, with seeds.
  "fruits-vegetables"(r) {
    let s = "";
    const cx = r.range(80, 160), cy = r.range(70, 85), R = r.range(48, 60), n = r.int(7, 12);
    s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R)}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(R - 6)}" class="ink-2"/>`;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      s += path(`M${f(cx + Math.cos(a) * 6)} ${f(cy + Math.sin(a) * 6)}L${f(cx + Math.cos(a) * (R - 8))} ${f(cy + Math.sin(a) * (R - 8))}`, "ink-2");
      const am = a + Math.PI / n, d = r.range(R * 0.45, R * 0.65);
      const sx = cx + Math.cos(am) * d, sy = cy + Math.sin(am) * d;
      s += `<ellipse cx="${f(sx)}" cy="${f(sy)}" rx="1.6" ry="3.2" transform="rotate(${f((am * 180) / Math.PI + 90)} ${f(sx)} ${f(sy)})" class="seed"/>`;
    }
    return s + `<circle cx="${f(cx)}" cy="${f(cy)}" r="5"/>`;
  },
};

export interface Motif {
  seed: number;
  /** Inner SVG markup in a 240×150 viewBox. */
  markup: string;
  /** Wash blob behind the linework, as a path. */
  wash: string;
}

export function motifFor(id: string, category: string): Motif {
  const seed = hashString(`${category}/${id}`);
  const r = rng(seed);
  const gen = GEN[category] ?? GEN.ground!;
  const wash = loop(rng(seed ^ 0x9e3779b9), W * r.range(0.4, 0.6), H * 0.52, W * 0.42, H * 0.4, 0.22);
  return { seed, markup: gen(r), wash };
}

export function motifSvg(id: string, category: string, extraClass = ""): string {
  const m = motifFor(id, category);
  return `<svg class="motif ${extraClass}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <path class="wash" d="${m.wash}"/>
    <g class="lines" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">${m.markup}</g>
  </svg>`;
}
