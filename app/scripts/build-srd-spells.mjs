#!/usr/bin/env node
/**
 * Builds resources/srd/spells.json from the vendored Open5e v2 fixtures
 * (srd-source/Spell.json + SpellCastingOption.json, dataset srd-2024 from
 * https://github.com/open5e/open5e-api data/v2/wizards-of-the-coast/srd-2024).
 *
 * Emits one record per spell in the shared `Spell` shape (minus id/source/l10n,
 * which the importer adds), keeping the structured roll layer minimal:
 * attack spells, save spells (with the damage-on-success rule), healing spells,
 * and a tiny allowlist of roll-at-the-table damage-only spells. Everything
 * else keeps its dice in the rules text only — notes over logic, by design.
 *
 * Run manually after updating fixtures: node scripts/build-srd-spells.mjs
 * The output is committed, like monsters.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => JSON.parse(readFileSync(join(root, 'srd-source', f), 'utf8'));

const spellsRaw = src('Spell.json');
const optionsRaw = src('SpellCastingOption.json');

// Spells whose dice are rolled straight at the table without an attack or
// save (auto-hit missiles, smite riders). All other damage-only spells keep
// their dice as note text.
const DAMAGE_ONLY_ALLOWLIST = new Set(['Magic Missile', 'Divine Smite', 'Shining Smite']);

const ATTACK_RE = /make(?:s)? (?:a|one) (?:ranged or melee|melee or ranged|ranged|melee) spell attack/i;
const HEAL_RE = /regains?\s.{0,60}hit points/i;
// Every half-on-save spell in the dataset says so with a "half … damage"
// clause ("takes half as much damage only", "half the initial damage",
// "Success: Half as much damage"); save spells without one deal nothing on a
// success (Acid Splash, Disintegrate).
const SUCCESS_HALF_RE = /half (?:as much|the initial) damage|success:\s*half/i;

const CASTING_TIME = {
  action: 'Action',
  'bonus-action': 'Bonus Action',
  reaction: 'Reaction',
  '1minute': '1 Minute',
  '10minutes': '10 Minutes',
  '1hour': '1 Hour',
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function parseDiceStr(str) {
  if (!str) return null;
  const m = str.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  return { count: Number(m[1]), die: Number(m[2]), bonus: m[3] ? Number(m[3]) : null };
}

const averageOf = (count, die, bonus) => Math.floor(count * ((die + 1) / 2) + (bonus ?? 0));

// ---- upcast derivation from SpellCastingOption slot_level_N damage rolls ----

const optionsByParent = new Map();
for (const o of optionsRaw) {
  const list = optionsByParent.get(o.fields.parent) ?? [];
  list.push(o.fields);
  optionsByParent.set(o.fields.parent, list);
}

/**
 * Returns {count, die} when every slot-level option is the base roll plus a
 * consistent per-level increment of the same die with an unchanged bonus,
 * null otherwise (those spells fall back to upcastText).
 */
function deriveUpcast(pk, baseLevel, baseRoll) {
  const base = parseDiceStr(baseRoll);
  if (!base) return null;
  const slots = (optionsByParent.get(pk) ?? [])
    .filter((o) => o.type.startsWith('slot_level_') && o.damage_roll)
    .map((o) => ({ level: Number(o.type.slice('slot_level_'.length)), roll: parseDiceStr(o.damage_roll) }))
    .sort((a, b) => a.level - b.level);
  if (!slots.length) return null;
  let per = null;
  for (const s of slots) {
    if (!s.roll || s.roll.die !== base.die || (s.roll.bonus ?? null) !== (base.bonus ?? null)) return null;
    const steps = s.level - baseLevel;
    const delta = s.roll.count - base.count;
    if (steps <= 0 || delta <= 0 || delta % steps !== 0) return null;
    const thisPer = delta / steps;
    if (per !== null && thisPer !== per) return null;
    per = thisPer;
  }
  return per ? { count: per, die: base.die } : null;
}

