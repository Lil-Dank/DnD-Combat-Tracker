import { useEffect, useState } from 'react';
import type { ArchivedCombat } from '../../../shared/types';
import { logEntrySegments, logRollMath, logSourceTag } from '../../../shared/logText';
import { api } from '../api';
import { useConfirm } from '../Confirm';
import { useI18n } from '../i18n';

/**
 * The Combat Archive: every ended combat's log, kept until deleted here.
 * Players can browse the same archive (filtered) from their phones.
 */
export function ArchiveScreen() {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const [entries, setEntries] = useState<ArchivedCombat[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = () => void api.listArchive().then(setEntries);
  useEffect(refresh, []);

  const open = entries.find((e) => e.id === openId) ?? null;

  if (open) {
    let lastRound = -1;
    return (
      <div className="screen">
        <header className="screen-header">
          <h1>
            {open.templateName}{' '}
            <span className="muted">
              {new Date(open.endedAt).toLocaleString()} · {t('archive.rounds', { rounds: open.rounds })}
            </span>
          </h1>
          <button className="btn" onClick={() => setOpenId(null)}>
            {t('common.back')}
          </button>
        </header>
        <div className="archive-log">
          {open.log.map((e) => {
            const header =
              e.round !== lastRound && e.round > 0 ? (
                <div className="log-round">{t('log.round', { round: e.round })}</div>
              ) : null;
            lastRound = e.round > 0 ? e.round : lastRound;
            const math = logRollMath(e);
            return (
              <div key={e.id}>
                {header}
                <div className={`log-entry kind-${e.kind}`}>
                  <span className="log-text">
                    {logEntrySegments(lang, e).map((seg, i) =>
                      seg.cls ? (
                        <span key={i} className={seg.cls}>
                          {seg.text}
                        </span>
                      ) : (
                        seg.text
                      ),
                    )}
                  </span>
                  <span className="log-src">{logSourceTag(lang, e)}</span>
                </div>
                {math && <div className="log-roll tnum">{math}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{t('archive.title')}</h1>
      </header>
      {entries.length === 0 ? (
        <p className="empty-note">{t('archive.empty')}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('archive.encounter')}</th>
              <th>{t('archive.ended')}</th>
              <th>{t('archive.roundsCol')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  <button className="linkish" onClick={() => setOpenId(e.id)}>
                    {e.templateName}
                  </button>
                </td>
                <td>{new Date(e.endedAt).toLocaleString()}</td>
                <td>{e.rounds}</td>
                <td>
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      if (await confirm(t('archive.deleteConfirm'), t('common.delete'))) {
                        await api.deleteArchivedCombat(e.id);
                        refresh();
                      }
                    }}
                  >
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
