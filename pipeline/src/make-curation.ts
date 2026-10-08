// One-off helper: turn "character → rejected photo numbers" (from eyeballing contact sheets) into
// calibration/curation.json (rejected Commons titles, stable across refetches). Merges with existing.
import { join } from "node:path";
import { CAL_DIR, readJson, writeJson } from "./lib.ts";

const REJECT_BY_INDEX: Record<string, number[]> = JSON.parse(process.argv[2] ?? "{}");
const manifest = readJson<Record<string, { file: string; title: string }[]>>(join(CAL_DIR, "photos.json"), {});
const negs = readJson<{ file: string; title: string }[]>(join(CAL_DIR, "negatives.json"), []);
const cur = readJson<{ reject: Record<string, string[]> }>(join(CAL_DIR, "curation.json"), { reject: {} });
for (const [id, idxs] of Object.entries(REJECT_BY_INDEX)) {
  const list = id === "_negative" ? negs : manifest[id] ?? [];
  const titles = idxs.map((n) => list[n - 1]?.title).filter(Boolean) as string[];
  cur.reject[id] = [...new Set([...(cur.reject[id] ?? []), ...titles])];
}
writeJson(join(CAL_DIR, "curation.json"), cur);
console.log(Object.entries(cur.reject).map(([k, v]) => `${k}: ${v.length}`).join(", "));
