import { useEffect, useState } from 'react';
import type { AppState, Combatant, MonsterAction } from '../../shared/types';
import { abilityMod } from '../../shared/types';
import { rollD20, rollPool, type RollMode } from '../../shared/dice';
import { api } from './api';
import { spellActionName, spellActionText } from '../../shared/spellAction';
import { DmgText } from './DmgText';
import { useI18n } from './i18n';

/**
 * DM-side Monster Attack workflow, mirroring the Stream Deck flow:
 * pick attack → pick target(s) (multi for save-based AoE) → roll attack
 * (vs the target's AC) and/or damage → for save actions choose who saved
 * (half damage, rounded down) → apply.
 */

type Step = 'attack' | 'slot' | 'target' | 'roll' | 'saves';

// Spell snapshots are always offered (incl. healing and utility casts, so the
// DM can cast for a phone-less player); otherwise attack rolls and damaging
// save actions, as before.
const isRollable = (a: MonsterAction) =>
  a.spell != null || a.type === 'attack' || (a.type === 'save' && a.onHit.damage.length > 0);

export const hasRollableAttacks = (c: Combatant) => c.attacks.some(isRollable);

interface AtkRoll {
  die: number;
  /** Every d20 thrown: one entry normally, two under adv/dis. */
  dice: number[];
  total: number;
  verdict: 'hit' | 'miss' | null;
  crit: boolean;
  nat1: boolean;
}

interface DmgRoll {
  total: number;
  parts: string[];
  conditional: string[];
  math: string;
  /** Damage type per bracket group of `math`, for the log's tinting. */
  mathTypes: (string | null)[];
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
  const { t, lang, dmg, mon, abilityCode, locAction } = useI18n();
  const combat = state.combat;
  const attacker = combat?.combatants.find((c) => c.id === attackerId);
  const l10nDe = state.monsters.find((m) => m.id === attacker?.sourceId)?.l10n?.de;
  // Spell snapshots carry their own German pair; monster actions use the
  // template l10n as before.
  const actName = (a: MonsterAction) => (a.spell ? spellActionName(lang, a) : locAction(l10nDe, a).name);
  const actText = (a: MonsterAction) => (a.spell ? spellActionText(lang, a) : a.display.text);

  const [step, setStep] = useState<Step>('attack');
  const [attack, setAttack] = useState<MonsterAction | null>(null);
  const [advMode, setAdvMode] = useState<RollMode>('normal');
  const [targets, setTargets] = useState<string[]>([]);
  const [atkRoll, setAtkRoll] = useState<AtkRoll | null>(null);
  const [dmgRoll, setDmgRoll] = useState<DmgRoll | null>(null);
  /** One row per target on the saves step: the entered total and, when the
   *  app rolled it, the d20 behind it. */
  const [saveRows, setSaveRows] = useState<Record<string, { total: string; die: number | null }>>({});
  const [slotLevel, setSlotLevel] = useState<number | null>(null);
  const [castErr, setCastErr] = useState(false);

  // The flow is bound to the attacker; if it leaves the combat, close.
  useEffect(() => {
    if (!attacker) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attacker]);

  if (!combat || !attacker) return null;

  const isSave = attack?.type === 'save';
  const isHeal = attack?.spell?.healing === true;
  // Slots live on the PC record; combatants only snapshot attacks.
  const pcRecord = attacker.type === 'pc' ? state.pcs.find((p) => p.id === attacker.sourceId) : undefined;
  const candidates = combat.combatants.filter((c) => c.id !== attacker.id || isHeal);
  const targetObjs = targets
    .map((id) => combat.combatants.find((c) => c.id === id))
    .filter((c): c is Combatant => c !== undefined);
  const singleTarget = targetObjs.length === 1 ? targetObjs[0] : null;

  /** Where a spell goes once its slot is settled. */
  const stepAfterCast = (a: MonsterAction): Step | 'done' =>
    a.onHit.damage.length > 0 || a.type === 'attack' ? 'target' : 'done';

