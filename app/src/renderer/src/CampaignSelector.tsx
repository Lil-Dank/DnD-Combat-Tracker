import { useState } from 'react';
import type { AppState } from '../../shared/types';
import { api } from './api';
import { useConfirm } from './Confirm';
import { useI18n } from './i18n';

/**
 * The sidebar campaign switcher: a compact select of all campaigns plus a
 * manage button opening the create/rename/delete modal. Switching hot-swaps
 * party, encounters, combat and archive - any in-progress combat is simply
 * left on disk and resumes when its campaign is mounted again.
 */
export function CampaignSelector({ state }: { state: AppState }) {
  const { t } = useI18n();
  const [showManage, setShowManage] = useState(false);

  return (
    <>
      <div className="campaign-row">
        <select
          className="theme-select campaign-select"
          value={state.activeCampaignId}
          title={state.campaigns.find((c) => c.id === state.activeCampaignId)?.name}
          onChange={(e) => void api.switchCampaign(e.target.value)}
        >
          {state.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          className="btn small campaign-manage"
          title={t('campaign.manage')}
          onClick={() => setShowManage(true)}
        >
          ✎
        </button>
      </div>
      {showManage && <CampaignModal state={state} onClose={() => setShowManage(false)} />}
    </>
  );
}

function CampaignModal({ state, onClose }: { state: AppState; onClose: () => void }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = await api.createCampaign(name);
    setNewName('');
    await api.switchCampaign(id);
  };

  const commitRename = async () => {
    if (renamingId && renameValue.trim()) {
      await api.renameCampaign(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('campaign.modalTitle')}</h2>
        <div className="campaign-list">
          {state.campaigns.map((c) => {
            const isActive = c.id === state.activeCampaignId;
            const isLast = state.campaigns.length <= 1;
            return (
              <div key={c.id} className={`campaign-item ${isActive ? 'selected' : ''}`}>
                {renamingId === c.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => void commitRename()}
                  />
                ) : (
                  <span className="campaign-item-name">
                    {c.name}
                    {isActive && <span className="muted"> · {t('campaign.active')}</span>}
                  </span>
                )}
                <div className="campaign-item-actions">
                  <button
                    className="btn small"
                    title={t('campaign.rename')}
                    onClick={() => {
                      setRenamingId(c.id);
                      setRenameValue(c.name);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="btn small danger"
                    disabled={isActive || isLast}
                    title={
                      isActive
                        ? t('campaign.cannotDeleteActive')
                        : isLast
                          ? t('campaign.cannotDeleteLast')
                          : t('common.delete')
                    }
                    onClick={async () => {
                      if (await confirm(t('campaign.deleteConfirm'), t('common.delete'))) {
                        await api.deleteCampaign(c.id);
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="campaign-create-row">
          <input
            placeholder={t('campaign.namePlaceholder')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create();
            }}
          />
          <button className="btn primary" disabled={!newName.trim()} onClick={() => void create()}>
            + {t('campaign.create')}
          </button>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
