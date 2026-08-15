import { randomUUID } from 'crypto';
import type { DamageInstance, MonsterAction } from '../shared/types';
import { averageOf, parseDice } from '../shared/dice';

/**
 * Migrates pre-schema attack records ({ name, toHit, reachOrRange, damageDice,
 * damageType, rawText }) into the MonsterAction shape. Best-effort: parsed
 * fields are derived where possible; rawText becomes display.text.
 */

interface LegacyAttack {
  name: string;
  toHit: number | null;
  reachOrRange: string;
  damageDice: string;
  damageType: string;
  rawText: string;
}

function isLegacy(a: unknown): a is LegacyAttack {
  return (
    typeof a === 'object' &&
    a !== null &&
    !('display' in a) &&
    ('rawText' in a || 'damageDice' in a || 'reachOrRange' in a)
  );
}

function legacyDamage(a: LegacyAttack): DamageInstance[] {
  const out: DamageInstance[] = [];
  // Old combined strings look like "2d6+6 + 1d8 acid" or "1d6+2".
  for (const part of a.damageDice.split(/\s+\+\s+(?=\d+d)/)) {
    const m = part.trim().match(/^(\d+d\d+(?:[+-]\d+)?)(?:\s+(\w+))?/);
    if (!m) continue;
    const dice = parseDice(m[1]);
    out.push({
      average: dice ? averageOf(dice.count, dice.die, dice.bonus) : null,
      dice: m[1],
      count: dice?.count ?? null,
      die: dice?.die ?? null,
      bonus: dice?.bonus ?? null,
      type: (out.length === 0 ? a.damageType || m[2] : m[2]) ?? 'variable',
      condition: null,
    });
  }
  return out;
}

function migrateAttack(a: LegacyAttack, index: number): MonsterAction {
  const text = a.rawText || '';
  const reachM = a.reachOrRange.match(/reach\s+(\d+)/i);
  const rangeM = a.reachOrRange.match(/range\s+(\d+)(?:\/(\d+))?/i);
  const saveM = text.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+Saving Throw:\s*DC\s*(\d+)/i);
  const damage = legacyDamage(a);
  const type = a.toHit !== null ? 'attack' : saveM ? 'save' : 'other';

  return {
    id: `legacy.${randomUUID()}`,
    name: a.name,
    section: 'action',
    type,
    order: index,
    attack:
      a.toHit !== null
        ? {
            kind: rangeM && reachM ? 'melee_or_ranged' : rangeM ? 'ranged' : 'melee',
            toHit: a.toHit,
            toHitNote: null,
            reach: reachM ? parseInt(reachM[1], 10) : rangeM ? null : 5,
            range: rangeM
              ? { normal: parseInt(rangeM[1], 10), long: rangeM[2] ? parseInt(rangeM[2], 10) : null }
              : null,
            usage: null,
          }
        : null,
    save: saveM ? { ability: saveM[1].toUpperCase().slice(0, 3), dc: parseInt(saveM[2], 10) } : null,
    onHit: { damage, alternateDamage: null, effects: [] },
    onHitOrMiss: null,
    display: {
      toHit: a.toHit !== null ? (a.toHit >= 0 ? `+${a.toHit}` : `${a.toHit}`) : null,
      range: a.reachOrRange || null,
      damage: damage.length
        ? damage.map((d) => `${d.average ?? '?'} (${d.dice}) ${d.type}`).join(' plus ')
        : null,
      text,
    },
  };
}

/** Returns migrated actions, or null when the list is already current. */
export function migrateActions(attacks: unknown[]): MonsterAction[] | null {
  if (!Array.isArray(attacks) || attacks.length === 0) return null;
  if (!attacks.some(isLegacy)) return null;
  return attacks.map((a, i) => (isLegacy(a) ? migrateAttack(a, i) : (a as MonsterAction)));
}