  /** Concentration tag for the caster's combatant (English + German names). */
  const concOf = (a: MonsterAction) =>
    a.spell?.concentration ? { name: a.name, deName: a.spell.deName ?? null } : null;

  const pickAttack = (a: MonsterAction) => {
    setAttack(a);
    setTargets([]);
    setAtkRoll(null);
    setDmgRoll(null);
    setSaveRows({});
    setSlotLevel(null);
    setCastErr(false);
    if (a.spell && pcRecord) {
      if (a.spell.level > 0) {
        setStep('slot');
        return;
      }
      // Cantrip: log the cast (free), then straight on — utility cantrips
      // are done right there.
      void api.castSpell(pcRecord.id, actName(a), null, concOf(a));
      if (stepAfterCast(a) === 'done') {
        onClose();
        return;
      }
    }
    setStep('target');
  };

  /** Slot step confirm: spend the slot (server-validated), log, move on. */
  const castWithSlot = async (a: MonsterAction, lvl: number) => {
    if (!pcRecord) return;
    const ok = await api.castSpell(pcRecord.id, actName(a), lvl, concOf(a));
    if (!ok) {
      setCastErr(true);
      return;
    }
    setSlotLevel(lvl);
    if (stepAfterCast(a) === 'done') onClose();
    else setStep('target');
  };

  const toggleTarget = (id: string) => {
    setTargets(targets.includes(id) ? targets.filter((t) => t !== id) : [...targets, id]);
  };

  const rollAttack = () => {
    if (!attack?.attack) return;
    // Advantage/disadvantage: two dice, keep one, THEN add the bonus.
    const { die, dice } = rollD20(advMode);
    const total = die + attack.attack.toHit;
    const ac = singleTarget?.ac ?? null;
    const verdict =
      die === 20 ? 'hit' : die === 1 ? 'miss' : ac !== null ? (total >= ac ? 'hit' : 'miss') : null;
    setAtkRoll({ die, dice, total, verdict, crit: die === 20, nat1: die === 1 });
    if (attacker) {
      void api.kenkuAttackEvent({ sourceId: attacker.sourceId, attackId: attack.id, phase: 'attackRoll' });
      const phase =
        die === 20 ? 'attackCrit' : verdict === 'hit' ? 'attackHit' : verdict === 'miss' ? 'attackMiss' : null;
      if (phase) {
        void api.kenkuAttackEvent({
          sourceId: attacker.sourceId,
          attackId: attack.id,
          phase,
          // Roll details ride along for the combat log.
          // Names are snapshotted into the log in the DM's current language,
          // matching what the deck and phones record.
          roll: {
            actorName: mon(attacker.displayName),
            actorType: attacker.type,
            targetName: singleTarget ? mon(singleTarget.displayName) : undefined,
            targetType: singleTarget?.type,
            attackName: actName(attack),
            die,
            dice,
            total,
          },
        });
      }
    }
  };

  const rollDamage = () => {
    if (!attack) return;
    let total = 0;
    const parts: string[] = [];
    const conditional: string[] = [];
    const mathParts: string[] = [];
    const mathTypes: (string | null)[] = [];
    for (const d of attack.onHit.damage) {
      let value: number;
      if (d.dice && d.count && d.die) {
        const roll = rollPool([{ count: d.count, die: d.die }], d.bonus ?? 0);
        value = roll.total;
        if (!d.condition) {
          const bonus = d.bonus ?? 0;
          const bonusStr = bonus === 0 ? '' : bonus > 0 ? ` +${bonus}` : ` ${bonus}`;
          // Canonical "1d4", not d.dice — the raw string may already contain
          // the bonus ("1d4+2"), which bonusStr would then repeat.
          mathParts.push(`${d.count}d${d.die} [${roll.perPart[0].join('+')}]${bonusStr}`);
          mathTypes.push(d.type ?? null);
        }
      } else {
        value = d.average ?? 0;
        if (!d.condition) mathParts.push(`${value}`);
      }
      if (d.condition) {
        conditional.push(`+${value} ${dmg(d.type)} (${d.condition})`);
      } else {
        total += value;
        parts.push(`${value} ${dmg(d.type)}`);
      }
    }
    // Upcast dice from the chosen slot, as their own math bracket.
    const meta = attack.spell;
    if (meta?.upcast && slotLevel !== null && slotLevel > meta.level) {
      const count = meta.upcast.count * (slotLevel - meta.level);
      const roll = rollPool([{ count, die: meta.upcast.die }], 0);
      total += roll.total;
      mathParts.push(`${count}d${meta.upcast.die} [${roll.perPart[0].join('+')}]`);
      mathTypes.push(attack.onHit.damage[0]?.type ?? null);
      parts.push(`${roll.total} ${dmg(attack.onHit.damage[0]?.type ?? 'variable')}`);
    }
    setDmgRoll({ total, parts, conditional, math: `${mathParts.join(' + ')} = ${total}`, mathTypes });
    setSaveRows({});
    if (attacker) {
      void api.kenkuAttackEvent({ sourceId: attacker.sourceId, attackId: attack.id, phase: 'damageRoll' });
    }
  };

