import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../../shared/types';
import { logEntryText, logSourceTag } from '../../shared/logText';
import { useI18n } from './i18n';

const COLLAPSE_KEY = 'dct-log-collapsed';

/**
 * The Combat screen's right-hand log sidebar. Always recording, costs nothing
 * when unwanted: the full-width button at the bottom collapses it to a slim
 * strip (remembered in localStorage). Newest entries at the bottom,
 * auto-scrolled.
 */
export function CombatLogPanel({ log }: { log: LogEntry[] }) {
  const { t, lang } = useI18n();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === '1',
  );
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collapsed) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length, collapsed]);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      return !c;
    });
  };

  if (collapsed) {
    return (
      <aside className="log-panel collapsed">
        <div className="log-panel-vertical">📜 {t('logPanel.title')}</div>
        <button className="log-panel-toggle" onClick={toggle} title={t('logPanel.expand')}>
          «
        </button>
      </aside>
    );
  }

  let lastRound = -1;
  return (
    <aside className="log-panel">
      <header className="log-panel-header">
        <h3>📜 {t('logPanel.title')}</h3>
      </header>
      <div className="log-panel-body">
        {log.length === 0 && <p className="muted">{t('logPanel.empty')}</p>}
        {log.map((e) => {
          const header =
            e.round !== lastRound && e.round > 0 ? (
              <div className="log-round">{t('log.round', { round: e.round })}</div>
            ) : null;
          lastRound = e.round > 0 ? e.round : lastRound;
          return (
            <div key={e.id}>
              {header}
              <div className={`log-entry kind-${e.kind}`}>
                {logEntryText(lang, e)}
                <span className="log-src"> · {logSourceTag(lang, e)}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <button className="log-panel-toggle" onClick={toggle} title={t('logPanel.collapse')}>
        {t('logPanel.collapse')} »
      </button>
    </aside>
  );
}
