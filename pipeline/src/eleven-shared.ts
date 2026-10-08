// One-off: search the shared voice library (read-only, no secrets printed).
import { elJson } from "./eleven.ts";
const queries = process.argv.slice(2);
for (const q of queries) {
  const data: any = await elJson(`/v1/shared-voices?page_size=12&${q}`);
  console.log(`\n## ${q} (${data.voices?.length})`);
  for (const v of data.voices ?? []) {
    console.log(`${v.voice_id} | ${v.public_owner_id} | ${v.name} | ${v.gender}/${v.age}/${v.accent}/${v.language} | ${v.category} | used:${v.cloned_by_count} | free_users:${v.free_users_allowed} | ${(v.description ?? "").replace(/\s+/g, " ").slice(0, 90)}`);
  }
}
