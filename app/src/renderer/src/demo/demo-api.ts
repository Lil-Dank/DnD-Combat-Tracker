/**
 * Browser stand-in for the Electron main process, powering the GitHub Pages
 * demo. Activated only when `window.api` is absent (i.e. not running inside
 * Electron): implements the full preload Api against in-memory state that is
 * persisted to localStorage and synced across tabs with a BroadcastChannel,
 * so the Player View works as a second browser tab.
 *
 * The combat rules mirror app/src/main/state.ts exactly — sort order, monster
 * removal at 0 HP, round wrapping, instance numbering. If those semantics
 * change there, change them here too.
 *
 * It also exposes `window.__demo` for the simulated Stream Deck: the same
 * state message the real bridge would push over the WebSocket, and a command
 * sink accepting the same command set.
 */
import type {
  AppState,
  Combat,
  Combatant,
  Condition,
  EncounterTemplate,
  MonsterTemplate,
  PC,
  Settings,
} from '../../../shared/types';
import { DEFAULT_SETTINGS } from '../../../shared/types';
import {
  abilityCodeLabel,
  monsterName,
  type MonsterL10n,
} from '../../../shared/i18n';
import type { Api } from '../../../preload/index';
import monstersDe from '../../../../resources/srd/monsters.de.json';

const LS_KEY = 'dnd-combat-tracker-demo-v1';
const uuid = () => crypto.randomUUID();
const d20 = () => 1 + Math.floor(Math.random() * 20);

interface DemoData {
  pcs: PC[];
  monsters: MonsterTemplate[];
  templates: EncounterTemplate[];
  settings: Settings;
  combat: Combat | null;
  seeded: boolean;
}

interface BridgeCommand {
  type: string;
  actorId?: string;
  amount?: number;
  condition?: string;
}

