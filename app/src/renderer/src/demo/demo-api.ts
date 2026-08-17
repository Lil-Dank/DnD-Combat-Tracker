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
  ArchivedCombat,
  EncounterTemplate,
  KenkuEventId,
  LogEntry,
  LogSource,
  MonsterAction,
  MonsterTemplate,
  PC,
  Settings,
} from '../../../shared/types';
import { DEFAULT_SETTINGS } from '../../../shared/types';
import { rollD20, type RollMode } from '../../../shared/dice';
import {
  abilityCodeLabel,
  monsterName,
  type MonsterL10n,
} from '../../../shared/i18n';
import type { Api } from '../../../preload/index';
import monstersDe from '../../../../resources/srd/monsters.de.json';
import {
  demoKenkuLibrary,
  demoKenkuPausePlayback,
  demoKenkuPlayback,
  demoKenkuPlayPlaylist,
  demoKenkuPlaySound,
  demoKenkuStopAll,
  demoKenkuStopSound,
} from './demo-kenku';

// Key bump reseeds returning visitors — this one brings the Deck of Many
// Turns rebrand plus PC stat blocks and colorized log targets.
const LS_KEY = 'deck-of-many-turns-demo-v1';
const uuid = () => crypto.randomUUID();
const d20 = () => 1 + Math.floor(Math.random() * 20);

interface DemoData {
  pcs: PC[];
  monsters: MonsterTemplate[];
  templates: EncounterTemplate[];
  settings: Settings;
  combat: Combat | null;
  archive: ArchivedCombat[];
  seeded: boolean;
}

/** Who performed a mutation, for the demo combat log. */
interface ActionCtx {
  source: LogSource;
  actorName?: string;
  actorType?: 'pc' | 'monster';
  math?: string;
  mathTypes?: (string | null)[];
  sourceName?: string;
}

const DM_CTX: ActionCtx = { source: 'dm' };
const DECK_CTX: ActionCtx = { source: 'deck' };

const deckCtx = (cmd: BridgeCommand): ActionCtx => ({
    source: 'deck',
    actorName: cmd.actorName,
    actorType: cmd.actorType === 'pc' || cmd.actorType === 'monster' ? cmd.actorType : undefined,
    math: cmd.math,
    mathTypes: cmd.mathTypes,
  });

interface BridgeCommand {
  type: string;
  actorId?: string;
  amount?: number;
  condition?: string;
  phase?: string;
  actorName?: string;
  actorType?: string;
  math?: string;
  mathTypes?: (string | null)[];
  roll?: {
    actorName?: string;
    actorType?: string;
    targetName?: string;
    targetType?: string;
    attackName?: string;
    die?: number;
    dice?: number[];
    total?: number;
  };
}

