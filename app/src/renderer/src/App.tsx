import { useEffect, useState } from 'react';
import type { AppState } from '../../shared/types';
import { api } from './api';
import { PcScreen } from './screens/PcScreen';
import { MonsterScreen } from './screens/MonsterScreen';
import { TemplatesScreen } from './screens/TemplatesScreen';
import { CombatScreen } from './screens/CombatScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ArchiveScreen } from './screens/ArchiveScreen';
import { PlayerView } from './screens/PlayerView';
import { ConfirmProvider } from './Confirm';
import { I18nProvider } from './i18n';
import { KenkuSoundboardModal } from './KenkuSoundboardModal';
import { PlayerWebQrModal } from './PlayerWebQrModal';
import { PlayerSaveModal } from './PlayerSaveModal';
import type { PlayerSavePendingInfo } from '../../preload/index';
import { translate } from '../../shared/i18n';

type Tab = 'combat' | 'pcs' | 'monsters' | 'templates' | 'archive' | 'settings';

const TABS: { id: Tab; key: string }[] = [
  { id: 'combat', key: 'nav.combat' },
  { id: 'pcs', key: 'nav.party' },
  { id: 'monsters', key: 'nav.monsters' },
  { id: 'templates', key: 'nav.encounters' },
  { id: 'archive', key: 'nav.archive' },
  { id: 'settings', key: 'nav.settings' },
];

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>('combat');
  const [playerViewOpen, setPlayerViewOpen] = useState(false);
  const [combatTemplateId, setCombatTemplateId] = useState<string | null>(null);
  const [showSoundboard, setShowSoundboard] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [pendingSave, setPendingSave] = useState<PlayerSavePendingInfo | null>(null);
  const isPlayerView = window.location.hash.replace('#', '') === 'player';
  const lang = state?.settings.language ?? 'en';

  useEffect(() => {
    // The page <title> overrides the BrowserWindow title, so distinguish the
    // Player View here (helps OBS window capture tell the two apart).
    if (isPlayerView) document.title = translate(lang, 'app.playerViewTitle');
  }, [isPlayerView, lang]);

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
    // A phone launched a save-based attack: the DM adjudicates in a modal.
    const offSave = api.onPlayerSavePending((pending) => {
      if (!isPlayerView) {
        setPendingSave(pending);
        setTab('combat');
      }
    });
    return () => {
      mounted = false;
      off();
      offPv();
      offFocus();
      offSave();
    };
  }, []);

  if (!state) return <div className="loading">{translate(lang, 'app.loading')}</div>;

  if (isPlayerView) {
    return (
      <I18nProvider lang={lang}>
        <PlayerView state={state} />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider lang={lang}>
    <ConfirmProvider cancelLabel={translate(lang, 'common.cancel')}>
    <div className="app">
      <nav className="sidebar">
        <div className="app-title">
          <span className="app-title-icon">🎲</span>
          <span>{translate(lang, 'app.title')}</span>
        </div>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-btn ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {translate(lang, t.key)}
          </button>
        ))}
        <div className="sidebar-footer">
          {state.settings.kenku.enabled && (
            <button className="nav-btn" onClick={() => setShowSoundboard(true)}>
              {'🎵 '}
              {translate(lang, 'kenku.soundboard')}
            </button>
          )}
          {state.settings.playerWeb.enabled && (
            <button className="nav-btn" onClick={() => setShowQr(true)}>
              {'📱 '}
              {translate(lang, 'pw.qrButton')}
            </button>
          )}
          <button
            className={`nav-btn pv-toggle ${playerViewOpen ? 'active' : ''}`}
            onClick={() => void api.togglePlayerView()}
          >
            🖥 {translate(lang, playerViewOpen ? 'nav.closePlayerView' : 'nav.openPlayerView')}
          </button>
          {playerViewOpen && (
            <button className="nav-btn" onClick={() => void api.togglePlayerFullscreen()}>
              {translate(lang, 'nav.fullscreen')}
            </button>
          )}
          <div className={`bridge-status ${state.bridgeClientCount > 0 ? 'on' : ''}`}>
            {translate(lang, state.bridgeClientCount > 0 ? 'nav.deckConnected' : 'nav.deckOffline')}
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
        {tab === 'archive' && <ArchiveScreen />}
        {tab === 'settings' && <SettingsScreen state={state} />}
        {showSoundboard && <KenkuSoundboardModal onClose={() => setShowSoundboard(false)} />}
        {showQr && <PlayerWebQrModal onClose={() => setShowQr(false)} />}
        {pendingSave && (
          <PlayerSaveModal
            state={state}
            pending={pendingSave}
            onClose={() => setPendingSave(null)}
          />
        )}
      </main>
    </div>
    </ConfirmProvider>
    </I18nProvider>
  );
}
