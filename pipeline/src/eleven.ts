// ElevenLabs client helpers. The API key is read from week-1/.env and never printed, logged or written.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WEEK1 } from "./lib.ts";

const BASE = "https://api.elevenlabs.io";

function readKey(): string {
  const raw = readFileSync(join(WEEK1, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*elevenlabs-api-key\s*=\s*(.*)\s*$/);
    if (m) return m[1]!.replace(/^["']|["']$/g, "").trim();
  }
  throw new Error("elevenlabs-api-key not found in week-1/.env");
}

let KEY: string | null = null;
const key = () => (KEY ??= readKey());

export class HttpError extends Error {
  constructor(public status: number, public body: string) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
  }
}

export async function el(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "xi-api-key": key(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.text()).replaceAll(key(), "***");
    throw new HttpError(res.status, body);
  }
  return res;
}

export async function elJson<T = any>(path: string): Promise<T> {
  return (await el(path)).json() as Promise<T>;
}

export interface Subscription {
  character_count: number;
  character_limit: number;
  tier?: string;
  next_character_count_reset_unix?: number;
}

export async function subscription(): Promise<Subscription> {
  return elJson<Subscription>("/v1/user/subscription");
}

export async function tts(voiceId: string, modelId: string, text: string, outputFormat: string): Promise<{ audio: Buffer; headers: Headers }> {
  const res = await el(`/v1/text-to-speech/${voiceId}?output_format=${encodeURIComponent(outputFormat)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: modelId }),
  });
  return { audio: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}