export function createDemoApi(): Api {
  let data: DemoData = load() ?? {
    pcs: [],
    monsters: [],
    templates: [],
    settings: { ...DEFAULT_SETTINGS },
    combat: null,
    archive: [],
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
      if (!raw) return null;
      const stored = JSON.parse(raw) as DemoData;
      if (!Array.isArray(stored.archive)) stored.archive = [];
      if (stored.combat && !Array.isArray(stored.combat.log)) stored.combat.log = [];
      // Same deep-merge as main/state.ts: settings gain new sections over time.
      stored.settings = {
        ...DEFAULT_SETTINGS,
        ...stored.settings,
        kenku: { ...DEFAULT_SETTINGS.kenku, ...(stored.settings?.kenku ?? {}) },
      };
      return stored;
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
      kenkuConnected,
      playerClients: [...playerClaims.entries()].map(([pcId, claim]) => ({
        pcId,
        playerName: claim.playerName,
        connected: [...playerSessions].some((s) => s.pcId === pcId),
      })),
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

  // ---- Kenku (demo): trigger engine mirroring main/kenku.ts -------------------
  // The demo simulates a connected Kenku: the full configuration UI works and
  // "playing" states light up, but everything is silent by design.

  const kenkuConnected = true;
  const kenkuPending = new Set<ReturnType<typeof setTimeout>>();

  const kenkuSettings = () => data.settings.kenku;

  function kenkuFire(ref: { soundId: string; delayMs?: number }): void {
    const delay = ref.delayMs ?? 0;
    if (delay <= 0) {
      void demoKenkuPlaySound(ref.soundId);
      return;
    }
    const timer = setTimeout(() => {
      kenkuPending.delete(timer);
      void demoKenkuPlaySound(ref.soundId);
    }, delay);
    kenkuPending.add(timer);
  }

  function kenkuEvent(event: KenkuEventId): void {
    const k = kenkuSettings();
    if (!k.enabled) return;
    const ref = k.eventSounds[event];
    if (ref) kenkuFire(ref);
  }

  function kenkuCombatEvent(event: KenkuEventId): void {
    const k = kenkuSettings();
    if (event === 'combatStart') {
      kenkuEvent(event);
      if (!k.enabled) return;
      const tpl = data.templates.find((t) => t.id === data.combat?.sourceTemplateId);
      if (tpl?.kenkuPlaylistId) void demoKenkuPlayPlaylist(tpl.kenkuPlaylistId);
      return;
    }
    if (event === 'combatEnd') {
      for (const t of kenkuPending) clearTimeout(t);
      kenkuPending.clear();
      kenkuEvent(event);
      if (!k.enabled) return;
      const tpl = data.templates.find((t) => t.id === data.combat?.sourceTemplateId);
      if (tpl?.kenkuPlaylistId) void demoKenkuPausePlayback();
      return;
    }
    kenkuEvent(event);
  }

  const KENKU_PHASE_TRIGGER: Record<string, string | null> = {
    attackRoll: 'attackRoll',
    attackHit: 'attackHit',
    attackCrit: 'attackHit',
    attackMiss: null,
    damageRoll: 'damageRoll',
    damageApplied: 'damageApplied',
  };
  const KENKU_PHASE_EVENT: Record<string, KenkuEventId | undefined> = {
    attackHit: 'attackHit',
    attackCrit: 'attackCrit',
    attackMiss: 'attackMiss',
  };

  function kenkuAttackEvent(payload: { sourceId?: string; attackId: string; phase: string }): void {
    const k = kenkuSettings();
    if (!k.enabled) return;
    const trigger = KENKU_PHASE_TRIGGER[payload.phase];
    if (trigger) {
      const monster =
        data.monsters.find((m) => m.id === payload.sourceId) ??
        data.monsters.find((m) => m.attacks.some((a) => a.id === payload.attackId));
      const action = monster?.attacks.find((a) => a.id === payload.attackId);
      if (action?.kenkuSound && action.kenkuSound.trigger === trigger) {
        kenkuFire(action.kenkuSound);
      }
    }
    const event = KENKU_PHASE_EVENT[payload.phase];
    if (event) kenkuEvent(event);
  }

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

  /** Mirror of main/state.ts pushLog: structured entries, rendered via i18n. */
  function pushLog(combat: Combat, entry: Omit<LogEntry, 'id' | 'ts' | 'round'>): void {
    combat.log.push({ ...entry, id: uuid(), ts: Date.now(), round: combat.round });
  }

  function logTurn(combat: Combat, ctx: ActionCtx): void {
    const current = combat.combatants[combat.currentIndex];
    if (!current) return;
    pushLog(combat, {
      kind: 'turn',
      actorName: current.displayName,
      actorType: current.type,
      source: ctx.source,
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

  function applyDamage(combatantId: string, amount: number, ctx: ActionCtx = DM_CTX): void {
    const combat = data.combat;
    if (!combat || amount <= 0) return;
    const idx = combat.combatants.findIndex((c) => c.id === combatantId);
    if (idx === -1) return;
    const c = combat.combatants[idx];
    c.currentHp = Math.max(0, c.currentHp - amount);
    pushLog(combat, {
      kind: 'damage',
      actorName: ctx.actorName,
      actorType: ctx.actorType,
      targetName: c.displayName,
      targetType: c.type,
      amount,
      math: ctx.math,
      mathTypes: ctx.mathTypes,
      source: ctx.source,
      sourceName: ctx.sourceName,
    });
    let downedOrKilled: KenkuEventId | null = null;
    if (c.currentHp === 0) {
      downedOrKilled = c.type === 'monster' ? 'monsterKilled' : 'pcDowned';
      pushLog(combat, {
        kind: c.type === 'monster' ? 'kill' : 'down',
        targetName: c.displayName,
        targetType: c.type,
        source: ctx.source,
        sourceName: ctx.sourceName,
      });
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
    kenkuCombatEvent('damageApplied');
    if (downedOrKilled) kenkuCombatEvent(downedOrKilled);
  }

  function applyHeal(combatantId: string, amount: number, ctx: ActionCtx = DM_CTX): void {
    const combat = data.combat;
    if (!combat || amount <= 0) return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    c.currentHp = Math.min(c.maxHp, c.currentHp + amount);
    if (c.currentHp > 0) c.isDowned = false;
    pushLog(combat, {
      kind: 'heal',
      actorName: ctx.actorName,
      actorType: ctx.actorType,
      targetName: c.displayName,
      targetType: c.type,
      amount,
      source: ctx.source,
      sourceName: ctx.sourceName,
    });
    save();
    kenkuCombatEvent('healApplied');
  }

  function toggleCondition(
    combatantId: string,
    condition: Condition,
    ctx: ActionCtx = DM_CTX,
  ): void {
    const combat = data.combat;
    if (!combat) return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    const removing = c.conditions.includes(condition);
    c.conditions = removing
      ? c.conditions.filter((x) => x !== condition)
      : [...c.conditions, condition];
    pushLog(combat, {
      kind: removing ? 'conditionRemoved' : 'conditionAdded',
      targetName: c.displayName,
      targetType: c.type,
      condition,
      source: ctx.source,
    });
    save();
  }

  function nextTurn(ctx: ActionCtx = DM_CTX): void {
    const combat = data.combat;
    if (!combat || combat.phase !== 'active' || combat.combatants.length === 0) return;
    combat.currentIndex += 1;
    if (combat.currentIndex >= combat.combatants.length) {
      combat.currentIndex = 0;
      combat.round += 1;
    }
    logTurn(combat, ctx);
    save();
    kenkuCombatEvent('turnChange');
  }

  function prevTurn(ctx: ActionCtx = DM_CTX): void {
    const combat = data.combat;
    if (!combat || combat.phase !== 'active' || combat.combatants.length === 0) return;
    if (combat.currentIndex === 0) {
      if (combat.round <= 1) return;
      combat.currentIndex = combat.combatants.length - 1;
      combat.round -= 1;
    } else {
      combat.currentIndex -= 1;
    }
    logTurn(combat, ctx);
    save();
    kenkuCombatEvent('turnChange');
  }

  /** End combat, archiving the log like main/state.ts does. */
  function endCombatShared(ctx: ActionCtx = DM_CTX): void {
    const combat = data.combat;
    if (combat) {
      kenkuCombatEvent('combatEnd');
      if (combat.phase === 'active') {
        pushLog(combat, { kind: 'combatEnd', source: ctx.source });
        const template = data.templates.find((t) => t.id === combat.sourceTemplateId);
        data.archive.unshift({
          id: combat.id,
          templateName: template?.name ?? '?',
          endedAt: Date.now(),
          rounds: combat.round,
          log: combat.log,
        });
      }
    }
    data.combat = null;
    save();
  }

  /** Log an attack roll reported by the deck sim (verdict phases only). */
  function logAttackRoll(cmd: BridgeCommand): void {
    const combat = data.combat;
    const roll = cmd.roll;
    const outcome =
      cmd.phase === 'attackCrit' ? 'crit' : cmd.phase === 'attackHit' ? 'hit' : cmd.phase === 'attackMiss' ? 'miss' : null;
    if (!combat || !roll || !outcome) return;
    pushLog(combat, {
      kind: 'attackRoll',
      actorName: roll.actorName,
      actorType: roll.actorType as 'pc' | 'monster' | undefined,
      targetName: roll.targetName,
      targetType: roll.targetType as 'pc' | 'monster' | undefined,
      attackName: roll.attackName,
      die: roll.die,
      dice: roll.dice && roll.dice.length > 1 ? roll.dice : undefined,
      total: roll.total,
      outcome,
      source: 'deck',
    });
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

    // A compact MonsterAction factory for seeded PC attacks (same record
    // shape the Party screen / phone editor produce via formToAction).
    const pcAttack = (
      name: string,
      toHit: number | null,
      save: { ability: string; dc: number } | null,
      dice: string,
      count: number,
      die: number,
      bonus: number,
      average: number,
      dmgType: string,
    ): MonsterAction => ({
      id: `manual.${uuid()}`,
      name,
      section: 'action',
      type: toHit !== null ? 'attack' : 'save',
      order: 0,
      attack:
        toHit !== null
          ? { kind: 'melee', toHit, toHitNote: null, reach: 5, range: null, usage: null }
          : null,
      save,
      onHit: {
        damage: [{ average, dice, count, die, bonus, type: dmgType, condition: null }],
        alternateDamage: null,
        effects: [],
      },
      onHitOrMiss: null,
      kenkuSound: null,
      display: {
        toHit: toHit !== null ? `+${toHit}` : null,
        range: toHit !== null ? 'reach 5 ft.' : null,
        damage: `${average} (${dice}) ${dmgType.charAt(0).toUpperCase()}${dmgType.slice(1)}`,
        text: '',
      },
    });

    for (const p of [
      {
        name: 'Aria Windwhisper', maxHp: 38, ac: 15, initMod: 3,
        abilities: { str: 10, dex: 17, con: 12, int: 13, wis: 14, cha: 11 },
        notes: 'Elf rogue 5 · passive Perception 14 · speed 35 ft',
        attacks: [
          pcAttack('Rapier', 5, null, '1d8+3', 1, 8, 3, 7, 'piercing'),
          pcAttack('Shortbow', 5, null, '1d6+3', 1, 6, 3, 6, 'piercing'),
        ],
      },
      {
        name: 'Thorin Oakenshield', maxHp: 52, ac: 18, initMod: 0,
        abilities: { str: 18, dex: 10, con: 16, int: 9, wis: 12, cha: 10 },
        notes: 'Dwarf fighter 5 · speed 25 ft',
        attacks: [pcAttack('Warhammer', 6, null, '1d10+4', 1, 10, 4, 9, 'bludgeoning')],
      },
      { name: 'Bartholomew Quill', maxHp: 31, ac: 13, initMod: 2, attacks: [] },
      {
        name: 'Seraphina Dawnbringer', maxHp: 45, ac: 17, initMod: 1,
        attacks: [pcAttack('Sacred Flame', null, { ability: 'DEX', dc: 13 }, '1d8', 1, 8, 0, 4, 'radiant')],
      },
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

    // Kenku demo config: enabled, with sample event sounds, per-attack sounds
    // and a battle playlist on the first template - all synthesized locally.
    data.settings.kenku = {
      enabled: true,
      host: '127.0.0.1',
      port: 3333,
      eventSounds: {
        combatStart: { soundId: 'demo-horn', title: 'Battle Horn' },
        monsterKilled: { soundId: 'demo-screech', title: 'Goblin Screech' },
        attackCrit: { soundId: 'demo-thunder', title: 'Thunder Crack' },
        healApplied: { soundId: 'demo-chime', title: 'Healing Chime' },
      },
    };
    data.templates[0].kenkuPlaylistId = 'demo-pl-battle';
    data.templates[0].kenkuPlaylistTitle = 'Battle Drums';
    const attachSound = (
      monsterName: string,
      attackName: string,
      soundId: string,
      title: string,
      trigger: 'attackRoll' | 'attackHit' | 'damageRoll' | 'damageApplied',
    ) => {
      const m = byName(monsterName);
      const a = m?.attacks.find((x) => x.name === attackName);
      if (a) a.kenkuSound = { soundId, title, trigger };
    };
    attachSound('Goblin Warrior', 'Scimitar', 'demo-sword', 'Sword Clash', 'attackHit');
    attachSound('Owlbear', 'Rend', 'demo-roar', 'Dragon Roar', 'attackHit');
    attachSound('Adult Black Dragon', 'Acid Breath', 'demo-fire', 'Fire Whoosh', 'damageRoll');

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
        abilities: pc.abilities ?? null,
        attacks: pc.attacks.map((a) => ({ ...a })),
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
      log: [],
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

    // A short round-1 backstory so the log rail and the phone's log/ticker
    // have something to tell from the first second.
    const mName = (i: number) => monsters[i]?.displayName ?? 'Goblin Warrior 1';
    const pName = (i: number) => pcs[i]?.displayName ?? 'Aria Windwhisper';
    const entry = (e: Omit<LogEntry, 'id' | 'ts'>): LogEntry => ({
      ...e,
      id: uuid(),
      ts: Date.now() - (10 - combat.log.length) * 45000,
    });
    combat.log.push(
      entry({ kind: 'combatStart', source: 'dm', round: 1 }),
      entry({ kind: 'turn', actorName: pName(0), actorType: 'pc', source: 'dm', round: 1 }),
      entry({
        kind: 'attackRoll', actorName: pName(0), actorType: 'pc', targetName: mName(0),
        targetType: 'monster',
        attackName: 'Rapier', die: 14, total: 19, outcome: 'hit', source: 'player', round: 1,
      }),
      entry({
        kind: 'damage', actorName: pName(0), actorType: 'pc', targetName: mName(0),
        targetType: 'monster', amount: 7, source: 'player', round: 1,
      }),
      entry({ kind: 'turn', actorName: mName(0), actorType: 'monster', source: 'deck', round: 1 }),
      entry({
        kind: 'attackRoll', actorName: mName(0), actorType: 'monster', targetName: pName(0),
        targetType: 'pc',
        attackName: 'Scimitar', die: 17, total: 21, outcome: 'hit', source: 'deck', round: 1,
      }),
      entry({
        kind: 'damage', actorName: mName(0), actorType: 'monster', targetName: pName(0),
        targetType: 'pc', amount: 6, source: 'deck', round: 1,
      }),
      entry({
        kind: 'conditionAdded', targetName: mName(1), targetType: 'monster',
        condition: 'Prone', source: 'dm', round: 1,
      }),
      entry({ kind: 'turn', actorName: mName(0), actorType: 'monster', source: 'dm', round: 2 }),
    );

    // One archived fight so the Archive tab and the phone's history browser
    // aren't empty on first visit.
    const archivedLog: LogEntry[] = [
      { kind: 'combatStart', source: 'dm', round: 1 },
      { kind: 'turn', actorName: 'Owlbear 1', actorType: 'monster', source: 'dm', round: 1 },
      {
        kind: 'attackRoll', actorName: 'Owlbear 1', actorType: 'monster',
        targetName: 'Thorin Oakenshield', targetType: 'pc', attackName: 'Rend',
        die: 18, total: 25, outcome: 'hit', source: 'deck', round: 1,
      },
      {
        kind: 'damage', actorName: 'Owlbear 1', actorType: 'monster',
        targetName: 'Thorin Oakenshield', targetType: 'pc', amount: 14,
        source: 'deck', round: 1,
      },
      {
        kind: 'attackRoll', actorName: 'Thorin Oakenshield', actorType: 'pc',
        targetName: 'Owlbear 1', targetType: 'monster', attackName: 'Warhammer',
        die: 20, total: 26, outcome: 'crit', source: 'player', round: 1,
      },
      {
        kind: 'damage', actorName: 'Thorin Oakenshield', actorType: 'pc',
        targetName: 'Owlbear 1', targetType: 'monster', amount: 18,
        source: 'player', round: 2,
      },
      { kind: 'kill', targetName: 'Owlbear 1', targetType: 'monster', source: 'player', round: 2 },
      { kind: 'combatEnd', source: 'dm', round: 2 },
    ].map((e, i) => ({ ...e, id: uuid(), ts: Date.now() - 86400000 + i * 60000 }) as LogEntry);
    data.archive.push({
      id: uuid(),
      templateName: 'Owlbear Den',
      endedAt: Date.now() - 86400000 + archivedLog.length * 60000,
      rounds: 2,
      log: archivedLog,
    });

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
            sourceId: c.sourceId,
            type: c.type,
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
        nextTurn(DECK_CTX);
        break;
      case 'prevTurn':
        prevTurn(DECK_CTX);
        break;
      case 'endCombat':
        endCombatShared(DECK_CTX);
        break;
      case 'attackEvent':
        kenkuAttackEvent(cmd as unknown as { sourceId?: string; attackId: string; phase: string });
        logAttackRoll(cmd);
        break;
      case 'applyDamage':
        if (cmd.actorId && typeof cmd.amount === 'number') applyDamage(cmd.actorId, cmd.amount, deckCtx(cmd));
        break;
      case 'applyHeal':
        if (cmd.actorId && typeof cmd.amount === 'number') applyHeal(cmd.actorId, cmd.amount, deckCtx(cmd));
        break;
      case 'toggleCondition':
        if (cmd.actorId && cmd.condition) toggleCondition(cmd.actorId, cmd.condition as Condition, DECK_CTX);
        break;
    }
    // A real deck press pulls the DM window to the Combat screen.
    for (const cb of focusListeners) cb();
  }

  // ---- fake player server (demo) ---------------------------------------------
  // Speaks the playerServer.ts protocol to the phone-sim iframe: same
  // disclosure rules (monster HP/AC never sent, monster roll numbers stripped
  // from the log), same commands, strict turn gating.

  interface PlayerSession {
    token: string | null;
    pcId: string | null;
    onMessage: (json: string) => void;
  }

  const playerSessions = new Set<PlayerSession>();
  const playerClaims = new Map<string, { token: string; playerName: string | null }>();
  const savePendingListeners = new Set<(pending: object) => void>();
  interface PendingSave {
    id: string;
    pcId: string;
    actorName: string;
    attackId: string;
    attackName: string;
    damage: number;
    targetIds: string[];
    session: PlayerSession;
  }
  const pendingSaves = new Map<string, PendingSave>();

  function tokenPcId(token: string | null): string | null {
    if (!token) return null;
    for (const [pcId, claim] of playerClaims) if (claim.token === token) return pcId;
    return null;
  }

  function filterLogForPlayers(log: LogEntry[]): LogEntry[] {
    // Mirror of the real server: no dice compositions on player surfaces.
    return log.map((e) =>
      e.kind === 'attackRoll' || e.math !== undefined
        ? {
            ...e,
            die: undefined,
            dice: undefined,
            total: e.kind === 'attackRoll' ? undefined : e.total,
            math: undefined,
            mathTypes: undefined,
          }
        : e,
    );
  }

  function playerStateMessage(session: PlayerSession): string {
    const lang = data.settings.language;
    const combat = data.combat;
    const active = combat !== null && combat.phase === 'active';
    const ownPc = session.pcId ? data.pcs.find((p) => p.id === session.pcId) ?? null : null;
    const ownCombatant = active
      ? combat.combatants.find((c) => c.type === 'pc' && c.sourceId === session.pcId) ?? null
      : null;

    const combatants = active
      ? combat.combatants.map((c, i) => {
          const base = {
            id: c.id,
            name: monsterName(lang, c.displayName),
            type: c.type,
            isCurrentTurn: i === combat.currentIndex,
            isDowned: c.isDowned,
            conditions: c.conditions,
            isBloodied: c.type === 'monster' ? c.currentHp < c.maxHp * 0.5 : undefined,
          };
          if (c.type !== 'pc') return base;
          const pcExtra = { currentHp: c.currentHp, maxHp: c.maxHp };
          if (c.sourceId !== session.pcId) return { ...base, ...pcExtra };
          return { ...base, ...pcExtra, ac: c.ac, initiative: c.initiative };
        })
      : [];

    return JSON.stringify({
      type: 'state',
      language: lang,
      gating: data.settings.playerWeb.gating,
      combatActive: active,
      round: active ? combat.round : 0,
      currentIndex: active ? combat.currentIndex : 0,
      myTurn: ownCombatant
        ? combat!.combatants.indexOf(ownCombatant) === combat!.currentIndex
        : false,
      claims: data.pcs.map((p) => ({
        pcId: p.id,
        name: p.name,
        taken: playerClaims.has(p.id),
        mine: p.id === session.pcId,
        playerName: playerClaims.get(p.id)?.playerName ?? null,
      })),
      you: ownPc
        ? {
            pcId: ownPc.id,
            name: ownPc.name,
            maxHp: ownPc.maxHp,
            ac: ownPc.ac,
            initMod: ownPc.initMod,
            abilities: ownPc.abilities ?? null,
            notes: ownPc.notes ?? '',
            attacks: ownPc.attacks,
            combatantId: ownCombatant?.id ?? null,
          }
        : null,
      combatants,
      log: active ? filterLogForPlayers(combat.log).slice(-200) : [],
      archive: data.archive.map((a) => ({
        id: a.id,
        templateName: a.templateName,
        endedAt: a.endedAt,
        rounds: a.rounds,
      })),
    });
  }

  function playerBroadcast(): void {
    for (const s of playerSessions) s.onMessage(playerStateMessage(s));
  }
  stateListeners.add(() => playerBroadcast());

  function publishPlayerClients(): void {
    notify();
  }

  function playerIsMyTurn(pcId: string): boolean {
    const combat = data.combat;
    if (!combat || combat.phase !== 'active') return false;
    const own = combat.combatants.find((c) => c.type === 'pc' && c.sourceId === pcId);
    return own !== undefined && combat.combatants.indexOf(own) === combat.currentIndex;
  }

  function playerGateAllows(pcId: string, targets: string[], kind: 'hpChange' | 'attack'): boolean {
    if (playerIsMyTurn(pcId)) return true;
    if (data.settings.playerWeb.gating !== 'relaxed' || kind !== 'hpChange') return false;
    const own = data.combat?.combatants.find((c) => c.type === 'pc' && c.sourceId === pcId);
    return own !== undefined && targets.length === 1 && targets[0] === own.id;
  }

  function rollActionDamage(action: MonsterAction): {
    total: number;
    math: string;
    mathTypes: (string | null)[];
    rolls: number[];
  } {
    let total = 0;
    const mathParts: string[] = [];
    const mathTypes: (string | null)[] = [];
    const allRolls: number[] = [];
    for (const d of action.onHit.damage) {
      if (d.condition) continue;
      if (d.count && d.die) {
        const rolls: number[] = [];
        for (let i = 0; i < d.count; i++) rolls.push(1 + Math.floor(Math.random() * d.die));
        allRolls.push(...rolls);
        const bonus = d.bonus ?? 0;
        total += rolls.reduce((a, b) => a + b, 0) + bonus;
        const bonusStr = bonus === 0 ? '' : bonus > 0 ? ` +${bonus}` : ` ${bonus}`;
        mathParts.push(`${d.dice ?? `${d.count}d${d.die}`} [${rolls.join('+')}]${bonusStr}`);
        mathTypes.push(d.type ?? null);
      } else {
        const value = d.average ?? 0;
        total += value;
        mathParts.push(`${value}`);
      }
    }
    total = Math.max(0, total);
    return { total, math: `${mathParts.join(' + ')} = ${total}`, mathTypes, rolls: allRolls };
  }

  function sourceNameFor(pcId: string): string | undefined {
    return playerClaims.get(pcId)?.playerName ?? undefined;
  }

  function playerCtx(pcId: string): ActionCtx {
    const pc = data.pcs.find((p) => p.id === pcId);
    return { source: 'player', actorName: pc?.name, actorType: 'pc', sourceName: sourceNameFor(pcId) };
  }

  function handlePlayerCommand(session: PlayerSession, cmd: Record<string, unknown>): void {
    const sendTo = (msg: object) => session.onMessage(JSON.stringify(msg));
    const type = cmd.type as string;

    if (type === 'hello') {
      session.token = typeof cmd.token === 'string' ? cmd.token : null;
      session.pcId = tokenPcId(session.token);
      sendTo(JSON.parse(playerStateMessage(session)));
      return;
    }

    if (type === 'claim') {
      const pcId = cmd.pcId as string;
      const token = cmd.token as string;
      if (!data.pcs.some((p) => p.id === pcId)) {
        sendTo({ type: 'claimResult', ok: false, reason: 'unknownPc' });
        return;
      }
      const existing = playerClaims.get(pcId);
      if (existing && existing.token !== token) {
        sendTo({ type: 'claimResult', ok: false, reason: 'taken' });
        return;
      }
      for (const [otherId, claim] of playerClaims) {
        if (otherId !== pcId && claim.token === token) playerClaims.delete(otherId);
      }
      const name = typeof cmd.playerName === 'string' ? cmd.playerName.trim().slice(0, 40) : '';
      playerClaims.set(pcId, { token, playerName: name || null });
      session.token = token;
      session.pcId = pcId;
      sendTo({ type: 'claimResult', ok: true });
      publishPlayerClients();
      return;
    }

    if (type === 'release') {
      if (session.pcId) playerClaims.delete(session.pcId);
      session.pcId = null;
      session.token = null;
      publishPlayerClients();
      return;
    }

    if (!session.pcId) return;
    const pcId = session.pcId;

    if (type === 'applyDamage' || type === 'applyHeal') {
      const targets = (cmd.targets as string[]) ?? [];
      const amount = cmd.amount as number;
      if (!Number.isInteger(amount) || amount < 1 || amount > 999) return;
      if (!playerGateAllows(pcId, targets, 'hpChange')) {
        sendTo({ type: 'error', code: 'notYourTurn' });
        return;
      }
      const ctx = playerCtx(pcId);
      for (const id of targets) {
        if (type === 'applyDamage') applyDamage(id, amount, ctx);
        else applyHeal(id, amount, ctx);
      }
      return;
    }

    if (type === 'attackRollDigital') {
      // Mirror of the real server's split flow, stage 1: d20 only.
      const pc = data.pcs.find((p) => p.id === pcId);
      const action = pc?.attacks.find((a) => a.id === cmd.attackId);
      const targetIds = (cmd.targetIds as string[]) ?? [];
      if (!pc || !action || action.type === 'save' || action.save) {
        sendTo({ type: 'error', code: 'badAttack' });
        return;
      }
      if (!playerGateAllows(pcId, targetIds, 'attack')) {
        sendTo({ type: 'error', code: 'notYourTurn' });
        return;
      }
      const combat = data.combat;
      const target = combat?.combatants.find((c) => c.id === targetIds[0]);
      if (!combat || !target) {
        sendTo({ type: 'error', code: 'badTarget' });
        return;
      }
      const mode = cmd.advantage === 'adv' || cmd.advantage === 'dis' ? cmd.advantage : 'normal';
      const { die, dice } = rollD20(mode as RollMode);
      const total = die + (action.attack?.toHit ?? 0);
      const outcome =
        die === 20 ? 'crit' : die === 1 ? 'miss' : total >= target.ac ? 'hit' : 'miss';
      pushLog(combat, {
        kind: 'attackRoll',
        actorName: pc.name,
        actorType: 'pc',
        targetName: target.displayName,
        targetType: target.type,
        attackName: action.name,
        die,
        dice: dice.length > 1 ? dice : undefined,
        total,
        outcome,
        source: 'player',
        sourceName: sourceNameFor(pcId),
      });
      kenkuAttackEvent({
        sourceId: pcId,
        attackId: action.id,
        phase: outcome === 'crit' ? 'attackCrit' : outcome === 'hit' ? 'attackHit' : 'attackMiss',
      });
      save();
      sendTo({
        type: 'attackRollResult',
        targetId: target.id,
        targetName: target.displayName,
        die,
        dice,
        total,
        outcome,
      });
      return;
    }

    if (type === 'damageRollDigital') {
      // Stage 2: roll and apply the damage.
      const pc = data.pcs.find((p) => p.id === pcId);
      const action = pc?.attacks.find((a) => a.id === cmd.attackId);
      const targetIds = (cmd.targetIds as string[]) ?? [];
      if (!pc || !action) {
        sendTo({ type: 'error', code: 'badAttack' });
        return;
      }
      if (!playerGateAllows(pcId, targetIds, 'attack')) {
        sendTo({ type: 'error', code: 'notYourTurn' });
        return;
      }
      const combat = data.combat;
      const target = combat?.combatants.find((c) => c.id === targetIds[0]);
      if (!combat || !target) {
        sendTo({ type: 'error', code: 'badTarget' });
        return;
      }
      const rolled = rollActionDamage(action);
      applyDamage(target.id, rolled.total, {
        ...playerCtx(pcId),
        math: rolled.math,
        mathTypes: rolled.mathTypes,
      });
      kenkuAttackEvent({ sourceId: pcId, attackId: action.id, phase: 'damageApplied' });
      sendTo({
        type: 'damageResult',
        targetId: target.id,
        targetName: target.displayName,
        damage: rolled.total,
        rolls: rolled.rolls,
        math: rolled.math,
        mathTypes: rolled.mathTypes,
      });
      return;
    }

    if (type === 'attackDigital' || type === 'attackManual') {
      const pc = data.pcs.find((p) => p.id === pcId);
      const action = pc?.attacks.find((a) => a.id === cmd.attackId);
      const targetIds = (cmd.targetIds as string[]) ?? [];
      if (!pc || !action) {
        sendTo({ type: 'error', code: 'badAttack' });
        return;
      }
      if (!playerGateAllows(pcId, targetIds, 'attack')) {
        sendTo({ type: 'error', code: 'notYourTurn' });
        return;
      }
      if (action.type === 'save' || action.save) {
        const rolledSave = rollActionDamage(action);
        const damage =
          type === 'attackManual' && Number.isInteger(cmd.damage) && (cmd.damage as number) > 0
            ? (cmd.damage as number)
            : rolledSave.total;
        const pending: PendingSave = {
          id: uuid(),
          pcId,
          actorName: pc.name,
          attackId: action.id,
          attackName: action.name,
          damage,
          targetIds,
          session,
        };
        pendingSaves.set(pending.id, pending);
        sendTo({ type: 'savePending', id: pending.id, damage });
        for (const cb of savePendingListeners) {
          cb({
            id: pending.id,
            actorName: pending.actorName,
            attackName: pending.attackName,
            ability: action.save?.ability ?? 'DEX',
            dc: action.save?.dc ?? 10,
            damage: pending.damage,
            targetIds: pending.targetIds,
          });
        }
        return;
      }
      const combat = data.combat;
      const target = combat?.combatants.find((c) => c.id === targetIds[0]);
      if (!combat || !target) {
        sendTo({ type: 'error', code: 'badTarget' });
        return;
      }
      let die: number | null = null;
      let total: number;
      let outcome: 'crit' | 'hit' | 'miss';
      if (type === 'attackDigital') {
        die = 1 + Math.floor(Math.random() * 20);
        total = die + (action.attack?.toHit ?? 0);
        outcome = die === 20 ? 'crit' : die === 1 ? 'miss' : total >= target.ac ? 'hit' : 'miss';
      } else {
        total = (cmd.d20Total as number) ?? 0;
        const natural = cmd.natural as number | undefined;
        die = natural === 20 ? 20 : natural === 1 ? 1 : null;
        outcome = natural === 20 ? 'crit' : natural === 1 ? 'miss' : total >= target.ac ? 'hit' : 'miss';
      }
      const combatForLog = data.combat;
      if (combatForLog) {
        pushLog(combatForLog, {
          kind: 'attackRoll',
          actorName: pc.name,
          actorType: 'pc',
          targetName: target.displayName,
          targetType: target.type,
          attackName: action.name,
          die: die ?? undefined,
          total,
          outcome,
          source: 'player',
          sourceName: sourceNameFor(pcId),
        });
      }
      kenkuAttackEvent({
        sourceId: pcId,
        attackId: action.id,
        phase: outcome === 'crit' ? 'attackCrit' : outcome === 'hit' ? 'attackHit' : 'attackMiss',
      });
      let damage: number | null = null;
      if (outcome !== 'miss') {
        const manualDmg =
          type === 'attackManual' && Number.isInteger(cmd.damage) && (cmd.damage as number) > 0;
        const rolledDmg = rollActionDamage(action);
        damage = manualDmg ? (cmd.damage as number) : rolledDmg.total;
        applyDamage(target.id, damage, {
          ...playerCtx(pcId),
          math: manualDmg ? undefined : rolledDmg.math,
          mathTypes: manualDmg ? undefined : rolledDmg.mathTypes,
        });
      } else {
        save();
      }
      sendTo({
        type: 'attackResult',
        targetId: target.id,
        targetName: target.displayName,
        die,
        total,
        outcome,
        damage,
      });
      return;
    }

    if (type === 'saveAttack') {
      const action = cmd.action as MonsterAction;
      const pc = data.pcs.find((p) => p.id === pcId);
      if (!pc || !action || typeof action.id !== 'string') return;
      const idx = pc.attacks.findIndex((a) => a.id === action.id);
      if (idx === -1) pc.attacks.push(action);
      else pc.attacks[idx] = action;
      const live = data.combat?.combatants.find((c) => c.type === 'pc' && c.sourceId === pcId);
      if (live) live.attacks = pc.attacks.map((a) => ({ ...a }));
      save();
      return;
    }

    if (type === 'deleteAttack') {
      const pc = data.pcs.find((p) => p.id === pcId);
      if (!pc) return;
      pc.attacks = pc.attacks.filter((a) => a.id !== cmd.actionId);
      const live = data.combat?.combatants.find((c) => c.type === 'pc' && c.sourceId === pcId);
      if (live) live.attacks = pc.attacks.map((a) => ({ ...a }));
      save();
      return;
    }

    if (type === 'getArchive') {
      const found = data.archive.find((a) => a.id === cmd.archiveId);
      if (!found) return;
      sendTo({
        type: 'archiveEntry',
        id: found.id,
        templateName: found.templateName,
        endedAt: found.endedAt,
        rounds: found.rounds,
        log: filterLogForPlayers(found.log),
      });
      return;
    }
  }

  function resolvePlayerSave(
    id: string,
    results: Array<{ targetId: string; saved: boolean; total?: number }>,
  ): void {
    const pending = pendingSaves.get(id);
    if (!pending) return;
    pendingSaves.delete(id);
    const combat = data.combat;
    const half = Math.floor(pending.damage / 2);
    const applied: Array<{ targetId: string; targetName: string; saved: boolean; amount: number }> = [];
    for (const r of results) {
      const target = combat?.combatants.find((c) => c.id === r.targetId);
      if (!target || !pending.targetIds.includes(r.targetId)) continue;
      const amount = r.saved ? half : pending.damage;
      if (combat) {
        pushLog(combat, {
          kind: 'save',
          actorName: target.displayName,
          actorType: target.type,
          targetName: pending.actorName,
          targetType: 'pc',
          attackName: pending.attackName,
          total: r.total,
          outcome: r.saved ? 'saved' : 'failed',
          source: 'dm',
        });
      }
      if (amount > 0) {
        applyDamage(r.targetId, amount, {
          source: 'player',
          actorName: pending.actorName,
          actorType: 'pc',
          sourceName: sourceNameFor(pending.pcId),
        });
      }
      applied.push({ targetId: r.targetId, targetName: target.displayName, saved: r.saved, amount });
    }
    save();
    pending.session.onMessage(
      JSON.stringify({ type: 'saveResolved', id, results: applied }),
    );
  }

  function dismissPlayerSave(id: string): void {
    const pending = pendingSaves.get(id);
    if (!pending) return;
    pendingSaves.delete(id);
    pending.session.onMessage(
      JSON.stringify({ type: 'saveResolved', id, cancelled: true, results: [] }),
    );
  }

  (window as unknown as { __demo?: object }).__demo = {
    bridgeState,
    command,
    /** The phone-sim iframe attaches its fake WebSocket here. */
    playerAttach: (onMessage: (json: string) => void) => {
      const session: PlayerSession = { token: null, pcId: null, onMessage };
      playerSessions.add(session);
      onMessage(playerStateMessage(session));
      return {
        send: (json: string) => {
          try {
            handlePlayerCommand(session, JSON.parse(json) as Record<string, unknown>);
          } catch {
            /* malformed frames are dropped, like the real server */
          }
        },
        close: () => {
          playerSessions.delete(session);
        },
      };
    },
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
    savePcAttack: async (pcId, action) => {
      const pc = data.pcs.find((p) => p.id === pcId);
      if (!pc) return;
      const idx = pc.attacks.findIndex((a) => a.id === action.id);
      if (idx === -1) pc.attacks.push(action);
      else pc.attacks[idx] = action;
      const live = data.combat?.combatants.find((c) => c.type === 'pc' && c.sourceId === pcId);
      if (live) live.attacks = pc.attacks.map((a) => ({ ...a }));
      save();
    },
    deletePcAttack: async (pcId, actionId) => {
      const pc = data.pcs.find((p) => p.id === pcId);
      if (!pc) return;
      pc.attacks = pc.attacks.filter((a) => a.id !== actionId);
      const live = data.combat?.combatants.find((c) => c.type === 'pc' && c.sourceId === pcId);
      if (live) live.attacks = pc.attacks.map((a) => ({ ...a }));
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
        log: [],
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
      pushLog(combat, { kind: 'combatStart', source: 'dm' });
      logTurn(combat, DM_CTX);
      save();
      kenkuCombatEvent('combatStart');
    },
    endCombat: async () => endCombatShared(),
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

    // Kenku in the demo: real Kenku Remote when reachable (its remote has no
    // CORS today, so usually not), otherwise the built-in synthesized board.
    kenkuGetLibrary: async () => demoKenkuLibrary(),
    kenkuPlaySound: async (id) => demoKenkuPlaySound(id),
    kenkuStopSound: async (id) => demoKenkuStopSound(id),
    kenkuStopAll: async () => demoKenkuStopAll(),
    kenkuSoundPlayback: async () => demoKenkuPlayback(),
    kenkuCheckConnection: async () => true,
    kenkuAttackEvent: async (payload) => kenkuAttackEvent(payload),

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

    // Player web: backed by the in-page fake player server (phone-sim iframe).
    getPlayerWebQr: async () => ({ urls: [], port: 0, error: null, dataUrls: [] }),
    kickPlayer: async (pcId) => {
      playerClaims.delete(pcId);
      for (const s of playerSessions) {
        if (s.pcId === pcId) {
          s.pcId = null;
          s.token = null;
          s.onMessage(JSON.stringify({ type: 'kicked' }));
        }
      }
      publishPlayerClients();
    },
    resolvePlayerSave: async (id, results) => resolvePlayerSave(id, results),
    dismissPlayerSave: async (id) => dismissPlayerSave(id),
    onPlayerSavePending: (cb) => {
      const wrapped = (pending: object) => cb(pending as Parameters<typeof cb>[0]);
      savePendingListeners.add(wrapped);
      return () => savePendingListeners.delete(wrapped);
    },
    listArchive: async () => data.archive,
    deleteArchivedCombat: async (id) => {
      data.archive = data.archive.filter((a) => a.id !== id);
      save();
    },
  } as Api;
}
