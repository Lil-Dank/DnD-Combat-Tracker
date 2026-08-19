import { useState } from 'react';
import type { AppState, DamageInstance, MonsterSource, Spell, SpellSchool } from '../../../shared/types';
import { SPELL_SCHOOLS } from '../../../shared/types';
import { api } from '../api';
import { useConfirm } from '../Confirm';
import { useI18n } from '../i18n';
import { ABILITIES } from '../actionForm';
import { DamageEditor, type DamagePartValue } from '../../../components/DamageEditor';
import { AttackText } from '../AttackText';
import { averageOf, displayDice, parseDice } from '../../../shared/dice';
import {
  spellClassLabel,
  spellComponents,
  spellField,
  spellLevelLabel,
  spellSchoolLabel,
} from '../../../shared/i18n';

interface SpellFormData {
  id?: string;
  name: string;
  level: string;
  school: SpellSchool;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  classes: string;
  text: string;
  attack: boolean;
  /** '' = no saving throw. */
  saveAbility: string;
  onSuccess: 'half' | 'none';
  damage: DamagePartValue;
  healing: string;
  upcastDice: string;
  upcastText: string;
  source: MonsterSource;
}

const emptyForm = (): SpellFormData => ({
  name: '',
  level: '1',
  school: 'evocation',
  castingTime: 'Action',
  range: '60 feet',
  components: 'V, S',
  duration: 'Instantaneous',
  concentration: false,
  ritual: false,
  classes: '',
  text: '',
  attack: false,
  saveAbility: '',
  onSuccess: 'half',
  damage: { dice: '', flat: '', type: '', condition: '' },
  healing: '',
  upcastDice: '',
  upcastText: '',
  source: 'manual',
});

const toForm = (s: Spell): SpellFormData => ({
  id: s.id,
  name: s.name,
  level: String(s.level),
  school: s.school,
  castingTime: s.castingTime,
  range: s.range,
  components: s.components,
  duration: s.duration,
  concentration: s.concentration,
  ritual: s.ritual,
  classes: s.classes.join(', '),
  text: s.text,
  attack: s.attack,
  saveAbility: s.save?.ability ?? '',
  onSuccess: s.save?.onSuccess ?? 'half',
  damage: {
    dice: s.damage[0]?.dice ?? '',
    flat: s.damage[0] && !s.damage[0].dice ? String(s.damage[0].average ?? '') : '',
    type: s.damage[0]?.type ?? '',
    condition: '',
  },
  healing: s.healing?.dice ?? '',
  upcastDice: s.upcast ? `${s.upcast.count}d${s.upcast.die}` : '',
  upcastText: s.upcastText ?? '',
  source: s.source,
});

function formToSpell(f: SpellFormData, existing?: Spell): Omit<Spell, 'id'> & { id?: string } {
  const dmgParsed = parseDice(f.damage.dice);
  const damage: DamageInstance[] = [];
  if (dmgParsed) {
    damage.push({
      average: averageOf(dmgParsed.count, dmgParsed.die, dmgParsed.bonus),
      dice: f.damage.dice.replace(/\s+/g, ''),
      count: dmgParsed.count,
      die: dmgParsed.die,
      bonus: dmgParsed.bonus || null,
      type: f.damage.type.trim().toLowerCase() || 'variable',
      condition: null,
    });
  } else if (f.damage.flat.trim()) {
    const flat = parseInt(f.damage.flat, 10) || 0;
    damage.push({
      average: flat,
      dice: null,
      count: null,
      die: null,
      bonus: null,
      type: f.damage.type.trim().toLowerCase() || 'variable',
      condition: null,
    });
  }
  const healParsed = parseDice(f.healing);
  const upParsed = parseDice(f.upcastDice);
  return {
    id: f.id,
    name: f.name.trim(),
    level: Math.min(9, Math.max(0, parseInt(f.level, 10) || 0)),
    school: f.school,
    castingTime: f.castingTime.trim() || 'Action',
    range: f.range.trim(),
    components: f.components.trim(),
    duration: f.duration.trim(),
    concentration: f.concentration,
    ritual: f.ritual,
    classes: f.classes.split(',').map((c) => c.trim()).filter(Boolean),
    text: f.text,
    attack: f.attack,
    save: f.saveAbility ? { ability: f.saveAbility, onSuccess: f.onSuccess } : null,
    damage,
    healing: healParsed
      ? { dice: f.healing.replace(/\s+/g, ''), count: healParsed.count, die: healParsed.die }
      : null,
    upcast: upParsed ? { count: upParsed.count, die: upParsed.die } : null,
    upcastText: f.upcastText.trim() || null,
    source: f.source,
    l10n: existing?.l10n ?? null,
  };
}

