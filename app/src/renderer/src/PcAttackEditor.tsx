import { useState } from 'react';
import type { ActionKind, AttackKind, KenkuAttackTrigger, PC, Spell } from '../../shared/types';
import { api } from './api';
import { useI18n } from './i18n';
import { DmgText } from './DmgText';
import { DamageEditor } from '../../components/DamageEditor';
import { useKenkuLibrary } from './useKenkuLibrary';
import { spellToAction } from '../../shared/spellAction';
import { spellLevelLabel } from '../../shared/i18n';
import {
  ABILITIES,
  actionToForm,
  emptyAction,
  formToAction,
  type ActionForm,
} from './actionForm';

/**
 * The Party screen's attack editor: PC attacks use the same schema and the
 * same conversion code as monster actions, so the DM attack modal, the
 * Stream Deck picker, and the player web app all roll them identically.
 * Saves apply immediately (they also patch the live combatant), independent
 * of the surrounding PC form. Spells attach here too, as editable snapshots
 * from the global Spellbook.
 */
export function PcAttackEditor({
  pc,
  kenkuOn,
  spells,
}: {
  pc: PC;
  kenkuOn: boolean;
  spells: Spell[];
}) {
  const { t, lang } = useI18n();
  const [form, setForm] = useState<ActionForm | null>(null);
  const [picking, setPicking] = useState(false);
  const { library: kenkuLibrary } = useKenkuLibrary(form !== null && kenkuOn);

  const patch = (p: Partial<ActionForm>) => setForm((f) => (f ? { ...f, ...p } : f));

  const save = async () => {
    if (!form || !form.name.trim()) return;
    const existing = pc.attacks.find((a) => a.id === form.id);
    const order = existing?.order ?? pc.attacks.length;
    await api.savePcAttack(pc.id, formToAction(form, order, existing));
    setForm(null);
  };

  const attachSpell = async (spell: Spell, opts: { toHit?: number; dc?: number }) => {
    const action = spellToAction(spell, opts, `spell.${crypto.randomUUID()}`, pc.attacks.length);
    await api.savePcAttack(pc.id, action);
    setPicking(false);
  };

  return (
    <div className="pc-attacks">
      <h3>
        {t('pcs.attacks')} <span className="muted">{t('pcs.attacksNote')}</span>
      </h3>

      {pc.attacks.length === 0 && !form && <p className="muted">{t('pcs.noAttacks')}</p>}

      <ul className="pc-attack-list">
        {pc.attacks.map((a) => (
          <li key={a.id}>
            <span>
              <strong>{a.name}</strong>{' '}
              {a.spell && (
                <span className="tag spell-chip" title={t('pcs.spellChipNote')}>
                  ✨ {spellLevelLabel(lang, a.spell.level)}
                </span>
              )}{' '}
              <span className="muted">
                {a.display.toHit ?? (a.save ? `${a.save.ability} ${a.save.dc}` : '')}
                {a.display.damage ? <> · <DmgText text={a.display.damage} /></> : ''}
              </span>
            </span>
            <span className="pc-attack-buttons">
              <button className="btn small" onClick={() => setForm(actionToForm(a))}>
                {t('common.edit')}
              </button>
              <button
                className="btn small danger"
                onClick={() => void api.deletePcAttack(pc.id, a.id)}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>

      {form ? (
        <div className="attack-form">
          <div className="form-row">
            <label>
              {t('common.name')}
              <input value={form.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>
            <label>
              {t('common.type')}
              <select
                value={form.type}
                onChange={(e) => patch({ type: e.target.value as ActionKind })}
              >
                <option value="attack">{t('monsters.type.attack')}</option>
                <option value="save">{t('monsters.type.save')}</option>
              </select>
            </label>
          </div>

          {form.type === 'attack' && (
            <div className="form-row">
              <label>
                {t('common.kind')}
                <select
                  value={form.kind}
                  onChange={(e) => patch({ kind: e.target.value as AttackKind })}
                >
                  <option value="melee">{t('monsters.kind.melee')}</option>
                  <option value="ranged">{t('monsters.kind.ranged')}</option>
                  <option value="melee_or_ranged">{t('monsters.kind.melee_or_ranged')}</option>
                </select>
              </label>
              <label>
                {t('monsters.f.toHit')}
                <input
                  type="number"
                  placeholder="+5"
                  value={form.toHit}
                  onChange={(e) => patch({ toHit: e.target.value })}
                />
              </label>
              {form.kind !== 'ranged' && (
                <label>
                  {t('pcs.reach')}
                  <input
                    type="number"
                    value={form.reach}
                    onChange={(e) => patch({ reach: e.target.value })}
                  />
                </label>
              )}
              {form.kind !== 'melee' && (
                <>
                  <label>
                    {t('pcs.range')}
                    <input
                      type="number"
                      placeholder="80"
                      value={form.rangeNormal}
                      onChange={(e) => patch({ rangeNormal: e.target.value })}
                    />
                  </label>
                  <label>
                    {t('monsters.f.longRange')}
                    <input
                      type="number"
                      placeholder="320"
                      value={form.rangeLong}
                      onChange={(e) => patch({ rangeLong: e.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {form.type === 'save' && (
            <div className="form-row">
              <label>
                {t('monsters.f.saveAbility')}
                <select
                  value={form.saveAbility}
                  onChange={(e) => patch({ saveAbility: e.target.value })}
                >
                  {ABILITIES.map((ab) => (
                    <option key={ab} value={ab}>
                      {ab}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('common.dc')}
                <input
                  type="number"
                  value={form.saveDc}
                  onChange={(e) => patch({ saveDc: e.target.value })}
                />
              </label>
            </div>
          )}

          {form.damage.map((d, j) => (
            <div key={j} className="dmg-row">
              <DamageEditor
                t={t}
                lang={lang}
                value={d}
                onChange={(p) => {
                  const damage = [...form.damage];
                  damage[j] = { ...d, ...p };
                  patch({ damage });
                }}
              />
              <button
                className="btn small danger attack-remove"
                onClick={() => patch({ damage: form.damage.filter((_, k) => k !== j) })}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="btn small"
            onClick={() =>
              patch({ damage: [...form.damage, { dice: '', flat: '', type: '', condition: '' }] })
            }
          >
            {t('monsters.f.addDamage')}
          </button>

          {kenkuOn && (
            <div className="kenku-action-sound">
              <label>
                {t('kenku.sound')}
                {kenkuLibrary ? (
                  <select
                    value={form.kenkuSound?.soundId ?? ''}
                    onChange={(e) => {
                      const soundId = e.target.value;
                      if (!soundId) {
                        patch({ kenkuSound: null });
                        return;
                      }
                      const snd = kenkuLibrary.sounds.find((x) => x.id === soundId);
                      patch({
                        kenkuSound: {
                          soundId,
                          title: snd?.title ?? soundId,
                          trigger: form.kenkuSound?.trigger ?? 'attackHit',
                          delayMs: form.kenkuSound?.delayMs,
                        },
                      });
                    }}
                  >
                    <option value="">{t('kenku.noSound')}</option>
                    {kenkuLibrary.sounds.map((snd) => (
                      <option key={snd.id} value={snd.id}>
                        {snd.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">{form.kenkuSound?.title ?? t('kenku.offline')}</span>
                )}
              </label>
              {form.kenkuSound && (
                <label>
                  {t('kenku.trigger')}
                  <select
                    value={form.kenkuSound.trigger}
                    onChange={(e) =>
                      patch({
                        kenkuSound: {
                          ...form.kenkuSound!,
                          trigger: e.target.value as KenkuAttackTrigger,
                        },
                      })
                    }
                  >
                    <option value="attackRoll">{t('kenku.trg.attackRoll')}</option>
                    <option value="attackHit">{t('kenku.trg.attackHit')}</option>
                    <option value="damageRoll">{t('kenku.trg.damageRoll')}</option>
                    <option value="damageApplied">{t('kenku.trg.damageApplied')}</option>
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="modal-actions">
            <button className="btn" onClick={() => setForm(null)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!form.name.trim()}
              onClick={() => void save()}
            >
              {t('pcs.save')}
            </button>
          </div>
        </div>
      ) : picking ? (
        <SpellPicker spells={spells} onAttach={attachSpell} onCancel={() => setPicking(false)} />
      ) : (
        <div className="pc-attack-add-row">
          <button className="btn small" onClick={() => setForm(emptyAction())}>
            {t('pcs.addAttack')}
          </button>
          <button className="btn small" onClick={() => setPicking(true)}>
            {t('pcs.fromSpellbook')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Inline spell picker for attaching a spellbook entry to a PC. Attack spells
 * ask for the caster's spell attack bonus, save spells for the save DC —
 * both are per-caster (ability modifier + proficiency), the spellbook record
 * stays neutral.
 */
function SpellPicker({
  spells,
  onAttach,
  onCancel,
}: {
  spells: Spell[];
  onAttach: (spell: Spell, opts: { toHit?: number; dc?: number }) => void;
  onCancel: () => void;
}) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<Spell | null>(null);
  const [bonus, setBonus] = useState('');

  const locName = (s: Spell) => (lang === 'de' && s.l10n?.de?.name ? s.l10n.de.name : s.name);
  const list = spells.filter(
    (s) =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      locName(s).toLowerCase().includes(filter.toLowerCase()),
  );

  if (picked) {
    const needsToHit = picked.attack;
    const needsDc = !picked.attack && !!picked.save;
    const n = parseInt(bonus, 10);
    return (
      <div className="attack-form">
        <div className="form-row">
          <strong>
            {locName(picked)}{' '}
            <span className="muted">{spellLevelLabel(lang, picked.level)}</span>
          </strong>
          {needsToHit && (
            <label>
              {t('pcs.spellToHit')}
              <input
                autoFocus
                type="number"
                placeholder="+5"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </label>
          )}
          {needsDc && (
            <label>
              {t('pcs.spellDc')}
              <input
                autoFocus
                type="number"
                placeholder="13"
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
              />
            </label>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setPicked(null)}>
            {t('common.back')}
          </button>
          <button
            className="btn primary"
            disabled={(needsToHit || needsDc) && !Number.isFinite(n)}
            onClick={() =>
              onAttach(picked, needsToHit ? { toHit: n || 0 } : needsDc ? { dc: n || 10 } : {})
            }
          >
            {t('pcs.attach')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="attack-form">
      <input
        autoFocus
        className="search-box"
        placeholder={t('spellbook.search')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="spell-pick-list">
        {list.length === 0 && <p className="muted">{t('spellbook.empty')}</p>}
        {list.slice(0, 60).map((s) => (
          <button key={s.id} className="pick-btn" title={s.text.slice(0, 400)} onClick={() => setPicked(s)}>
            {locName(s)} <span className="muted">{spellLevelLabel(lang, s.level)}</span>
          </button>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
