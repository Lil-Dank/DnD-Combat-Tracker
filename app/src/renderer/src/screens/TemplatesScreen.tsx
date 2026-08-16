import { useMemo, useState } from 'react';
import type { AppState, EncounterEntry, EncounterTemplate } from '../../../shared/types';
import { api } from '../api';
import { useConfirm } from '../Confirm';
import { useKenkuLibrary } from '../useKenkuLibrary';
import { isDemo } from '../api';
import { useI18n } from '../i18n';

interface TemplateFormData {
  id?: string;
  name: string;
  entries: EncounterEntry[];
  kenkuPlaylistId?: string | null;
  kenkuPlaylistTitle?: string | null;
}

export function TemplatesScreen({
  state,
  onStartCombat,
}: {
  state: AppState;
  onStartCombat: (templateId: string) => void;
}) {
  const { t: tr, mon } = useI18n();
  const [form, setForm] = useState<TemplateFormData | null>(null);
  const [monsterFilter, setMonsterFilter] = useState('');
  const confirm = useConfirm();

  const monstersById = useMemo(
    () => new Map(state.monsters.map((m) => [m.id, m])),
    [state.monsters],
  );

  const kenkuOn = !isDemo && state.settings.kenku.enabled;
  const { library } = useKenkuLibrary(form !== null && kenkuOn);

  const startEdit = (t: EncounterTemplate) =>
    setForm({
      id: t.id,
      name: t.name,
      entries: t.entries.map((e) => ({ ...e })),
      kenkuPlaylistId: t.kenkuPlaylistId ?? null,
      kenkuPlaylistTitle: t.kenkuPlaylistTitle ?? null,
    });

  const submit = async () => {
    if (!form || !form.name.trim()) return;
    await api.saveTemplate({
      id: form.id,
      name: form.name.trim(),
      entries: form.entries.filter((e) => e.quantity > 0),
      kenkuPlaylistId: form.kenkuPlaylistId ?? null,
      kenkuPlaylistTitle: form.kenkuPlaylistTitle ?? null,
    });
    setForm(null);
  };

  const setQuantity = (monsterTemplateId: string, quantity: number) => {
    if (!form) return;
    const exists = form.entries.some((e) => e.monsterTemplateId === monsterTemplateId);
    let entries: EncounterEntry[];
    if (quantity <= 0) {
      entries = form.entries.filter((e) => e.monsterTemplateId !== monsterTemplateId);
    } else if (exists) {
      entries = form.entries.map((e) =>
        e.monsterTemplateId === monsterTemplateId ? { ...e, quantity } : e,
      );
    } else {
      entries = [...form.entries, { monsterTemplateId, quantity }];
    }
    setForm({ ...form, entries });
  };

  const totalMonsters = (t: { entries: EncounterEntry[] }) =>
    t.entries.reduce((sum, e) => sum + e.quantity, 0);

  const filteredMonsters = state.monsters.filter((m) =>
    m.name.toLowerCase().includes(monsterFilter.toLowerCase()),
  );

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{tr('templates.title')}</h1>
        <button
          className="btn primary"
          onClick={() => setForm({ name: '', entries: [] })}
          disabled={state.monsters.length === 0}
        >
          {tr('templates.new')}
        </button>
      </header>

      {state.monsters.length === 0 && (
        <p className="empty-note">
          {tr('templates.noLibrary')}
        </p>
      )}

      {state.encounterTemplates.length === 0 && state.monsters.length > 0 && !form && (
        <p className="empty-note">
          {tr('templates.emptyNote')}
          quantities (e.g. 4× Goblin, 1× Bugbear) that you pick when starting combat.
        </p>
      )}

      <div className="template-grid">
        {state.encounterTemplates.map((t) => (
          <div key={t.id} className="template-card">
            <div className="template-card-head">
              <h3>
                {t.name}
                {t.kenkuPlaylistId && (
                  <span className="kenku-marker" title={t.kenkuPlaylistTitle ?? ''}> 🎵</span>
                )}
              </h3>
              <span className="muted">{totalMonsters(t)} {tr('templates.monsters')}</span>
            </div>
            <ul className="template-entries">
              {t.entries.map((e) => (
                <li key={e.monsterTemplateId}>
                  <span className="qty">{e.quantity}×</span>{' '}
                  {mon(monstersById.get(e.monsterTemplateId)?.name ?? '') || '(deleted monster)'}
                </li>
              ))}
              {t.entries.length === 0 && <li className="muted">{tr('templates.emptyTemplate')}</li>}
            </ul>
            <div className="template-card-actions">
              <button
                className="btn small primary"
                disabled={t.entries.length === 0}
                onClick={async () => {
                  if (state.combat) {
                    if (!(await confirm(tr('templates.combatInProgress'), tr('templates.endAndStart')))) return;
                    await api.endCombat();
                  }
                  onStartCombat(t.id);
                }}
              >
                {tr('templates.start')}
              </button>
              <button className="btn small" onClick={() => startEdit(t)}>{tr('common.edit')}</button>
              <button className="btn small" onClick={() => void api.duplicateTemplate(t.id)}>
                {tr('common.duplicate')}
              </button>
              <button
                className="btn small danger"
                onClick={async () => {
                  if (await confirm(tr('templates.deleteConfirm', { name: t.name }), tr('common.delete'))) void api.deleteTemplate(t.id);
                }}
              >
                {tr('common.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal wide" onClick={(e) => e.stopPropagation()}>
            <h2>{tr(form.id ? 'templates.editTemplate' : 'templates.newTemplate')}</h2>
            <label>
              {tr('templates.nameLabel')}
              <input
                autoFocus
                placeholder={tr('templates.namePlaceholder')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>

            {kenkuOn && (
              <label className="inline-label">
                {tr('kenku.playlist')}
                {library ? (
                  <select
                    className="theme-select"
                    value={form.kenkuPlaylistId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      const pl = library.playlists.find((p) => p.id === id);
                      setForm({
                        ...form,
                        kenkuPlaylistId: id,
                        kenkuPlaylistTitle: pl?.title ?? null,
                      });
                    }}
                  >
                    <option value="">{tr('kenku.noPlaylist')}</option>
                    {library.playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="muted">
                    {form.kenkuPlaylistTitle
                      ? tr('kenku.offlineKeep', { title: form.kenkuPlaylistTitle })
                      : tr('kenku.offline')}
                  </span>
                )}
              </label>
            )}

            {form.entries.length > 0 && (
              <>
                <h3>{tr('templates.inThisEncounter')}</h3>
                <ul className="picked-entries">
                  {form.entries.map((e) => (
                    <li key={e.monsterTemplateId}>
                      <span>{monstersById.get(e.monsterTemplateId)?.name ?? '(deleted)'}</span>
                      <span className="picked-controls">
                        <button
                          className="btn small"
                          onClick={() => setQuantity(e.monsterTemplateId, e.quantity - 1)}
                        >
                          −
                        </button>
                        <span className="qty">{e.quantity}</span>
                        <button
                          className="btn small"
                          onClick={() => setQuantity(e.monsterTemplateId, e.quantity + 1)}
                        >
                          +
                        </button>
                        <button
                          className="btn small danger"
                          onClick={() => setQuantity(e.monsterTemplateId, 0)}
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3>{tr('templates.addMonsters')}</h3>
            <input
              className="search-box"
              placeholder={tr('templates.searchLibrary')}
              value={monsterFilter}
              onChange={(e) => setMonsterFilter(e.target.value)}
            />
            <div className="monster-pick-list">
              {filteredMonsters.slice(0, 60).map((m) => {
                const entry = form.entries.find((e) => e.monsterTemplateId === m.id);
                return (
                  <button
                    key={m.id}
                    className={`pick-btn ${entry ? 'picked' : ''}`}
                    onClick={() => setQuantity(m.id, (entry?.quantity ?? 0) + 1)}
                    title={`HP ${m.maxHp} · AC ${m.ac}`}
                  >
                    {entry ? `${entry.quantity}× ` : ''}{mon(m.name)}
                  </button>
                );
              })}
              {filteredMonsters.length > 60 && (
                <span className="muted">{tr('combat.moreRefine', { n: filteredMonsters.length - 60 })}</span>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setForm(null)}>{tr('common.cancel')}</button>
              <button
                className="btn primary"
                disabled={!form.name.trim()}
                onClick={() => void submit()}
              >
                {tr('templates.saveTemplate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
