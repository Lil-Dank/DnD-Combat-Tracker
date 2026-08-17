import { useEffect, useRef, useState } from 'react';
import type { LogEntry } from '../../shared/types';
import { logEntryText, logSourceTag } from '../../shared/logText';
import { useI18n } from './i18n';

const COLLAPSE_KEY = 'dct-log-collapsed';

/**
 * The Combat screen's right-hand live log. Always recording, costs nothing
 * when unwanted: the panel collapses to a slim vertical toggle and remembers
 * that choice. Newest entries at the bottom, auto-scrolled.
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
      <button className="log-panel-collapsed" onClick={toggle} title={t('logPanel.title')}>
        📜
      </button>
    );
  }

  let lastRound = -1;
  return (
    <aside className="log-panel">
      <header className="log-panel-header">
        <h3>{t('logPanel.title')}</h3>
        <button className="btn small" onClick={toggle} title={t('logPanel.collapse')}>
          »
        </button>
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
    </aside>
  );
}