  const apply = async () => {
    if (!dmgRoll || !attacker) return;
    // Healing spells flip the polarity: the rolled total restores HP.
    if (isHeal) {
      for (const id of targets) await api.applyHeal(id, dmgRoll.total);
      onClose();
      return;
    }
    // Damage on a successful save: legacy default is half; some spells deal
    // nothing (Acid Splash).
    const onSuccess = attack?.save?.onSuccess ?? 'half';
    const half = onSuccess === 'none' ? 0 : Math.floor(dmgRoll.total / 2);
    for (const id of targets) {
      const halved = didSave(id);
      // The throw goes in immediately before the damage it caused: the card
      // builder pairs a save with the damage that follows it, so logging all
      // the saves up front would split every target across two cards.
      const target = targetObjs.find((c) => c.id === id);
      const total = savedTotal(id);
      if (isSave && attack?.save && target && total !== null) {
        await api.logSaveRoll({
          actorName: mon(target.displayName),
          actorType: target.type,
          targetName: mon(attacker.displayName),
          targetType: attacker.type,
          attackName: actName(attack),
          ability: attack.save.ability,
          dc: attack.save.dc,
          die: saveRows[id]?.die ?? undefined,
          total,
          saved: halved,
        });
      }
      if (halved && half === 0) continue;
      await api.applyDamage(id, halved ? half : dmgRoll.total, {
        actorName: mon(attacker.displayName),
        actorType: attacker.type,
        math: halved ? `${dmgRoll.math} → ½ ${half}` : dmgRoll.math,
        mathTypes: dmgRoll.mathTypes,
      });
    }
    if (attacker && attack) {
      void api.kenkuAttackEvent({ sourceId: attacker.sourceId, attackId: attack.id, phase: 'damageApplied' });
    }
    onClose();
  };

  const targetName = (c: Combatant) => `${c.isDowned ? '💀 ' : ''}${mon(c.displayName)}`;

  // ---- saving throws (mirrors PlayerSaveModal, which adjudicates the same
  // action when a phone launches it) ------------------------------------------

  /** The target's modifier for this action's save ability; null if unknown. */
  const saveBonus = (c: Combatant): number | null => {
    const ability = attack?.save?.ability;
    if (!ability || !c.abilities) return null;
    const score = (c.abilities as unknown as Record<string, number>)[ability.toLowerCase().slice(0, 3)];
    return typeof score === 'number' ? abilityMod(score) : null;
  };

  const rollSave = (id: string, bonus: number | null) => {
    const die = Math.floor(Math.random() * 20) + 1;
    setSaveRows((r) => ({ ...r, [id]: { die, total: String(die + (bonus ?? 0)) } }));
  };

  const rollAllSaves = () => {
    setSaveRows(
      Object.fromEntries(
        targetObjs.map((c) => {
          const die = Math.floor(Math.random() * 20) + 1;
          return [c.id, { die, total: String(die + (saveBonus(c) ?? 0)) }];
        }),
      ),
    );
  };

