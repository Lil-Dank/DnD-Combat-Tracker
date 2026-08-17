import type { LogEntry } from '../../shared/types';
import { logEntrySegments, logRollSegments, logSourceTag } from '../../shared/logText';
import { useI18n } from './i18n';

/**
 * The one way combat-log entries render on DM surfaces: round headers,
 * colored segments, right-justified source tags, and the muted dice-math
 * sub-lines. Shared by the Combat screen's log sidebar and the Archive.
 */
export function LogEntries({ log }: { log: LogEntry[] }) {
  const { t, lang } = useI18n();
  let lastRound = -1;
  return (
    <>
      {log.map((e) => {
        const header =
          e.round !== lastRound && e.round > 0 ? (
            <div className="log-round">{t('log.round', { round: e.round })}</div>
          ) : null;
        lastRound = e.round > 0 ? e.round : lastRound;
        const math = logRollSegments(lang, e);
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
            {math && (
              <div className="log-roll tnum">
                {math.map((seg, i) =>
                  seg.cls ? (
                    <span key={i} className={seg.cls}>
                      {seg.text}
                    </span>
                  ) : (
                    seg.text
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
