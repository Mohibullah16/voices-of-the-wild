// Thirteen category emblems, hand-drawn as SVG paths on a 48×48 grid.
// One line language throughout: 1.6 stroke, round caps and joins, no fills,
// drawn the way a naturalist would sketch them in a margin.

export const CATEGORY_IDS = [
  "trees", "birds", "animals", "small-creatures", "flowers", "plants", "fruits-vegetables",
  "ground", "sky", "water", "vehicles", "structures", "urban",
] as const;

const E: Record<string, string> = {
  trees: `
    <path d="M14 30C8 30 6 24 10 21C8 15 13 10 18 12C20 6 29 6 31 11C36 9 41 14 38 19C43 22 40 30 34 30Z"/>
    <path d="M22 44C22.5 38 22.5 34 21.5 30M26 44C25.5 38 25.5 34 26.5 30M17 44H31"/>
    <path d="M24 30V22M24 26L19.5 21.5M24 24L28.5 19.5"/>`,
  birds: `
    <path d="M10 30C14 22 22 18 30 20C32 15 38 14 40.5 18L45 19.5L40.5 21C39.5 28 34 33.5 24 34L12 38L16 32Z"/>
    <circle cx="37.6" cy="18.4" r=".9" fill="currentColor" stroke="none"/>
    <path d="M20 26.5C25 25 30 26 33 29M8 41H40M25.5 34L24.5 41M30 33.2L30 41"/>`,
  animals: `
    <path d="M24 42.5C17 42.5 14 37.5 16 33.5C18 29.5 21 28 24 28C27 28 30 29.5 32 33.5C34 37.5 31 42.5 24 42.5Z"/>
    <ellipse cx="13.5" cy="23.5" rx="3.2" ry="4.4" transform="rotate(-24 13.5 23.5)"/>
    <ellipse cx="20" cy="15.5" rx="3.2" ry="4.6" transform="rotate(-8 20 15.5)"/>
    <ellipse cx="28" cy="15.5" rx="3.2" ry="4.6" transform="rotate(8 28 15.5)"/>
    <ellipse cx="34.5" cy="23.5" rx="3.2" ry="4.4" transform="rotate(24 34.5 23.5)"/>`,
  "small-creatures": `
    <ellipse cx="24" cy="29" rx="8" ry="10.5"/>
    <circle cx="24" cy="15" r="3.8"/>
    <path d="M24 18.8V39.5M16.5 24L10.5 19.5M16 29H9M16.8 34L11 39M31.5 24L37.5 19.5M32 29H39M31.2 34L37 39"/>
    <path d="M22.2 11.8C20.5 8 17.5 6.5 15 6.5M25.8 11.8C27.5 8 30.5 6.5 33 6.5"/>`,
  flowers: `
    ${[0, 72, 144, 216, 288].map((a) => `<path transform="rotate(${a} 24 17)" d="M24 13.6C20.4 9.4 21 4.5 24 4.5C27 4.5 27.6 9.4 24 13.6Z"/>`).join("")}
    <circle cx="24" cy="17" r="3"/>
    <path d="M24 20.5C24 29 23 36 24 44M24 34C28 30 33 30 35.5 31C32.5 35 28 36 24 34Z"/>`,
  plants: `
    <path d="M24 44C24 32 22 22 15.5 12M24 44C25 30 28 20 34 10M24 44C23 35 18 29 9 26M24 44C26 35 31 30.5 40 28.5M24 44V15"/>
    <path d="M11 44H37"/>`,
  "fruits-vegetables": `
    <path d="M26 14C16 14 10 24 12 33C14 41 24 44.5 32 40.5C40 36.5 40 24 34.5 18C32.5 15.8 29.5 14 26 14Z"/>
    <path d="M26 14C26 11 27 9 29 8M28.5 9C33 4.5 39.5 5 42 7C38.5 11 33.5 12 28.5 9ZM30 8.8L40 7.2"/>
    <path d="M18 26C17 30 18 34 21 36.5"/>`,
  ground: `
    <path d="M10 24C10 14 38 14 38 24Z"/>
    <path d="M20 24C20 32 19.5 37 18.5 42H29.5C28.5 37 28 32 28 24"/>
    <circle cx="18" cy="19.5" r="1.4"/><circle cx="27" cy="18" r="1.1"/><circle cx="32" cy="21" r="1"/>
    <path d="M5 42H43"/>
    <path d="M35 42C35 39.5 37 38 39.5 38C42 38 43 40 43 42M6 42C6 40.5 7.5 39.5 9 39.5C11 39.5 12 40.5 12 42"/>`,
  sky: `
    <circle cx="31" cy="15" r="5.2"/>
    <path d="M31 5.5V7.2M31 22.8V24M40.5 15H38.8M23.2 15H21.5M37.7 8.3L36.5 9.5M25.5 20.5L24.3 21.7M37.7 21.7L36.5 20.5M25.5 9.5L24.3 8.3"/>
    <path d="M12 39C7 39 6 33 10 31C10 26 16 24 19 27C21 21 30 20.5 32 26.5C38 24.5 42 29.5 40 33C43.5 34.5 42.5 39 38 39Z"/>`,
  water: `
    <path d="M24 5C19 13 16.5 17 16.5 21.5C16.5 26.5 20 29.5 24 29.5C28 29.5 31.5 26.5 31.5 21.5C31.5 17 29 13 24 5Z"/>
    <path d="M21 21.5C21 23.8 22.2 25.4 24 26"/>
    <path d="M6 36.5C10 33.5 14 33.5 18 36.5C22 39.5 26 39.5 30 36.5C34 33.5 38 33.5 42 36.5M10 42.5C13 40.5 16 40.5 19 42.5C22 44.5 26 44.5 29 42.5C32 40.5 35 40.5 38 42.5"/>`,
  vehicles: `
    <circle cx="14" cy="36" r="4.2"/><circle cx="35" cy="36" r="4.2"/>
    <circle cx="14" cy="36" r="1" fill="currentColor" stroke="none"/><circle cx="35" cy="36" r="1" fill="currentColor" stroke="none"/>
    <path d="M9.8 36H8V24C8 18 11.5 14 17 14H30C36.5 15 41.5 21 41.5 28V36H39.2M18.2 36H30.8"/>
    <path d="M8 22H41M13 18H28V22M30.5 15V36"/>`,
  structures: `
    <path d="M12 30C12 21.5 24 18 24 11C24 18 36 21.5 36 30"/>
    <path d="M24 11V5.5M22.6 7.2C23.6 6.6 24.4 6.6 25.4 7.2"/>
    <path d="M9.5 30H38.5V44H9.5ZM20 44V38.5C20 34.5 28 34.5 28 38.5V44"/>
    <path d="M41 44V19M45 44V19M40.2 19L43 13L45.8 19ZM40 27H46"/>`,
  urban: `
    <path d="M24 44V6M15.5 12H32.5M18 17H30"/>
    <circle cx="15.5" cy="10.6" r="1.2"/><circle cx="32.5" cy="10.6" r="1.2"/>
    <path d="M4 22C9 16 12.5 13.5 15.5 12M32.5 12C35.5 13.5 39 16 44 22M4 27C10 20 14 17.5 18 17M30 17C34 17.5 38 20 44 27"/>
    <path d="M19.5 44H28.5"/>`,
};

