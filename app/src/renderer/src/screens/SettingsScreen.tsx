import { useState } from 'react';
import type { AppState, KenkuEventId, KenkuSoundRef, ThemeId } from '../../../shared/types';
import { THEMES } from '../../../shared/types';
import { LANGUAGES, type Lang } from '../../../shared/i18n';
import { api } from '../api';
import { useI18n } from '../i18n';
import { useKenkuLibrary } from '../useKenkuLibrary';

const KENKU_EVENTS: KenkuEventId[] = [
  'combatStart',
  'combatEnd',
  'turnChange',
  'damageApplied',
  'healApplied',
  'pcDowned',
  'monsterKilled',
  'attackCrit',
  'attackHit',
  'attackMiss',
];

/** The Kenku FM settings section. */
function KenkuSection({ state }: { state: AppState }) {
  const { t } = useI18n();
  const kenku = state.settings.kenku;
  const { library, refresh } = useKenkuLibrary(kenku.enabled);
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const update = (patch: Partial<typeof kenku>) =>
    void api.updateSettings({ kenku: { ...kenku, ...patch } });

  const setEventSound = (event: KenkuEventId, ref: KenkuSoundRef | null) => {
    const eventSounds = { ...kenku.eventSounds };
    if (ref) eventSounds[event] = ref;
    else delete eventSounds[event];
    update({ eventSounds });
  };

  return (
    <section className="settings-section">
      <h2>{t('kenku.section')}</h2>
      <label className="inline-label checkbox-label">
        <input
          type="checkbox"
          checked={kenku.enabled}
          onChange={(e) => {
            update({ enabled: e.target.checked });
            setTestResult(null);
          }}
        />
        {t('kenku.enable')}
      </label>
      <p className="muted">{t('kenku.outputNote')}</p>

      {kenku.enabled && (
        <>
          <label className="inline-label">
            {t('kenku.address')}
            <input
              type="text"
              defaultValue={kenku.host}
              onBlur={(e) => {
                const host = e.target.value.trim();
                if (host && host !== kenku.host) update({ host });
              }}
            />
            <input
              type="number"
              defaultValue={kenku.port}
              onBlur={(e) => {
                const port = parseInt(e.target.value, 10);
                if (port >= 1 && port <= 65535 && port !== kenku.port) update({ port });
              }}
            />
            <button
              className="btn small"
              onClick={async () => {
                setTestResult(await api.kenkuCheckConnection());
                refresh();
              }}
            >
              {t('kenku.test')}
            </button>
            <span className={`bridge-status ${state.kenkuConnected ? 'on' : ''}`}>
              {(testResult ?? state.kenkuConnected)
                ? `● ${t('kenku.statusConnected')}`
                : `○ ${t('kenku.statusOffline')}`}
            </span>
          </label>

          <h3>{t('kenku.events')}</h3>
          <p className="muted">{t('kenku.eventsNote')}</p>
          {!library && <p className="muted">{t('kenku.offline')}</p>}
          <div className="kenku-events">
            {KENKU_EVENTS.map((event) => {
              const ref = kenku.eventSounds[event];
              return (
                <div key={event} className="kenku-event-row">
                  <span className="kenku-event-label">{t(`kenku.ev.${event}`)}</span>
                  {library ? (
                    <select
                      className="theme-select"
                      value={ref?.soundId ?? ''}
                      onChange={(e) => {
                        const soundId = e.target.value;
                        if (!soundId) {
                          setEventSound(event, null);
                          return;
                        }
                        const sound = library.sounds.find((x) => x.id === soundId);
                        setEventSound(event, {
                          soundId,
                          title: sound?.title ?? soundId,
                          delayMs: ref?.delayMs,
                        });
                      }}
                    >
                      <option value="">{t('kenku.noSound')}</option>
                      {library.soundboards.map((board) => (
                        <optgroup key={board.id} label={board.title}>
                          {board.sounds
                            .map((id) => library.sounds.find((x) => x.id === id))
                            .filter((x): x is NonNullable<typeof x> => Boolean(x))
                            .map((sound) => (
                              <option key={sound.id} value={sound.id}>
                                {sound.title}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <span className="muted">{ref?.title ?? t('kenku.noSound')}</span>
                  )}
                  <input
                    type="number"
                    min={0}
                    placeholder={t('kenku.delay')}
                    title={t('kenku.delay')}
                    className="kenku-delay"
                    defaultValue={ref?.delayMs ?? ''}
                    disabled={!ref}
                    onBlur={(e) => {
                      if (!ref) return;
                      const delayMs = parseInt(e.target.value, 10);
                      setEventSound(event, {
                        ...ref,
                        delayMs: Number.isFinite(delayMs) && delayMs > 0 ? delayMs : undefined,
                      });
                    }}
                  />
                  <button
                    className="btn small"
                    disabled={!ref}
                    title={t('kenku.preview')}
                    onClick={() => ref && void api.kenkuPlaySound(ref.soundId)}
                  >
                    ▶
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export function SettingsScreen({ state }: { state: AppState }) {
  const { t, lang } = useI18n();

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>{t('settings.title')}</h1>
      </header>

      <section className="settings-section">
        <h2>{t('settings.appearance')}</h2>
        <label className="inline-label">
          {t('settings.language')}
          <select
            className="theme-select"
            value={state.settings.language}
            onChange={(e) => void api.updateSettings({ language: e.target.value as Lang })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{t('settings.languageNote')}</p>

        <label className="inline-label">
          {t('settings.theme')}
          <select
            className="theme-select"
            value={state.settings.theme}
            onChange={(e) => void api.updateSettings({ theme: e.target.value as ThemeId })}
          >
            {THEMES.map((th) => (
              <option key={th.id} value={th.id}>
                {th.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{t('settings.themeNote')}</p>
      </section>

      <section className="settings-section">
        <h2>{t('settings.combatScreen')}</h2>
        <label className="inline-label checkbox-label">
          <input
            type="checkbox"
            checked={state.settings.autoOpenAttacks}
            onChange={(e) => void api.updateSettings({ autoOpenAttacks: e.target.checked })}
          />
          {t('settings.autoOpen')}
        </label>
      </section>

      <section className="settings-section">
        <h2>{t('settings.playerView')}</h2>
        <label className="inline-label">
          {t('settings.bgColor')}
          <input
            type="color"
            value={state.settings.playerViewBgColor}
            onChange={(e) => void api.updateSettings({ playerViewBgColor: e.target.value })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>{t('settings.bridge')}</h2>
        <label className="inline-label">
          {t('settings.port')}
          <input
            type="number"
            defaultValue={state.settings.bridgePort}
            onBlur={(e) => {
              const port = parseInt(e.target.value, 10);
              if (port >= 1024 && port <= 65535 && port !== state.settings.bridgePort) {
                void api.updateSettings({ bridgePort: port });
              }
            }}
          />
        </label>
        <p className="muted">
          {t('settings.portNote', {
            status: t(state.bridgeClientCount > 0 ? 'settings.connected' : 'settings.noPlugin'),
          })}
        </p>
      </section>

      <KenkuSection state={state} />

      <section className="settings-section">
        <h2>{t('settings.about')}</h2>
        <p>
          {t('settings.credits')}{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC-BY-4.0
          </a>
          {t('settings.creditsDataset')}
        </p>
        {lang === 'de' && <p className="muted">{t('settings.creditsNote')}</p>}
      </section>
    </div>
  );
}
