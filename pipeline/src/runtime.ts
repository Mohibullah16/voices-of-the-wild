// Compose app/public/data/roster.runtime.json (CONTRACT §2) from the roster, the audio manifest and calibration.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  AUDIO_MANIFEST, CALIBRATION_JSON, DATA_OUT, DEFAULT_PREFIX, DIM, MODEL_DTYPE, MODEL_ID, PREFIX_LITERAL,
  loadRoster, readJson, stripTags, writeJson, type LineKey, type RosterOwner,
} from "./lib.ts";

export interface AudioEntry {
  owner: string;
  line: LineKey;
  text: string;
  caption: string;
  src: string;
  engine: "elevenlabs" | "kokoro";
  voice: string;
  voiceName?: string;
  model: string;
  duration: number;
}
export type AudioManifest = Record<string, AudioEntry>; // key: `${owner}/${line}`

export interface Thresholds {
  category: Record<string, number>;
  species: Record<string, number>;
  margin: number;
  global_min: number;
}
export interface CalibrationState {
  prefix: string;
  thresholds: Thresholds;
  summary?: Record<string, unknown>;
}

export function defaultThresholds(categories: string[]): Thresholds {
  return {
    category: Object.fromEntries(categories.map((c) => [c, 0.3])),
    species: Object.fromEntries(categories.map((c) => [c, 0.35])),
    margin: 0.02,
    global_min: 0.3,
  };
}

export function writeRuntime() {
  const roster = loadRoster();
  const audio = readJson<AudioManifest>(AUDIO_MANIFEST, {});
  const cal = readJson<CalibrationState | null>(CALIBRATION_JSON, null);
  const prefix = cal?.prefix ?? DEFAULT_PREFIX;
  const thresholds = cal?.thresholds ?? defaultThresholds(roster.categories.map((c) => c.id));

  const line = (o: RosterOwner, k: LineKey) => {
    const text = o.lines[k]!;
    const a = audio[`${o.id}/${k}`];
    const ok = a && a.text === text;
    return {
      text,
      caption: stripTags(text),
      src: ok ? a.src : "",
      engine: ok ? a.engine : "kokoro",
      duration: ok ? a.duration : 0,
    };
  };
  const lines = (o: RosterOwner) =>
    Object.fromEntries((Object.keys(o.lines) as LineKey[]).map((k) => [k, line(o, k)]));
  const strip = ({ descriptions: _d, lines: _l, match_title: _t, ...rest }: RosterOwner) => rest;

  let el = 0, ko = 0;
  for (const a of Object.values(audio)) a.engine === "elevenlabs" ? el++ : ko++;

  const runtime = {
    version: roster.version,
    model: {
      id: MODEL_ID,
      dtype: MODEL_DTYPE,
      dim: DIM,
      prefix: { image: "", text: PREFIX_LITERAL[prefix] ?? "" },
      prefix_variant: prefix,
    },
    thresholds,
    credits: {
      voices: "ElevenLabs",
      voices_note: "Elder voices by ElevenLabs (Eleven v4), generated once at build time.",
      open_voices: "Kokoro-82M (Apache 2.0) via kokoro-js, generated at build time.",
      embeddings: "EmbeddingGemma 2 by Google DeepMind (Apache 2.0), via Transformers.js.",
      calibration_photos: "Wikimedia Commons contributors (CC0 / public domain / CC BY / CC BY-SA); used only for threshold calibration, not shipped.",
      lines: { elevenlabs: el, kokoro: ko },
    },
    categories: roster.categories.map((c) => ({
      id: c.id,
      name: c.name,
      guardian: { ...strip(c.guardian), lines: lines(c.guardian) },
      characters: c.characters.map((ch) => ({ ...strip(ch), lines: lines(ch) })),
    })),
  };
  writeJson(join(DATA_OUT, "roster.runtime.json"), runtime);
  return runtime;
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  writeRuntime();
  console.log("wrote roster.runtime.json");
}
