// Guardian sigils: a wax-seal style roundel per category. The ring pattern
// (notch count, star positions, inner beading) is derived from the category
// so each guardian's seal is distinct, with the category emblem at its heart.
import { emblemPaths } from "./emblems";
import { f, hashString, rng } from "./prng";

export function sigilSvg(categoryId: string, size = 96, label?: string): string {
  const r = rng(hashString(`sigil/${categoryId}`));
  const c = 48;
  const notches = r.int(9, 16);
  const rot = r() * 30;
  let ring = "";
  for (let i = 0; i < notches; i++) {
    const a = ((i / notches) * 360 + rot) * (Math.PI / 180);
    ring += `<path d="M${f(c + Math.cos(a) * 40)} ${f(c + Math.sin(a) * 40)}L${f(c + Math.cos(a) * 44.5)} ${f(c + Math.sin(a) * 44.5)}"/>`;
  }
  const stars = r.int(2, 4);
  let marks = "";
  for (let i = 0; i < stars; i++) {
    const a = ((i / stars) * 360 + rot + 180 / notches) * (Math.PI / 180);
    const x = c + Math.cos(a) * 35, y = c + Math.sin(a) * 35;
    marks += `<path d="M${f(x)} ${f(y - 2.6)}L${f(x + 0.8)} ${f(y - 0.8)}L${f(x + 2.6)} ${f(y)}L${f(x + 0.8)} ${f(y + 0.8)}L${f(x)} ${f(y + 2.6)}L${f(x - 0.8)} ${f(y + 0.8)}L${f(x - 2.6)} ${f(y)}L${f(x - 0.8)} ${f(y - 0.8)}Z" fill="currentColor" stroke="none"/>`;
  }
  const beads = r.int(20, 32);
  let beading = "";
  for (let i = 0; i < beads; i++) {
    const a = (i / beads) * Math.PI * 2;
    beading += `<circle cx="${f(c + Math.cos(a) * 31)}" cy="${f(c + Math.sin(a) * 31)}" r=".7" fill="currentColor" stroke="none"/>`;
  }
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true" focusable="false"`;
  return `<svg class="sigil" viewBox="0 0 96 96" width="${size}" height="${size}" ${a11y} fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="48" cy="48" r="46.5"/><circle cx="48" cy="48" r="38.5"/>
    ${ring}${marks}${beading}
    <g transform="translate(28.8 28.8) scale(.8)" stroke-width="1.75">${emblemPaths(categoryId)}</g>
  </svg>`;
}
