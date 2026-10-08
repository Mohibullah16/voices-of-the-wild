// Description embeddings with an on-disk cache (keyed by exact input string), plus the writer for
// app/public/data/embeddings.bin + embeddings.index.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Embedder } from "./model.ts";
import { DATA_OUT, DIM, PIPELINE_DIR, TEXT_PREFIXES, ensureDir, owners, sha8, type Roster, writeJson } from "./lib.ts";

const CACHE_DIR = join(PIPELINE_DIR, ".cache");

export interface BankRow {
  row: number;
  owner: string;
  category: string;
  guardian: boolean;
}
export interface Bank {
  dim: number;
  vectors: Float32Array;
  index: BankRow[];
}

function cachePath(key: string) {
  return join(CACHE_DIR, `text-${key}.bin`);
}

/** Embed every description of every owner with the named prefix variant. Cached per (prefix, roster text). */
export async function buildBank(roster: Roster, prefixName: string, embedder: () => Promise<Embedder>): Promise<Bank> {
  const fmt = TEXT_PREFIXES[prefixName];
  if (!fmt) throw new Error(`unknown prefix variant ${prefixName}`);
  const index: BankRow[] = [];
  const texts: string[] = [];
  for (const { owner, category, guardian } of owners(roster)) {
    // `match_title` overrides the title for owners whose species name is too short to anchor the text
    // (e.g. "Car" scored ~0.05 lower than "title: none" on real car photos).
    const title = owner.match_title ?? (guardian ? roster.categories.find((c) => c.id === category)!.name : owner.species ?? owner.name);
    for (const d of owner.descriptions) {
      index.push({ row: index.length, owner: owner.id, category, guardian });
      texts.push(fmt(d, title));
    }
  }
  const key = `${prefixName}-${sha8(JSON.stringify(texts))}`;
  ensureDir(CACHE_DIR);
  const p = cachePath(key);
  let vectors: Float32Array;
  if (existsSync(p)) {
    const buf = readFileSync(p);
    vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
  } else {
    const e = await embedder();
    const t0 = Date.now();
    const rows = await e.embedTexts(texts);
    console.log(`  embedded ${texts.length} descriptions (${prefixName}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    vectors = new Float32Array(rows.length * DIM);
    rows.forEach((r, i) => vectors.set(r, i * DIM));
    writeFileSync(p, Buffer.from(vectors.buffer));
  }
  return { dim: DIM, vectors, index };
}

export function writeBank(bank: Bank) {
  ensureDir(DATA_OUT);
  writeFileSync(join(DATA_OUT, "embeddings.bin"), Buffer.from(bank.vectors.buffer, bank.vectors.byteOffset, bank.vectors.byteLength));
  writeJson(join(DATA_OUT, "embeddings.index.json"), bank.index);
}
