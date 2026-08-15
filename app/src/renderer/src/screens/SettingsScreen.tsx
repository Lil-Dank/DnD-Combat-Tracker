import type { AppState, ThemeId } from '../../../shared/types';
import { THEMES } from '../../../shared/types';
import { LANGUAGES, type Lang } from '../../../shared/i18n';
import { api } from '../api';
import { useI18n } from '../i18n';

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
