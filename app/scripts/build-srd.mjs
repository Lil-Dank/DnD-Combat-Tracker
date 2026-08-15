// Compiles the Open5e SRD 5.2 fixture files (srd-source/) into the compact
// resources/srd/monsters.json bundled with the app, emitting the MonsterAction
// schema derived from SRD 5.2.1 (display layer + parsed layer per action).
//
// Source: https://github.com/open5e/open5e-api (data/v2/wizards-of-the-coast/srd-2024)
// Content: System Reference Document 5.2.1 by Wizards of the Coast, CC-BY-4.0.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => JSON.parse(readFileSync(join(root, 'srd-source', f), 'utf-8'));

const creatures = src('Creature.json');
const actions = src('CreatureAction.json');
const attacks = src('CreatureActionAttack.json');

const actionsByCreature = new Map();
for (const a of actions) {
  const list = actionsByCreature.get(a.fields.parent) ?? [];
  list.push(a);
  actionsByCreature.set(a.fields.parent, list);
}
const attacksByAction = new Map();
for (const at of attacks) {
  const list = attacksByAction.get(at.fields.parent) ?? [];
  list.push(at);
  attacksByAction.set(at.fields.parent, list);
}

const dieSize = (d) => (d ? parseInt(String(d).replace(/^D/i, ''), 10) : null);
const averageOf = (count, die, bonus) => Math.floor((count * (die + 1)) / 2) + bonus;
const formatDice = (count, die, bonus) =>
  `${count}d${die}${bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : ''}`;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const SECTION_MAP = {
  ACTION: 'action',
  BONUS_ACTION: 'bonus_action',
  REACTION: 'reaction',
  LEGENDARY_ACTION: 'legendary_action',
};

function damageInstance({ count, die, bonus, type, condition }) {
  const hasDice = count != null && die != null;
  return {
    average: hasDice ? averageOf(count, die, bonus ?? 0) : null,
    dice: hasDice ? formatDice(count, die, bonus ?? 0) : null,
    count: hasDice ? count : null,
    die: hasDice ? die : null,
    bonus: hasDice ? (bonus ?? 0) : null,
    type: type ?? 'variable',
    condition: condition ?? null,
  };
}

/**
 * Damage mentions in prose: "10 (3d6) Psychic damage" or "1 Piercing damage",
 * each optionally followed by a condition ("… if the attack roll had Advantage").
 * "or"-prefixed mentions are alternate damage, not extra instances — skipped.
 */
function parseDamageFromText(desc, max = 2) {
  const out = [];
  const re = /(\bor\s+)?(\d+)\s*\((\d+)d(\d+)\s*([+-]\s*\d+)?\)\s+(\w+)\s+damage(\s+if\s+[^.,]+)?|(?:^|[\s:])(\d+)\s+([A-Z]\w+)\s+damage/g;
  let m;
  while (out.length < max && (m = re.exec(desc)) !== null) {
    if (m[2] !== undefined) {
      if (m[1]) continue; // alternate damage ("… or 18 (4d6+4) if …")
      const count = parseInt(m[3], 10);
      const die = parseInt(m[4], 10);
      const bonus = m[5] ? parseInt(m[5].replace(/\s/g, ''), 10) : 0;
      out.push(
        damageInstance({
          count, die, bonus,
          type: m[6].toLowerCase(),
          condition: m[7] ? m[7].replace(/^\s+if\s+/, 'if ').trim() : null,
        }),
      );
    } else {
      // Flat-number damage, no dice.
      out.push({
        average: parseInt(m[8], 10),
        dice: null, count: null, die: null, bonus: null,
        type: m[9].toLowerCase(),
        condition: null,
      });
    }
  }
  return out;
}

/** "Melee or Ranged Attack Roll: +10, reach 5 ft. or range 30/120 ft." from text. */
function parseAttackRollFromText(desc) {
  const m = desc.match(/(Melee or Ranged|Melee|Ranged)\s+Attack Roll:\s*([+-]?\d+)(?:\s*\(([^)]+)\))?/i);
  if (!m) return null;
  const kindWord = m[1].toLowerCase();
  const kind = kindWord === 'melee or ranged' ? 'melee_or_ranged' : kindWord;
  const reachM = desc.match(/reach\s+(\d+)\s*f(?:t|eet)/i);
  const rangeM = desc.match(/range\s+(\d+)(?:\/(\d+))?\s*f(?:t|eet)/i);
  return {
    kind,
    toHit: parseInt(m[2].replace('−', '-'), 10),
    toHitNote: m[3] ?? null,
    reach: reachM ? parseInt(reachM[1], 10) : null,
    range: rangeM
      ? { normal: parseInt(rangeM[1], 10), long: rangeM[2] ? parseInt(rangeM[2], 10) : null }
      : null,
  };
}

