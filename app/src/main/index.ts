import { app, BrowserWindow } from 'electron';
import { store } from './state';
import { registerIpc, broadcastPlayerViewStatus } from './ipc';
import { createDmWindow, initWindowState, onPlayerViewChanged } from './windows';
import { startBridge } from './bridge';
import { loadGermanMonsterNames } from './srd';
import { handleCombatEvent, startKenkuStatusPolling } from './kenku';
import { setMonsterNameMap } from '../shared/i18n';

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  await store.init(userData);
  await initWindowState(userData);
  const l10nDe = await loadGermanMonsterNames();
  setMonsterNameMap(l10nDe);
  await store.backfillMonsterL10n(l10nDe);
  registerIpc();
  onPlayerViewChanged(() => broadcastPlayerViewStatus());
  startBridge();
  store.onCombatEvent(handleCombatEvent);
  startKenkuStatusPolling();
  createDmWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDmWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
