import { useState } from 'react';
import type { AppState } from '../../shared/types';
import { formatPool, rollPool, type DicePoolPart } from '../../shared/dice';
import { api } from './api';
import { useI18n } from './i18n';

const DICE = [4, 6, 8, 10, 12, 20, 100];

interface PartForm {
  count: string;
  die: string;
}

/**
 * DM-side counterpart of the deck's Dice Roller: a pool of mixed dice
 * (e.g. 2d8+1 +1d4) → roll → optionally apply the total as damage or healing.
 */
export function DiceRollerModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const { t } = useI18n();
  const [parts, setParts] = useState<PartForm[]>([{ count: '1', die: '20' }]);
  const [mod, setMod] = useState('0');
  const [result, setResult] = useState<{ total: number; perPart: number[][]; expr: string } | null>(null);
  const [targets, setTargets] = useState<Set<string>>(new Set());

  const combat = state.combat;
  const combatants = combat && combat.phase === 'active' ? combat.combatants : [];

  const poolOf = (): DicePoolPart[] =>
    parts.map((p) => ({
      count: Math.min(99, Math.max(1, parseInt(p.count, 10) || 1)),
      die: parseInt(p.die, 10),
    }));

  const patchPart = (i: number, patch: Partial<PartForm>) => {
    const next = [...parts];
    next[i] = { ...next[i], ...patch };
    setParts(next);
    setResult(null);
  };

  const roll = () => {
    const pool = poolOf();
    const m = parseInt(mod, 10) || 0;
    const { total, perPart } = rollPool(pool, m);
    setResult({ total, perPart, expr: formatPool(pool, m) });
  };

  const toggleTarget = (id: string) => {
    const next = new Set(targets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTargets(next);
  };

  const apply = async (kind: 'damage' | 'heal') => {
    if (!result || targets.size === 0) return;
    for (const id of targets) {
      if (kind === 'damage') await api.applyDamage(id, result.total);
      else await api.applyHeal(id, result.total);
    }
    onClose();
  };

  const modNum = parseInt(mod, 10) || 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('dice.title')}</h2>
        {parts.map((p, i) => (
          <div key={i} className="form-row">
            <label>
              {t(i === 0 ? 'dice.amount' : 'dice.extraAmount')}
              <input
                autoFocus={i === 0}
                type="number"
                min={1}
                max={99}
                value={p.count}
                onChange={(e) => patchPart(i, { count: e.target.value })}
              />
            </label>
            <label>
              {t('dice.die')}
              <select value={p.die} onChange={(e) => patchPart(i, { die: e.target.value })}>
                {DICE.map((d) => (
                  <option key={d} value={d}>d{d}</option>
                ))}
              </select>
            </label>
            {i === 0 ? (
              <label>
                {t('dice.modifier')}
                <input
                  type="number"
                  value={mod}
                  onChange={(e) => {
                    setMod(e.target.value);
                    setResult(null);
                  }}
                />
              </label>
            ) : (
              <button
                className="btn small danger attack-remove"
                onClick={() => {
                  setParts(parts.filter((_, j) => j !== i));
                  setResult(null);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <div className="dice-add-row">
          <button
            className="btn small"
            onClick={() => {
              setParts([...parts, { count: '1', die: '6' }]);
              setResult(null);
            }}
          >
            {t('dice.addExtra')}
          </button>
        </div>
        <button className="btn primary dice-roll-btn" onClick={roll}>
          {t('dice.rollPool', { pool: formatPool(poolOf(), modNum) })}
        </button>

        {result && (
          <div className="dice-result">
            <span className="dice-total">{result.expr} = {result.total}</span>
            <span className="muted">
              {' '}({result.perPart.map((rolls) => rolls.join(', ')).join(' · ')}
              {modNum ? ` · ${modNum > 0 ? '+' : ''}${modNum}` : ''})
            </span>
          </div>
        )}

        {combatants.length > 0 && (
          <>
            <h3>{t('dice.applyTo')} <span className="muted">{t('dice.pickOneOrMore')}</span></h3>
            <div className="monster-pick-list">
              {combatants.map((c) => (
                <button
                  key={c.id}
                  className={`pick-btn ${targets.has(c.id) ? 'picked' : ''}`}
                  onClick={() => toggleTarget(c.id)}
                >
                  {c.isDowned ? '💀 ' : ''}{c.displayName}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>{t('common.close')}</button>
              <button
                className="btn danger"
                disabled={!result || targets.size === 0}
                title={!result ? t('dice.rollFirst') : ''}
                onClick={() => void apply('damage')}
              >
                {t('dice.applyDamage')} {result && targets.size > 0 ? `(${result.total})` : ''}
              </button>
              <button
                className="btn heal"
                disabled={!result || targets.size === 0}
                title={!result ? t('dice.rollFirst') : ''}
                onClick={() => void apply('heal')}
              >
                {t('dice.applyHeal')} {result && targets.size > 0 ? `(${result.total})` : ''}
              </button>
            </div>
          </>
        )}
        {combatants.length === 0 && (
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>{t('common.close')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
