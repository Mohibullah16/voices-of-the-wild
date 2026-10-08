// Fetch real, freely licensed photos per character from Wikimedia Commons for calibration.
// Writes calibration/photos/<id>/<n>.jpg (≤768px), calibration/photos.json and calibration/ATTRIBUTION.md.
// Usage: tsx src/fetch-photos.ts [--per 3] [--only id1,id2] [--force]
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { CAL_DIR, PHOTOS_DIR, ensureDir, loadRoster, readJson, writeJson } from "./lib.ts";

const args = process.argv.slice(2);
const PER = args.includes("--per") ? Number(args[args.indexOf("--per") + 1]) : 3;
const ONLY = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1]!.split(",")) : null;
const FORCE = args.includes("--force");
const UA = "VoicesOfTheWild-calibration/0.1 (DEV hackathon build script; contact via github)";

/** Hand-tuned Commons search queries (scientific names find real photos far more reliably). */
const QUERIES: Record<string, string[]> = {
  "neem-tree": ["Azadirachta indica tree", "Azadirachta indica leaves"],
  "conocarpus-tree": ["Conocarpus erectus", "Conocarpus lancifolius"],
  "peepal-tree": ["Ficus religiosa tree", "Ficus religiosa leaves"],
  "gulmohar-tree": ["Delonix regia tree flowers", "Delonix regia"],
  "coconut-palm": ["Cocos nucifera tree", "coconut palm tree"],
  "amaltas-tree": ["Cassia fistula tree flowers", "Cassia fistula"],
  "house-crow": ["Corvus splendens", "house crow"],
  "common-myna": ["Acridotheres tristis", "common myna"],
  "black-kite": ["Milvus migrans govinda", "Milvus migrans"],
  "rock-pigeon": ["Columba livia feral pigeon", "rock pigeon city"],
  "rose-ringed-parakeet": ["Psittacula krameri", "rose-ringed parakeet"],
  "house-sparrow": ["Passer domesticus male", "house sparrow"],
  "street-dog": ["Indian pariah dog street", "stray dog street Pakistan"],
  cat: ["street cat", "domestic cat outdoors"],
  "palm-squirrel": ["Funambulus pennantii", "Funambulus palmarum"],
  goat: ["goat Pakistan", "domestic goat"],
  cow: ["zebu cattle", "Bos indicus"],
  camel: ["dromedary camel Pakistan", "Camelus dromedarius"],
  "black-ant-trail": ["ant trail", "ants marching line"],
  "house-gecko": ["Hemidactylus flaviviridis", "Hemidactylus frenatus wall"],
  cockroach: ["Periplaneta americana", "American cockroach"],
  "honey-bee": ["Apis mellifera flower", "Apis florea"],
  "plain-tiger-butterfly": ["Danaus chrysippus", "plain tiger butterfly"],
  "ghost-crab": ["Ocypode ceratophthalmus", "ghost crab beach"],
  bougainvillea: ["Bougainvillea glabra", "Bougainvillea spectabilis"],
  oleander: ["Nerium oleander flowers", "Nerium oleander"],
  hibiscus: ["Hibiscus rosa-sinensis red", "Hibiscus rosa-sinensis"],
  jasmine: ["Jasminum sambac flower", "Jasminum sambac"],
  marigold: ["Tagetes erecta flower", "Tagetes erecta"],
  ixora: ["Ixora coccinea", "Ixora chinensis"],
  "lawn-grass": ["Cynodon dactylon lawn", "green lawn grass"],
  "money-plant": ["Epipremnum aureum", "pothos plant"],
  "aloe-vera": ["Aloe vera plant", "Aloe barbadensis"],
  "wall-peepal-sapling": ["Ficus religiosa growing on wall", "plant growing on wall"],
  croton: ["Codiaeum variegatum", "croton plant leaves"],
  "prickly-pear": ["Opuntia ficus-indica", "Opuntia cactus"],
  "mango-fruit": ["mango fruit", "Mangifera indica fruit"],
  "banana-bunch": ["banana bunch", "bananas bunch market"],
  "guava-fruit": ["guava fruit", "Psidium guajava fruit"],
  watermelon: ["watermelon fruit", "watermelons market"],
  onion: ["onion bulbs", "red onions"],
  "bitter-gourd": ["Momordica charantia fruit", "bitter gourd"],
  "fallen-leaves": ["fallen leaves ground", "dry fallen leaves"],
  feather: ["feather on ground", "single feather lying", "pigeon feather"],
  pebbles: ["pebbles", "pebbles beach stones"],
  "tree-stump": ["tree stump", "cut tree stump"],
  seashell: ["seashell on beach", "seashell sand"],
  "cracked-mud": ["cracked mud", "dried cracked earth"],
  sunset: ["sunset sky Karachi", "sunset sky"],
  "cumulus-clouds": ["cumulus clouds", "cumulus humilis"],
  "crescent-moon": ["crescent moon sky", "waxing crescent moon"],
  "full-moon": ["full moon", "full moon photograph", "full moon rising"],
  "overcast-sky": ["overcast sky", "stratus clouds overcast"],
  contrail: ["contrail sky", "airplane contrail"],
  "sea-waves": ["sea waves Clifton beach", "ocean waves beach"],
  "storm-drain-nala": ["nullah Karachi", "storm drain channel"],
  puddle: ["puddle", "rain puddle street"],
  "dew-drops": ["dew drops grass", "dew drops leaf"],
  fountain: ["fountain park", "water fountain jets", "fountain Lahore"],
  "mangrove-creek": ["mangroves Karachi", "Avicennia marina mangrove"],
  "auto-rickshaw": ["auto rickshaw Pakistan", "auto rickshaw Karachi"],
  "decorated-truck": ["Pakistani truck art", "truck art Pakistan"],
  "decorated-bus": ["Karachi bus decorated", "Karachi minibus"],
  motorcycle: ["motorcycle Pakistan street", "Honda CD 70"],
  bicycle: ["bicycle parked street", "roadster bicycle"],
  car: ["Suzuki Mehran", "car parked at night street", "parked car street", "Toyota Corolla Pakistan"],
  "oak-tree": ["Quercus robur tree", "oak leaves acorns"],
  "donkey-cart": ["donkey cart Karachi", "donkey cart Pakistan"],
  "water-tanker": ["water tanker Karachi", "water tanker truck"],
  "mosque-dome": ["mosque dome Karachi", "mosque dome"],
  footbridge: ["pedestrian bridge Karachi", "pedestrian overpass"],
  minaret: ["minaret Karachi", "mosque minaret"],
  flyover: ["flyover Karachi", "flyover Pakistan"],
  "mazar-e-quaid": ["Jinnah Mausoleum Karachi", "Mazar-e-Quaid exterior", "Mazar-e-Quaid"],
  "frere-hall": ["Frere Hall Karachi", "Frere Hall"],
  "electric-pole-wires": ["utility pole wires India", "electric pole wires street", "electrical wires mess India", "power lines pole Karachi"],
  "wall-chalking": ["graffiti Karachi", "Urdu graffiti wall", "political graffiti Pakistan", "wall painting advertisement Pakistan"],
  "tea-stall": ["tea stall Pakistan", "tea stall India roadside", "chai stall"],
  "park-bench": ["park bench", "bench in park"],
  "rooftop-water-tank": ["rooftop water tank", "water tanks roof", "plastic water tank roof India"],
  "zebra-crossing": ["zebra crossing", "pedestrian crossing stripes", "zebra crossing road markings"],
};

