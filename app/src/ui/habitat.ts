// Teasers for characters you have not met yet: where to look, never what it is.
const PHRASES: Record<string, string> = {
  street: "Somewhere along a street",
  park: "Somewhere in a park",
  village: "Out past the city, in a village",
  roadside: "By the side of a road",
  desert: "Somewhere dry and sandy",
  farm: "Out on a farm",
  coast: "Somewhere by the sea",
  beach: "Down on the beach",
  garden: "In someone’s garden",
  wasteland: "On an empty plot",
  median: "On a road median",
  mountain: "Up in the hills",
  hill: "Up in the hills",
  forest: "Under thick trees",
  wetland: "Somewhere marshy",
  mangrove: "Among the mangroves",
  mudflat: "Out on the mudflats",
  "tide-pool": "In a rock pool",
  wall: "On an old wall",
  walls: "On an old wall",
  fence: "Along a fence",
  pond: "Near a pond",
  fountain: "Beside a fountain",
  lawn: "On a lawn",
  hedge: "Inside a hedge",
  river: "Near a river",
  riverbank: "Near a river",
  canal: "Along a canal",
  rooftop: "Up on a rooftop",
  market: "In a busy market",
  cart: "On a fruit cart",
  sky: "Up above you",
  square: "In a town square",
  scrub: "In the scrub",
  wires: "Up on the wires",
  field: "Out in a field",
  landfill: "Where the rubbish goes",
  drain: "Near a drain",
  harbor: "At the harbour",
  ruins: "Among old ruins",
  historic: "Somewhere old and famous",
  landmark: "Somewhere old and famous",
  "old-city": "In the old city",
  trees: "Up in the trees",
  tree: "On a tree",
  vine: "Climbing a vine",
  water: "Somewhere near water",
  sea: "Out at sea",
  highway: "Along a highway",
  road: "On the road",
  railway: "Near the railway",
  construction: "On a building site",
  ground: "Down at your feet",
  stones: "Among the stones",
  rocks: "Among the rocks",
  building: "On a building",
  "water-tank": "Up by the water tanks",
  eaves: "Under the eaves",
  palms: "Up in the palms",
  outskirts: "On the edge of town",
};

export function habitatHint(habitat: string[], seed: string): string {
  const known = habitat.filter((h) => PHRASES[h]);
  if (!known.length) return "Somewhere outside…";
  // Stable choice per character so the teaser doesn't change between visits.
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${PHRASES[known[h % known.length]!]}…`;
}

export function habitatLabel(h: string): string {
  return h.replace(/-/g, " ");
}
