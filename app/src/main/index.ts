import { app, BrowserWindow } from 'electron';
import { store } from './state';
import { registerIpc, broadcastPlayerViewStatus } from './ipc';
import { createDmWindow, initWindowState, onPlayerViewChanged } from './windows';
import { startBridge } from './bridge';
import { loadGermanMonsterNames } from './srd';
import { setMonsterNameMap } from '../shared/i18n';

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  await store.init(userData);
  await initWindowState(userData);
  setMonsterNameMap(await loadGermanMonsterNames());
  registerIpc();
  onPlayerViewChanged(() => broadcastPlayerViewStatus());
  startBridge();
  createDmWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createDmWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