const OK_LICENSE = /^(cc0|cc[- ]by(-sa)?[- ]\d(\.\d)?|cc[- ]by(-sa)?$|public domain|pd\b|pdm)/i;
const BAD_TITLE = /(map|logo|diagram|drawing|illustration|stamp|coat of arms|herbarium|painting|svg|chart|icon|botanical|plate|sketch|poster|xray|x-ray|skull|museum|specimen|cartoon|flora|köhler|kohler|medizinal|blanco|curtis|lithograph|engraving|scan|book|page|interior)/i;

interface Pick {
  id: string;
  file: string;
  title: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
  query: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

async function getJson(u: URL, form?: Record<string, string>): Promise<any> {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = form
        ? await fetch(u, { method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form) })
        : await fetch(u, { headers: { "User-Agent": UA } });
      if (res.ok) return res.json();
      last = `HTTP ${res.status}`;
    } catch (e: any) {
      last = e?.cause?.code ?? e?.message ?? String(e);
    }
    await sleep(2000 * 2 ** attempt);
  }
  throw new Error(`Wikimedia request failed: ${u.host}${u.pathname} (${last})`);
}

// Note: commons.wikimedia.org itself is unreachable from the build machine's network (DNS/TLS reset),
// so we use two other official Wikimedia endpoints over the same Commons data:
//   search    → api.wikimedia.org core REST (Commons search, CirrusSearch syntax)
//   metadata  → en.wikipedia.org action API imageinfo (resolves Commons files via the shared repo)
//   images    → upload.wikimedia.org thumbnails
async function candidates(query: string) {
  const s = new URL("https://api.wikimedia.org/core/v1/commons/search/page");
  s.searchParams.set("q", `${query} filetype:bitmap`);
  s.searchParams.set("limit", "40");
  const found: string[] = ((await getJson(s))?.pages ?? []).map((p: any) => p.title as string);
  if (!found.length) return [];
  const u = new URL("https://en.wikipedia.org/w/api.php");
  const data = await getJson(u, {
    action: "query", format: "json", formatversion: "2", titles: found.join("|"),
    prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "768",
  });
  const norm = new Map<string, string>((data?.query?.normalized ?? []).map((n: any) => [n.to, n.from]));
  const pages: any[] = data?.query?.pages ?? [];
  const order = (p: any) => found.indexOf(norm.get(p.title) ?? p.title);
  pages.sort((a, b) => order(a) - order(b));
  return pages
    .map((p) => {
      const ii = p.imageinfo?.[0];
      const md = ii?.extmetadata ?? {};
      return {
        title: p.title as string,
        mime: ii?.mime as string,
        width: ii?.width as number,
        height: ii?.height as number,
        thumb: ii?.thumburl as string,
        page: ii?.descriptionurl as string,
        license: strip(md.LicenseShortName?.value ?? ""),
        licenseUrl: strip(md.LicenseUrl?.value ?? ""),
        author: strip(md.Artist?.value ?? "unknown"),
        restrictions: strip(md.Restrictions?.value ?? ""),
      };
    })
    .filter((c) => c.mime === "image/jpeg" && c.width >= 500 && c.height >= 400 && c.thumb)
    .filter((c) => OK_LICENSE.test(c.license) && !/nc|nd/i.test(c.license.replace(/^cc[- ]by(-sa)?/i, "")))
    .filter((c) => !BAD_TITLE.test(c.title));
}

