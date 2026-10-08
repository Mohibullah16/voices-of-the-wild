// Checks a cloud listener: sends calibration photos (downscaled like the app) and runs the app's own matcher.
//   LISTENER=http://localhost:7861 npx tsx tools/listener-check.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { match } from "../src/match";

const L = process.env.LISTENER ?? "http://localhost:7861";
const data = join(import.meta.dirname, "..", "public", "data");
const roster = JSON.parse(readFileSync(join(data, "roster.runtime.json"), "utf8"));
const index = JSON.parse(readFileSync(join(data, "embeddings.index.json"), "utf8"));
const buf = readFileSync(join(data, "embeddings.bin"));
const bank = { dim: roster.model.dim, vectors: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), index };
const photos = join(import.meta.dirname, "..", "..", "pipeline", "calibration", "photos");
const ids = (process.env.PHOTOS ?? "neem-tree,house-crow,auto-rickshaw,sunset,street-dog,mango-fruit,bougainvillea,lawn-grass").split(",");
let ok = 0;
for (const id of ids) {
  const src = /\.(jpe?g|png)$/i.test(id) ? id : id.includes("/") ? join(photos, `${id}.jpg`) : join(photos, id, "1.jpg");
  const jpeg = await sharp(src).rotate().resize(896, 896, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer();
  const t = Date.now();
  const res = await fetch(`${L}/embed`, { method: "POST", headers: { "Content-Type": "image/jpeg", Origin: "https://voices-of-the-wild.netlify.app" }, body: jpeg });
  const j = (await res.json()) as { vector: number[]; ms: number };
  const r = match(Float32Array.from(j.vector), bank as never, roster.thresholds);
  const o = r.outcome as { kind: string; owner?: string; category?: string };
  const who = o.owner ?? o.category ?? "-";
  if (o.kind === "species" && who === id.split("/")[0]) ok++;
  console.log(`${id.replace(/.*[\/]/, "").padEnd(15)} → ${o.kind.padEnd(8)} ${who.padEnd(16)} server ${j.ms} ms, round trip ${Date.now() - t} ms, ${Math.round(jpeg.length / 1024)} KB, CORS ${res.headers.get("access-control-allow-origin") ? "ok" : "MISSING"}`);
}
console.log(`${ok}/${ids.length} named correctly`);
