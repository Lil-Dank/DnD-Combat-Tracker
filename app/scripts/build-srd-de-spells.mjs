#!/usr/bin/env node
/**
 * Builds resources/srd/spells.de.json — German spell names + rules text from
 * the German SRD 5.2.1, matched to the English spells in
 * resources/srd/spells.json.
 *
 * Input: a plain-text dump of DE_SRD_CC_v5.2.1.pdf (pypdf or pdftotext),
 * one visual line per text line. Page-break artifacts ("@@PAGE n@@", running
 * heads, bare page numbers) are stripped here.
 *
 *   node scripts/build-srd-de-spells.mjs path/to/de-srd-full.txt
 *
 * Spell blocks have no HP/AC stat signature like monsters, so matching works
 * on the header tuple: level + school + component set + concentration +
 * ritual + range + the dice multiset of the rules text (4W4 ↔ 4d4) —
 * accepted only when unique on both sides, relaxed tier by tier. Anything
 * still ambiguous is dropped with a report: an English fallback beats a
 * wrong German match. MANUAL_OVERRIDES pins stragglers by hand.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/build-srd-de-spells.mjs <de-srd-text-dump>');
  process.exit(1);
}

const SCHOOL_DE = {
  Bann: 'abjuration',
  Beschwörungs: 'conjuration',
  Erkenntnis: 'divination',
  Verzauberungs: 'enchantment',
  Hervorrufungs: 'evocation',
  Illusions: 'illusion',
  Nekromantie: 'necromancy',
  Verwandlungs: 'transmutation',
};
const SCHOOL_TRICK_DE = {
  Bannmagie: 'abjuration',
  Banns: 'abjuration',
  Beschwörung: 'conjuration',
  Erkenntnis: 'divination',
  Verzauberung: 'enchantment',
  Hervorrufung: 'evocation',
  Illusion: 'illusion',
  Nekromantie: 'necromancy',
  Verwandlung: 'transmutation',
};

/** EnglishName -> GermanName for pairs the signature matcher can't settle. */
const MANUAL_OVERRIDES = {
  'Animate Dead': 'Tote beleben',
  'Antimagic Field': 'Antimagisches Feld',
  'Arcane Lock': 'Arkanes Schloss',
  Augury: 'Vorahnung',
  Bane: 'Verderben',
  Banishment: 'Verbannung',
  Barkskin: 'Rindenhaut',
  Bless: 'Segnen',
  'Calm Emotions': 'Gefühle besänftigen',
  Darkvision: 'Dunkelsicht',
  'Detect Thoughts': 'Gedanken wahrnehmen',
  Druidcraft: 'Druidenkunst',
  Elementalism: 'Elementalismus',
  'Enhance Ability': 'Attribut verbessern',
  Enthrall: 'Fesseln',
  Fly: 'Flug',
  'Gaseous Form': 'Gasförmige Gestalt',
  'Greater Restoration': 'Vollständige Genesung',
  Hallow: 'Weihen',
  'Holy Aura': 'Heilige Aura',
  'Hypnotic Pattern': 'Hypnotisches Muster',
  Jump: 'Sprung',
  'Lesser Restoration': 'Schwache Genesung',
  'Locate Animals or Plants': 'Tiere oder Pflanzen aufspüren',
  'Locate Object': 'Gegenstand aufspüren',
  Longstrider: 'Lange Schritte',
  'Major Image': 'Mächtiges Trugbild',
  'Protection from Poison': 'Schutz vor Gift',
  'Ray of Frost': 'Kältestrahl',
  'Resilient Sphere': 'Unverwüstliche Sphäre',
  'Rope Trick': 'Seiltrick',
  'Sacred Flame': 'Heilige Flamme',
  'Speak with Dead': 'Mit Toten sprechen',
  'Spider Climb': 'Spinnenklettern',
  'Starry Wisp': 'Sternenfunke',
  'Wall of Force': 'Energiewand',
  'Wall of Stone': 'Steinwand',
  'Warding Bond': 'Schützendes Band',
  'Water Breathing': 'Wasser atmen',
  'Water Walk': 'Wasserwandeln',
};

// ---- load + clean the dump ---------------------------------------------------

const rawLines = readFileSync(input, 'utf8').split('\n');
const lines = [];
for (const l of rawLines) {
  const s = l.trim();
  if (!s) continue;
  if (/^@@PAGE \d+@@$/.test(s)) continue;
  if (/^Systemreferenzdokument 5\.2\.1$/.test(s)) continue;
  if (/^\d{1,3}$/.test(s)) continue;
  lines.push(s);
}

