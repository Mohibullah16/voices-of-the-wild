// node validate.js <dataDir>  -> validates roster/roster.json against CONTRACT.md section 1 + editor rules
const fs = require('fs'), path = require('path');
const dataDir = process.argv[2];
const verbose = process.argv.includes('--lines');
const errs = [], warns = [];
let roster;
try { roster = JSON.parse(fs.readFileSync(path.join(dataDir, 'roster', 'roster.json'), 'utf8')); }
catch (e) { console.error('PARSE FAIL', e.message); process.exit(1); }
const catalog = JSON.parse(fs.readFileSync(path.join(dataDir, 'catalog.json'), 'utf8'));
const catItems = new Map();
for (const c of catalog.categories) for (const i of c.items) catItems.set(i.id, { ...i, cat: c.id });

// Local (Urdu/Roman-Urdu) words we want to flag inside lines. Names are allowed (checked separately).
const LOCAL = ['beta','yaar','chalo','jaan','jao','na','haan','arey','arre','arrey','achha','bas','bhai','salaam','shabash','mohalla','gali',
  'khuda','hafiz','wah','oye','haina','kadak','choori','desi','jhumka','jhumkas','gajra','sabzi','salan','thela','dhaba','rishta','puttar',
  'mitthu','aam','lo','taaza','hai','nahin','nahi','phir','aa','gaye','wapis','aaye','pehchaan','liya','bijli','kunda','nazar','nimbu','mirch',
  'kabootar','baaz','dupatta','shalwar','shalwars','charpai','paratha','pakora','pakoras','chowkidar','kabari','dhakkan','bhindi','imli',
  'dastarkhwan','sadqa','hakeem','hakeems','langar','qawwali','azaan','muezzin','jaali','jaalis','jharokha','jharokhas','maghrib','musafir',
  'tadka','handi','darjan','masala','paani','mamu','khala','chacha','nani','dadi','begum','sahib','ustad','baba','amma','taya','tai','phuppo','kaka'];
const ALLOWED = new Set(['masala','chai','bazaar','monsoon']);
// Denylist (option A): place names, festivals and Urdu/Hindi/Roman-Urdu words that must not appear in
// names, personalities, voice notes or lines. Species and visual descriptions are exempt (embedding stability).
const DENY = new Set(['karachi','pakistan','pakistani','sindh','clifton','keamari','larkana','urdu','indus','dubai','madagascar',
  'jinnah','quaid','sadequain','frere','mohalla','gali','eid','nani','khala','bhai','chacha','mamu','begum','baba','amma','sahib',
  'ustad','beta','yaar','jaan','dada','dadi','phuppo','tai','taya','kaka','pehlwan','mazar','azaan','muezzin','nala','dhaba',
  'panchayat','chowrangi','sheru','billi','gori','bakra','gendu','genda','tarbooz','pyaz','kela','amrood','karela','shabnam',
  'chhapak','bhoot','kekra','kaner','motia','gurhal','lali','mitthu','kauwa','chunmun','cheel','kabootar','gappi','udaan',
  'hariyali','phulwari','mitti','aasmaan','mistri','minar','rehri','tanki','lakeer','laal','wali','bhola','gadha','fawwara',
  'lehar','timmar','hilal','chaudhvin','shafaq','badli','gumbad','pankh','kankri','seepi','daraar','patjhar','ghikwar','rangeela',
  'doob','chhotu','guchhu','chyoonti','chhipkali','mehnati','sheroo','kunda','mashhoori','keeray','makoray','mian','shaadi',
  'dulhan','aam','badshah','rani','chhoti','mamu']);
function denyHits(s) {
  const words = s.toLowerCase().replace(/[^a-z' \-]/g, ' ').split(/[\s\-]+/).map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean);
  return [...new Set(words.filter(w => DENY.has(w)))];
}
const TAG = /\[[^\]]+\]/g;
const RE_TAGONLY = /^\s*(\[[^\]]+\]\s*)+$/;

