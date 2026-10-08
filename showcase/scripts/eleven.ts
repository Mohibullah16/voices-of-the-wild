// ElevenLabs helpers for the showcase (build-time only).
// The key is read from week-1/.env (`elevenlabs-api-key`) and is never printed, logged or written.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const SHOWCASE = join(dirname(fileURLToPath(import.meta.url)), "..");
export const WEEK1 = join(SHOWCASE, "..");
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

export async function el(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(BASE + path, { ...init, headers: { "xi-api-key": key(), ...(init.headers ?? {}) } });
  if (!res.ok) {
    const body = (await res.text()).replaceAll(key(), "***").slice(0, 400);
    throw new Error(`ElevenLabs HTTP ${res.status}: ${body}`);
  }
  return res;
}

export interface Usage {
  used: number;
  limit: number;
  remaining: number;
}

/** GET /v1/user/subscription, reduced to numbers only. */
export async function usage(): Promise<Usage> {
  const s: any = await (await el("/v1/user/subscription")).json();
  return { used: s.character_count, limit: s.character_limit, remaining: s.character_limit - s.character_count };
}

export const fmtUsage = (u: Usage) => `used ${u.used} / ${u.limit} (remaining ${u.remaining})`;
