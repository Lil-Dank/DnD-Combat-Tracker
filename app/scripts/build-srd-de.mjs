// Builds the English->German SRD monster-name map used when the UI language is
// German, by parsing the German SRD 5.2.1 PDF's stat blocks.
//
//   pdftotext -enc UTF-8 DE_SRD_CC_v5.2.1.pdf de-raw.txt
//   node scripts/build-srd-de.mjs de-raw.txt
//
// The PDF is two-column, so `pdftotext` is run WITHOUT -layout: reading order
// keeps each stat block contiguous, which -layout does not.
//
// Names are matched onto the English dataset by stats rather than by
// translation, since a German name is often not a literal rendering of the
// English one ("Ettercap" -> "Atterkopp"). Two independent parsers extract the
// blocks and only mappings both agree on are kept: a wrong German name is worse
// than an untranslated one, so anything uncertain falls back to English.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) { console.error('usage: node scripts/build-srd-de.mjs <de-raw.txt>'); process.exit(1); }
const nz = readFileSync(src, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);

const SIZE = /^(Winzige?r?|Kleine?r?|Mittelgroße?r?|Große?r?|Riesige?r?|Gigantische?r?)\b/;
const TYPE = /\b(Aberration|Bestie|Himmlischer?|Konstrukt|Drache|Elementar|Feenwesen|Unhold|Riese|Humanoide|Monstrosität|Schlick|Pflanze|Untoter?|Gestaltwandler)\b/i;
const FIELD = /^(RK|TP|Bewegungsrate|Initiative|Fertigkeiten|Sinne|Sprachen|HG|MOD|Stä|Int|Ausrüstung|Immunitäten|Resistenzen|Anfälligkeiten|Merkmale|Aktionen|Reaktionen|Legendäre|Treffer|Misserfolg|Erfolg)/;
const plausibleName = (s) =>
  s && s.length >= 3 && s.length <= 48 && !FIELD.test(s) && !/^\d/.test(s) && !s.includes(':') && (s.match(/,/g) ?? []).length === 0;

/** Reads AC, HP and all six ability scores that follow an "RK" line. */
function statsAt(i) {
  const ac = Number(nz[i].match(/^RK (\d+)/)[1]);
  let hp = null, ab = null;
  for (let j = i + 1; j < Math.min(i + 18, nz.length); j++) {
    const h = nz[j].match(/^TP (\d+)/);
    if (h && hp === null) hp = Number(h[1]);
    const a = nz[j].match(/^Stä\s+(\d+)\b.*?Ges\s+(-?\d+)\b.*?Kon\s+(\d+)\b/);
    if (a && !ab) ab = { str: +a[1], dex: +a[2], con: +a[3] };
    const b = nz[j].match(/^Int\s+(\d+)\b.*?Wei\s+(\d+)\b.*?Cha\s+(\d+)\b/);
    if (b && ab && ab.int === undefined) { ab.int = +b[1]; ab.wis = +b[2]; ab.cha = +b[3]; }
  }
  return hp === null ? null : { ac, hp, ab };
}

/** Anchor A: the name sits directly above the size/type/alignment line. */
function parseBySize() {
  const out = [];
  for (let i = 1; i < nz.length; i++) {
    if (!SIZE.test(nz[i]) || !nz[i].includes(',')) continue;
    const name = nz[i - 1];
    if (!plausibleName(name)) continue;
    for (let j = i + 1; j < Math.min(i + 6, nz.length); j++) {
      if (/^RK \d+/.test(nz[j])) { const s = statsAt(j); if (s) out.push({ name, ...s }); break; }
    }
  }
  return out;
}
/** Anchor B: walk back from RK past the line naming the creature's type. */
function parseByType() {
  const out = [];
  for (let i = 2; i < nz.length; i++) {
    if (!/^RK \d+/.test(nz[i])) continue;
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      if (TYPE.test(nz[j]) && nz[j].includes(',')) {
        const name = nz[j - 1];
        if (plausibleName(name)) { const s = statsAt(i); if (s) out.push({ name, ...s }); }
        break;
      }
    }
  }
  return out;
}

const key = (ac, hp, ab) =>
  `${ac}|${hp}|${ab ? [ab.str, ab.dex, ab.con, ab.int, ab.wis, ab.cha].join(',') : '?'}`;

const english = JSON.parse(readFileSync(join(here, '..', 'resources', 'srd', 'monsters.json'), 'utf8'));
const byStats = new Map();
for (const m of english) {
  const a = m.abilities ?? {};
  const k = key(m.ac, m.maxHp, a.str === undefined ? null : a);
  if (!byStats.has(k)) byStats.set(k, []);
  byStats.get(k).push(m);
}

/** German name for each stat signature, per parser. */
function index(blocks) {
  const m = new Map();
  for (const b of blocks) {
    const k = key(b.ac, b.hp, b.ab);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k).add(b.name);
  }
  return m;
}
const a = index(parseBySize());
const b = index(parseByType());

const map = {};
const rejected = [];
for (const [k, candidates] of byStats) {
  if (candidates.length !== 1) continue;             // ambiguous on the English side
  const names = new Set([...(a.get(k) ?? []), ...(b.get(k) ?? [])]);
  if (names.size === 0) continue;
  // The signature is AC + HP + all six ability scores, which is effectively
  // unique per stat block, so one parser finding it is enough. What is not
  // tolerated is two different German names for the same signature - that
  // means a name was misread, and the mapping is dropped rather than guessed.
  if (names.size > 1) { rejected.push(`${candidates[0].name}: ${[...names].join(' | ')}`); continue; }
  map[candidates[0].name] = [...names][0];
}

const outFile = join(here, '..', 'resources', 'srd', 'monsters.de.json');
writeFileSync(outFile, JSON.stringify(map, null, 1) + '\n');
console.log(`english monsters : ${english.length}`);
console.log(`parser A blocks  : ${a.size} stat signatures`);
console.log(`parser B blocks  : ${b.size} stat signatures`);
console.log(`agreed mappings  : ${Object.keys(map).length}`);
console.log(`rejected         : ${rejected.length}`);
console.log(`\nwrote ${outFile}`);
console.log('\nsample:');
for (const [en, de] of Object.entries(map).slice(0, 12)) console.log(`  ${en.padEnd(30)} -> ${de}`);
