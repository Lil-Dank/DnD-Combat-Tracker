import { useEffect, useState } from 'react';
import type { AppState } from '../../shared/types';
import { api } from './api';
import { PcScreen } from './screens/PcScreen';
import { MonsterScreen } from './screens/MonsterScreen';
import { TemplatesScreen } from './screens/TemplatesScreen';
import { CombatScreen } from './screens/CombatScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PlayerView } from './screens/PlayerView';
import { ConfirmProvider } from './Confirm';

type Tab = 'combat' | 'pcs' | 'monsters' | 'templates' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'combat', label: '⚔ Combat' },
  { id: 'pcs', label: '🛡 Party' },
  { id: 'monsters', label: '🐉 Monsters' },
  { id: 'templates', label: '📜 Encounters' },
  { id: 'settings', label: '⚙ Settings' },
];

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>('combat');
  const [playerViewOpen, setPlayerViewOpen] = useState(false);
  const [combatTemplateId, setCombatTemplateId] = useState<string | null>(null);
  const isPlayerView = window.location.hash.replace('#', '') === 'player';

  useEffect(() => {
    // The page <title> overrides the BrowserWindow title, so distinguish the
    // Player View here (helps OBS window capture tell the two apart).
    if (isPlayerView) document.title = 'D&D Combat Tracker - Player View';
  }, [isPlayerView]);

  useEffect(() => {
    // Theme presets swap the CSS variables via this attribute (DM window UI
    // only — the Player View has its own fixed styling + background color).
    if (state) document.documentElement.dataset.theme = state.settings.theme;
  }, [state?.settings.theme]);

  useEffect(() => {
    let mounted = true;
    api.getState().then((s) => {
      if (mounted) setState(s);
    });
    api.getPlayerViewOpen().then((open) => {
      if (mounted) setPlayerViewOpen(open);
    });
    const off = api.onState(setState);
    const offPv = api.onPlayerViewOpen(setPlayerViewOpen);
    // A Stream Deck press pulls the DM window to the Combat screen.
    const offFocus = api.onFocusCombat(() => {
      if (!isPlayerView) setTab('combat');
    });
    return () => {
      mounted = false;
      off();
      offPv();
      offFocus();
    };
  }, []);

  if (!state) return <div className="loading">Loading…</div>;

  if (isPlayerView) {
    return <PlayerView state={state} />;
  }

  return (
    <ConfirmProvider>
    <div className="app">
      <nav className="sidebar">
        <div className="app-title">
          <span className="app-title-icon">🎲</span>
          <span>Combat Tracker</span>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <button
            className={`nav-btn pv-toggle ${playerViewOpen ? 'active' : ''}`}
            onClick={() => void api.togglePlayerView()}
          >
            🖥 {playerViewOpen ? 'Close Player View' : 'Open Player View'}
          </button>
          {playerViewOpen && (
            <button className="nav-btn" onClick={() => void api.togglePlayerFullscreen()}>
              ⛶ Fullscreen
            </button>
          )}
          <div className={`bridge-status ${state.bridgeClientCount > 0 ? 'on' : ''}`}>
            {state.bridgeClientCount > 0 ? '● Stream Deck connected' : '○ Stream Deck offline'}
          </div>
        </div>
      </nav>
      <main className="content">
        {tab === 'pcs' && <PcScreen state={state} />}
        {tab === 'monsters' && <MonsterScreen state={state} />}
        {tab === 'templates' && (
          <TemplatesScreen
            state={state}
            onStartCombat={(templateId) => {
              setCombatTemplateId(templateId);
              setTab('combat');
            }}
          />
        )}
        {tab === 'combat' && <CombatScreen state={state} preselectedTemplateId={combatTemplateId} />}
        {tab === 'settings' && <SettingsScreen state={state} />}
      </main>
    </div>
    </ConfirmProvider>
  );
}