const ids = new Set();
let elderTotal = 0, elderLines = 0, allTotal = 0;
const localHits = [];

function nameTokens(n) { return n.toLowerCase().replace(/[^a-z\- ]/g, ' ').split(/[\s-]+/).filter(Boolean); }

function checkLine(owner, key, s, limit, nameToks) {
  if (typeof s !== 'string' || !s.trim()) { errs.push(`${owner}.${key}: empty`); return; }
  const len = s.length;
  if (len > limit) errs.push(`${owner}.${key}: ${len} > ${limit}`);
  const tags = s.match(TAG) || [];
  if (tags.length < 1) errs.push(`${owner}.${key}: no tag`);
  if (tags.length > 2) errs.push(`${owner}.${key}: ${tags.length} tags`);
  const stripped = s.replace(TAG, '').replace(/\s+/g, ' ').trim();
  const denied = denyHits(stripped);
  if (denied.length) errs.push(`${owner}.${key}: denylisted word(s) ${denied.join(', ')}`);
  if (!stripped || RE_TAGONLY.test(s)) errs.push(`${owner}.${key}: nothing left after stripping tags`);
  if (/\s[,.!?;:]/.test(stripped) || /^[,.!?;:]/.test(stripped)) warns.push(`${owner}.${key}: punctuation glitch after strip: "${stripped}"`);
  const words = stripped.toLowerCase().replace(/[^a-z' \-]/g, ' ').split(/[\s\-]+/).map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean);
  const hits = words.filter(w => LOCAL.includes(w) && !ALLOWED.has(w) && !nameToks.has(w));
  if (hits.length) localHits.push(`${owner}.${key}: ${[...new Set(hits)].join(', ')}`);
  if (hits.length > 1) errs.push(`${owner}.${key}: >1 local word (${hits.join(',')})`);
  return len;
}

if (roster.version !== 1) errs.push('version must be 1');
if (!Array.isArray(roster.categories) || roster.categories.length !== 13) errs.push(`expected 13 categories, got ${roster.categories && roster.categories.length}`);
for (const cat of roster.categories) {
  const catInCatalog = catalog.categories.find(c => c.id === cat.id);
  if (!catInCatalog) errs.push(`category ${cat.id} not in catalog`);
  if (!cat.name || typeof cat.name !== 'string') errs.push(`${cat.id}: missing name`);
  const g = cat.guardian;
  if (!g) { errs.push(`${cat.id}: no guardian`); continue; }
  if (g.id !== `${cat.id}-guardian`) errs.push(`${cat.id}: guardian id ${g.id}`);
  if (ids.has(g.id)) errs.push(`dup id ${g.id}`); ids.add(g.id);
  for (const k of ['name', 'personality', 'voice']) if (!g[k]) errs.push(`${g.id}: missing ${k}`);
  for (const k of ['name', 'personality', 'voice']) { const dh = denyHits(g[k] || ''); if (dh.length) errs.push(`${g.id}.${k}: denylisted word(s) ${dh.join(', ')}`); }
  if (!Array.isArray(g.descriptions) || g.descriptions.length < 3) errs.push(`${g.id}: descriptions`);
  const gk = Object.keys(g.lines || {});
  if (gk.sort().join() !== ['again', 'first_meet', 'goodbye', 'hint'].join()) errs.push(`${g.id}: line keys ${gk}`);
  const gtoks = new Set(nameTokens(g.name));
  for (const k of ['first_meet', 'again', 'goodbye', 'hint']) { const l = checkLine(g.id, k, g.lines[k], 130, gtoks); allTotal += l || 0; }
  if (!Array.isArray(cat.characters) || cat.characters.length !== (cat.id === 'vehicles' ? 7 : 6)) errs.push(`${cat.id}: ${cat.characters && cat.characters.length} characters (need ${cat.id === 'vehicles' ? 7 : 6})`); // vehicles: + the bicycle
  const elders = cat.characters.filter(c => c.tier === 'elder').length;
  if (elders !== (cat.id === 'vehicles' ? 3 : 2)) errs.push(`${cat.id}: ${elders} elders (need ${cat.id === 'vehicles' ? 3 : 2})`);
  const cautions = cat.characters.filter(c => c.caution).length;
  if (cautions > 1) errs.push(`${cat.id}: ${cautions} caution items (max 1)`);
  const landmarks = cat.characters.filter(c => (catItems.get(c.id) || {}).habitat?.includes('landmark')).length;
  if (landmarks > 2) errs.push(`${cat.id}: ${landmarks} landmarks (max 2)`);
  for (const c of cat.characters) {
    const ci = catItems.get(c.id);
    if (!ci) errs.push(`${c.id}: not in catalog`);
    else {
      if (ci.cat !== cat.id) errs.push(`${c.id}: catalog category ${ci.cat} != ${cat.id}`);
      if (c.rarity !== ci.rarity) errs.push(`${c.id}: rarity mismatch`);
      if (JSON.stringify(c.habitat) !== JSON.stringify(ci.habitat)) errs.push(`${c.id}: habitat mismatch`);
      if (c.caution !== !!ci.caution) errs.push(`${c.id}: caution mismatch`);
    }
    if (ids.has(c.id)) errs.push(`dup id ${c.id}`); ids.add(c.id);
    if (c.category !== cat.id) errs.push(`${c.id}: category field`);
    if (!['elder', 'common'].includes(c.tier)) errs.push(`${c.id}: tier ${c.tier}`);
    for (const k of ['name', 'species', 'personality', 'voice']) if (!c[k]) errs.push(`${c.id}: missing ${k}`);
    for (const k of ['name', 'personality', 'voice']) { const dh = denyHits(c[k] || ''); if (dh.length) errs.push(`${c.id}.${k}: denylisted word(s) ${dh.join(', ')}`); }
    if (typeof c.caution !== 'boolean') errs.push(`${c.id}: caution not boolean`);
    if (!Array.isArray(c.habitat) || !c.habitat.length) errs.push(`${c.id}: habitat`);
    if (!Array.isArray(c.descriptions) || c.descriptions.length < 3 || c.descriptions.length > 5) errs.push(`${c.id}: ${c.descriptions && c.descriptions.length} descriptions`);
    const lk = Object.keys(c.lines || {}).sort().join();
    if (lk !== 'again,first_meet,goodbye') errs.push(`${c.id}: line keys ${lk}`);
    const limit = c.tier === 'elder' ? 105 : 130;
    const toks = new Set([...nameTokens(c.name)]);
    for (const k of ['first_meet', 'again', 'goodbye']) {
      const l = checkLine(c.id, k, c.lines[k], limit, toks) || 0;
      allTotal += l;
      if (c.tier === 'elder') { elderTotal += l; elderLines++; }
      if (verbose) console.log(`${String(l).padStart(4)} ${c.tier === 'elder' ? 'E' : ' '} ${c.id}.${k}`);
    }
  }
}
if (elderLines !== 81) errs.push(`elder lines ${elderLines} != 81`);
if (elderTotal > 8400) errs.push(`elder total ${elderTotal} > 8400`);

console.log(`categories: ${roster.categories.length}, characters: ${roster.categories.reduce((a, c) => a + c.characters.length, 0)}, guardians: ${roster.categories.filter(c => c.guardian).length}`);
console.log(`elder lines: ${elderLines}, elder total characters (incl. tags): ${elderTotal} / 8400`);
console.log(`all lines total characters: ${allTotal}`);
console.log(`\nlocal words remaining in lines (name tokens excluded): ${localHits.length}`);
localHits.forEach(h => console.log('  ' + h));
if (warns.length) { console.log('\nWARN'); warns.forEach(w => console.log('  ' + w)); }
if (errs.length) { console.log('\nERRORS'); errs.forEach(e => console.log('  ' + e)); process.exit(1); }
console.log('\nOK');