function parseEffects(desc) {
  const effects = [];
  const condRe = /has the (\w+(?: and \w+)?) condition(?:\s*\(escape DC (\d+)\))?/gi;
  let m;
  while ((m = condRe.exec(desc)) !== null) {
    for (const cond of m[1].split(/ and /i)) {
      effects.push({
        kind: 'condition',
        condition: cond.toLowerCase(),
        escapeDC: m[2] ? parseInt(m[2], 10) : null,
        text: m[0],
      });
    }
  }
  const saveM = desc.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+)/i);
  // Embedded save on an attack (not the action's own save — that's type 'save').
  if (saveM && /Attack Roll:/i.test(desc)) {
    effects.push({ kind: 'save', text: saveM[0] });
  }
  return effects;
}

function parseAlternateDamage(desc) {
  const m = desc.match(/,?\s*or\s+(\d+)\s*\((\d+)d(\d+)\s*([+-]\s*\d+)?\)(?:\s+(\w+))?(?:\s+damage)?\s+if\s+([^.]+)\./i);
  if (!m) return null;
  const count = parseInt(m[2], 10);
  const die = parseInt(m[3], 10);
  const bonus = m[4] ? parseInt(m[4].replace(/\s/g, ''), 10) : 0;
  return {
    average: parseInt(m[1], 10),
    dice: formatDice(count, die, bonus),
    type: (m[5] ?? '').toLowerCase() || 'as primary',
    when: m[6].trim(),
  };
}

function usageOf(action) {
  const f = action.fields;
  if (f.limited_to_form) return { type: 'form', text: String(f.limited_to_form) };
  if (f.uses_type === 'RECHARGE_ON_ROLL') return { type: 'recharge', min: f.uses_param ?? 5 };
  if (f.uses_type === 'PER_DAY') return { type: 'per_day', times: f.uses_param ?? 1 };
  return null;
}

function displayRange(reach, range) {
  const parts = [];
  if (reach != null) parts.push(`reach ${reach} ft.`);
  if (range != null) parts.push(`range ${range.normal}${range.long ? `/${range.long}` : ''} ft.`);
  return parts.join(' or ') || null;
}

function displayDamage(damage) {
  if (damage.length === 0) return null;
  return damage
    .map((d) =>
      d.dice
        ? `${d.average} (${d.dice.replace(/([+-])/, ' $1 ')}) ${cap(d.type)}`
        : `${d.average} ${cap(d.type)}`,
    )
    .join(' plus ');
}

/** Structured attack-roll entry from a CreatureActionAttack row. */
function attackAction(row, action, creaturePk, order, nthOfAction) {
  const f = row.fields;
  const desc = action.fields.desc ?? '';

  // Data quirk: single-damage attacks sometimes carry their type in
  // extra_damage_type with no extra damage dice.
  const hasExtra = f.extra_damage_die_count != null;
  const primaryType = f.damage_type ?? (hasExtra ? null : f.extra_damage_type);

  const damage = [];
  if (f.damage_die_count != null && f.damage_die_type != null) {
    damage.push(
      damageInstance({
        count: f.damage_die_count,
        die: dieSize(f.damage_die_type),
        bonus: f.damage_bonus,
        type: primaryType,
      }),
    );
  } else if (f.damage_bonus != null && f.damage_bonus > 0) {
    // Flat-number damage attacks.
    damage.push({
      average: f.damage_bonus, dice: null, count: null, die: null, bonus: null,
      type: primaryType ?? 'variable', condition: null,
    });
  }
  if (hasExtra) {
    const extraCondition = /if the attack roll had Advantage/i.test(desc)
      ? 'if the attack roll had Advantage'
      : null;
    damage.push(
      damageInstance({
        count: f.extra_damage_die_count,
        die: dieSize(f.extra_damage_die_type),
        bonus: f.extra_damage_bonus,
        type: f.extra_damage_type,
        condition: extraCondition,
      }),
    );
  }

  // The SRD sentence is authoritative (the structured rows miss some second
  // damage instances, e.g. the ice devil's cold rider) — prefer the text
  // parse when it captures more than the row did.
  const textDamage = parseDamageFromText(desc);
  const reconciled = textDamage.length > damage.length ? textDamage : damage;

  const kind = f.reach != null && f.range != null ? 'melee_or_ranged' : f.reach != null ? 'melee' : 'ranged';
  const range = f.range != null ? { normal: f.range, long: f.long_range ?? null } : null;
  const toHit = f.to_hit_mod ?? 0;
  const toHitNoteM = desc.match(/Attack Roll:\s*[+-]?\d+\s*\(([^)]+)\)/i);
  const hitOrMissM = desc.match(/Hit or Miss:\s*(.+)$/is);

  return {
    id: `${creaturePk}.${slug(action.fields.name)}${nthOfAction > 0 ? `-${nthOfAction + 1}` : ''}`,
    name: action.fields.name,
    section: SECTION_MAP[action.fields.action_type] ?? 'action',
    type: 'attack',
    order,
    attack: {
      kind,
      toHit,
      toHitNote: toHitNoteM ? toHitNoteM[1] : null,
      reach: f.reach ?? null,
      range,
      usage: usageOf(action),
    },
    save: null,
    onHit: {
      damage: reconciled,
      alternateDamage: parseAlternateDamage(desc),
      effects: parseEffects(desc),
    },
    onHitOrMiss: hitOrMissM ? hitOrMissM[1].trim() : null,
    display: {
      toHit: toHit >= 0 ? `+${toHit}` : `${toHit}`,
      range: displayRange(f.reach ?? null, range),
      damage: displayDamage(reconciled),
      text: desc,
    },
  };
}