  const savedTotal = (id: string): number | null => {
    const n = parseInt(saveRows[id]?.total ?? '', 10);
    return Number.isFinite(n) ? n : null;
  };

  const didSave = (id: string): boolean => {
    const total = savedTotal(id);
    return total !== null && attack?.save != null && total >= attack.save.dc;
  };

  const allSavesEntered = targetObjs.every((c) => savedTotal(c.id) !== null);
  const savedCount = targetObjs.filter((c) => didSave(c.id)).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('attack.heading', { name: mon(attacker.displayName) })}</h2>

        {step === 'attack' && (
          <>
            <h3>{t('attack.pickAttack')}</h3>
            <div className="monster-pick-list">
              {attacker.attacks.filter(isRollable).map((a) => (
                <button key={a.id} className="pick-btn" title={actText(a)} onClick={() => pickAttack(a)}>
                  {actName(a)}
                  {a.display.toHit && ` (${a.display.toHit})`}
                  {a.save && ` (${abilityCode(a.save.ability)} ${t('monsters.dc')} ${a.save.dc})`}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
            </div>
          </>
        )}

        {step === 'slot' && attack && attack.spell && pcRecord && (
          <>
            <h3>{t('cast.slotTitle', { spell: actName(attack) })}</h3>
            <div className="monster-pick-list">
              {Array.from({ length: 10 - attack.spell.level }, (_, i) => attack.spell!.level + i)
                .filter((lvl) => (pcRecord.spellSlots?.max[lvl - 1] ?? 0) > 0)
                .map((lvl) => {
                  const left = pcRecord.spellSlots?.current[lvl - 1] ?? 0;
                  return (
                    <button
                      key={lvl}
                      className="pick-btn"
                      disabled={left <= 0}
                      onClick={() => void castWithSlot(attack, lvl)}
                    >
                      {t('cast.slotBtn', { n: lvl, left })}
                    </button>
                  );
                })}
            </div>
            {attack.spell.upcast && (
              <p className="muted">
                ⬆{' '}
                {t('spellbook.upcastPerLevel', {
                  dice: `${attack.spell.upcast.count}d${attack.spell.upcast.die}`,
                  level: attack.spell.level,
                })}
              </p>
            )}
            {!attack.spell.upcast && attack.spell.upcastText && (
              <p className="muted">⬆ {attack.spell.upcastText}</p>
            )}
            {castErr && <p className="pw-error">{t('cast.noSlots')}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep('attack')}>{t('common.back')}</button>
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
            </div>
          </>
        )}

        {step === 'target' && attack && (
          <>
            <h3>
              {t(isSave ? 'attack.pickTargetsFor' : 'attack.pickTargetFor', {
                name: locAction(l10nDe, attack).name,
              })}{' '}
              {isSave && <span className="muted">{t('attack.severalAllowed')}</span>}
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
            <h3>{actName(attack)}</h3>
            <p className="muted">
              {isSave
                ? t('combat.targetsCount', {
                    ability: abilityCode(attack.save!.ability),
                    dc: attack.save!.dc,
                    n: targets.length,
                  })
                : singleTarget
                  ? isHeal
                    ? targetName(singleTarget)
                    : t('attack.vsTarget', { name: targetName(singleTarget), ac: singleTarget.ac })
                  : ''}
              {locAction(l10nDe, attack).damage && (
                <> · <DmgText text={locAction(l10nDe, attack).damage!} /></>
              )}
            </p>

            {attack.attack && (
              <div className="adv-toggle-row">
                {(['dis', 'normal', 'adv'] as const).map((m) => (
                  <button
                    key={m}
                    className={`btn small ${advMode === m ? 'primary' : ''}`}
                    onClick={() => setAdvMode(m)}
                  >
                    {t(`roll.${m}`)}
                  </button>
                ))}
              </div>
            )}
            {attack.attack && (
              <div className="dice-result">
                <button className="btn primary" onClick={rollAttack}>{t('attack.rollAttack')}</button>
                {atkRoll && (
                  <span className="dice-total atk-result">
                    {' '}ATK {atkRoll.total}
                    <span className="muted">
                      {' '}(d20:{' '}
                      {atkRoll.dice.map((d, i) => (
                        <span key={i}>
                          {i > 0 && ' · '}
                          <span className={d === atkRoll.die ? '' : 'die-dropped'}>{d}</span>
                        </span>
                      ))}
                      )
                    </span>{' '}
                    {atkRoll.crit
                      ? t('attack.crit')
                      : atkRoll.nat1
                        ? t('attack.nat1')
                        : atkRoll.verdict === 'hit'
                          ? t('attack.hit')
                          : atkRoll.verdict === 'miss'
                            ? t('attack.miss')
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
                      <span className="muted"> (<DmgText text={dmgRoll.parts.join(' + ')} />)</span>
                    )}
                    {dmgRoll.conditional.map((c) => (
                      <span key={c} className="muted"> · <DmgText text={c} /></span>
                    ))}
                  </span>
                )}
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={() => { setStep('target'); setDmgRoll(null); setAtkRoll(null); }}>
                {t('common.back')}
              </button>
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
              {dmgRoll && (
                <button
                  className={`btn ${isHeal ? 'primary' : 'danger'}`}
                  onClick={() => {
                    if (isSave) setStep('saves');
                    else void apply();
                  }}
                >
                  {isSave
                    ? t('attack.whoSaved')
                    : isHeal
                      ? t('attack.applyHeal', { total: dmgRoll.total })
                      : t('attack.apply', { total: dmgRoll.total })}
                </button>
              )}
            </div>
          </>
        )}

        {step === 'saves' && attack && dmgRoll && (
          <>
            <h3>
              {t('attack.rollSaves', {
                ability: abilityCode(attack.save!.ability),
                dc: attack.save!.dc,
              })}{' '}
              <span className="muted">
                {(attack.save?.onSuccess ?? 'half') === 'none'
                  ? t('attack.savedTakeNone', { full: dmgRoll.total })
                  : t('attack.savedTakeHalf', { half: Math.floor(dmgRoll.total / 2), full: dmgRoll.total })}
              </span>
            </h3>
            <table className="pw-save-table">
              <tbody>
                {targetObjs.map((c) => {
                  const bonus = saveBonus(c);
                  const total = savedTotal(c.id);
                  const ok = total !== null && total >= attack.save!.dc;
                  return (
                    <tr key={c.id}>
                      <td>{targetName(c)}</td>
                      <td>
                        <button className="btn small" onClick={() => rollSave(c.id, bonus)}>
                          🎲 {bonus !== null && (bonus >= 0 ? `+${bonus}` : bonus)}
                        </button>
                      </td>
                      <td>
                        <input
                          type="number"
                          className="pw-save-input"
                          value={saveRows[c.id]?.total ?? ''}
                          onChange={(e) =>
                            setSaveRows((r) => ({ ...r, [c.id]: { die: null, total: e.target.value } }))
                          }
                          placeholder="…"
                        />
                        {saveRows[c.id]?.die != null && (
                          <span className="muted"> (d20: {saveRows[c.id].die})</span>
                        )}
                      </td>
                      <td>
                        {total !== null &&
                          (ok ? (
                            <span className="pw-online">✓ {t('pw.saveSaved')}</span>
                          ) : (
                            <span className="pw-error">✗ {t('pw.saveFailed')}</span>
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="modal-actions">
              <button className="btn" onClick={() => setStep('roll')}>{t('common.back')}</button>
              <button className="btn" onClick={rollAllSaves}>🎲 {t('attack.rollAllSaves')}</button>
              <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
              <button className="btn danger" disabled={!allSavesEntered} onClick={() => void apply()}>
                ⚔ Apply ({targets.length - savedCount}×{dmgRoll.total}, {savedCount}×
                {(attack.save?.onSuccess ?? 'half') === 'none' ? 0 : Math.floor(dmgRoll.total / 2)})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
