import type { AppState, ThemeId } from '../../../shared/types';
import { THEMES } from '../../../shared/types';
import { api } from '../api';

export function SettingsScreen({ state }: { state: AppState }) {
  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Settings</h1>
      </header>

      <section className="settings-section">
        <h2>Appearance</h2>
        <label className="inline-label">
          Theme
          <select
            className="theme-select"
            value={state.settings.theme}
            onChange={(e) => void api.updateSettings({ theme: e.target.value as ThemeId })}
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">Applies to the DM window. The Player View keeps its own look.</p>
      </section>

      <section className="settings-section">
        <h2>DM Combat Screen</h2>
        <label className="inline-label checkbox-label">
          <input
            type="checkbox"
            checked={state.settings.autoOpenAttacks}
            onChange={(e) => void api.updateSettings({ autoOpenAttacks: e.target.checked })}
          />
          Automatically open the attack quick reference for the monster whose turn it is
        </label>
      </section>

      <section className="settings-section">
        <h2>Player View</h2>
        <label className="inline-label">
          Background color
          <input
            type="color"
            value={state.settings.playerViewBgColor}
            onChange={(e) => void api.updateSettings({ playerViewBgColor: e.target.value })}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2>Stream Deck bridge</h2>
        <label className="inline-label">
          WebSocket port
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
          Default 57321. Change only on a port conflict, and set the same port in the Stream
          Deck plugin settings. Status: {state.bridgeClientCount > 0 ? 'connected' : 'no plugin connected'}.
        </p>
      </section>

      <section className="settings-section">
        <h2>About / Credits</h2>
        <p>
          Monster data: <strong>SRD 5.2.1</strong> by Wizards of the Coast, licensed under{' '}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC-BY-4.0
          </a>
          . Dataset: 5e-bits/5e-database (2025 SRD files).
        </p>
      </section>
    </div>
  );
}