/** Save-based, text-only-attack, or plain action (breath weapons, Multiattack…). */
function textAction(action, creaturePk, order) {
  const desc = action.fields.desc ?? '';

  // Some attack rolls have no structured row upstream (e.g. the roper's
  // grapple-only Tentacle) — the sentence grammar still identifies them.
  const rollFromText = parseAttackRollFromText(desc);
  if (rollFromText) {
    const damage = parseDamageFromText(desc);
    const hitOrMissM = desc.match(/Hit or Miss:\s*(.+)$/is);
    return {
      id: `${creaturePk}.${slug(action.fields.name)}`,
      name: action.fields.name,
      section: SECTION_MAP[action.fields.action_type] ?? 'action',
      type: 'attack',
      order,
      attack: { ...rollFromText, usage: usageOf(action) },
      save: null,
      onHit: { damage, alternateDamage: parseAlternateDamage(desc), effects: parseEffects(desc) },
      onHitOrMiss: hitOrMissM ? hitOrMissM[1].trim() : null,
      display: {
        toHit: rollFromText.toHit >= 0 ? `+${rollFromText.toHit}` : `${rollFromText.toHit}`,
        range: displayRange(rollFromText.reach, rollFromText.range),
        damage: displayDamage(damage),
        text: desc,
      },
    };
  }

  const saveM = desc.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+)/i);
  const type = saveM ? 'save' : 'other';
  const damage = saveM ? parseDamageFromText(desc) : [];

  return {
    id: `${creaturePk}.${slug(action.fields.name)}`,
    name: action.fields.name,
    section: SECTION_MAP[action.fields.action_type] ?? 'action',
    type,
    order,
    attack: null,
    save: saveM ? { ability: saveM[1].toUpperCase().slice(0, 3), dc: parseInt(saveM[2], 10) } : null,
    onHit: { damage, alternateDamage: null, effects: type === 'save' ? parseEffects(desc) : [] },
    onHitOrMiss: null,
    display: {
      toHit: null,
      range: null,
      damage: displayDamage(damage),
      text: desc,
    },
  };
}

const monsters = [];
let attackCount = 0;
let saveCount = 0;
let otherCount = 0;

for (const c of creatures) {
  const f = c.fields;
  if (!f.name || typeof f.hit_points !== 'number') continue;

  const monsterActions = [];
  const creatureActions = (actionsByCreature.get(c.pk) ?? []).sort(
    (a, b) => (a.fields.order_in_statblock ?? 0) - (b.fields.order_in_statblock ?? 0),
  );
  let order = 0;
  for (const action of creatureActions) {
    try {
      const rows = attacksByAction.get(action.pk) ?? [];
      if (rows.length > 0) {
        rows.forEach((row, i) => {
          monsterActions.push(attackAction(row, action, c.pk, order++, i));
          attackCount++;
        });
      } else {
        const entry = textAction(action, c.pk, order++);
        monsterActions.push(entry);
        if (entry.type === 'attack') attackCount++;
        else if (entry.type === 'save') saveCount++;
        else otherCount++;
      }
    } catch {
      // Unparseable action → skip it, keep the monster.
    }
  }

  const dexMod = Math.floor(((f.ability_score_dexterity ?? 10) - 10) / 2);
  monsters.push({
    name: f.name,
    maxHp: f.hit_points,
    ac: f.armor_class ?? 10,
    initMod: f.initiative_bonus ?? dexMod,
    abilities: {
      str: f.ability_score_strength ?? 10,
      dex: f.ability_score_dexterity ?? 10,
      con: f.ability_score_constitution ?? 10,
      int: f.ability_score_intelligence ?? 10,
      wis: f.ability_score_wisdom ?? 10,
      cha: f.ability_score_charisma ?? 10,
    },
    attacks: monsterActions,
  });
}

monsters.sort((a, b) => a.name.localeCompare(b.name));
const outDir = join(root, 'resources', 'srd');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'monsters.json'), JSON.stringify(monsters, null, 1));
console.log(
  `Wrote ${monsters.length} monsters: ${attackCount} attack rolls, ${saveCount} save actions, ${otherCount} other actions.`,
);