/**
 * The global spell library: search, expandable rules text, SRD import and a
 * manual editor — the Spellbook the DM reads at the table. PCs attach copies
 * of these records to their action lists; editing here never touches copies
 * already attached.
 */
export function SpellbookScreen({ state }: { state: AppState }) {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const [form, setForm] = useState<SpellFormData | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const locName = (s: Spell) => (lang === 'de' && s.l10n?.de?.name ? s.l10n.de.name : s.name);
  const locText = (s: Spell) => (lang === 'de' && s.l10n?.de?.text ? s.l10n.de.text : s.text);

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const { imported } = await api.importSrdSpells();
      setImportResult(t('spellbook.imported', { n: imported }));
    } catch (err) {
      setImportResult(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  const submit = async () => {
    if (!form || !form.name.trim()) return;
    const existing = form.id ? state.spells.find((s) => s.id === form.id) : undefined;
    await api.saveSpell(formToSpell(form, existing));
    setForm(null);
  };

  const spells = state.spells.filter(
    (s) =>
      s.name.toLowerCase().includes(filter.toLowerCase()) ||
      locName(s).toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{t('spellbook.title')}</h1>
        <div className="header-actions">
          <button className="btn" disabled={importing} onClick={() => void runImport()}>
            {t(importing ? 'monsters.importing' : 'spellbook.import')}
          </button>
          <button className="btn primary" onClick={() => setForm(emptyForm())}>
            {t('spellbook.add')}
          </button>
        </div>
      </header>

      {importResult && <p className="notice">{importResult}</p>}

      <input
        className="search-box"
        placeholder={t('spellbook.search')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {state.spells.length === 0 && !form && <p className="empty-note">{t('spellbook.empty')}</p>}

      <table className="data-table">
        {spells.length > 0 && (
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('spellbook.level')}</th>
              <th>{t('spellbook.school')}</th>
              <th>{t('spellbook.castingTime')}</th>
              <th>{t('monsters.source')}</th>
              <th></th>
            </tr>
          </thead>
        )}
        <tbody>
          {spells.map((s) => (
            <>
              <tr key={s.id}>
                <td className="name-cell">
                  <button
                    className="link-btn"
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    {expanded === s.id ? '▾' : '▸'} {locName(s)}
                    {s.concentration && (
                      <span className="muted" title={t('spellbook.concentration')}>
                        {' '}
                        {lang === 'de' ? 'Ⓚ' : 'Ⓒ'}
                      </span>
                    )}
                  </button>
                </td>
                <td>{spellLevelLabel(lang, s.level)}</td>
                <td>{spellSchoolLabel(lang, s.school)}</td>
                <td>{spellField(lang, s.castingTime)}</td>
                <td>
                  <span className={`tag ${s.source}`}>
                    {s.source === 'srd' ? 'SRD' : t('monsters.manual')}
                  </span>
                </td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => setForm(toForm(s))}>
                    {t('common.edit')}
                  </button>
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      if (await confirm(t('spellbook.deleteConfirm', { name: s.name }), t('common.delete')))
                        void api.deleteSpell(s.id);
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
              {expanded === s.id && (
                <tr key={`${s.id}-detail`} className="attack-row">
                  <td colSpan={6}>
                    <div className="spell-header-line">
                      <span>
                        <b>{t('spellbook.range')}:</b> {spellField(lang, s.range)}
                      </span>
                      <span>
                        <b>{t('spellbook.components')}:</b> {spellComponents(lang, s.components)}
                      </span>
                      <span>
                        <b>{t('spellbook.duration')}:</b> {spellField(lang, s.duration)}
                      </span>
                      {s.concentration && (
                        <span className="tag">{t('spellbook.concentration')}</span>
                      )}
                      {s.ritual && <span className="tag">{t('spellbook.ritual')}</span>}
                      {s.classes.length > 0 && (
                        <span className="muted">
                          {s.classes.map((c) => spellClassLabel(lang, c)).join(', ')}
                        </span>
                      )}
                    </div>
                    <SpellRollSummary spell={s} />
                    <AttackText text={locText(s)} />
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>{t(form.id ? 'spellbook.editSpell' : 'spellbook.addSpell')}</h2>
            <label>
              {t('common.name')}
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="form-row">
              <label>
                {t('spellbook.level')}
                <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={String(i)}>
                      {spellLevelLabel(lang, i)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('spellbook.school')}
                <select
                  value={form.school}
                  onChange={(e) => setForm({ ...form, school: e.target.value as SpellSchool })}
                >
                  {SPELL_SCHOOLS.map((sc) => (
                    <option key={sc} value={sc}>
                      {spellSchoolLabel(lang, sc)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('spellbook.castingTime')}
                <input
                  value={form.castingTime}
                  onChange={(e) => setForm({ ...form, castingTime: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                {t('spellbook.range')}
                <input value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value })} />
              </label>
              <label>
                {t('spellbook.components')}
                <input
                  value={form.components}
                  onChange={(e) => setForm({ ...form, components: e.target.value })}
                />
              </label>
              <label>
                {t('spellbook.duration')}
                <input
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: e.target.value })}
                />
              </label>
            </div>
            <div className="form-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.concentration}
                  onChange={(e) => setForm({ ...form, concentration: e.target.checked })}
                />
                {t('spellbook.concentration')}
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.ritual}
                  onChange={(e) => setForm({ ...form, ritual: e.target.checked })}
                />
                {t('spellbook.ritual')}
              </label>
              <label>
                {t('spellbook.classes')}
                <input
                  placeholder="Wizard, Sorcerer"
                  value={form.classes}
                  onChange={(e) => setForm({ ...form, classes: e.target.value })}
                />
              </label>
            </div>

            <h3>
              {t('spellbook.rollLayer')} <span className="muted">{t('spellbook.rollLayerNote')}</span>
            </h3>
            <div className="form-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.attack}
                  onChange={(e) => setForm({ ...form, attack: e.target.checked })}
                />
                {t('spellbook.attackRoll')}
              </label>
              <label>
                {t('spellbook.saveAbility')}
                <select
                  value={form.saveAbility}
                  onChange={(e) => setForm({ ...form, saveAbility: e.target.value })}
                >
                  <option value="">{t('spellbook.noSave')}</option>
                  {ABILITIES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              {form.saveAbility && (
                <label>
                  {t('spellbook.onSuccess')}
                  <select
                    value={form.onSuccess}
                    onChange={(e) => setForm({ ...form, onSuccess: e.target.value as 'half' | 'none' })}
                  >
                    <option value="half">{t('spellbook.onSuccessHalf')}</option>
                    <option value="none">{t('spellbook.onSuccessNone')}</option>
                  </select>
                </label>
              )}
            </div>
            <div className="attack-form">
              <span className="field-label">{t('spellbook.damage')}</span>
              <DamageEditor
                t={t}
                lang={lang}
                value={form.damage}
                onChange={(patch) => setForm({ ...form, damage: { ...form.damage, ...patch } })}
              />
            </div>
            <div className="form-row">
              <label>
                {t('spellbook.healing')}
                <input
                  placeholder="2d8"
                  value={form.healing}
                  onChange={(e) => setForm({ ...form, healing: e.target.value })}
                />
              </label>
              <label>
                {t('spellbook.upcast')}
                <input
                  placeholder="1d6"
                  value={form.upcastDice}
                  onChange={(e) => setForm({ ...form, upcastDice: e.target.value })}
                />
              </label>
            </div>
            <label>
              {t('spellbook.text')}
              <textarea
                rows={8}
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button className="btn" onClick={() => setForm(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" disabled={!form.name.trim()} onClick={() => void submit()}>
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** One compact line summarizing what a cast rolls (attack/save/damage/heal/upcast). */
export function SpellRollSummary({ spell }: { spell: Spell }) {
  const { t, lang, dmg, abilityCode } = useI18n();
  const parts: string[] = [];
  if (spell.attack) parts.push(`⚔ ${t('spellbook.attackRoll')}`);
  if (spell.save) {
    parts.push(
      `🛡 ${abilityCode(spell.save.ability)} — ${t(
        spell.save.onSuccess === 'none' ? 'spellbook.onSuccessNone' : 'spellbook.onSuccessHalf',
      )}`,
    );
  }
  for (const d of spell.damage) {
    parts.push(`💥 ${d.dice ? displayDice(lang, d.dice) : String(d.average ?? '')} ${dmg(d.type)}`);
  }
  if (spell.healing) parts.push(`✚ ${displayDice(lang, spell.healing.dice)}`);
  if (spell.upcast) {
    parts.push(
      `⬆ ${t('spellbook.upcastPerLevel', {
        dice: displayDice(lang, `${spell.upcast.count}d${spell.upcast.die}`),
        level: spell.level,
      })}`,
    );
  }
  if (!parts.length) return null;
  return <div className="spell-roll-summary muted">{parts.join('  ·  ')}</div>;
}
