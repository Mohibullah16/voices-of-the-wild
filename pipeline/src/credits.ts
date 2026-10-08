import { subscription } from "./eleven.ts";
const s: any = await subscription();
console.log({ tier: s.tier, used: s.character_count, limit: s.character_limit, voice_slots_used: s.voice_slots_used, voice_limit: s.voice_limit, status: s.status });
