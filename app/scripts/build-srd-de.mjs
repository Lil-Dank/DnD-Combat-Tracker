// Builds the German localization data for SRD-imported monsters from the
// German SRD 5.2.1 PDF.
//
//   pdftotext -enc UTF-8 DE_SRD_CC_v5.2.1.pdf de-raw.txt     (raw mode, NOT -layout)
//   node scripts/build-srd-de.mjs de-raw.txt
//
// Raw reading order keeps each stat block contiguous, which -layout does not.
//
// Output: resources/srd/monsters.de.json —
//   { "<English name>": { name: "<German name>",
//                         actions: { "<English action name>": { name, text } } } }
//
// Monsters are matched by stat signature (AC + HP + the six ability scores,
// falling back to the initiative bonus), never by translating words: German
// names are often not literal renderings ("Ettercap" -> "Atterkopp"). Actions
// are matched per monster the same way — by to-hit / save-DC / damage-average
// signatures, then a small fixed-name dictionary (Multiattack ->
// Mehrfachangriff), then a last-one-left pairing per section. Anything
// ambiguous is dropped: an English fallback beats a wrong German label.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src) {
  console.error('usage: node scripts/build-srd-de.mjs <de-raw.txt>');
  process.exit(1);
}

// ---- text cleanup ----------------------------------------------------------
const rawLines = readFileSync(src, 'utf8')
  .split('\n')
  .map((l) => l.replace(/−/g, '-').trimEnd())        // U+2212 minus -> '-'
  .filter((l) => !/^\s*\d+ Systemreferenzdokument 5\.2\.1\s*$/.test(l));

