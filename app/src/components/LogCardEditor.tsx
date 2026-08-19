import { useState } from 'react';
import type { CombatantType, LogEntry, LogEntryPatch } from '../shared/types';
import { CONDITIONS, type Condition } from '../shared/types';
import { entryDamageType } from '../shared/logCards';
import { DAMAGE_TYPE_DE, conditionLabel, damageTypeLabel, type Lang } from '../shared/i18n';
import type { LogCardOption } from './LogCards';

/**
 * Inline editor for one log entry (DM only). Fields appear per kind:
 * actors/targets pick from the current combatants (free text survives for
 * names that left the fight), amounts and rolls are number inputs, damage
 * type and outcome are selects. Saving hands a whitelisted patch up — the
 * store re-applies HP deltas for damage/heal.
 */

const FREE = '__free__';
const NONE = '__none__';

function NamePicker({
  label,
  value,
  valueType,
  options,
  allowNone,
  onChange,
}: {
  label: string;
  value: string | undefined;
  valueType: CombatantType | undefined;
  options: LogCardOption[];
  allowNone: boolean;
  onChange: (name: string | undefined, type: CombatantType | undefined) => void;
}) {
  const known = value !== undefined && options.some((o) => o.name === value);
  const [free, setFree] = useState(value !== undefined && !known);
  return (
    <label>
      {label}
      {!free ? (
        <select
          value={value === undefined ? NONE : known ? value : FREE}
          onChange={(e) => {
            const v = e.target.value;
            if (v === NONE) onChange(undefined, undefined);
            else if (v === FREE) setFree(true);
            else {
              const opt = options.find((o) => o.name === v);
              onChange(v, opt?.type);
            }
          }}
        >
          {allowNone && <option value={NONE}>—</option>}
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
          <option value={FREE}>…</option>
        </select>
      ) : (
        <input
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined, valueType)}
        />
      )}
    </label>
  );
}

export function LogCardEditor({
  entry,
  lang,
  t,
  options,
  onSave,
  onCancel,
}: {
  entry: LogEntry;
  lang: Lang;
  t: (key: string, params?: Record<string, string | number>) => string;
  options: LogCardOption[];
  onSave: (patch: LogEntryPatch) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [patch, setPatch] = useState<LogEntryPatch>({});
  const merged = { ...entry, ...patch };
  const set = (p: LogEntryPatch) => setPatch((prev) => ({ ...prev, ...p }));

  const num = (
    label: string,
    value: number | undefined,
    field: 'amount' | 'die' | 'total' | 'dc' | 'slotLevel',
  ) => (
    <label>
      {label}
      <input
        className="num"
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          set({ [field]: Number.isFinite(n) ? n : undefined } as LogEntryPatch);
        }}
      />
    </label>
  );

  const isDamage = entry.kind === 'damage';
  const isHeal = entry.kind === 'heal';
  const isAttack = entry.kind === 'attackRoll';
  const isSave = entry.kind === 'save';
  const isCast = entry.kind === 'cast';
  const isCond = entry.kind === 'conditionAdded' || entry.kind === 'conditionRemoved';

  return (
    <div className="log-edit-form" onClick={(e) => e.stopPropagation()}>
      {(isDamage || isHeal) && (
        <>
          {num(t('log.card.f.amount'), merged.amount, 'amount')}
          {isDamage && (
            <label>
              {t('log.card.f.type')}
              <select
                value={entryDamageType(merged as LogEntry) ?? ''}
                onChange={(e) => set({ damageType: e.target.value || undefined })}
              >
                <option value="">—</option>
                {Object.keys(DAMAGE_TYPE_DE).map((k) => (
                  <option key={k} value={k}>
                    {damageTypeLabel(lang, k)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <NamePicker
            label={t('log.card.f.from')}
            value={merged.actorName}
            valueType={merged.actorType}
            options={options}
            allowNone
            onChange={(name, type) => set({ actorName: name, actorType: type })}
          />
        </>
      )}

      {isAttack && (
        <>
          <NamePicker
            label={t('log.card.f.target')}
            value={merged.targetName}
            valueType={merged.targetType}
            options={options}
            allowNone
            onChange={(name, type) => set({ targetName: name, targetType: type })}
          />
          {num('d20', merged.die, 'die')}
          {num(t('log.card.f.total'), merged.total, 'total')}
          <label>
            {t('log.card.f.outcome')}
            <select
              value={merged.outcome ?? 'hit'}
              onChange={(e) => set({ outcome: e.target.value as LogEntry['outcome'] })}
            >
              {(['hit', 'miss', 'crit'] as const).map((o) => (
                <option key={o} value={o}>
                  {t(`log.outcome.${o}`)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {isSave && (
        <>
          {num('d20', merged.die, 'die')}
          {num(t('log.card.f.total'), merged.total, 'total')}
          {num('DC', merged.dc, 'dc')}
          <label>
            {t('log.card.f.outcome')}
            <select
              value={merged.outcome ?? 'saved'}
              onChange={(e) => set({ outcome: e.target.value as LogEntry['outcome'] })}
            >
              <option value="saved">{t('log.card.saveOk')}</option>
              <option value="failed">{t('log.card.saveFail')}</option>
            </select>
          </label>
        </>
      )}

      {isCast && (
        <>
          <label>
            {t('log.card.f.spell')}
            <input
              value={merged.attackName ?? ''}
              onChange={(e) => set({ attackName: e.target.value })}
            />
          </label>
          {num(t('log.card.f.slot'), merged.slotLevel, 'slotLevel')}
        </>
      )}

      {isCond && (
        <label>
          {t('log.card.f.condition')}
          <select
            value={merged.condition ?? CONDITIONS[0]}
            onChange={(e) => set({ condition: e.target.value as Condition })}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {conditionLabel(lang, c)}
              </option>
            ))}
          </select>
        </label>
      )}

      <span className="buttons">
        <button className="cancel" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button
          className="save"
          disabled={Object.keys(patch).length === 0}
          onClick={() => void onSave(patch)}
        >
          {t('common.save')}
        </button>
      </span>
    </div>
  );
}
