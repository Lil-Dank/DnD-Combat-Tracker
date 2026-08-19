import { useMemo, useState } from 'react';
import type { AppState } from '../../shared/types';
import { abilityMod } from '../../shared/types';
import type { PlayerSavePendingInfo } from '../../preload/index';
import { api } from './api';
import { useI18n } from './i18n';

interface RowState {
  total: string;
  /** Set once a digital roll fills the row (shows the die for flavor). */
  die: number | null;
}

/**
 * A phone launched a save-based attack: the DM adjudicates each target's
 * saving throw here — roll digitally (d20 + the target's ability modifier)
 * or type a manually rolled total. Targets meeting the DC take half damage.
 */
export function PlayerSaveModal({
  state,
  pending,
  onClose,
}: {
  state: AppState;
  pending: PlayerSavePendingInfo;
  onClose: () => void;
}) {
  const { t, abilityCode, mon } = useI18n();
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const targets = useMemo(() => {
    const combatants = state.combat?.combatants ?? [];
    return pending.targetIds
      .map((id) => combatants.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
  }, [state.combat, pending.targetIds]);

  const abilityKey = pending.ability.toLowerCase().slice(0, 3);

  const bonusFor = (c: (typeof targets)[number]): number | null => {
    const scores = c.abilities;
    if (!scores) return null;
    const score = (scores as unknown as Record<string, number>)[abilityKey];
    return typeof score === 'number' ? abilityMod(score) : null;
  };

  const roll = (id: string, bonus: number | null) => {
    const die = Math.floor(Math.random() * 20) + 1;
    setRows((r) => ({ ...r, [id]: { die, total: String(die + (bonus ?? 0)) } }));
  };

  const setTotal = (id: string, total: string) => {
    setRows((r) => ({ ...r, [id]: { die: null, total } }));
  };

  const parsed = (id: string): number | null => {
    const n = parseInt(rows[id]?.total ?? '', 10);
    return Number.isFinite(n) ? n : null;
  };

  const allEntered = targets.every((c) => parsed(c.id) !== null);

  const apply = async () => {
    const results = targets.map((c) => {
      const total = parsed(c.id) ?? 0;
      return { targetId: c.id, saved: total >= pending.dc, total };
    });
    await api.resolvePlayerSave(pending.id, results);
    onClose();
  };

  const dismiss = () => {
    void api.dismissPlayerSave(pending.id);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('pw.saveTitle', { attack: pending.attackName })}</h2>
        <p>
          {t(pending.onSuccess === 'none' ? 'pw.saveInfoNone' : 'pw.saveInfo', {
            actor: pending.actorName,
            ability: abilityCode(pending.ability),
            dc: pending.dc,
            damage: pending.damage,
          })}
        </p>
        <table className="pw-save-table">
          <tbody>
            {targets.map((c) => {
              const bonus = bonusFor(c);
              const total = parsed(c.id);
              const saved = total !== null && total >= pending.dc;
              return (
                <tr key={c.id}>
                  <td>{mon(c.displayName)}</td>
                  <td>
                    <button className="btn small" onClick={() => roll(c.id, bonus)}>
                      🎲 {bonus !== null && (bonus >= 0 ? `+${bonus}` : bonus)}
                    </button>
                  </td>
                  <td>
                    <input
                      type="number"
                      className="pw-save-input"
                      value={rows[c.id]?.total ?? ''}
                      onChange={(e) => setTotal(c.id, e.target.value)}
                      placeholder="…"
                    />
                    {rows[c.id]?.die !== null && rows[c.id]?.die !== undefined && (
                      <span className="muted"> (d20: {rows[c.id].die})</span>
                    )}
                  </td>
                  <td>
                    {total !== null &&
                      (saved ? (
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
        <footer className="modal-actions">
          <button className="btn" onClick={dismiss}>
            {t('pw.saveDismiss')}
          </button>
          <button className="btn primary" disabled={!allEntered} onClick={() => void apply()}>
            {t('pw.saveApply')}
          </button>
        </footer>
      </div>
    </div>
  );
}
