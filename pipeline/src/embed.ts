// `npm run embed` — embed every description of every character + guardian with EmbeddingGemma 2 (q4),
// write app/public/data/embeddings.bin + embeddings.index.json, refresh roster.runtime.json.
// Prefix variant: --prefix <name>, else the one calibration chose, else the model-card default.
import { CALIBRATION_JSON, DEFAULT_PREFIX, loadRoster, readJson } from "./lib.ts";
import { loadEmbedder, type Embedder } from "./model.ts";
import { writeRuntime, type CalibrationState } from "./runtime.ts";
import { buildBank, writeBank } from "./textbank.ts";

const args = process.argv.slice(2);
const cal = readJson<CalibrationState | null>(CALIBRATION_JSON, null);
const prefix = args.includes("--prefix") ? args[args.indexOf("--prefix") + 1]! : cal?.prefix ?? DEFAULT_PREFIX;

let e: Promise<Embedder> | null = null;
const roster = loadRoster();
const bank = await buildBank(roster, prefix, () => (e ??= loadEmbedder({ vision: false })));
writeBank(bank);
writeRuntime();
console.log(`embeddings: ${bank.index.length} rows × ${bank.dim} (prefix: ${prefix})`);
