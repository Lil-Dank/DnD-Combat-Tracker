import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppState,
  ArchivedCombat,
  Condition,
  EncounterTemplate,
  MonsterAction,
  MonsterTemplate,
  PC,
  Settings,
} from '../shared/types';

/** A phone-initiated save-based attack awaiting DM adjudication. */
export interface PlayerSavePendingInfo {
  id: string;
  actorName: string;
  attackName: string;
  ability: string;
  dc: number;
  damage: number;
  targetIds: string[];
}

const api = {
  getState: (): Promise<AppState> => ipcRenderer.invoke('getState'),
  getPlayerViewOpen: (): Promise<boolean> => ipcRenderer.invoke('getPlayerViewOpen'),
  onState: (cb: (state: AppState) => void): (() => void) => {
    const handler = (_e: unknown, state: AppState) => cb(state);
    ipcRenderer.on('state', handler);
    return () => ipcRenderer.removeListener('state', handler);
  },
  onPlayerViewOpen: (cb: (open: boolean) => void): (() => void) => {
    const handler = (_e: unknown, open: boolean) => cb(open);
    ipcRenderer.on('playerViewOpen', handler);
    return () => ipcRenderer.removeListener('playerViewOpen', handler);
  },
  /** Fired when the Stream Deck sends a command; used to show the Combat tab. */
  onFocusCombat: (cb: () => void): (() => void) => {
    const handler = () => cb();
    ipcRenderer.on('focusCombat', handler);
    return () => ipcRenderer.removeListener('focusCombat', handler);
  },

  savePc: (pc: Omit<PC, 'id'> & { id?: string }) => ipcRenderer.invoke('pc:save', pc),
  deletePc: (id: string) => ipcRenderer.invoke('pc:delete', id),
  savePcAttack: (pcId: string, action: MonsterAction) =>
    ipcRenderer.invoke('pc:saveAttack', { pcId, action }),
  deletePcAttack: (pcId: string, actionId: string) =>
    ipcRenderer.invoke('pc:deleteAttack', { pcId, actionId }),

  saveMonster: (m: Omit<MonsterTemplate, 'id'> & { id?: string }) =>
    ipcRenderer.invoke('monster:save', m),
  deleteMonster: (id: string) => ipcRenderer.invoke('monster:delete', id),
  importSrd: (): Promise<{ imported: number }> => ipcRenderer.invoke('monster:importSrd'),

  saveTemplate: (t: Omit<EncounterTemplate, 'id'> & { id?: string }) =>
    ipcRenderer.invoke('template:save', t),
  deleteTemplate: (id: string) => ipcRenderer.invoke('template:delete', id),
  duplicateTemplate: (id: string) => ipcRenderer.invoke('template:duplicate', id),

  startCombatSetup: (templateId: string, pcIds: string[], rollMode: 'all' | 'monstersOnly') =>
    ipcRenderer.invoke('combat:startSetup', { templateId, pcIds, rollMode }),
  setInitiative: (combatantId: string, value: number | null) =>
    ipcRenderer.invoke('combat:setInitiative', { combatantId, value }),
  rerollInitiative: (id: string) => ipcRenderer.invoke('combat:reroll', id),
  reorderCombatant: (fromIndex: number, toIndex: number) =>
    ipcRenderer.invoke('combat:reorder', { fromIndex, toIndex }),
  beginCombat: () => ipcRenderer.invoke('combat:begin'),
  endCombat: () => ipcRenderer.invoke('combat:end'),
  nextTurn: () => ipcRenderer.invoke('combat:nextTurn'),
  prevTurn: () => ipcRenderer.invoke('combat:prevTurn'),
  applyDamage: (
    combatantId: string,
    amount: number,
    ctx?: {
      actorName?: string;
      actorType?: 'pc' | 'monster';
      math?: string;
      mathTypes?: (string | null)[];
    },
  ) => ipcRenderer.invoke('combat:damage', { combatantId, amount, ctx }),
  applyHeal: (combatantId: string, amount: number) =>
    ipcRenderer.invoke('combat:heal', { combatantId, amount }),
  toggleCondition: (combatantId: string, condition: Condition) =>
    ipcRenderer.invoke('combat:toggleCondition', { combatantId, condition }),
  removeCombatant: (id: string) => ipcRenderer.invoke('combat:removeCombatant', id),
  addMonsterToCombat: (monsterTemplateId: string, quantity: number) =>
    ipcRenderer.invoke('combat:addMonster', { monsterTemplateId, quantity }),

  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('settings:update', patch),

  // ---- Kenku FM (audio plays through Kenku; these only talk to its remote) ----
  kenkuGetLibrary: (): Promise<import('../main/kenku').KenkuLibrary | null> =>
    ipcRenderer.invoke('kenku:getLibrary'),
  kenkuPlaySound: (id: string): Promise<boolean> => ipcRenderer.invoke('kenku:playSound', id),
  kenkuStopSound: (id: string): Promise<boolean> => ipcRenderer.invoke('kenku:stopSound', id),
  kenkuStopAll: (): Promise<void> => ipcRenderer.invoke('kenku:stopAll'),
  kenkuSoundPlayback: (): Promise<{ sounds: Array<{ id: string }> } | null> =>
    ipcRenderer.invoke('kenku:soundPlayback'),
  kenkuCheckConnection: (): Promise<boolean> => ipcRenderer.invoke('kenku:checkConnection'),
  kenkuAttackEvent: (
    payload: import('../main/kenku').AttackEventPayload & {
      /** Optional attack-roll details for the combat log (verdict phases). */
      roll?: import('../main/combatLog').AttackRollDetails;
    },
  ): Promise<void> => ipcRenderer.invoke('kenku:attackEvent', payload),
  togglePlayerView: () => ipcRenderer.invoke('playerView:toggle'),
  togglePlayerFullscreen: () => ipcRenderer.invoke('playerView:fullscreen'),

  // ---- Player web companion ----
  getPlayerWebQr: (): Promise<{
    urls: string[];
    port: number;
    error: string | null;
    dataUrls: string[];
  }> => ipcRenderer.invoke('playerWeb:getQr'),
  kickPlayer: (pcId: string): Promise<void> => ipcRenderer.invoke('playerWeb:kick', pcId),
  resolvePlayerSave: (
    id: string,
    results: Array<{ targetId: string; saved: boolean; total?: number }>,
  ): Promise<void> => ipcRenderer.invoke('playerWeb:resolveSave', { id, results }),
  dismissPlayerSave: (id: string): Promise<void> => ipcRenderer.invoke('playerWeb:dismissSave', id),
  onPlayerSavePending: (cb: (pending: PlayerSavePendingInfo) => void): (() => void) => {
    const handler = (_e: unknown, pending: PlayerSavePendingInfo) => cb(pending);
    ipcRenderer.on('playerSavePending', handler);
    return () => ipcRenderer.removeListener('playerSavePending', handler);
  },

  // ---- Combat archive ----
  listArchive: (): Promise<ArchivedCombat[]> => ipcRenderer.invoke('archive:list'),
  deleteArchivedCombat: (id: string): Promise<void> => ipcRenderer.invoke('archive:delete', id),

  // ---- Campaigns ----
  createCampaign: (name: string): Promise<string> => ipcRenderer.invoke('campaign:create', { name }),
  switchCampaign: (id: string): Promise<void> => ipcRenderer.invoke('campaign:switch', { id }),
  renameCampaign: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke('campaign:rename', { id, name }),
  deleteCampaign: (id: string): Promise<boolean> => ipcRenderer.invoke('campaign:delete', { id }),
};

export type Api = typeof api;

contextBridge.exposeInMainWorld('api', api);