/** Inner SVG markup for a category emblem (48×48 grid). Unknown ids get a plain field-mark. */
export function emblemPaths(categoryId: string): string {
  return E[categoryId] ?? `<circle cx="24" cy="24" r="14"/><path d="M24 14V34M14 24H34"/>`;
}

export function emblemSvg(categoryId: string, size = 48, label?: string): string {
  const a11y = label ? `role="img" aria-label="${label}"` : `aria-hidden="true" focusable="false"`;
  return `<svg class="emblem" viewBox="0 0 48 48" width="${size}" height="${size}" ${a11y} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${emblemPaths(categoryId)}</svg>`;
}

/** Short labels for chips and tabs; the roster's own name is used for headings. */
export const SHORT_NAME: Record<string, string> = {
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

/** One shooting tip per category, shown on the capture screen. */
export const PHOTO_HINT: Record<string, string> = {
  trees: "Trees talk more when you get one leaf in the frame.",
  birds: "Birds: fill the frame. Zoom, don't creep closer.",
  animals: "Animals: from a respectful distance, the whole animal.",
  "small-creatures": "Small creatures: get low, get close, don't touch.",
  flowers: "Flowers: one bloom, close, with a leaf beside it.",
  plants: "Plants: show the leaves, not the whole bed.",
  "fruits-vegetables": "Fruit and veg: one piece, filling the frame.",
  ground: "Ground: point down. Stones, leaves, cracks, feathers.",
  sky: "Sky: look up. Never point the camera at the sun.",
  water: "Water: the surface, the ripples, the edge.",
  vehicles: "Vehicles: only parked ones, from the pavement.",
  structures: "Structures: step back and get the whole shape.",
  urban: "Street things: poles, benches, walls, signs.",
};