/** Negative controls: indoor things nobody in the roster should claim. */
const NEGATIVES = [
  "laptop computer on desk", "kitchen interior", "bookshelf with books", "sofa living room", "computer keyboard",
  "coffee mug on table", "television set", "office chair", "bathroom sink", "refrigerator kitchen", "headphones", "stapler",
];

const roster = loadRoster();
const manifestPath = join(CAL_DIR, "photos.json");

if (args.includes("--negatives")) {
  const negPath = join(CAL_DIR, "negatives.json");
  const out: Pick[] = [];
  const dir = join(PHOTOS_DIR, "_negative");
  ensureDir(dir);
  for (const q of NEGATIVES) {
    let list: Awaited<ReturnType<typeof candidates>> = [];
    try { list = await candidates(q); } catch (e: any) { console.warn(`  negative "${q}" failed: ${e.message}`); }
    for (const c of list.slice(0, 5)) {
      try {
        const res = await fetch(c.thumb, { headers: { "User-Agent": UA } });
        if (!res.ok) continue;
        const file = `${out.length + 1}.jpg`;
        await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(join(dir, file));
        out.push({ id: "_negative", file: `_negative/${file}`, title: c.title, author: c.author, license: c.license, licenseUrl: c.licenseUrl, source: c.page, query: q });
        break;
      } catch {}
    }
    await sleep(500);
  }
  writeJson(negPath, out);
  console.log(`negatives: ${out.length}`);
}

// Manual curation (from eyeballing contact sheets): rejected titles never come back; rejected photos
// are removed and topped up from the next search results.
const curation = readJson<{ reject: Record<string, string[]> }>(join(CAL_DIR, "curation.json"), { reject: {} });
const rejected = (id: string) => new Set(curation.reject[id] ?? []);

// Negatives: drop rejected ones (renumbering files).
{
  const negPath = join(CAL_DIR, "negatives.json");
  const negs = readJson<Pick[]>(negPath, []);
  const bad = rejected("_negative");
  if (negs.some((n) => bad.has(n.title))) {
    const keep = negs.filter((n) => !bad.has(n.title));
    const dir = join(PHOTOS_DIR, "_negative");
    const bufs = keep.map((n) => readFileSync(join(PHOTOS_DIR, n.file)));
    rmSync(dir, { recursive: true });
    ensureDir(dir);
    keep.forEach((n, i) => { n.file = `_negative/${i + 1}.jpg`; writeFileSync(join(PHOTOS_DIR, n.file), bufs[i]!); });
    writeJson(negPath, keep);
    console.log(`negatives: dropped ${negs.length - keep.length} rejected, ${keep.length} left`);
  }
}

const manifest = readJson<Record<string, Pick[]>>(manifestPath, {});
const skipped: string[] = [];

