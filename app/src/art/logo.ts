// The mark: a leaf that speaks. Leaf outline, midrib and veins, with two sound
// arcs coming off its edge. Also exported as raw paths for icon rendering.

export const MARK_PATHS = `
  <path d="M8.5 39.5C8 23 18.5 10.5 36.5 7.5C38.5 25.5 27 38.5 8.5 39.5Z"/>
  <path d="M8.5 39.5C17 30.5 26 20 36.5 7.5M15.5 31.5L14.8 24.5M15.5 31.5L22.5 31M21.5 24.5L21 17.5M21.5 24.5L28.5 24"/>
  <path d="M35 28.5C37.6 30.6 38.3 34.4 36.5 37.2M39.6 25.2C44 28.8 45.2 35.4 42 40.2"/>`;

export function markSvg(size = 32, label?: string): string {
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true" focusable="false"`;
  return `<svg class="mark" viewBox="0 0 48 48" width="${size}" height="${size}" ${a11y} fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${MARK_PATHS}</svg>`;
}
