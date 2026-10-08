// Voice casting. ElevenLabs voices are stock voices already in the account (premade + library voices
// added earlier; no cloned voices). Kokoro voices are picked from each casting note.
import type { Roster, RosterOwner } from "./lib.ts";

export const ELEVEN_MODEL = "eleven_v4"; // expressive v4 (not v4 Turbo); confirmed via GET /v1/models
export const ELEVEN_FORMAT = "mp3_44100_64";

/** Elder → ElevenLabs voice (id, name, why). English voices only (option A). Will, Charlie and Laura are each used twice: the account has no spare English voices left. */
export const ELEVEN_CAST: Record<string, { id: string; name: string; why: string }> = {
  "weeping-willow": { id: "9cI5mhBtM4WtQ9Fo6jWQ", name: "Sara - Warm, Serious and Steady", why: "warm, slow grandmother (was neem)" },
  "maple-tree": { id: "bIHbv24MWmeRgasZH58o", name: "Will", why: "bright, bouncy young male (was conocarpus)" },
  "house-crow": { id: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", why: "husky, raspy trickster" },
  robin: { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam - Energetic, Social Media Creator", why: "young, bright, cheeky (was myna)" },
  "street-dog": { id: "SOYHLrjzK2X1ezoPC6cr", name: "Harry", why: "rough, clipped" },
  cat: { id: "qSeXEcewz7tA0Q0qk9fH", name: "Victoria", why: "warm, smooth drawl" },
  "black-ant-trail": { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", why: "crisp, clear, brisk" },
  ladybird: { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", why: "small, bright, chatty female (was gecko)" },
  bougainvillea: { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", why: "velvety, theatrical" },
  oleander: { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", why: "mature, firm, no-nonsense" },
  "lawn-grass": { id: "bIHbv24MWmeRgasZH58o", name: "Will (shared with conocarpus)", why: "easygoing young male" },
  "money-plant": { id: "ljX1ZrXuDIIRVcmiVSyR", name: "Michael - Genuine and Approachable", why: "chatty, warm, middle-aged male" },
  "mango-fruit": { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel - Steady Broadcaster", why: "rich, grand, regal" },
  "banana-bunch": { id: "iP95p4xoKVk53GoZ742B", name: "Chris", why: "bright, friendly patter" },
  "fallen-leaves": { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", why: "warm, gentle" },
  feather: { id: "SAz9YHcvj6GT2YYXdXww", name: "River", why: "gender-neutral, soft, airy" },
  sunset: { id: "nPczCjzI2devNBz1zQrb", name: "Brian", why: "deep, velvety, comforting" },
  "cumulus-clouds": { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", why: "bouncy, quirky" },
  "sea-waves": { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie (shared with footbridge)", why: "energetic, booming" },
  "storm-drain-nala": { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", why: "laid-back, resonant grumble" },
  "yellow-taxi": { id: "cjVigY5qzO86Huf0OWal", name: "Eric - Smooth, Trustworthy", why: "fast, friendly big-city patter (was rickshaw)" },
  "ice-cream-truck": { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", why: "warm female, sunny but firm on safety (was truck)" },
  "clock-tower": { id: "JBFqnCBsd6RMkjVDRZzb", name: "George - Warm, Captivating Storyteller", why: "deep, calm, slow older man (was dome)" },
  footbridge: { id: "IKne3meq5aSn9XLyUdCD", name: "Charlie (shared with sea-waves)", why: "young, earnest, energetic male" },
  "fire-hydrant": { id: "pqHfZKP75CvOlQylNhV4", name: "Bill", why: "gruff but kind, dry humour (was pole)" },
  "graffiti-mural": { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura (shared with cumulus-clouds)", why: "bright, bubbly young female; Adam (was wall-chalking) is male" },
  motorcycle: { id: "8baRIHZEGj62eS9YHzC6", name: "Neha P - Messy, Unpolished & Relatable", why: "young, casual, buzzy; the city's delivery bike" },
  bicycle: { id: "k7nOSUCadIEwB6fdJmbw", name: "Ahmed - Clear, Deep and Natural", why: "warm, steady older voice for Spokes" },
};

/** Kokoro voice with a speed. */
export interface KVoice {
  voice: string;
  speed: number;
}

/** Guardians get the deepest / most characterful (and best-graded) Kokoro voices, slowed a touch. */
const GUARDIAN_CAST: Record<string, KVoice> = {
  trees: { voice: "af_heart", speed: 0.9 },
  birds: { voice: "bm_fable", speed: 0.92 },
  animals: { voice: "am_fenrir", speed: 0.9 },
  "small-creatures": { voice: "af_kore", speed: 1.0 },
  flowers: { voice: "bf_emma", speed: 0.9 },
  plants: { voice: "af_sarah", speed: 0.9 },
  "fruits-vegetables": { voice: "bm_george", speed: 0.92 },
  ground: { voice: "af_bella", speed: 0.88 },
  sky: { voice: "am_onyx", speed: 0.85 },
  water: { voice: "af_nicole", speed: 0.9 },
  vehicles: { voice: "am_michael", speed: 0.9 },
  structures: { voice: "bm_lewis", speed: 0.88 },
  urban: { voice: "am_santa", speed: 0.9 },
};

const POOLS: Record<string, string[]> = {
  "F-young": ["af_jessica", "af_sky", "af_nova", "af_bella", "af_kore", "af_aoede"],
  "F-mid": ["af_sarah", "af_aoede", "af_river", "bf_isabella", "af_alloy", "af_heart", "bf_emma"],
  "F-old": ["bf_isabella", "bf_emma", "af_river", "af_sarah", "bf_alice", "bf_lily"],
  "F-soft": ["af_nicole", "af_sky", "bf_lily"],
  "M-young": ["am_puck", "am_liam", "am_echo", "am_eric", "am_adam"],
  "M-mid": ["am_michael", "am_eric", "bm_daniel", "am_adam", "am_puck", "am_echo"],
  "M-old": ["bm_george", "am_onyx", "bm_lewis", "am_fenrir", "bm_fable", "bm_daniel", "am_santa"],
  "M-deep": ["am_onyx", "am_fenrir", "bm_george", "bm_lewis", "am_santa", "am_michael"],
  "N-young": ["af_sky", "am_puck", "af_nova", "am_echo", "af_kore"],
  "N-mid": ["af_river", "af_alloy", "am_eric", "af_kore", "bf_isabella"],
  "N-old": ["bm_fable", "af_river", "bm_george", "bf_isabella"],
};

function classify(note: string) {
  const n = note.toLowerCase();
  const fem = /\b(female|woman|girl|grandmother|aunt|khala|feminine)\b/.test(n);
  const mal = /\b(male|man|boy|uncle)\b/.test(n);
  const g: "F" | "M" | "N" = fem && !mal ? "F" : mal && !fem ? "M" : fem && mal ? (n.indexOf("female") < n.indexOf("male") ? "F" : "M") : "N";
  const age = /\b(child|teen|teenager|young|youthful|small)\b/.test(n) ? "young" : /\b(elderly|old|older)\b/.test(n) ? "old" : "mid";
  const deep = /\b(deep|booming|resonant|baritone|gravelly)\b/.test(n);
  const soft = /\b(whisper|whispery|airy|hushed|breathy)\b/.test(n);
  let speed = 1.0;
  if (/very fast|breathless|tumbling/.test(n)) speed = 1.15;
  else if (/\b(fast|quick)\b/.test(n)) speed = 1.07;
  else if (/very slow/.test(n)) speed = 0.85;
  else if (/\bslow\b/.test(n)) speed = 0.92;
  let pool = `${g}-${age}`;
  if (g === "M" && deep && age !== "young") pool = "M-deep";
  if (g === "F" && soft) pool = "F-soft";
  return { pool, speed };
}

/** Characters added after the first cast: fixed voices, kept out of the usage count so nobody else's voice shifts. */
const FIXED_CAST: Record<string, KVoice> = {
  "oak-tree": { voice: "bm_george", speed: 0.92 },
  car: { voice: "am_eric", speed: 0.95 },
};

/** Deterministic Kokoro cast for every non-elder owner (and fallbacks for elders). */
export function kokoroCast(roster: Roster): Record<string, KVoice> {
  const cast: Record<string, KVoice> = {};
  const uses = new Map<string, number>();
  const bump = (v: string) => uses.set(v, (uses.get(v) ?? 0) + 1);
  for (const c of roster.categories) {
    const g = GUARDIAN_CAST[c.id] ?? { voice: "am_onyx", speed: 0.9 };
    cast[c.guardian.id] = g;
    bump(g.voice);
  }
  for (const c of roster.categories) {
    const taken = new Set<string>([cast[c.guardian.id]!.voice]);
    for (const ch of c.characters) {
      if (FIXED_CAST[ch.id]) { cast[ch.id] = FIXED_CAST[ch.id]!; continue; }
      const { pool, speed } = classify(ch.voice ?? "");
      const candidates = POOLS[pool] ?? POOLS["N-mid"]!;
      const free = candidates.filter((v) => !taken.has(v));
      const list = free.length ? free : candidates;
      const pick = [...list].sort((a, b) => (uses.get(a) ?? 0) - (uses.get(b) ?? 0) || list.indexOf(a) - list.indexOf(b))[0]!;
      cast[ch.id] = { voice: pick, speed };
      taken.add(pick);
      bump(pick);
    }
  }
  return cast;
}

export function isElder(o: RosterOwner) {
  return o.tier === "elder";
}
