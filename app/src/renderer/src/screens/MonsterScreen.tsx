import { useState } from 'react';
import type {
  KenkuAttackTrigger,
  ActionKind,
  ActionSection,
  AppState,
  AttackKind,
  DamageInstance,
  MonsterAction,
  MonsterTemplate,
} from '../../../shared/types';
import { ABILITY_KEYS } from '../../../shared/types';
import type { AbilityScores } from '../../../shared/types';
import { averageOf, parseDice } from '../../../shared/dice';
import { api } from '../api';
import { useConfirm } from '../Confirm';
import { AttackText } from '../AttackText';
import { AbilityTable } from '../AbilityTable';
import { useI18n } from '../i18n';
import { useKenkuLibrary } from '../useKenkuLibrary';
import { isDemo } from '../api';

// ---- editable action form model (strings while typing) ----

interface DamageForm {
  dice: string; // "2d6+5" or empty
  flat: string; // flat average when no dice
  type: string;
  condition: string;
}

interface ActionForm {
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

interface MonsterFormData {
  id?: string;
  name: string;
  maxHp: string;
  ac: string;
  initMod: string;
  source: 'manual' | 'srd';
  /** Ability scores as strings while typing; all-blank means "none". */
  abilities: Record<(typeof ABILITY_KEYS)[number], string>;
  actions: ActionForm[];
}

const emptyAbilities = (): MonsterFormData['abilities'] => ({
  str: '', dex: '', con: '', int: '', wis: '', cha: '',
});

function abilitiesToForm(a: AbilityScores | null | undefined): MonsterFormData['abilities'] {
  if (!a) return emptyAbilities();
  return {
    str: String(a.str), dex: String(a.dex), con: String(a.con),
    int: String(a.int), wis: String(a.wis), cha: String(a.cha),
  };
}

/** All blank → null; otherwise blanks default to 10. */
function formToAbilities(f: MonsterFormData['abilities']): AbilityScores | null {
  if (ABILITY_KEYS.every((k) => f[k].trim() === '')) return null;
  const parse = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 10;
  };
  return {
    str: parse(f.str), dex: parse(f.dex), con: parse(f.con),
    int: parse(f.int), wis: parse(f.wis), cha: parse(f.cha),
  };
}

const SECTIONS: { id: ActionSection; label: string }[] = [
  { id: 'action', label: 'Action' },
  { id: 'bonus_action', label: 'Bonus Action' },
  { id: 'reaction', label: 'Reaction' },
  { id: 'legendary_action', label: 'Legendary' },
  { id: 'trait', label: 'Trait' },
];

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