// ---- segment spell blocks ----------------------------------------------------

const GRADE_RE = /^(Bann|Beschwörungs|Erkenntnis|Verzauberungs|Hervorrufungs|Illusions|Nekromantie|Verwandlungs)zauber (\d)\. Grades(\s*\(|$)/;
const TRICK_RE = /^Zaubertrick de[rs] (Bannmagie|Banns|Beschwörung|Erkenntnis|Verzauberung|Hervorrufung|Illusion|Nekromantie|Verwandlung)(\s*\(|$)/;

/** Header line indexes: [i] is the school/grade line; the name sits at i-1. */
const headers = [];
for (let i = 1; i < lines.length; i++) {
  const g = GRADE_RE.exec(lines[i]);
  const c = TRICK_RE.exec(lines[i]);
  if (!g && !c) continue;
  // Real description headers have Zeitaufwand: within the next few lines
  // (class-table rows and index entries don't).
  const near = lines.slice(i + 1, i + 5).join(' ');
  if (!near.includes('Zeitaufwand:')) continue;
  headers.push({
    index: i,
    name: lines[i - 1],
    level: g ? Number(g[2]) : 0,
    school: g ? SCHOOL_DE[g[1]] : SCHOOL_TRICK_DE[c[1]],
  });
}

/** Joins wrapped lines, mends soft-hyphen breaks, squeezes spaces. */
function joinText(ls) {
  return ls
    .join(' ')
    .replace(/‑\s+/g, '‑')
    .replace(/\s+‑/g, '‑')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const FIELD_RE = /^(Zeitaufwand|Reichweite|Komponenten|Wirkungsdauer):\s*(.*)$/;

const deSpells = [];
for (let h = 0; h < headers.length; h++) {
  const start = headers[h].index + 1;
  const end = h + 1 < headers.length ? headers[h + 1].index - 1 : lines.length;
  const block = lines.slice(start, end);
  // Header fields may wrap; collect until the line after Wirkungsdauer's value.
  const fields = {};
  let fi = 0;
  let current = null;
  for (; fi < block.length; fi++) {
    const m = FIELD_RE.exec(block[fi]);
    if (m) {
      current = m[1];
      fields[current] = m[2];
      continue;
    }
    if (current === 'Wirkungsdauer' && fields.Wirkungsdauer !== undefined) break;
    if (current) fields[current] = `${fields[current]} ${block[fi]}`.trim();
    if (!current && fi > 6) break; // malformed block — bail to description
  }
  const description = joinText(block.slice(fi))
    // The higher-slot paragraph reads better on its own line.
    .replace(/\s*(Verwenden von Zauberplätzen höheren Grades:)/, '\n\n$1')
    .replace(/\s*(Zaubertrick-?\s?[Vv]erbesserung:)/, '\n\n$1');
  if (!description) continue;
  const comps = (fields.Komponenten ?? '')
    .replace(/\(.*$/, '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => (x === 'G' ? 'S' : x))
    .sort()
    .join('');
  const range = fields.Reichweite ?? '';
  const rangeFeet = /Berührung/i.test(range)
    ? 'touch'
    : /Selbst/i.test(range)
      ? 'self'
      : (() => {
          const m = /([\d,]+)\s*(?:Meter|Kilometer)/.exec(range);
          if (!m) return 'other';
          const meters = Number(m[1].replace(',', '.')) * (range.includes('Kilometer') ? 1000 : 1);
          return String(Math.round((meters / 1.5) * 5));
        })();
  const dice = (description.match(/\d+W\d+/g) ?? [])
    .map((d) => d.replace('W', 'd'))
    .sort()
    .join(',');
  deSpells.push({
    name: headers[h].name,
    level: headers[h].level,
    school: headers[h].school,
    comps,
    concentration: /Konzentration/i.test(fields.Wirkungsdauer ?? ''),
    ritual: /Ritual/i.test(fields.Zeitaufwand ?? ''),
    rangeFeet,
    dice,
    text: description,
  });
}

// Page-break reprints: keep the fuller block per name.
const byName = new Map();
for (const s of deSpells) {
  const prev = byName.get(s.name);
  if (!prev || s.text.length > prev.text.length) byName.set(s.name, s);
}
const de = [...byName.values()];

// ---- English side ------------------------------------------------------------

const en = JSON.parse(readFileSync(join(root, 'resources', 'srd', 'spells.json'), 'utf8')).map((s) => {
  const range = /^touch/i.test(s.range)
    ? 'touch'
    : /^self/i.test(s.range)
      ? 'self'
      : (() => {
          const m = /^([\d,]+)\s*(?:feet|foot|miles?)/.exec(s.range);
          if (!m) return 'other';
          const feet = Number(m[1].replace(/,/g, '')) * (/mile/.test(s.range) ? 5280 : 1);
          return String(feet);
        })();
  return {
    name: s.name,
    level: s.level,
    school: s.school,
    comps: [s.components.includes('V') && 'V', /\bS\b/.test(s.components) && 'S', /\bM\b/.test(s.components) && 'M']
      .filter(Boolean)
      .sort()
      .join(''),
    concentration: s.concentration,
    ritual: s.ritual,
    rangeFeet: range,
    dice: (s.text.match(/\d+d\d+/g) ?? []).sort().join(','),
  };
});

// ---- tiered unique matching --------------------------------------------------

const TIERS = [
  (s) => [s.level, s.school, s.comps, s.concentration, s.ritual, s.rangeFeet, s.dice].join('|'),
  (s) => [s.level, s.school, s.comps, s.concentration, s.ritual, s.dice].join('|'),
  (s) => [s.level, s.school, s.comps, s.concentration, s.ritual, s.rangeFeet].join('|'),
  (s) => [s.level, s.school, s.concentration, s.dice].join('|'),
  (s) => [s.level, s.school, s.comps, s.concentration, s.ritual].join('|'),
];

const matched = new Map(); // EnglishName -> de record
const usedDe = new Set();
const usedEn = new Set();

for (const [enName, deName] of Object.entries(MANUAL_OVERRIDES)) {
  const d = byName.get(deName);
  if (d) {
    matched.set(enName, d);
    usedDe.add(d.name);
    usedEn.add(enName);
  }
}

for (const tier of TIERS) {
  const deBySig = new Map();
  for (const d of de) {
    if (usedDe.has(d.name)) continue;
    const sig = tier(d);
    deBySig.set(sig, deBySig.has(sig) ? null : d); // null = ambiguous
  }
  const enBySig = new Map();
  for (const e of en) {
    if (usedEn.has(e.name)) continue;
    const sig = tier(e);
    enBySig.set(sig, enBySig.has(sig) ? null : e);
  }
  for (const [sig, e] of enBySig) {
    if (!e) continue;
    const d = deBySig.get(sig);
    if (!d) continue;
    matched.set(e.name, d);
    usedDe.add(d.name);
    usedEn.add(e.name);
  }
}

// Last pass: a (level, school) bucket with exactly one leftover on each side.
{
  const bucket = (s) => `${s.level}|${s.school}`;
  const deLeft = new Map();
  for (const d of de) {
    if (usedDe.has(d.name)) continue;
    (deLeft.get(bucket(d)) ?? deLeft.set(bucket(d), []).get(bucket(d))).push(d);
  }
  for (const e of en) {
    if (usedEn.has(e.name)) continue;
    const ds = deLeft.get(bucket(e)) ?? [];
    const enPeers = en.filter((x) => !usedEn.has(x.name) && bucket(x) === bucket(e));
    if (ds.length === 1 && enPeers.length === 1) {
      matched.set(e.name, ds[0]);
      usedDe.add(ds[0].name);
      usedEn.add(e.name);
    }
  }
}

// ---- emit --------------------------------------------------------------------

const out = {};
for (const [enName, d] of [...matched.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  out[enName] = { name: d.name, text: d.text };
}
writeFileSync(join(root, 'resources', 'srd', 'spells.de.json'), JSON.stringify(out, null, 1) + '\n');

const unmatchedEn = en.filter((e) => !usedEn.has(e.name)).map((e) => e.name);
const unmatchedDe = de.filter((d) => !usedDe.has(d.name)).map((d) => d.name);
console.log(`spells.de.json: ${Object.keys(out).length}/${en.length} matched (${de.length} German blocks found)`);
if (unmatchedEn.length) console.log(`  unmatched EN (${unmatchedEn.length}): ${unmatchedEn.join('; ')}`);
if (unmatchedDe.length) console.log(`  unmatched DE (${unmatchedDe.length}): ${unmatchedDe.join('; ')}`);
