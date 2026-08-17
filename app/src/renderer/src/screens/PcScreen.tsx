import { useState } from 'react';
import type { AppState, PC } from '../../../shared/types';
import { api } from '../api';
import { useConfirm } from '../Confirm';
import { useI18n } from '../i18n';
import { PcAttackEditor } from '../PcAttackEditor';

interface PcFormData {
  id?: string;
  name: string;
  maxHp: string;
  ac: string;
  initMod: string;
}

const emptyForm: PcFormData = { name: '', maxHp: '10', ac: '10', initMod: '0' };

export function PcScreen({ state }: { state: AppState }) {
  const { t } = useI18n();
  const [form, setForm] = useState<PcFormData | null>(null);
  const confirm = useConfirm();

  const startEdit = (pc: PC) =>
    setForm({
      id: pc.id,
      name: pc.name,
      maxHp: String(pc.maxHp),
      ac: String(pc.ac),
      initMod: String(pc.initMod),
    });

  const submit = async () => {
    if (!form || !form.name.trim()) return;
    const existing = form.id ? state.pcs.find((p) => p.id === form.id) : undefined;
    await api.savePc({
      id: form.id,
      name: form.name.trim(),
      maxHp: Math.max(1, parseInt(form.maxHp, 10) || 1),
      ac: parseInt(form.ac, 10) || 10,
      initMod: parseInt(form.initMod, 10) || 0,
      attacks: existing?.attacks ?? [],
    });
    setForm(null);
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{t('pcs.titleFull')}</h1>
        <button className="btn primary" onClick={() => setForm({ ...emptyForm })}>
          {t('pcs.add')}
        </button>
      </header>

      {state.pcs.length === 0 && !form && (
        <p className="empty-note">{t('pcs.emptyFull')}</p>
      )}

      <table className="data-table">
        {state.pcs.length > 0 && (
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.maxHp')}</th>
              <th>{t('common.ac')}</th>
              <th>{t('common.initMod')}</th>
              <th></th>
            </tr>
          </thead>
        )}
        <tbody>
          {state.pcs.map((pc) => (
            <tr key={pc.id}>
              <td className="name-cell">{pc.name}</td>
              <td>{pc.maxHp}</td>
              <td>{pc.ac}</td>
              <td>{pc.initMod >= 0 ? `+${pc.initMod}` : pc.initMod}</td>
              <td className="row-actions">
                <button className="btn small" onClick={() => startEdit(pc)}>{t('common.edit')}</button>
                <button
                  className="btn small danger"
                  onClick={async () => {
                    if (await confirm(t('pcs.deleteConfirm', { name: pc.name }), t('common.delete'))) void api.deletePc(pc.id);
                  }}
                >
                  {t('common.delete')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {form && (
        <div className="modal-backdrop" onClick={() => setForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t(form.id ? 'pcs.editPc' : 'pcs.addPc')}</h2>
            <label>
              {t('common.name')}
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && void submit()}
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
            {(() => {
              const savedPc = form.id ? state.pcs.find((p) => p.id === form.id) : undefined;
              return savedPc ? (
                <PcAttackEditor pc={savedPc} kenkuOn={state.settings.kenku.enabled} />
              ) : null;
            })()}
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
