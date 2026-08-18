import type { DamageInstance, MonsterAction, Spell } from './types';

/**
 * The slice of a spell the attach conversion needs — structural, so the
 * phone's WireSpell (pre-localized, no classes/source) qualifies too.
 */
export type CastableSpell = Pick<
  Spell,
  | 'id'
  | 'name'
  | 'level'
  | 'castingTime'
  | 'range'
  | 'text'
  | 'attack'
  | 'save'
  | 'damage'
  | 'healing'
  | 'upcast'
  | 'upcastText'
>;

/**
 * Snapshots a spellbook entry into a PC action ("attach"). The copy is a
 * plain MonsterAction — editable like any attack afterwards (that is how
 * cantrip dice scale: the player bumps them as they level) — plus `spell`
 * metadata that drives the slot prompt, upcast dice and heal polarity.
 *
 * To-hit bonus and save DC are per-caster (ability modifier + proficiency),
 * so the caller collects them when attaching; the spellbook record itself
 * stays caster-neutral. Used by the Party screen picker, the phone picker
 * and the demo.
 */
export function spellToAction(
  spell: CastableSpell,
  opts: { toHit?: number; dc?: number },
  id: string,
  order: number,
): MonsterAction {
  const ct = spell.castingTime.toLowerCase();
  const section = ct.startsWith('bonus') ? 'bonus_action' : ct.startsWith('reaction') ? 'reaction' : 'action';
  const type = spell.attack ? 'attack' : spell.save ? 'save' : 'other';

  const rangeFt = /^(\d+)[ -]f(?:ee|oo)t/.exec(spell.range);
  const touchOrSelf = /^(touch|self)/i.test(spell.range);

  const damage: DamageInstance[] = spell.damage.map((d) => ({ ...d }));
  if (spell.healing) {
    damage.push({
      average: Math.floor(spell.healing.count * ((spell.healing.die + 1) / 2)),
      dice: spell.healing.dice,
      count: spell.healing.count,
      die: spell.healing.die,
      bonus: null,
      type: 'healing',
      condition: null,
    });
  }

  const displayDamage = damage
    .map((d) => `${d.dice ?? d.average ?? ''} ${d.type}`.trim())
    .join(' plus ');

  return {
    id,
    name: spell.name,
    section,
    type,
    order,
    attack: spell.attack
      ? {
          kind: touchOrSelf ? 'melee' : 'ranged',
          toHit: opts.toHit ?? 0,
          toHitNote: null,
          reach: touchOrSelf ? 5 : null,
          range: rangeFt ? { normal: Number(rangeFt[1]), long: null } : touchOrSelf ? null : null,
          usage: null,
        }
      : null,
    save: spell.save
      ? { ability: spell.save.ability, dc: opts.dc ?? 10, onSuccess: spell.save.onSuccess }
      : null,
    onHit: { damage, alternateDamage: null, effects: [] },
    onHitOrMiss: null,
    display: {
      toHit: spell.attack ? `+${opts.toHit ?? 0}` : null,
      range: spell.range || null,
      damage: displayDamage || null,
      // The full rules text rides along — the "advanced effects as a note,
      // visible at a glance" layer for DM and players.
      text: spell.text,
    },
    spell: {
      spellId: spell.id,
      level: spell.level,
      upcast: spell.upcast ? { ...spell.upcast } : null,
      upcastText: spell.upcastText,
      healing: spell.healing !== null,
    },
  };
}
