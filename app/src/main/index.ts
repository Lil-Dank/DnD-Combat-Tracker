import { app, BrowserWindow } from 'electron';
import { cpSync, existsSync } from 'fs';
import * as path from 'path';
import { store } from './state';
import { registerIpc, broadcastPlayerViewStatus } from './ipc';
import { createDmWindow, initWindowState, onPlayerViewChanged } from './windows';
import { startBridge } from './bridge';
import { startPlayerServer, stopPlayerServer } from './playerServer';
import { loadGermanMonsterNames } from './srd';
import { handleCombatEvent, startKenkuStatusPolling } from './kenku';
import { setMonsterNameMap } from '../shared/i18n';

/**
 * One-time data migration for the Deck of Many Turns rebrand: the package
 * name changed, so userData moved from %APPDATA%/dnd-combat-tracker. Copy
 * (never move — the old folder stays as a backup) exactly once, only when
 * the new location has no data yet.
 */
function migrateLegacyUserData(userData: string): void {
  const newData = path.join(userData, 'data');
  const legacyData = path.join(app.getPath('appData'), 'dnd-combat-tracker', 'data');
  if (existsSync(newData) || !existsSync(legacyData)) return;
  try {
    cpSync(legacyData, newData, { recursive: true });
    console.log(`Migrated user data from ${legacyData} to ${newData}`);
  } catch (err) {
    console.error('User-data migration failed; starting fresh', err);
  }
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  migrateLegacyUserData(userData);
  await store.init(userData);
  await initWindowState(userData);
  const l10nDe = await loadGermanMonsterNames();
  setMonsterNameMap(l10nDe);
  await store.backfillMonsterL10n(l10nDe);
  registerIpc();
  onPlayerViewChanged(() => broadcastPlayerViewStatus());
  startBridge();
  startPlayerServer(userData);
  store.onCombatEvent(handleCombatEvent);
  startKenkuStatusPolling();
  createDmWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDmWindow();
  });
});

app.on('window-all-closed', () => {
  stopPlayerServer();
  app.quit();
});