const emptyAction = (): ActionForm => ({
  id: `manual.${crypto.randomUUID()}`,
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

function actionToForm(a: MonsterAction): ActionForm {
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

function formToAction(f: ActionForm, order: number, existing?: MonsterAction): MonsterAction {
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
    save: isSave ? { ability: f.saveAbility, dc: parseInt(f.saveDc, 10) || 10 } : null,
    onHit: {
      damage,
      alternateDamage: existing?.onHit.alternateDamage ?? null,
      effects: existing?.onHit.effects ?? [],
    },
    onHitOrMiss: existing?.onHitOrMiss ?? null,
    kenkuSound: f.kenkuSound ?? null,
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

export function MonsterScreen({ state }: { state: AppState }) {
  const { t, mon, abilityCode, locAction, fmtRange } = useI18n();
  const [form, setForm] = useState<MonsterFormData | null>(null);
  const kenkuOn = !isDemo && state.settings.kenku.enabled;
  const { library: kenkuLibrary } = useKenkuLibrary(form !== null && kenkuOn);
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const startEdit = (m: MonsterTemplate) =>
    setForm({
      id: m.id,
      name: m.name,
      maxHp: String(m.maxHp),
      ac: String(m.ac),
      initMod: String(m.initMod),
      source: m.source,
      abilities: abilitiesToForm(m.abilities),
      actions: m.attacks.map(actionToForm),
    });

  const submit = async () => {
    if (!form || !form.name.trim()) return;
    const existing = form.id ? state.monsters.find((m) => m.id === form.id) : undefined;
    await api.saveMonster({
      id: form.id,
      name: form.name.trim(),
      maxHp: Math.max(1, parseInt(form.maxHp, 10) || 1),
      ac: parseInt(form.ac, 10) || 10,
      initMod: parseInt(form.initMod, 10) || 0,
      abilities: formToAbilities(form.abilities),
      source: form.source,
      attacks: form.actions
        .filter((a) => a.name.trim())
        .map((a, i) => formToAction(a, i, existing?.attacks.find((x) => x.id === a.id))),
    });
    setForm(null);
  };

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const { imported } = await api.importSrd();
      setImportResult(`Imported ${imported} monsters from the SRD 5.2.1 dataset.`);
    } catch (err) {
      setImportResult(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  };

  const patchAction = (i: number, patch: Partial<ActionForm>) => {
    if (!form) return;
    const actions = [...form.actions];
    actions[i] = { ...actions[i], ...patch };
    setForm({ ...form, actions });
  };

  // Search matches the English name and, in German, the SRD name too - a
  // German-speaking DM types "Eulenbär", not "Owlbear".
  const monsters = state.monsters.filter(
    (m) =>
      m.name.toLowerCase().includes(filter.toLowerCase()) ||
      mon(m.name).toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{t('monsters.title')}</h1>
        <div className="header-actions">
          <button className="btn" disabled={importing} onClick={() => void runImport()}>
            {t(importing ? 'monsters.importing' : 'monsters.import')}
          </button>
          <button
            className="btn primary"
            onClick={() =>
              setForm({
                name: '', maxHp: '10', ac: '10', initMod: '0', source: 'manual',
                abilities: emptyAbilities(), actions: [],
              })
            }
          >
            {t('monsters.add')}
          </button>
        </div>
      </header>

      {importResult && <p className="notice">{importResult}</p>}

      <input
        className="search-box"
        placeholder={t('monsters.search')}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {state.monsters.length === 0 && !form && (
        <p className="empty-note">
          {t('monsters.libraryEmpty')}
        </p>
      )}

      <table className="data-table">
        {monsters.length > 0 && (
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.maxHp')}</th>
              <th>{t('common.ac')}</th>
              <th>{t('common.initMod')}</th>
              <th>{t('monsters.actions')}</th>
              <th>{t('monsters.source')}</th>
              <th></th>
            </tr>
          </thead>
        )}
        <tbody>
          {monsters.map((m) => (
            <>
              <tr key={m.id}>
                <td className="name-cell">
                  <button
                    className="link-btn"
                    onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    title={t('monsters.showActions')}
                  >
                    {expanded === m.id ? '▾' : '▸'} {mon(m.name)}
                  </button>
                </td>
                <td>{m.maxHp}</td>
                <td>{m.ac}</td>
                <td>{m.initMod >= 0 ? `+${m.initMod}` : m.initMod}</td>
                <td>{m.attacks.length}</td>
                <td>
                  <span className={`tag ${m.source}`}>{m.source === 'srd' ? 'SRD' : t('monsters.manual')}</span>
                </td>
                <td className="row-actions">
                  <button className="btn small" onClick={() => startEdit(m)}>{t('common.edit')}</button>
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      if (await confirm(t('monsters.deleteConfirm', { name: m.name }), t('common.delete')))
                        void api.deleteMonster(m.id);
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
              {expanded === m.id && (
                <tr key={`${m.id}-attacks`} className="attack-row">
                  <td colSpan={7}>
                    {m.abilities && <AbilityTable abilities={m.abilities} />}
                    {m.attacks.length === 0 ? (
                      <em>{t('monsters.noActions')}</em>
                    ) : (
                      <ul className="attack-list">
                        {m.attacks.map((a) => {
                          const loc = locAction(m.l10n?.de, a);
                          return (
                            <li key={a.id} title={loc.text}>
                              <strong>{loc.name}</strong>
                              {a.display.toHit && ` ${a.display.toHit} ${t('combat.toHit')}`}
                              {a.save &&
                                ` ${t('combat.saveDc', { ability: abilityCode(a.save.ability), dc: a.save.dc })}`}
                              {loc.range && `, ${fmtRange(loc.range)}`}
                              {loc.damage && `, ${loc.damage}`}
                              {a.type !== 'attack' && loc.text && <AttackText text={loc.text} />}
                            </li>
                          );
                        })}
                      </ul>
                    )}
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
            <h2>{t(form.id ? 'monsters.editMonster' : 'monsters.addMonster')}</h2>
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
                {t('common.maxHp')}
                <input
                  type="number"
                  min={1}
                  value={form.maxHp}
                  onChange={(e) => setForm({ ...form, maxHp: e.target.value })}
                />
              </label>
              <label>
                {t('common.ac')}
                <input
                  type="number"
                  value={form.ac}
                  onChange={(e) => setForm({ ...form, ac: e.target.value })}
                />
              </label>
              <label>
                {t('common.initMod')}
                <input
                  type="number"
                  value={form.initMod}
                  onChange={(e) => setForm({ ...form, initMod: e.target.value })}
                />
              </label>
            </div>

            <h3>{t('monsters.abilities')} <span className="muted">{t('monsters.abilitiesNote')}</span></h3>
            <div className="form-row">
              {ABILITY_KEYS.map((k) => (
                <label key={k}>
                  {k.toUpperCase()}
                  <input
                    type="number"
                    placeholder="10"
                    value={form.abilities[k]}
                    onChange={(e) =>
                      setForm({ ...form, abilities: { ...form.abilities, [k]: e.target.value } })
                    }
                  />
                </label>
              ))}
            </div>

            <h3>{t('monsters.actions')} <span className="muted">{t('monsters.actionsNote')}</span></h3>
            {form.actions.map((a, i) => (
              <div key={a.id} className="attack-form">
                <div className="form-row">
                  <label>
                    {t('common.name')}
                    <input value={a.name} onChange={(e) => patchAction(i, { name: e.target.value })} />
                  </label>
                  <label>
                    {t('common.section')}
                    <select
                      value={a.section}
                      onChange={(e) => patchAction(i, { section: e.target.value as ActionSection })}
                    >
                      {SECTIONS.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('common.type')}
                    <select
                      value={a.type}
                      onChange={(e) => patchAction(i, { type: e.target.value as ActionKind })}
                    >
                      <option value="attack">{t('monsters.type.attack')}</option>
                      <option value="save">{t('monsters.type.save')}</option>
                      <option value="other">{t('monsters.type.other')}</option>
                    </select>
                  </label>
                  <button
                    className="btn small danger attack-remove"
                    onClick={() =>
                      setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })
                    }
                  >
                    ✕
                  </button>
                </div>

                {a.type === 'attack' && (
                  <div className="form-row">
                    <label>
                      {t('common.kind')}
                      <select
                        value={a.kind}
                        onChange={(e) => patchAction(i, { kind: e.target.value as AttackKind })}
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
                        placeholder="+4"
                        value={a.toHit}
                        onChange={(e) => patchAction(i, { toHit: e.target.value })}
                      />
                    </label>
                    {a.kind !== 'ranged' && (
                      <label>
                        Reach (ft)
                        <input
                          type="number"
                          value={a.reach}
                          onChange={(e) => patchAction(i, { reach: e.target.value })}
                        />
                      </label>
                    )}
                    {a.kind !== 'melee' && (
                      <>
                        <label>
                          Range (ft)
                          <input
                            type="number"
                            placeholder="80"
                            value={a.rangeNormal}
                            onChange={(e) => patchAction(i, { rangeNormal: e.target.value })}
                          />
                        </label>
                        <label>
                          {t('monsters.f.longRange')}
                          <input
                            type="number"
                            placeholder="320"
                            value={a.rangeLong}
                            onChange={(e) => patchAction(i, { rangeLong: e.target.value })}
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}

                {a.type === 'save' && (
                  <div className="form-row">
                    <label>
                      {t('monsters.f.saveAbility')}
                      <select
                        value={a.saveAbility}
                        onChange={(e) => patchAction(i, { saveAbility: e.target.value })}
                      >
                        {ABILITIES.map((ab) => (
                          <option key={ab} value={ab}>{ab}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('common.dc')}
                      <input
                        type="number"
                        value={a.saveDc}
                        onChange={(e) => patchAction(i, { saveDc: e.target.value })}
                      />
                    </label>
                  </div>
                )}

                {a.type !== 'other' && (
                  <>
                    {a.damage.map((d, j) => (
                      <div key={j} className="form-row">
                        <label>
                          {t('monsters.f.damageDice')}
                          <input
                            placeholder="2d8+2 (or leave empty)"
                            value={d.dice}
                            onChange={(e) => {
                              const damage = [...a.damage];
                              damage[j] = { ...d, dice: e.target.value };
                              patchAction(i, { damage });
                            }}
                          />
                        </label>
                        <label>
                          {t('monsters.f.flatDamage')}
                          <input
                            type="number"
                            placeholder="if no dice"
                            value={d.flat}
                            onChange={(e) => {
                              const damage = [...a.damage];
                              damage[j] = { ...d, flat: e.target.value };
                              patchAction(i, { damage });
                            }}
                          />
                        </label>
                        <label>
                          {t('common.type')}
                          <input
                            placeholder="slashing"
                            value={d.type}
                            onChange={(e) => {
                              const damage = [...a.damage];
                              damage[j] = { ...d, type: e.target.value };
                              patchAction(i, { damage });
                            }}
                          />
                        </label>
                        <label>
                          {t('monsters.f.onlyIf')}
                          <input
                            placeholder="optional condition"
                            value={d.condition}
                            onChange={(e) => {
                              const damage = [...a.damage];
                              damage[j] = { ...d, condition: e.target.value };
                              patchAction(i, { damage });
                            }}
                          />
                        </label>
                        <button
                          className="btn small danger attack-remove"
                          onClick={() =>
                            patchAction(i, { damage: a.damage.filter((_, k) => k !== j) })
                          }
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn small"
                      onClick={() =>
                        patchAction(i, {
                          damage: [...a.damage, { dice: '', flat: '', type: '', condition: '' }],
                        })
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
                              value={a.kenkuSound?.soundId ?? ''}
                              onChange={(e) => {
                                const soundId = e.target.value;
                                if (!soundId) {
                                  patchAction(i, { kenkuSound: null });
                                  return;
                                }
                                const snd = kenkuLibrary.sounds.find((x) => x.id === soundId);
                                patchAction(i, {
                                  kenkuSound: {
                                    soundId,
                                    title: snd?.title ?? soundId,
                                    trigger: a.kenkuSound?.trigger ?? 'attackHit',
                                    delayMs: a.kenkuSound?.delayMs,
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
                            <span className="muted">
                              {a.kenkuSound?.title ?? t('kenku.offline')}
                            </span>
                          )}
                        </label>
                        {a.kenkuSound && (
                          <>
                            <label>
                              {t('kenku.trigger')}
                              <select
                                value={a.kenkuSound.trigger}
                                onChange={(e) =>
                                  patchAction(i, {
                                    kenkuSound: {
                                      ...a.kenkuSound!,
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
                            <label>
                              {t('kenku.delay')}
                              <input
                                type="number"
                                min={0}
                                defaultValue={a.kenkuSound.delayMs ?? ''}
                                onBlur={(e) => {
                                  const delayMs = parseInt(e.target.value, 10);
                                  patchAction(i, {
                                    kenkuSound: {
                                      ...a.kenkuSound!,
                                      delayMs:
                                        Number.isFinite(delayMs) && delayMs > 0 ? delayMs : undefined,
                                    },
                                  });
                                }}
                              />
                            </label>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

                <label>
                  Details / description{' '}
                  <span className="muted">(shown in the preview; supports **bold**)</span>
                  <textarea
                    rows={2}
                    value={a.text}
                    onChange={(e) => patchAction(i, { text: e.target.value })}
                  />
                </label>
              </div>
            ))}
            <button
              className="btn small"
              onClick={() => setForm({ ...form, actions: [...form.actions, emptyAction()] })}
            >
              {t('monsters.f.addAction')}
            </button>

            <div className="modal-actions">
              <button className="btn" onClick={() => setForm(null)}>{t('common.cancel')}</button>
              <button className="btn primary" disabled={!form.name.trim()} onClick={() => void submit()}>
                {t('pcs.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