// ---- build ------------------------------------------------------------------

const out = [];
const report = { attack: 0, save: 0, healing: 0, damageOnly: 0, utility: 0, upcastStructured: 0, noneWithDamage: [] };

for (const rec of spellsRaw) {
  const f = rec.fields;
  const isAttack = ATTACK_RE.test(f.desc);
  const isSave = !!f.saving_throw_ability;
  const isHeal = !isAttack && !isSave && !f.damage_types.length && !!f.damage_roll && HEAL_RE.test(f.desc);
  const isDamageOnly = !isAttack && !isSave && !isHeal && !!f.damage_roll && DAMAGE_ONLY_ALLOWLIST.has(f.name);

  const dice = parseDiceStr(f.damage_roll);
  const hasRollLayer = isAttack || isSave || isDamageOnly;

  const damage = [];
  if (hasRollLayer && dice) {
    damage.push({
      average: averageOf(dice.count, dice.die, dice.bonus),
      dice: f.damage_roll.replace(/\s+/g, ''),
      count: dice.count,
      die: dice.die,
      bonus: dice.bonus,
      type: f.damage_types[0] ?? 'variable',
      condition: null,
    });
  }

  let onSuccess = null;
  if (isSave) {
    onSuccess = damage.length && SUCCESS_HALF_RE.test(f.desc) ? 'half' : 'none';
    if (damage.length && onSuccess === 'none') report.noneWithDamage.push(f.name);
  }

  const healing = isHeal && dice ? { dice: f.damage_roll.replace(/\s+/g, ''), count: dice.count, die: dice.die } : null;

  // Cantrips scale by character level (player_level options) — the attached
  // copy is editable, so only leveled slot upcasts get the structured rule.
  const upcast = f.level > 0 && (damage.length || healing)
    ? deriveUpcast(rec.pk, f.level, f.damage_roll)
    : null;
  if (upcast) report.upcastStructured++;

  const components =
    [f.verbal && 'V', f.somatic && 'S', f.material && 'M'].filter(Boolean).join(', ') +
    (f.material && f.material_specified ? ` (${f.material_specified})` : '');

  const castingTime =
    (CASTING_TIME[f.casting_time] ?? cap(f.casting_time)) + (f.ritual ? ' or Ritual' : '');

  const higherHeading = f.level > 0 ? 'Using a Higher-Level Spell Slot.' : 'Cantrip Upgrade.';
  const text = f.desc + (f.higher_level ? `\n\n${higherHeading} ${f.higher_level}` : '');

  out.push({
    name: f.name,
    level: f.level,
    school: f.school,
    castingTime,
    range: f.range_text,
    components,
    duration: cap(f.duration),
    concentration: f.concentration,
    ritual: f.ritual,
    classes: f.classes.map((c) => cap(c.replace(/^srd-2024_/, ''))),
    text,
    attack: isAttack,
    save: isSave ? { ability: f.saving_throw_ability.slice(0, 3).toUpperCase(), onSuccess } : null,
    damage,
    healing,
    upcast,
    upcastText: f.level > 0 && f.higher_level ? f.higher_level : null,
  });

  if (isAttack) report.attack++;
  else if (isSave) report.save++;
  else if (isHeal) report.healing++;
  else if (isDamageOnly) report.damageOnly++;
  else report.utility++;
}

out.sort((a, b) => a.name.localeCompare(b.name));
const dest = join(root, 'resources', 'srd', 'spells.json');
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');

console.log(`spells.json: ${out.length} spells`);
console.log(
  `  attack ${report.attack} | save ${report.save} | healing ${report.healing} | damage-only ${report.damageOnly} | utility ${report.utility}`,
);
console.log(`  structured upcast rules: ${report.upcastStructured}`);
if (report.noneWithDamage.length) {
  console.log(`  save spells dealing NOTHING on success (eyeball): ${report.noneWithDamage.join('; ')}`);
}