export function createDemoApi(): Api {
  let data: DemoData = load() ?? {
    pcs: [],
    monsters: [],
    templates: [],
    settings: { ...DEFAULT_SETTINGS },
    combat: null,
    seeded: false,
  };

  const stateListeners = new Set<(s: AppState) => void>();
  const pvListeners = new Set<(open: boolean) => void>();
  const focusListeners = new Set<() => void>();
  const channel = new BroadcastChannel('dnd-demo');
  let pvWindow: Window | null = null;

  function load(): DemoData | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as DemoData) : null;
    } catch {
      return null;
    }
  }

  function appState(): AppState {
    return {
      pcs: [...data.pcs].sort((a, b) => a.name.localeCompare(b.name)),
      monsters: [...data.monsters].sort((a, b) => a.name.localeCompare(b.name)),
      encounterTemplates: [...data.templates].sort((a, b) => a.name.localeCompare(b.name)),
      combat: data.combat,
      settings: data.settings,
      // The simulated deck on this page counts as a connected client.
      bridgeClientCount: 1,
      // Kenku FM is a desktop-app integration; the browser demo hides it.
      kenkuConnected: false,
    };
  }

  function notify(): void {
    const s = appState();
    for (const cb of stateListeners) cb(s);
  }

  function save(broadcast = true): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: the demo keeps working in-memory.
    }
    notify();
    if (broadcast) channel.postMessage('sync');
  }

  channel.addEventListener('message', (ev) => {
    if (ev.data === 'sync') {
      const fresh = load();
      if (fresh) {
        data = fresh;
        notify();
      }
    } else if (ev.data === 'pv-fullscreen') {
      if (location.hash.replace('#', '') === 'player') {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    }
  });

  // ---- combat helpers, mirroring main/state.ts --------------------------------

  function sortCombatants(combat: Combat): void {
    combat.combatants.sort((a, b) => {
      if (a.initiative === null && b.initiative === null) return 0;
      if (a.initiative === null) return 1;
      if (b.initiative === null) return -1;
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.initMod - a.initMod;
    });
  }

  function combatantFrom(m: MonsterTemplate, displayName: string): Combatant {
    return {
      id: uuid(),
      displayName,
      type: 'monster',
      sourceId: m.id,
      maxHp: m.maxHp,
      currentHp: m.maxHp,
      ac: m.ac,
      initMod: m.initMod,
      abilities: m.abilities ?? null,
      attacks: m.attacks.map((a) => ({ ...a })),
      conditions: [],
      initiative: d20() + m.initMod,
      isDowned: false,
    };
  }

  function applyDamage(combatantId: string, amount: number): void {
    const combat = data.combat;
    if (!combat || amount <= 0) return;
    const idx = combat.combatants.findIndex((c) => c.id === combatantId);
    if (idx === -1) return;
    const c = combat.combatants[idx];
    c.currentHp = Math.max(0, c.currentHp - amount);
    if (c.currentHp === 0) {
      if (c.type === 'monster') {
        combat.combatants.splice(idx, 1);
        if (combat.combatants.length === 0) {
          combat.currentIndex = 0;
        } else if (idx < combat.currentIndex) {
          combat.currentIndex -= 1;
        } else if (idx === combat.currentIndex && combat.currentIndex >= combat.combatants.length) {
          combat.currentIndex = 0;
          if (combat.phase === 'active') combat.round += 1;
        }
      } else {
        c.isDowned = true;
      }
    }
    save();
  }

  function applyHeal(combatantId: string, amount: number): void {
    const combat = data.combat;
    if (!combat || amount <= 0) return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    c.currentHp = Math.min(c.maxHp, c.currentHp + amount);
    if (c.currentHp > 0) c.isDowned = false;
    save();
  }

  function toggleCondition(combatantId: string, condition: Condition): void {
    const combat = data.combat;
    if (!combat) return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    c.conditions = c.conditions.includes(condition)
      ? c.conditions.filter((x) => x !== condition)
      : [...c.conditions, condition];
    save();
  }

  function nextTurn(): void {
    const combat = data.combat;
    if (!combat || combat.phase !== 'active' || combat.combatants.length === 0) return;
    combat.currentIndex += 1;
    if (combat.currentIndex >= combat.combatants.length) {
      combat.currentIndex = 0;
      combat.round += 1;
    }
    save();
  }

  function prevTurn(): void {
    const combat = data.combat;
    if (!combat || combat.phase !== 'active' || combat.combatants.length === 0) return;
    if (combat.currentIndex === 0) {
      if (combat.round <= 1) return;
      combat.currentIndex = combat.combatants.length - 1;
      combat.round -= 1;
    } else {
      combat.currentIndex -= 1;
    }
    save();
  }

  // ---- SRD import -------------------------------------------------------------

  async function importSrd(): Promise<{ imported: number }> {
    const res = await fetch('srd/monsters.json');
    const bundled = (await res.json()) as Array<
      Omit<MonsterTemplate, 'id' | 'source' | 'l10n'>
    >;
    const l10nDe = monstersDe as unknown as Record<string, MonsterL10n>;
    const existingByName = new Map(
      data.monsters.filter((m) => m.source === 'srd').map((m) => [m.name.toLowerCase(), m.id]),
    );
    const imported: MonsterTemplate[] = bundled.map((m) => ({
      ...m,
      id: existingByName.get(m.name.toLowerCase()) ?? uuid(),
      source: 'srd',
      l10n: l10nDe[m.name] ? { de: l10nDe[m.name] } : null,
    }));
    const manual = data.monsters.filter((m) => m.source !== 'srd');
    data.monsters = [...manual, ...imported];
    save();
    return { imported: imported.length };
  }

  // ---- demo seed --------------------------------------------------------------

  async function seed(): Promise<void> {
    if (data.seeded) return;
    await importSrd();

    for (const p of [
      { name: 'Aria Windwhisper', maxHp: 38, ac: 15, initMod: 3 },
      { name: 'Thorin Oakenshield', maxHp: 52, ac: 18, initMod: 0 },
      { name: 'Bartholomew Quill', maxHp: 31, ac: 13, initMod: 2 },
      { name: 'Seraphina Dawnbringer', maxHp: 45, ac: 17, initMod: 1 },
    ]) {
      data.pcs.push({ id: uuid(), ...p });
    }

    const byName = (n: string) => data.monsters.find((m) => m.name === n);
    const tpl = (name: string, entries: Array<[string, number]>): void => {
      const resolved = entries
        .map(([n, q]) => ({ monsterTemplateId: byName(n)?.id ?? '', quantity: q }))
        .filter((e) => e.monsterTemplateId !== '');
      data.templates.push({ id: uuid(), name, entries: resolved });
    };
    tpl('Ambush on the Old Road', [
      ['Goblin Warrior', 4],
      ['Worg', 2],
      ['Bugbear Warrior', 1],
    ]);
    tpl("Dragon's Lair", [
      ['Adult Black Dragon', 1],
      ['Kobold Warrior', 4],
    ]);
    tpl('Owlbear Den', [['Owlbear', 2]]);

    // A combat already in progress, so the first thing a visitor sees is the
    // tracker doing its job rather than an empty screen.
    const ambush = data.templates[0];
    const combatants: Combatant[] = [];
    for (const entry of ambush.entries) {
      const m = data.monsters.find((x) => x.id === entry.monsterTemplateId);
      if (!m) continue;
      for (let i = 1; i <= entry.quantity; i++) {
        combatants.push(combatantFrom(m, entry.quantity > 1 ? `${m.name} ${i}` : m.name));
      }
    }
    for (const pc of data.pcs) {
      combatants.push({
        id: uuid(),
        displayName: pc.name,
        type: 'pc',
        sourceId: pc.id,
        maxHp: pc.maxHp,
        currentHp: pc.maxHp,
        ac: pc.ac,
        initMod: pc.initMod,
        abilities: null,
        attacks: [],
        conditions: [],
        initiative: d20() + pc.initMod,
        isDowned: false,
      });
    }
    const combat: Combat = {
      id: uuid(),
      sourceTemplateId: ambush.id,
      phase: 'setup',
      combatants,
      currentIndex: 0,
      round: 0,
    };
    sortCombatants(combat);
    combat.phase = 'active';
    combat.round = 2;
    data.combat = combat;

    // Mid-fight state: a bloodied monster, a hurt PC, a couple of conditions.
    const monsters = combat.combatants.filter((c) => c.type === 'monster');
    const pcs = combat.combatants.filter((c) => c.type === 'pc');
    if (monsters[0]) monsters[0].currentHp = Math.max(1, Math.ceil(monsters[0].maxHp * 0.35));
    if (monsters[1]) monsters[1].conditions = ['Prone'];
    if (pcs[0]) pcs[0].currentHp = Math.max(1, pcs[0].maxHp - 19);
    if (pcs[1]) pcs[1].conditions = ['Poisoned'];
    // Land the pointer on a monster so the quick reference is open on arrival.
    const monsterIdx = combat.combatants.findIndex((c) => c.type === 'monster');
    if (monsterIdx >= 0) combat.currentIndex = monsterIdx;

    data.seeded = true;
    save();
  }

  const ready: Promise<void> = data.seeded ? Promise.resolve() : seed().catch(() => {});

  // ---- Player View window handling -------------------------------------------

  function pvOpen(): boolean {
    return pvWindow !== null && !pvWindow.closed;
  }
  setInterval(() => {
    if (pvWindow && pvWindow.closed) {
      pvWindow = null;
      for (const cb of pvListeners) cb(false);
    }
  }, 1000);

  // ---- the simulated Stream Deck hooks ----------------------------------------

  function bridgeState(): object {
    const combat = data.combat;
    const active = combat !== null && combat.phase === 'active';
    const lang = data.settings.language;
    const templates = new Map(data.monsters.map((m) => [m.id, m]));
    return {
      type: 'state',
      language: lang,
      combatants: active
        ? combat.combatants.map((c, i) => ({
            id: c.id,
            displayName: monsterName(lang, c.displayName),
            currentHp: c.currentHp,
            maxHp: c.maxHp,
            ac: c.ac,
            isCurrentTurn: i === combat.currentIndex,
            isDowned: c.isDowned,
            conditions: c.conditions,
            attacks: c.attacks
              .filter((a) => a.type === 'attack' || (a.type === 'save' && a.onHit.damage.length > 0))
              .map((a) => ({
                id: a.id,
                name:
                  (lang === 'de' &&
                    templates.get(c.sourceId)?.l10n?.de?.actions[a.name]?.name) ||
                  a.name,
                toHit: a.attack?.toHit ?? null,
                save: a.save
                  ? `${abilityCodeLabel(lang, a.save.ability)} ${a.save.dc}`
                  : null,
                damage: a.onHit.damage.map((d) => ({
                  dice: d.dice,
                  average: d.average,
                  type: d.type,
                  condition: d.condition,
                })),
              })),
          }))
        : [],
      currentIndex: active ? combat.currentIndex : 0,
      round: active ? combat.round : 0,
    };
  }

  function command(cmd: BridgeCommand): void {
    switch (cmd.type) {
      case 'nextTurn':
        nextTurn();
        break;
      case 'prevTurn':
        prevTurn();
        break;
      case 'endCombat':
        data.combat = null;
        save();
        break;
      case 'applyDamage':
        if (cmd.actorId && typeof cmd.amount === 'number') applyDamage(cmd.actorId, cmd.amount);
        break;
      case 'applyHeal':
        if (cmd.actorId && typeof cmd.amount === 'number') applyHeal(cmd.actorId, cmd.amount);
        break;
      case 'toggleCondition':
        if (cmd.actorId && cmd.condition) toggleCondition(cmd.actorId, cmd.condition as Condition);
        break;
    }
    // A real deck press pulls the DM window to the Combat screen.
    for (const cb of focusListeners) cb();
  }

  (window as unknown as { __demo?: object }).__demo = {
    bridgeState,
    command,
    onState: (cb: () => void) => {
      const wrapped = () => cb();
      stateListeners.add(wrapped);
      return () => stateListeners.delete(wrapped);
    },
    ready: () => ready,
  };

  // ---- the Api surface ---------------------------------------------------------

  return {
    getState: async () => {
      await ready;
      return appState();
    },
    getPlayerViewOpen: async () => pvOpen(),
    onState: (cb) => {
      stateListeners.add(cb);
      return () => stateListeners.delete(cb);
    },
    onPlayerViewOpen: (cb) => {
      pvListeners.add(cb);
      return () => pvListeners.delete(cb);
    },
    onFocusCombat: (cb) => {
      focusListeners.add(cb);
      return () => focusListeners.delete(cb);
    },

    savePc: async (pc) => {
      const id = pc.id ?? uuid();
      data.pcs = [...data.pcs.filter((p) => p.id !== id), { ...pc, id }];
      save();
    },
    deletePc: async (id) => {
      data.pcs = data.pcs.filter((p) => p.id !== id);
      save();
    },

    saveMonster: async (m) => {
      const id = m.id ?? uuid();
      const existing = data.monsters.find((x) => x.id === id);
      data.monsters = [
        ...data.monsters.filter((x) => x.id !== id),
        { ...existing, ...m, id, source: existing?.source ?? m.source ?? 'manual' } as MonsterTemplate,
      ];
      save();
    },
    deleteMonster: async (id) => {
      data.monsters = data.monsters.filter((m) => m.id !== id);
      for (const t of data.templates) {
        t.entries = t.entries.filter((e) => e.monsterTemplateId !== id);
      }
      save();
    },
    importSrd,

    saveTemplate: async (t) => {
      const id = t.id ?? uuid();
      data.templates = [...data.templates.filter((x) => x.id !== id), { ...t, id }];
      save();
    },
    deleteTemplate: async (id) => {
      data.templates = data.templates.filter((t) => t.id !== id);
      save();
    },
    duplicateTemplate: async (id) => {
      const t = data.templates.find((x) => x.id === id);
      if (!t) return;
      data.templates.push({
        ...t,
        id: uuid(),
        name: `${t.name} (copy)`,
        entries: t.entries.map((e) => ({ ...e })),
      });
      save();
    },

    startCombatSetup: async (templateId, pcIds, rollMode) => {
      const template = data.templates.find((t) => t.id === templateId);
      if (!template) return;
      const combatants: Combatant[] = [];
      for (const entry of template.entries) {
        const m = data.monsters.find((x) => x.id === entry.monsterTemplateId);
        if (!m) continue;
        for (let i = 1; i <= entry.quantity; i++) {
          combatants.push(combatantFrom(m, entry.quantity > 1 ? `${m.name} ${i}` : m.name));
        }
      }
      for (const pcId of pcIds) {
        const pc = data.pcs.find((p) => p.id === pcId);
        if (!pc) continue;
        combatants.push({
          id: uuid(),
          displayName: pc.name,
          type: 'pc',
          sourceId: pc.id,
          maxHp: pc.maxHp,
          currentHp: pc.maxHp,
          ac: pc.ac,
          initMod: pc.initMod,
          abilities: null,
          attacks: [],
          conditions: [],
          initiative: rollMode === 'all' ? d20() + pc.initMod : null,
          isDowned: false,
        });
      }
      const combat: Combat = {
        id: uuid(),
        sourceTemplateId: templateId,
        phase: 'setup',
        combatants,
        currentIndex: 0,
        round: 0,
      };
      sortCombatants(combat);
      data.combat = combat;
      save();
    },
    setInitiative: async (combatantId, value) => {
      const combat = data.combat;
      if (!combat || combat.phase !== 'setup') return;
      const c = combat.combatants.find((x) => x.id === combatantId);
      if (!c) return;
      c.initiative = value;
      sortCombatants(combat);
      save();
    },
    rerollInitiative: async (id) => {
      const combat = data.combat;
      if (!combat || combat.phase !== 'setup') return;
      const c = combat.combatants.find((x) => x.id === id);
      if (!c) return;
      c.initiative = d20() + c.initMod;
      sortCombatants(combat);
      save();
    },
    reorderCombatant: async (fromIndex, toIndex) => {
      const combat = data.combat;
      if (!combat || combat.phase !== 'setup') return;
      const list = combat.combatants;
      if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) return;
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      save();
    },
    beginCombat: async () => {
      const combat = data.combat;
      if (!combat || combat.phase !== 'setup') return;
      if (combat.combatants.some((c) => c.initiative === null)) return;
      combat.phase = 'active';
      combat.currentIndex = 0;
      combat.round = 1;
      save();
    },
    endCombat: async () => {
      data.combat = null;
      save();
    },
    nextTurn: async () => nextTurn(),
    prevTurn: async () => prevTurn(),
    applyDamage: async (id, amount) => applyDamage(id, amount),
    applyHeal: async (id, amount) => applyHeal(id, amount),
    toggleCondition: async (id, condition) => toggleCondition(id, condition),
    removeCombatant: async (id) => {
      const combat = data.combat;
      if (!combat) return;
      const idx = combat.combatants.findIndex((c) => c.id === id);
      if (idx === -1) return;
      combat.combatants.splice(idx, 1);
      if (combat.combatants.length === 0) {
        combat.currentIndex = 0;
      } else if (idx < combat.currentIndex) {
        combat.currentIndex -= 1;
      } else if (combat.currentIndex >= combat.combatants.length) {
        combat.currentIndex = 0;
      }
      save();
    },
    addMonsterToCombat: async (monsterTemplateId, quantity) => {
      const combat = data.combat;
      const monster = data.monsters.find((m) => m.id === monsterTemplateId);
      if (!combat || !monster || quantity < 1) return;
      const baseName = monster.name;
      const existing = combat.combatants.filter(
        (c) => c.type === 'monster' && c.displayName.replace(/\s+\d+$/, '') === baseName,
      );
      let nextIndex = existing.length + 1;
      if (existing.length === 1 && existing[0].displayName === baseName) {
        existing[0].displayName = `${baseName} 1`;
      }
      const needsNumbers = existing.length > 0 || quantity > 1;
      for (let i = 0; i < quantity; i++) {
        const combatant = combatantFrom(
          monster,
          needsNumbers ? `${baseName} ${nextIndex++}` : baseName,
        );
        if (combat.phase === 'setup') {
          combat.combatants.push(combatant);
        } else {
          let idx = combat.combatants.findIndex(
            (c) => c.initiative !== null && c.initiative < combatant.initiative!,
          );
          if (idx === -1) idx = combat.combatants.length;
          combat.combatants.splice(idx, 0, combatant);
          if (idx <= combat.currentIndex) combat.currentIndex += 1;
        }
      }
      if (combat.phase === 'setup') sortCombatants(combat);
      save();
    },

    // Kenku FM talks to a local desktop app; inert in the browser demo.
    kenkuGetLibrary: async () => null,
    kenkuPlaySound: async () => false,
    kenkuStopSound: async () => false,
    kenkuStopAll: async () => {},
    kenkuSoundPlayback: async () => null,
    kenkuCheckConnection: async () => false,
    kenkuAttackEvent: async () => {},

    updateSettings: async (patch) => {
      data.settings = { ...data.settings, ...patch };
      save();
    },
    togglePlayerView: async () => {
      if (pvOpen()) {
        pvWindow?.close();
        pvWindow = null;
        for (const cb of pvListeners) cb(false);
      } else {
        pvWindow = window.open('#player', 'dnd-demo-player', 'width=1000,height=650');
        if (pvWindow) for (const cb of pvListeners) cb(true);
      }
    },
    togglePlayerFullscreen: async () => {
      channel.postMessage('pv-fullscreen');
    },
  } as Api;
}
