import { ipcMain } from 'electron';
import { store } from './state';
import * as kenku from './kenku';
import { importSrdMonsters } from './srd';
import { onBridgeCommand } from './bridge';
import {
  getAllWindows,
  isPlayerViewOpen,
  togglePlayerFullscreen,
  togglePlayerView,
} from './windows';

export function registerIpc(): void {
  ipcMain.handle('getState', () => store.getState());
  ipcMain.handle('getPlayerViewOpen', () => isPlayerViewOpen());

  ipcMain.handle('pc:save', (_e, pc) => store.savePc(pc));
  ipcMain.handle('pc:delete', (_e, id) => store.deletePc(id));

  ipcMain.handle('monster:save', (_e, m) => store.saveMonster(m));
  ipcMain.handle('monster:delete', (_e, id) => store.deleteMonster(id));
  ipcMain.handle('monster:importSrd', () => importSrdMonsters());

  ipcMain.handle('template:save', (_e, t) => store.saveTemplate(t));
  ipcMain.handle('template:delete', (_e, id) => store.deleteTemplate(id));
  ipcMain.handle('template:duplicate', (_e, id) => store.duplicateTemplate(id));

  ipcMain.handle('combat:startSetup', (_e, { templateId, pcIds, rollMode }) =>
    store.startCombatSetup(templateId, pcIds, rollMode),
  );
  ipcMain.handle('combat:setInitiative', (_e, { combatantId, value }) =>
    store.setInitiative(combatantId, value),
  );
  ipcMain.handle('combat:reroll', (_e, id) => store.rerollInitiative(id));
  ipcMain.handle('combat:reorder', (_e, { fromIndex, toIndex }) =>
    store.reorderCombatant(fromIndex, toIndex),
  );
  ipcMain.handle('combat:begin', () => store.beginCombat());
  ipcMain.handle('combat:end', () => store.endCombat());
  ipcMain.handle('combat:nextTurn', () => store.nextTurn());
  ipcMain.handle('combat:prevTurn', () => store.prevTurn());
  ipcMain.handle('combat:damage', (_e, { combatantId, amount }) =>
    store.applyDamage(combatantId, amount),
  );
  ipcMain.handle('combat:heal', (_e, { combatantId, amount }) =>
    store.applyHeal(combatantId, amount),
  );
  ipcMain.handle('combat:toggleCondition', (_e, { combatantId, condition }) =>
    store.toggleCondition(combatantId, condition),
  );
  ipcMain.handle('combat:removeCombatant', (_e, id) => store.removeCombatant(id));
  ipcMain.handle('combat:addMonster', (_e, { monsterTemplateId, quantity }) =>
    store.addMonsterToCombat(monsterTemplateId, quantity),
  );

  ipcMain.handle('settings:update', (_e, patch) => store.updateSettings(patch));

  ipcMain.handle('playerView:toggle', () => togglePlayerView());
  ipcMain.handle('playerView:fullscreen', () => togglePlayerFullscreen());

  // ---- Kenku FM ----
  ipcMain.handle('kenku:getLibrary', () => kenku.getLibrary());
  ipcMain.handle('kenku:playSound', (_e, id: string) => kenku.playSound(id));
  ipcMain.handle('kenku:stopSound', (_e, id: string) => kenku.stopSound(id));
  ipcMain.handle('kenku:stopAll', () => kenku.stopAllSounds());
  ipcMain.handle('kenku:soundPlayback', () => kenku.getSoundboardPlayback());
  ipcMain.handle('kenku:checkConnection', async () => {
    const ok = await kenku.checkConnection();
    store.setKenkuConnected(store.getState().settings.kenku.enabled && ok);
    return ok;
  });
  ipcMain.handle('kenku:attackEvent', (_e, payload: kenku.AttackEventPayload) =>
    kenku.handleAttackEvent(payload),
  );

  // Push every state change to all open windows.
  store.onChange((state) => {
    for (const win of getAllWindows()) {
      win.webContents.send('state', state);
    }
  });

  // A Stream Deck press means the DM is running combat — switch the DM
  // window to the Combat screen if it's showing something else.
  onBridgeCommand(() => {
    for (const win of getAllWindows()) {
      win.webContents.send('focusCombat');
    }
  });
}

/** Let windows know when the Player View opens/closes (button label state). */
export function broadcastPlayerViewStatus(): void {
  for (const win of getAllWindows()) {
    win.webContents.send('playerViewOpen', isPlayerViewOpen());
  }
}
