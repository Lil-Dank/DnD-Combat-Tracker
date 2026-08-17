import { useState } from 'react';
import { displayDice, formatDice, parseDice } from '../shared/dice';
import { damageTypeLabel, DAMAGE_TYPE_DE, type Lang } from '../shared/i18n';

const DICE = [4, 6, 8, 10, 12, 20, 100];

export interface DamagePartValue {
  dice: string;
  flat: string;
  type: string;
  condition: string;
}

/**
 * Structured damage entry shared by the desktop editors and the phone:
 * die picker + count stepper + bonus (round-tripping the stored NdM+B
 * string), flat damage when no dice, a localized damage-type select with a
 * custom escape hatch, and an optional rider-condition field. Hand-typed
 * values the parser can't read fall back to a plain text field.
 */
export function DamageEditor({
  t,
  lang,
  value,
  onChange,
  showCondition = false,
}: {
  t: (k: string, p?: Record<string, string | number>) => string;
  lang: Lang;
  value: DamagePartValue;
  onChange: (patch: Partial<DamagePartValue>) => void;
  showCondition?: boolean;
}) {
  const { dice, flat, type } = value;
  const parsed = dice.trim() === '' ? { count: 0, die: 8, bonus: 0 } : parseDice(dice);
  const manual = parsed === null;
  const cur = parsed ?? { count: 0, die: 8, bonus: 0 };

  const knownTypes = Object.keys(DAMAGE_TYPE_DE);
  const typeKnown = type === '' || knownTypes.includes(type.toLowerCase());
  const [otherType, setOtherType] = useState(!typeKnown);

  const emit = (count: number, die: number, bonus: number) => {
    onChange({ dice: count <= 0 ? '' : formatDice(count, die, bonus) });
  };

  return (
    <div className="dmg-editor">
      <span className="field-label">{t('monsters.f.damageDice')}</span>
      {manual ? (
        <div className="dice-manual">
          <input value={dice} onChange={(e) => onChange({ dice: e.target.value })} />
          <button type="button" className="link-btn" onClick={() => onChange({ dice: '1d8' })}>
            {t('mob.usePicker')}
          </button>
        </div>
      ) : (
        <div className="dice-picker">
          <div className="stepper">
            <button
              type="button"
              aria-label="−"
              onClick={() => emit(Math.max(0, cur.count - 1), cur.die, cur.bonus)}
            >
              −
            </button>
            <span className="stepper-value tnum">{cur.count}</span>
            <button
              type="button"
              aria-label="+"
              onClick={() => emit(Math.min(20, cur.count + 1), cur.die, cur.bonus)}
            >
              +
            </button>
          </div>
          <select
            value={cur.die}
            disabled={cur.count === 0}
            onChange={(e) => emit(Math.max(1, cur.count), parseInt(e.target.value, 10), cur.bonus)}
          >
            {DICE.map((d) => (
              <option key={d} value={d}>
                {displayDice(lang, `d${d}`)}
              </option>
            ))}
          </select>
          <label className="bonus-label">
            {t('mob.bonus')}
            <input
              type="number"
              inputMode="numeric"
              disabled={cur.count === 0}
              value={cur.count === 0 ? '' : cur.bonus}
              onChange={(e) => emit(cur.count, cur.die, parseInt(e.target.value, 10) || 0)}
            />
          </label>
          {cur.count === 0 ? (
            <label className="bonus-label">
              {t('monsters.f.flatDamage')}
              <input
                type="number"
                inputMode="numeric"
                value={flat}
                onChange={(e) => onChange({ flat: e.target.value })}
              />
            </label>
          ) : (
            <span className="dice-preview muted tnum">
              {displayDice(lang, formatDice(cur.count, cur.die, cur.bonus))}
            </span>
          )}
        </div>
      )}

      <div className="dmg-type-row">
        <label>
          {t('mob.dmgType')}
          <select
            value={otherType ? '__other' : type.toLowerCase()}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__other') {
                setOtherType(true);
              } else {
                setOtherType(false);
                onChange({ type: v });
              }
            }}
          >
            <option value="">{t('mob.typeNone')}</option>
            {knownTypes.map((k) => (
              <option key={k} value={k}>
                {damageTypeLabel(lang, k)}
              </option>
            ))}
            <option value="__other">{t('mob.typeOther')}</option>
          </select>
        </label>
        {otherType && (
          <label>
            {t('mob.typeCustom')}
            <input value={type} onChange={(e) => onChange({ type: e.target.value })} />
          </label>
        )}
        {showCondition && (
          <label>
            {t('monsters.f.onlyIf')}
            <input
              value={value.condition}
              onChange={(e) => onChange({ condition: e.target.value })}
            />
          </label>
        )}
      </div>
    </div>
  );
}