/** Join wrapped lines into one string, resolving soft-hyphen breaks. */
function joinLines(lines) {
  let out = '';
  for (const raw of lines) {
    const l = raw.trim();
    if (l === '') {
      if (!out.endsWith('\n')) out += '\n';               // paragraph break
      continue;
    }
    if (out === '' || out.endsWith('\n')) out += l;
    else if (/[­‑]$/.test(out)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out.replace(/[­]/g, '').trim();
}

// ---- stat block segmentation ----------------------------------------------
const SIZE =
  /^(Winzig|Klein|Mittelgroß|Groß|Riesig|Gigantisch|Schwarm)(e[rs]?)?\b.*,/;
const SECTION_MAP = {
  Merkmale: 'trait',
  Aktionen: 'action',
  Bonusaktionen: 'bonus_action',
  Reaktionen: 'reaction',
  'Legendäre Aktionen': 'legendary_action',
};
const FIELD =
  /^(RK|TP|Bewegungsrate|Initiative|Fertigkeiten|Sinne|Sprachen|HG|MOD|Stä|Int|Ausrüstung|Immunitäten|Resistenzen|Anfälligkeiten)\b/;

// Block starts: a size/type line whose next few lines contain "RK <n>".
const starts = [];
for (let i = 1; i < rawLines.length; i++) {
  if (!SIZE.test(rawLines[i])) continue;
  let hasRk = false;
  for (let j = i; j < Math.min(i + 8, rawLines.length); j++) {
    if (/^RK \d+/.test(rawLines[j])) { hasRk = true; break; }
  }
  if (!hasRk) continue;
  // Name: nearest non-empty line above.
  let n = i - 1;
  while (n >= 0 && rawLines[n].trim() === '') n--;
  const name = rawLines[n]?.trim();
  if (!name || name.length < 3 || name.length > 60 || FIELD.test(name) || /\d{2,}/.test(name)) continue;
  starts.push({ i, nameIdx: n, name });
}

const blocks = [];
for (let b = 0; b < starts.length; b++) {
  const from = starts[b].i;
  const to = b + 1 < starts.length ? starts[b + 1].nameIdx : rawLines.length;
  const lines = rawLines.slice(from, to);
  const text = lines.join('\n');

  // Two print layouts exist: fields on their own lines, or run together as
  // "RK 15 TP 9 (2W8) Bewegungsrate 9 m" - so search the block, not the line.
  const ac = text.match(/\bRK (\d+)/)?.[1];
  const hp = text.match(/\bTP (\d+)\s*\(/)?.[1];
  const init = text.match(/\bInitiative ([+-]\d+)/)?.[1];
  // Column order can scramble the ability rows in small blocks ('Kon 8' ends
  // up separated from its modifiers), so pull each score by its own label
  // from the header region (everything before the first section heading).
  const headEnd = lines.findIndex((l) => SECTION_MAP[l.trim()]);
  const head = joinLines(lines.slice(0, headEnd === -1 ? lines.length : headEnd));
  const score = (label) => {
    const m = head.match(new RegExp(label + String.raw` (\d+)`));
    return m ? Number(m[1]) : null;
  };
  const scores = ['Stä', 'Ges', 'Kon', 'Int', 'Wei', 'Cha'].map(score);
  const ab = scores.every((x) => x !== null) ? scores : null;
  if (ac === undefined || hp === undefined) continue;

  // ---- sections and entries -----------------------------------------------
  const sections = {};                                    // en-section -> entries
  let cur = null;
  let entry = null;
  const KEYWORD =
    /^(Misserfolg|Erfolg|Treffer|Erfolg oder Misserfolg|Nahkampf|Fernkampf|Nahkampf- oder|Stärke|Geschicklichkeits|Konstitutions|Intelligenz|Weisheits|Charisma)[a-zäöüß]*(rettungswurf|angriffswurf)?:/;
  const ENTRY = /^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9'’­‑ –-]{1,58}?(?:\s*\([^)]{1,48}\))?):\s*(.*)$/;

  const flush = () => {
    if (cur && entry) {
      entry.text = joinLines(entry.textLines);
      delete entry.textLines;
      (sections[cur] ??= []).push(entry);
    }
    entry = null;
  };

  for (const raw of lines) {
    const l = raw.trim();
    const asSection = SECTION_MAP[l];
    if (asSection) {
      flush();
      cur = asSection;
      continue;
    }
    if (!cur) continue;
    if (l === 'Anwendungen legendärer Aktionen' || /^Anwendungen legendärer Aktionen:/.test(l)) {
      flush();
      continue;
    }
    const m = l.match(ENTRY);
    if (m && !KEYWORD.test(l)) {
      flush();
      entry = { name: m[1].replace(/[­]/g, ''), textLines: [m[2]] };
      continue;
    }
    if (entry) entry.textLines.push(raw);
  }
  flush();

  // The run-together print layout can merge two entries into one paragraph
  // ("...fuehrt zwei Angriffe aus. Zerfetzen: Nahkampfangriffswurf..."), which
  // would both hide an action and poison signature matching with the swallowed
  // numbers. Split entry texts on interior "Name:" starts after sentence ends.
  const SPLIT = /(?<=\.)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß0-9'’ –-]{1,50}?(?:\s*\([^)]{1,48}\))?):\s/;
  for (const list of Object.values(sections)) {
    for (let e = 0; e < list.length; e++) {
      const m = list[e].text.match(SPLIT);
      if (!m || KEYWORD.test(m[1] + ':')) continue;
      const at = m.index + m[0].indexOf(m[1]);
      const rest = list[e].text.slice(at);
      const nm = rest.slice(0, rest.indexOf(':'));
      list[e].text = list[e].text.slice(0, at).trim();
      list.splice(e + 1, 0, { name: nm.trim(), text: rest.slice(rest.indexOf(':') + 1).trim() });
    }
  }

  blocks.push({
    name: starts[b].name.replace(/[­]/g, ''),
    ac: Number(ac),
    hp: Number(hp),
    init: init !== undefined ? Number(init) : null,
    ab,
    sections,
  });
}

// De-dupe repeated block titles (page-break reprints keep the first, fuller one).
const seen = new Map();
for (const blk of blocks) {
  const k = blk.name.toLowerCase();
  const prev = seen.get(k);
  const count = (o) => Object.values(o.sections).reduce((n, s) => n + s.length, 0);
  if (!prev || count(blk) > count(prev)) seen.set(k, blk);
}
const german = [...seen.values()];

// ---- match monsters --------------------------------------------------------
const english = JSON.parse(
  readFileSync(join(here, '..', 'resources', 'srd', 'monsters.json'), 'utf8'),
);
const sigFull = (ac, hp, ab) => (ab ? `${ac}|${hp}|${ab.join(',')}` : null);
const sigInit = (ac, hp, init) => (init === null ? null : `${ac}|${hp}|i${init}`);
const sigAcHp = (ac, hp) => `${ac}|${hp}`;

const index = { full: new Map(), init: new Map(), achp: new Map() };
const push = (m, k, v) => { if (k) (m.get(k) ?? m.set(k, []).get(k)).push(v); };
for (const m of english) {
  const a = m.abilities;
  push(index.full, sigFull(m.ac, m.maxHp, a ? [a.str, a.dex, a.con, a.int, a.wis, a.cha] : null), m);
  push(index.init, sigInit(m.ac, m.maxHp, m.initMod), m);
  push(index.achp, sigAcHp(m.ac, m.maxHp), m);
}
const lookup = (g) => {
  for (const [map, key] of [
    [index.full, sigFull(g.ac, g.hp, g.ab)],
    [index.init, sigInit(g.ac, g.hp, g.init)],
    [index.achp, sigAcHp(g.ac, g.hp)],
  ]) {
    const c = key ? map.get(key) ?? [] : [];
    if (c.length === 1) return c[0];
  }
  return null;
};

// A signature must never resolve to two different German names.
const claimed = new Map();                                // en name -> de name
const conflicts = new Set();
for (const g of german) {
  const en = lookup(g);
  if (!en) continue;
  const prev = claimed.get(en.name);
  if (prev && prev !== g.name) conflicts.add(en.name);
  claimed.set(en.name, g.name);
}

// ---- match actions per monster --------------------------------------------
/** Fixed EN->DE names for recurring entries with no stats to match on. */
const NAME_DICT = {
  Multiattack: 'Mehrfachangriff',
  Spellcasting: 'Zauberwirken',
  'Legendary Resistance': 'Legendäre Resistenz',
  Amphibious: 'Amphibisch',
  'Pack Tactics': 'Rudeltaktik',
  'Magic Resistance': 'Magieresistenz',
  'Frightful Presence': 'Schreckliche Gegenwart',
  'Nimble Escape': 'Flinke Flucht',
  'Keen Smell': 'Feiner Geruchssinn',
  Flyby: 'Vorbeiflug',
  'Water Breathing': 'Wasseratmung',
  'False Appearance': 'Falsches Erscheinungsbild',
};
const base = (s) => s.replace(/\s*\(.*\)\s*$/, '').trim();
const deSig = (text) => {
  const toHit = text.match(/angriffswurf:\s*\+?(-?\d+)/i)?.[1];
  const dc = text.match(/SG\s+(\d+)/)?.[1];
  const avg = text.match(/(\d+)\s*\(\d+W\d+/)?.[1];
  // Melee vs ranged separates pairs with identical numbers (Scimitar/Shortbow).
  const kind = /Nahkampf- oder Fernkampfangriffswurf/.test(text)
    ? 'B'
    : /Fernkampfangriffswurf/.test(text)
      ? 'R'
      : /Nahkampfangriffswurf/.test(text)
        ? 'M'
        : '?';
  if (toHit !== undefined) return `A|${kind}|${toHit}|${avg ?? ''}`;
  if (dc !== undefined) return `S|${dc}|${avg ?? ''}`;
  return null;
};
const enSig = (a) => {
  const avg = a.onHit?.damage?.[0]?.average;
  if (a.type === 'attack' && a.attack) {
    const kind =
      a.attack.kind === 'melee_or_ranged' ? 'B' : a.attack.kind === 'ranged' ? 'R' : 'M';
    return `A|${kind}|${a.attack.toHit}|${avg ?? ''}`;
  }
  if (a.type === 'save' && a.save) return `S|${a.save.dc}|${avg ?? ''}`;
  return null;
};

const out = {};
let actMatched = 0;
let actTotal = 0;
for (const g of german) {
  const en = lookup(g);
  if (!en || conflicts.has(en.name)) continue;
  const entry = { name: g.name, actions: {} };

  const bySection = {};
  for (const a of en.attacks ?? []) (bySection[a.section] ??= []).push(a);

  for (const [section, enActs] of Object.entries(bySection)) {
    const deActs = [...(g.sections[section] ?? [])];
    actTotal += enActs.length;
    const unEn = [...enActs];
    const take = (deA, enA) => {
      entry.actions[enA.name] = { name: deA.name, text: deA.text };
      unEn.splice(unEn.indexOf(enA), 1);
      deActs.splice(deActs.indexOf(deA), 1);
      actMatched++;
    };

    // 1. fixed-name dictionary first: a merged-layout Multiattack paragraph can
    //    carry another attack's numbers, so names outrank signatures here
    for (const enA of [...unEn]) {
      const want = NAME_DICT[base(enA.name)];
      if (!want) continue;
      const deHit = deActs.filter((x) => base(x.name) === want);
      if (deHit.length === 1) take(deHit[0], enA);
    }
    // 2. stat signatures, only when unique on both sides
    for (const enA of [...unEn]) {
      const k = enSig(enA);
      if (!k) continue;
      const enDup = enActs.filter((x) => enSig(x) === k);
      const deHit = deActs.filter((x) => deSig(x.text) === k);
      if (enDup.length === 1 && deHit.length === 1) take(deHit[0], enA);
    }
    // 3. exactly one left on each side -> pair
    if (unEn.length === 1 && deActs.length === 1) take(deActs[0], unEn[0]);
  }
  out[en.name] = entry;
}

const outFile = join(here, '..', 'resources', 'srd', 'monsters.de.json');
writeFileSync(outFile, JSON.stringify(out, null, 1) + '\n');

const withActions = Object.values(out).filter((m) => Object.keys(m.actions).length > 0).length;
console.log(`german blocks parsed   : ${german.length}`);
console.log(`monsters matched       : ${Object.keys(out).length} / ${english.length}`);
console.log(`  with action data     : ${withActions}`);
console.log(`  name conflicts dropped: ${conflicts.size}`);
console.log(`actions matched        : ${actMatched} / ${actTotal} (in matched monsters)`);
console.log(`wrote ${outFile}`);
