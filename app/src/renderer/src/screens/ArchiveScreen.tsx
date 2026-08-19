import { useEffect, useState } from 'react';
import type { ArchivedCombat } from '../../../shared/types';
import { api } from '../api';
import { useConfirm } from '../Confirm';
import { useI18n } from '../i18n';
import { LogCards } from '../../../components/LogCards';

/**
 * The Combat Archive: every ended combat's log, kept until deleted. Two-pane
 * master-detail — the fight list on the left, the full-width log of the
 * selected fight on the right, newest preselected. Players browse the same
 * archive (filtered) from their phones.
 */
export function ArchiveScreen() {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const [entries, setEntries] = useState<ArchivedCombat[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () =>
    void api.listArchive().then((list) => {
      setEntries(list);
      // Auto-select the newest fight so the screen is never empty.
      setOpenId((cur) => (cur && list.some((e) => e.id === cur) ? cur : list[0]?.id ?? null));
    });
  useEffect(refresh, []);

  const open = entries.find((e) => e.id === openId) ?? null;
  const locale = lang === 'de' ? 'de-DE' : 'en-US';

  return (
    <div className="screen archive-screen">
      <header className="screen-header">
        <h1>{t('archive.title')}</h1>
      </header>

      {entries.length === 0 ? (
        <p className="empty-note">{t('archive.empty')}</p>
      ) : (
        <div className="archive-panes">
          <aside className="archive-list-pane">
            {entries.map((e) => (
              <div
                key={e.id}
                className={`archive-item ${e.id === openId ? 'selected' : ''}`}
                onClick={() => setOpenId(e.id)}
              >
                <div className="archive-item-main">
                  <strong>{e.templateName}</strong>
                  <span className="muted">
                    {new Date(e.endedAt).toLocaleDateString(locale)} ·{' '}
                    {e.rounds === 1 ? t('archive.roundsOne') : t('archive.rounds', { rounds: e.rounds })}
                  </span>
                </div>
                <button
                  className="btn small danger"
                  title={t('common.delete')}
                  onClick={async (ev) => {
                    ev.stopPropagation();
                    if (await confirm(t('archive.deleteConfirm'), t('common.delete'))) {
                      await api.deleteArchivedCombat(e.id);
                      refresh();
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </aside>

          <section className="archive-log-pane">
            {open && (
              <>
                <h2>
                  {open.templateName}{' '}
                  <span className="muted">
                    {new Date(open.endedAt).toLocaleString(locale)} ·{' '}
                    {open.rounds === 1 ? t('archive.roundsOne') : t('archive.rounds', { rounds: open.rounds })}
                  </span>
                </h2>
                <div className="archive-log">
                  <LogCards log={open.log} lang={lang} t={t} showSource />
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