for (const cat of roster.categories) {
  for (const ch of cat.characters) {
    if (ONLY && !ONLY.has(ch.id)) continue;
    const dir = join(PHOTOS_DIR, ch.id);
    const bad = rejected(ch.id);
    const prior = (manifest[ch.id] ?? []).filter((p) => !bad.has(p.title) && existsSync(join(PHOTOS_DIR, p.file)));
    const complete = prior.length >= PER && prior.length === (manifest[ch.id] ?? []).length;
    if (!FORCE && complete && existsSync(dir)) continue;
    // Keep good prior photos (in memory), rebuild the folder with contiguous numbering.
    const keepBufs = FORCE ? [] : prior.map((p) => readFileSync(join(PHOTOS_DIR, p.file)));
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    ensureDir(dir);
    const picks: Pick[] = [];
    if (!FORCE) prior.forEach((p, i) => {
      const file = `${i + 1}.jpg`;
      writeFileSync(join(dir, file), keepBufs[i]!);
      picks.push({ ...p, file: `${ch.id}/${file}` });
    });
    const seen = new Set<string>([...bad, ...picks.map((p) => p.title)]);
    if (picks.length >= PER) { manifest[ch.id] = picks; writeJson(manifestPath, manifest); continue; }
    const queries = QUERIES[ch.id] ?? [ch.species ?? ch.name];
    // Round-robin over queries so the photos aren't all near-duplicates from one search.
    const lists = [];
    for (const q of queries) {
      try {
        lists.push({ q, list: await candidates(q) });
      } catch (e: any) {
        console.warn(`  ${ch.id}: search "${q}" failed: ${e.message}`);
      }
      await sleep(500);
    }
    for (let i = 0; picks.length < PER && i < 30; i++) {
      for (const { q, list } of lists) {
        const c = list[i];
        if (!c || seen.has(c.title) || picks.length >= PER) continue;
        seen.add(c.title);
        try {
          const res = await fetch(c.thumb, { headers: { "User-Agent": UA } });
          if (!res.ok) continue;
          const buf = Buffer.from(await res.arrayBuffer());
          const file = `${picks.length + 1}.jpg`;
          await sharp(buf).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(join(dir, file));
          picks.push({ id: ch.id, file: `${ch.id}/${file}`, title: c.title, author: c.author, license: c.license, licenseUrl: c.licenseUrl, source: c.page, query: q });
          await sleep(250);
        } catch (e) {
          console.warn(`  ${ch.id}: download failed for ${c.title}`);
        }
      }
    }
    manifest[ch.id] = picks;
    if (picks.length === 0) skipped.push(ch.id);
    console.log(`${ch.id}: ${picks.length} photo(s)`);
    writeJson(manifestPath, manifest);
  }
}

// Attribution file (tracked).
const lines = [
  "# Calibration photo attribution",
  "",
  "Photos used only to calibrate matching thresholds at build time. They are **not shipped** in the app.",
  "All from Wikimedia Commons under CC0, public domain, CC BY or CC BY-SA. Downscaled to ≤768px.",
  "",
  "| Character | File | Title | Author | License | Source |",
  "|---|---|---|---|---|---|",
];
for (const cat of roster.categories) {
  for (const ch of cat.characters) {
    for (const p of manifest[ch.id] ?? []) {
      const esc = (s: string) => s.replace(/\|/g, "\\|").slice(0, 120);
      const lic = p.licenseUrl ? `[${esc(p.license)}](${p.licenseUrl})` : esc(p.license);
      lines.push(`| ${ch.id} | \`${p.file}\` | ${esc(p.title.replace(/^File:/, ""))} | ${esc(p.author)} | ${lic} | [Commons](${p.source}) |`);
    }
  }
}
for (const p of readJson<Pick[]>(join(CAL_DIR, "negatives.json"), [])) {
  const esc = (s: string) => s.replace(/\|/g, "\\|").slice(0, 120);
  const lic = p.licenseUrl ? `[${esc(p.license)}](${p.licenseUrl})` : esc(p.license);
  lines.push(`| (negative control) | \`${p.file}\` | ${esc(p.title.replace(/^File:/, ""))} | ${esc(p.author)} | ${lic} | [Commons](${p.source}) |`);
}
const missing = roster.categories.flatMap((c) => c.characters).filter((c) => !(manifest[c.id]?.length));
if (missing.length) lines.push("", `No suitable photo found for: ${missing.map((m) => m.id).join(", ")}.`);
writeFileSync(join(CAL_DIR, "ATTRIBUTION.md"), lines.join("\n") + "\n", "utf8");
console.log(`done. skipped: ${skipped.join(", ") || "none"}`);
