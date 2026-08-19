import type {
  ActionKind,
  ActionSection,
  AttackKind,
  DamageInstance,
  MonsterAction,
} from '../../shared/types';
import { averageOf, parseDice } from '../../shared/dice';
import { uuid } from '../../shared/uuid';

/**
 * The editable form model for one action (strings while typing) and its
 * MonsterAction converters — shared by the monster editor and the Party
 * screen's PC attack editor so both build identical records, display
 * strings included.
 */

export interface DamageForm {
  dice: string; // "2d6+5" or empty
  flat: string; // flat average when no dice
  type: string;
  condition: string;
}

export interface ActionForm {
  id: string;
  name: string;
  /** Carried opaquely; edited by the Kenku block in the action row. */
  kenkuSound?: MonsterAction['kenkuSound'];
  section: ActionSection;
  type: ActionKind;
  kind: AttackKind;
  toHit: string;
  reach: string;
  rangeNormal: string;
  rangeLong: string;
  saveAbility: string;
  saveDc: string;
  damage: DamageForm[];
  text: string;
}

export const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export const emptyAction = (): ActionForm => ({
  id: `manual.${uuid()}`,
  name: '',
  section: 'action',
  type: 'attack',
  kind: 'melee',
  toHit: '',
  reach: '5',
  rangeNormal: '',
  rangeLong: '',
  saveAbility: 'DEX',
  saveDc: '',
  damage: [],
  text: '',
});

export function actionToForm(a: MonsterAction): ActionForm {
  return {
    id: a.id,
    name: a.name,
    kenkuSound: a.kenkuSound ?? null,
    section: a.section,
    type: a.type,
    kind: a.attack?.kind ?? 'melee',
    toHit: a.attack ? String(a.attack.toHit) : '',
    reach: a.attack?.reach != null ? String(a.attack.reach) : '',
    rangeNormal: a.attack?.range ? String(a.attack.range.normal) : '',
    rangeLong: a.attack?.range?.long != null ? String(a.attack.range.long) : '',
    saveAbility: a.save?.ability ?? 'DEX',
    saveDc: a.save ? String(a.save.dc) : '',
    damage: a.onHit.damage.map((d) => ({
      dice: d.dice ?? '',
      flat: d.dice == null && d.average != null ? String(d.average) : '',
      type: d.type,
      condition: d.condition ?? '',
    })),
    text: a.display.text,
  };
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function formToAction(f: ActionForm, order: number, existing?: MonsterAction): MonsterAction {
  const damage: DamageInstance[] = f.damage
    .filter((d) => d.dice.trim() !== '' || d.flat.trim() !== '')
    .map((d) => {
      const parsed = d.dice.trim() ? parseDice(d.dice) : null;
      return {
        average: parsed
          ? averageOf(parsed.count, parsed.die, parsed.bonus)
          : parseInt(d.flat, 10) || null,
        dice: parsed ? d.dice.trim().replace(/\s/g, '') : null,
        count: parsed?.count ?? null,
        die: parsed?.die ?? null,
        bonus: parsed?.bonus ?? null,
        type: d.type.trim().toLowerCase() || 'variable',
        condition: d.condition.trim() || null,
      };
    });

  const isAttack = f.type === 'attack';
  const isSave = f.type === 'save';
  const toHit = parseInt(f.toHit, 10) || 0;
  const reach = f.reach.trim() !== '' ? parseInt(f.reach, 10) || 0 : null;
  const range =
    f.rangeNormal.trim() !== ''
      ? {
          normal: parseInt(f.rangeNormal, 10) || 0,
          long: f.rangeLong.trim() !== '' ? parseInt(f.rangeLong, 10) || null : null,
        }
      : null;

  const rangeParts: string[] = [];
  if (isAttack && reach != null && f.kind !== 'ranged') rangeParts.push(`reach ${reach} ft.`);
  if (isAttack && range && f.kind !== 'melee') {
    rangeParts.push(`range ${range.normal}${range.long ? `/${range.long}` : ''} ft.`);
  }

  return {
    id: f.id,
    name: f.name.trim(),
    section: f.section,
    type: f.type,
    order,
    attack: isAttack
      ? {
          kind: f.kind,
          toHit,
          toHitNote: existing?.attack?.toHitNote ?? null,
          reach: f.kind === 'ranged' ? null : reach,
          range: f.kind === 'melee' ? null : range,
          usage: existing?.attack?.usage ?? null,
        }
      : null,
    save: isSave
      ? {
          ability: f.saveAbility,
          dc: parseInt(f.saveDc, 10) || 10,
          // The damage-on-success rule has no form field; spell snapshots
          // carry it through edits unchanged.
          ...(existing?.save?.onSuccess ? { onSuccess: existing.save.onSuccess } : {}),
        }
      : null,
    onHit: {
      damage,
      alternateDamage: existing?.onHit.alternateDamage ?? null,
      effects: existing?.onHit.effects ?? [],
    },
    onHitOrMiss: existing?.onHitOrMiss ?? null,
    kenkuSound: f.kenkuSound ?? null,
    // Spell metadata survives edits — an edited snapshot still casts (slot
    // prompt, upcast, heal polarity all keyed off this).
    spell: existing?.spell ?? null,
    display: {
      toHit: isAttack ? (toHit >= 0 ? `+${toHit}` : `${toHit}`) : null,
      range: rangeParts.join(' or ') || null,
      damage: damage.length
        ? damage
            .map((d) => (d.dice ? `${d.average} (${d.dice}) ${cap(d.type)}` : `${d.average} ${cap(d.type)}`))
            .join(' plus ')
        : null,
      text: f.text,
    },
  };
}
