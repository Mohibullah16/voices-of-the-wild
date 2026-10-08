// One-off: list models + voices + subscription numbers (no secrets printed).
import { elJson, subscription } from "./eleven.ts";
import { writeJson, BUILD_DIR } from "./lib.ts";
import { join } from "node:path";

const s = await subscription();
console.log("subscription", { tier: s.tier, used: s.character_count, limit: s.character_limit, reset: s.next_character_count_reset_unix });
const models: any[] = await elJson("/v1/models");
for (const m of models) console.log("model", m.model_id, "|", m.name, "| tts:", m.can_do_text_to_speech, "| cost:", m.model_rates?.character_cost_multiplier ?? m.token_cost_factor ?? "", "| maxchars:", m.maximum_text_length_per_request ?? "");
const voices: any = await elJson("/v2/voices?page_size=100&include_total_count=true");
console.log("voices", voices.voices?.length, voices.total_count);
const slim = (voices.voices ?? []).map((v: any) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels, description: v.description }));
writeJson(join(BUILD_DIR, "eleven-voices.json"), { models: models.map((m) => ({ id: m.model_id, name: m.name, description: m.description, rates: m.model_rates })), voices: slim });
for (const v of slim) console.log(v.id, "|", v.name, "|", v.category, "|", JSON.stringify(v.labels), "|", (v.description ?? "").slice(0, 100));
