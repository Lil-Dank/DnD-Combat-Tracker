import { useEffect, useState } from 'react';
import type { AppState, Combatant, MonsterAction } from '../../shared/types';
import { rollPool } from '../../shared/dice';
import { api } from './api';
import { useI18n } from './i18n';

/**
 * DM-side Monster Attack workflow, mirroring the Stream Deck flow:
 * pick attack → pick target(s) (multi for save-based AoE) → roll attack
 * (vs the target's AC) and/or damage → for save actions choose who saved
 * (half damage, rounded down) → apply.
 */

type Step = 'attack' | 'target' | 'roll' | 'saves';

const isRollable = (a: MonsterAction) =>
  a.type === 'attack' || (a.type === 'save' && a.onHit.damage.length > 0);

export const hasRollableAttacks = (c: Combatant) => c.attacks.some(isRollable);

interface AtkRoll {
  die: number;
  total: number;
  verdict: 'hit' | 'miss' | null;
  crit: boolean;
  nat1: boolean;
}

interface DmgRoll {
  total: number;
  parts: string[];
  conditional: string[];
}

export function MonsterAttackModal({
  state,
  attackerId,
  onClose,
}: {
  state: AppState;
  attackerId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const combat = state.combat;
  const attacker = combat?.combatants.find((c) => c.id === attackerId);

  const [step, setStep] = useState<Step>('attack');
  const [attack, setAttack] = useState<MonsterAction | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [atkRoll, setAtkRoll] = useState<AtkRoll | null>(null);
  const [dmgRoll, setDmgRoll] = useState<DmgRoll | null>(null);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  // The flow is bound to the attacker; if it leaves the combat, close.
  useEffect(() => {
    if (!attacker) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacker]);

  if (!combat || !attacker) return null;

  const isSave = attack?.type === 'save';
  const candidates = combat.combatants.filter((c) => c.id !== attacker.id);
  const targetObjs = targets
    .map((id) => combat.combatants.find((c) => c.id === id))
    .filter((c): c is Combatant => c !== undefined);
  const singleTarget = targetObjs.length === 1 ? targetObjs[0] : null;

  const pickAttack = (a: MonsterAction) => {
    setAttack(a);
    setTargets([]);
    setAtkRoll(null);
    setDmgRoll(null);
    setSaved(new Set());
    setStep('target');
  };

  const toggleTarget = (id: string) => {
    setTargets(targets.includes(id) ? targets.filter((t) => t !== id) : [...targets, id]);
  };

  const rollAttack = () => {
    if (!attack?.attack) return;
    const die = Math.floor(Math.random() * 20) + 1;
    const total = die + attack.attack.toHit;
    const ac = singleTarget?.ac ?? null;
    const verdict =
      die === 20 ? 'hit' : die === 1 ? 'miss' : ac !== null ? (total >= ac ? 'hit' : 'miss') : null;
    setAtkRoll({ die, total, verdict, crit: die === 20, nat1: die === 1 });
  };

  const rollDamage = () => {
    if (!attack) return;
    let total = 0;
    const parts: string[] = [];
    const conditional: string[] = [];
    for (const d of attack.onHit.damage) {
      const value =
        d.dice && d.count && d.die
          ? rollPool([{ count: d.count, die: d.die }], d.bonus ?? 0).total
          : (d.average ?? 0);
      if (d.condition) {
        conditional.push(`+${value} ${d.type} (${d.condition})`);
      } else {
        total += value;
        parts.push(`${value} ${d.type}`);
      }
    }
    setDmgRoll({ total, parts, conditional });
    setSaved(new Set());
  };

  const apply = async () => {
    if (!dmgRoll) return;
    const half = Math.floor(dmgRoll.total / 2);
    for (const id of targets) {
      await api.applyDamage(id, saved.has(id) ? half : dmgRoll.total);
    }
    onClose();
  };

  const targetName = (c: Combatant) => `${c.isDowned ? '💀 ' : ''}${c.displayName}`;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎲 {attacker.displayName} attacks</h2>

        {step === 'attack' && (
          <>
            <h3>{t('attack.pickAttack')}</h3>
            <div className="monster-pick-list">
              {attacker.attacks.filter(isRollable).map((a) => (
                <button key={a.id} className="pick-btn" title={a.display.text} onClick={() => pickAttack(a)}>
                  {a.name}
                  {a.display.toHit && ` (${a.display.toHit})`}
                  {a.save && ` (${a.save.ability} DC ${a.save.dc})`}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
            </div>
          </>
        )}

        {step === 'target' && attack && (
          <>
            <h3>
              {attack.name} — pick {isSave ? 'targets' : 'a target'}{' '}
              {isSave && <span className="muted">(save-based: several allowed)</span>}
            </h3>
            <div className="monster-pick-list">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  className={`pick-btn ${targets.includes(c.id) ? 'picked' : ''}`}
                  title={`AC ${c.ac}`}
                  onClick={() => {
                    if (isSave) toggleTarget(c.id);
                    else {
                      setTargets([c.id]);
                      setStep('roll');
                    }
                  }}
                >
                  {targetName(c)}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep('attack')}>{t('common.back')}</button>
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
              {isSave && (
                <button
                  className="btn primary"
                  disabled={targets.length === 0}
                  onClick={() => setStep('roll')}
                >
                  Next ({targets.length})
                </button>
              )}
            </div>
          </>
        )}

        {step === 'roll' && attack && (
          <>
            <h3>{attack.name}</h3>
            <p className="muted">
              {isSave
                ? `${attack.save!.ability} save DC ${attack.save!.dc} — ${targets.length} target${targets.length === 1 ? '' : 's'}`
                : singleTarget
                  ? `vs ${targetName(singleTarget)} — AC ${singleTarget.ac}`
                  : ''}
              {attack.display.damage && ` · ${attack.display.damage}`}
            </p>

            {attack.attack && (
              <div className="dice-result">
                <button className="btn primary" onClick={rollAttack}>{t('attack.rollAttack')}</button>
                {atkRoll && (
                  <span className="dice-total atk-result">
                    {' '}ATK {atkRoll.total}
                    <span className="muted"> (d20: {atkRoll.die})</span>{' '}
                    {atkRoll.crit
                      ? '💥 CRIT!'
                      : atkRoll.nat1
                        ? 'NAT 1 — MISS'
                        : atkRoll.verdict === 'hit'
                          ? '✔ HIT'
                          : atkRoll.verdict === 'miss'
                            ? '✘ MISS'
                            : ''}
                  </span>
                )}
              </div>
            )}

            {attack.onHit.damage.length > 0 && (
              <div className="dice-result">
                <button className="btn primary" onClick={rollDamage}>{t('attack.rollDamage')}</button>
                {dmgRoll && (
                  <span className="dice-total atk-result">
                    {' '}DMG {dmgRoll.total}
                    {dmgRoll.parts.length > 1 && (
                      <span className="muted"> ({dmgRoll.parts.join(' + ')})</span>
                    )}
                    {dmgRoll.conditional.map((c) => (
                      <span key={c} className="muted"> · {c}</span>
                    ))}
                  </span>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => { setStep('target'); setDmgRoll(null); setAtkRoll(null); }}>
                ← Back
              </button>
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
              {dmgRoll && (
                <button
                  className="btn danger"
                  onClick={() => {
                    if (isSave) setStep('saves');
                    else void apply();
                  }}
                >
                  {isSave ? t('attack.whoSaved') : t('attack.apply', { total: dmgRoll.total })}
                </button>
              )}
            </div>
          </>
        )}

        {step === 'saves' && attack && dmgRoll && (
          <>
            <h3>
              Who succeeded the {attack.save!.ability} DC {attack.save!.dc} save?{' '}
              <span className="muted">(saved take {Math.floor(dmgRoll.total / 2)} instead of {dmgRoll.total})</span>
            </h3>
            <div className="monster-pick-list">
              {targetObjs.map((c) => (
                <button
                  key={c.id}
                  className={`pick-btn ${saved.has(c.id) ? 'picked' : ''}`}
                  onClick={() => {
                    const next = new Set(saved);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    setSaved(next);
                  }}
                >
                  {saved.has(c.id) ? '½ ' : ''}{targetName(c)}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep('roll')}>{t('common.back')}</button>
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
              <button className="btn danger" onClick={() => void apply()}>
                ⚔ Apply ({targets.length - saved.size}×{dmgRoll.total}, {saved.size}×{Math.floor(dmgRoll.total / 2)})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
