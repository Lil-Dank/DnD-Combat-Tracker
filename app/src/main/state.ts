import * as path from 'path';
import { randomUUID } from 'crypto';
import { JsonCollection, JsonValue } from './storage';
import type {
  KenkuEventId,
  AppState,
  ArchivedCombat,
  Combat,
  Combatant,
  Condition,
  EncounterTemplate,
  LogEntry,
  LogSource,
  MonsterAction,
  MonsterTemplate,
  PC,
  PlayerClaimInfo,
  Settings,
} from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { monsterName } from '../shared/i18n';
import { migrateActions } from './migrate';

export type ChangeListener = (state: AppState) => void;

/** Who performed a mutation, for the combat log. Defaults to the DM window. */
export interface ActionContext {
  source: LogSource;
  /** Acting combatant's display name (player web actions carry their PC). */
  actorName?: string;
  actorType?: 'pc' | 'monster';
  /** Rolled-damage composition for the log ("2d6 [3+5] +4 = 12"). */
  math?: string;
  /** Player-sourced actions: the claim's player name or a device label. */
  sourceName?: string;
}

const DM_CTX: ActionContext = { source: 'dm' };

const d20 = () => Math.floor(Math.random() * 20) + 1;

/**
 * Canonical application state. All mutations flow through this store in the
 * main process; every change persists to disk and notifies listeners
 * (renderer windows + the Stream Deck bridge).
 */
export class AppStore {
  private pcs!: JsonCollection<PC>;
  private monsters!: JsonCollection<MonsterTemplate>;
  private templates!: JsonCollection<EncounterTemplate>;
  private settings!: JsonValue<Settings>;
  private combat!: JsonValue<Combat | null>;
  private archive!: JsonCollection<ArchivedCombat>;
  private listeners = new Set<ChangeListener>();
  bridgeClientCount = 0;
  kenkuConnected = false;
  playerClients: PlayerClaimInfo[] = [];
  /** Combat happenings for side-effect listeners (Kenku sounds); see index.ts. */
  private combatEventListener: ((event: KenkuEventId) => void) | null = null;

  async init(userDataDir: string): Promise<void> {
    const dataDir = path.join(userDataDir, 'data');
    this.pcs = new JsonCollection<PC>(path.join(dataDir, 'pcs.json'));
    this.monsters = new JsonCollection<MonsterTemplate>(path.join(dataDir, 'monsters.json'));
    this.templates = new JsonCollection<EncounterTemplate>(path.join(dataDir, 'encounter-templates.json'));
    this.settings = new JsonValue<Settings>(path.join(dataDir, 'settings.json'), DEFAULT_SETTINGS);
    this.combat = new JsonValue<Combat | null>(path.join(dataDir, 'combat.json'), null);
    this.archive = new JsonCollection<ArchivedCombat>(path.join(dataDir, 'combat-archive.json'));
    await Promise.all([
      this.pcs.load(),
      this.monsters.load(),
      this.templates.load(),
      this.settings.load(),
      this.combat.load(),
      this.archive.load(),
    ]);
    // Fill in any settings keys added after the file was first written.
    // Nested sections (kenku, playerWeb) merge sub-keys explicitly - a stored
    // file from before a new sub-key was added must still pick up its default.
    const stored = this.settings.get();
    await this.settings.set({
      ...DEFAULT_SETTINGS,
      ...stored,
      kenku: { ...DEFAULT_SETTINGS.kenku, ...(stored.kenku ?? {}) },
      playerWeb: { ...DEFAULT_SETTINGS.playerWeb, ...(stored.playerWeb ?? {}) },
    });
    // PCs stored before the attacks field / combats before the log field.
    for (const pc of this.pcs.list()) {
      if (!Array.isArray(pc.attacks)) await this.pcs.put({ ...pc, attacks: [] });
    }
    const combat = this.combat.get();
    if (combat && !Array.isArray(combat.log)) {
      combat.log = [];
      await this.combat.set(combat);
    }
    await this.migrateLegacyAttacks();
  }

  /** Upgrade pre-schema attack records in the library and any saved combat. */
  private async migrateLegacyAttacks(): Promise<void> {
    for (const m of this.monsters.list()) {
      const migrated = migrateActions(m.attacks as unknown[]);
      if (migrated) await this.monsters.put({ ...m, attacks: migrated });
    }
    const combat = this.combat.get();
    if (combat) {
      let changed = false;
      for (const c of combat.combatants) {
        const migrated = migrateActions(c.attacks as unknown[]);
        if (migrated) {
          c.attacks = migrated;
          changed = true;
        }
      }
      if (changed) await this.combat.set(combat);
    }
  }

  getState(): AppState {
    return {
      pcs: this.pcs.list().sort((a, b) => a.name.localeCompare(b.name)),
      monsters: this.monsters.list().sort((a, b) => a.name.localeCompare(b.name)),
      encounterTemplates: this.templates.list().sort((a, b) => a.name.localeCompare(b.name)),
      combat: this.combat.get(),
      settings: this.settings.get(),
      bridgeClientCount: this.bridgeClientCount,
      kenkuConnected: this.kenkuConnected,
      playerClients: this.playerClients,
    };
  }

  setPlayerClients(list: PlayerClaimInfo[]): void {
    this.playerClients = list;
    this.notify();
  }

  // ---- Combat log ----

  /**
   * Append a structured entry to the running combat's log. id/ts/round are
   * filled in here; rendering to text happens per-surface via i18n keys.
   * No-op without a combat (log lines never outlive their fight).
   */
  async appendLog(entry: Omit<LogEntry, 'id' | 'ts' | 'round'>): Promise<void> {
    const combat = this.combat.get();
    if (!combat) return;
    this.pushLog(combat, entry);
    await this.setCombat(combat);
  }

  /** In-mutator variant: fills fields and pushes, without its own persist. */
  private pushLog(combat: Combat, entry: Omit<LogEntry, 'id' | 'ts' | 'round'>): void {
    combat.log.push({ ...entry, id: randomUUID(), ts: Date.now(), round: combat.round });
  }

  /** Log snapshots carry names in the language active when the entry was made. */
  private locName(name: string): string {
    return monsterName(this.settings.get().language, name);
  }

  listArchive(): ArchivedCombat[] {
    return this.archive.list().sort((a, b) => b.endedAt - a.endedAt);
  }

  async deleteArchivedCombat(id: string): Promise<void> {
    await this.archive.delete(id);
    this.notify();
  }

  setKenkuConnected(connected: boolean): void {
    if (this.kenkuConnected === connected) return;
    this.kenkuConnected = connected;
    this.notify();
  }

  onCombatEvent(listener: (event: KenkuEventId) => void): void {
    this.combatEventListener = listener;
  }

  private emitCombatEvent(event: KenkuEventId): void {
    this.combatEventListener?.(event);
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  // ---- PCs ----

  async savePc(pc: Omit<PC, 'id'> & { id?: string }): Promise<void> {
    // Defensive: IPC callers predating the attacks field may omit it.
    await this.pcs.put({ ...pc, attacks: pc.attacks ?? [], id: pc.id ?? randomUUID() });
    this.notify();
  }

  async deletePc(id: string): Promise<void> {
    await this.pcs.delete(id);
    this.notify();
  }

  /**
   * Create or update one attack on a PC. Also patches the PC's live combatant
   * (matched by sourceId) so the deck and phones see the change immediately.
   * Used by the Party screen editor and the player web app.
   */
  async savePcAttack(pcId: string, action: MonsterAction): Promise<void> {
    const pc = this.pcs.get(pcId);
    if (!pc) return;
    const attacks = [...pc.attacks];
    const idx = attacks.findIndex((a) => a.id === action.id);
    if (idx === -1) attacks.push(action);
    else attacks[idx] = action;
    await this.pcs.put({ ...pc, attacks });
    await this.syncPcCombatantAttacks(pcId, attacks);
    this.notify();
  }

  async deletePcAttack(pcId: string, actionId: string): Promise<void> {
    const pc = this.pcs.get(pcId);
    if (!pc) return;
    const attacks = pc.attacks.filter((a) => a.id !== actionId);
    await this.pcs.put({ ...pc, attacks });
    await this.syncPcCombatantAttacks(pcId, attacks);
    this.notify();
  }

  private async syncPcCombatantAttacks(pcId: string, attacks: MonsterAction[]): Promise<void> {
    const combat = this.combat.get();
    if (!combat) return;
    const c = combat.combatants.find((x) => x.type === 'pc' && x.sourceId === pcId);
    if (!c) return;
    c.attacks = attacks.map((a) => ({ ...a }));
    await this.combat.set(combat);
  }

  // ---- Monsters ----

  /**
   * Attaches German SRD localization to imported monsters that predate the
   * l10n field, so existing libraries pick the feature up without a re-import.
   * Manual monsters are never touched.
   */
  async backfillMonsterL10n(map: Record<string, import('../shared/i18n').MonsterL10n>): Promise<void> {
    for (const m of this.monsters.list()) {
      if (m.source !== 'srd' || m.l10n?.de) continue;
      const entry = map[m.name];
      if (entry) await this.monsters.put({ ...m, l10n: { de: entry } });
    }
  }

  async saveMonster(m: Omit<MonsterTemplate, 'id'> & { id?: string }): Promise<void> {
    await this.monsters.put({ ...m, id: m.id ?? randomUUID() });
    this.notify();
  }

  async deleteMonster(id: string): Promise<void> {
    await this.monsters.delete(id);
    // Remove the monster from any template entries that reference it.
    for (const t of this.templates.list()) {
      if (t.entries.some((e) => e.monsterTemplateId === id)) {
        await this.templates.put({
          ...t,
          entries: t.entries.filter((e) => e.monsterTemplateId !== id),
        });
      }
    }
    this.notify();
  }

  async importMonsters(list: Omit<MonsterTemplate, 'id'>[]): Promise<number> {
    // Match by name (case-insensitive): re-importing updates existing SRD
    // entries instead of duplicating them.
    const existingByName = new Map(
      this.monsters
        .list()
        .filter((m) => m.source === 'srd')
        .map((m) => [m.name.toLowerCase(), m.id]),
    );
    const toPut = list.map((m) => ({
      ...m,
      id: existingByName.get(m.name.toLowerCase()) ?? randomUUID(),
    }));
    await this.monsters.putMany(toPut);
    this.notify();
    return toPut.length;
  }

  // ---- Encounter templates ----

  async saveTemplate(t: Omit<EncounterTemplate, 'id'> & { id?: string }): Promise<void> {
    await this.templates.put({ ...t, id: t.id ?? randomUUID() });
    this.notify();
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.templates.delete(id);
    this.notify();
  }

  async duplicateTemplate(id: string): Promise<void> {
    const t = this.templates.get(id);
    if (!t) return;
    await this.templates.put({
      ...t,
      id: randomUUID(),
      name: `${t.name} (copy)`,
      entries: t.entries.map((e) => ({ ...e })),
    });
    this.notify();
  }

  // ---- Combat lifecycle ----

  private async setCombat(combat: Combat | null): Promise<void> {
    await this.combat.set(combat);
    this.notify();
  }

  private getActiveCombat(): Combat | null {
    return this.combat.get();
  }

  /**
   * Instantiate a combat from a template + chosen PCs. Monsters are rolled
   * immediately; PCs are rolled too unless rollMode is 'monstersOnly'.
   */
  async startCombatSetup(
    templateId: string,
    pcIds: string[],
    rollMode: 'all' | 'monstersOnly',
  ): Promise<void> {
    const template = this.templates.get(templateId);
    if (!template) throw new Error('Template not found');

    const combatants: Combatant[] = [];

    for (const entry of template.entries) {
      const monster = this.monsters.get(entry.monsterTemplateId);
      if (!monster) continue;
      for (let i = 1; i <= entry.quantity; i++) {
        combatants.push({
          id: randomUUID(),
          displayName: entry.quantity > 1 ? `${monster.name} ${i}` : monster.name,
          type: 'monster',
          sourceId: monster.id,
          maxHp: monster.maxHp,
          currentHp: monster.maxHp,
          ac: monster.ac,
          initMod: monster.initMod,
          abilities: monster.abilities ?? null,
          attacks: monster.attacks.map((a) => ({ ...a })),
          conditions: [],
          initiative: d20() + monster.initMod,
          isDowned: false,
        });
      }
    }

    for (const pcId of pcIds) {
      const pc = this.pcs.get(pcId);
      if (!pc) continue;
      combatants.push({
        id: randomUUID(),
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
        initiative: rollMode === 'all' ? d20() + pc.initMod : null,
        isDowned: false,
      });
    }

    const combat: Combat = {
      id: randomUUID(),
      sourceTemplateId: templateId,
      phase: 'setup',
      combatants,
      currentIndex: 0,
      round: 0,
      log: [],
    };
    this.sortCombatants(combat);
    await this.setCombat(combat);
  }

  /** Sort descending by initiative (nulls last), tie-break by initMod. */
  private sortCombatants(combat: Combat): void {
    combat.combatants.sort((a, b) => {
      if (a.initiative === null && b.initiative === null) return 0;
      if (a.initiative === null) return 1;
      if (b.initiative === null) return -1;
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      return b.initMod - a.initMod;
    });
  }

  async setInitiative(combatantId: string, value: number | null): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || combat.phase !== 'setup') return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    c.initiative = value;
    this.sortCombatants(combat);
    await this.setCombat(combat);
  }

  async rerollInitiative(combatantId: string): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || combat.phase !== 'setup') return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    c.initiative = d20() + c.initMod;
    this.sortCombatants(combat);
    await this.setCombat(combat);
  }

  /** Manual drag-reorder during setup (for breaking remaining ties). */
  async reorderCombatant(fromIndex: number, toIndex: number): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || combat.phase !== 'setup') return;
    const list = combat.combatants;
    if (
      fromIndex < 0 || fromIndex >= list.length ||
      toIndex < 0 || toIndex >= list.length
    ) return;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    await this.setCombat(combat);
  }

  async beginCombat(): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || combat.phase !== 'setup') return;
    if (combat.combatants.some((c) => c.initiative === null)) {
      throw new Error('All combatants need an initiative value first');
    }
    combat.phase = 'active';
    combat.currentIndex = 0;
    combat.round = 1;
    this.pushLog(combat, { kind: 'combatStart', source: 'dm' });
    const first = combat.combatants[0];
    if (first) {
      this.pushLog(combat, {
        kind: 'turn',
        actorName: this.locName(first.displayName),
        actorType: first.type,
        source: 'dm',
      });
    }
    await this.setCombat(combat);
    this.emitCombatEvent('combatStart');
  }

  async endCombat(ctx: ActionContext = DM_CTX): Promise<void> {
    // Emit while the combat still exists, so the listener can read its
    // template (the Kenku handler pauses the playlist it started).
    const combat = this.combat.get();
    if (combat) {
      this.emitCombatEvent('combatEnd');
      // Archive the log (active combats only - an abandoned setup logs nothing).
      if (combat.phase === 'active') {
        this.pushLog(combat, { kind: 'combatEnd', source: ctx.source });
        const template = this.templates.get(combat.sourceTemplateId);
        await this.archive.put({
          id: combat.id,
          templateName: template?.name ?? '?',
          endedAt: Date.now(),
          rounds: combat.round,
          log: combat.log,
        });
      }
    }
    await this.setCombat(null);
  }

  // ---- Live combat control ----

  async nextTurn(ctx: ActionContext = DM_CTX): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || combat.phase !== 'active' || combat.combatants.length === 0) return;
    combat.currentIndex += 1;
    if (combat.currentIndex >= combat.combatants.length) {
      combat.currentIndex = 0;
      combat.round += 1;
    }
    this.logTurn(combat, ctx);
    await this.setCombat(combat);
    this.emitCombatEvent('turnChange');
  }

  async prevTurn(ctx: ActionContext = DM_CTX): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || combat.phase !== 'active' || combat.combatants.length === 0) return;
    if (combat.currentIndex === 0) {
      if (combat.round <= 1) return; // can't go before the start of combat
      combat.currentIndex = combat.combatants.length - 1;
      combat.round -= 1;
    } else {
      combat.currentIndex -= 1;
    }
    this.logTurn(combat, ctx);
    await this.setCombat(combat);
    this.emitCombatEvent('turnChange');
  }

  private logTurn(combat: Combat, ctx: ActionContext): void {
    const current = combat.combatants[combat.currentIndex];
    if (!current) return;
    this.pushLog(combat, {
      kind: 'turn',
      actorName: this.locName(current.displayName),
      actorType: current.type,
      source: ctx.source,
    });
  }

  async applyDamage(combatantId: string, amount: number, ctx: ActionContext = DM_CTX): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || amount <= 0) return;
    const idx = combat.combatants.findIndex((c) => c.id === combatantId);
    if (idx === -1) return;
    const c = combat.combatants[idx];
    c.currentHp = Math.max(0, c.currentHp - amount);
    this.pushLog(combat, {
      kind: 'damage',
      actorName: ctx.actorName,
      actorType: ctx.actorType,
      targetName: this.locName(c.displayName),
      targetType: c.type,
      amount,
      math: ctx.math,
      source: ctx.source,
      sourceName: ctx.sourceName,
    });
    let killedOrDowned: KenkuEventId | null = null;
    if (c.currentHp === 0) {
      killedOrDowned = c.type === 'monster' ? 'monsterKilled' : 'pcDowned';
      this.pushLog(combat, {
        kind: c.type === 'monster' ? 'kill' : 'down',
        targetName: this.locName(c.displayName),
        targetType: c.type,
        source: ctx.source,
        sourceName: ctx.sourceName,
      });
      if (c.type === 'monster') {
        // Remove dead monsters from the order entirely.
        combat.combatants.splice(idx, 1);
        if (combat.combatants.length === 0) {
          combat.currentIndex = 0;
        } else if (idx < combat.currentIndex) {
          combat.currentIndex -= 1;
        } else if (idx === combat.currentIndex && combat.currentIndex >= combat.combatants.length) {
          // The dying monster was the current turn and last in order: wrap.
          combat.currentIndex = 0;
          if (combat.phase === 'active') combat.round += 1;
        }
      } else {
        c.isDowned = true;
      }
    }
    await this.setCombat(combat);
    this.emitCombatEvent('damageApplied');
    if (killedOrDowned) this.emitCombatEvent(killedOrDowned);
  }

  async applyHeal(combatantId: string, amount: number, ctx: ActionContext = DM_CTX): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat || amount <= 0) return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    c.currentHp = Math.min(c.maxHp, c.currentHp + amount);
    if (c.currentHp > 0) c.isDowned = false;
    this.pushLog(combat, {
      kind: 'heal',
      actorName: ctx.actorName,
      actorType: ctx.actorType,
      targetName: this.locName(c.displayName),
      targetType: c.type,
      amount,
      source: ctx.source,
      sourceName: ctx.sourceName,
    });
    await this.setCombat(combat);
    this.emitCombatEvent('healApplied');
  }

  async toggleCondition(
    combatantId: string,
    condition: Condition,
    ctx: ActionContext = DM_CTX,
  ): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat) return;
    const c = combat.combatants.find((x) => x.id === combatantId);
    if (!c) return;
    const removing = c.conditions.includes(condition);
    if (removing) {
      c.conditions = c.conditions.filter((x) => x !== condition);
    } else {
      c.conditions = [...c.conditions, condition];
    }
    this.pushLog(combat, {
      kind: removing ? 'conditionRemoved' : 'conditionAdded',
      targetName: this.locName(c.displayName),
      targetType: c.type,
      condition,
      source: ctx.source,
    });
    await this.setCombat(combat);
  }

  /** Add monsters to an ongoing (or setup-phase) combat, rolling initiative. */
  async addMonsterToCombat(monsterTemplateId: string, quantity: number): Promise<void> {
    const combat = this.getActiveCombat();
    const monster = this.monsters.get(monsterTemplateId);
    if (!combat || !monster || quantity < 1) return;

    // Continue instance numbering after any existing same-named monsters.
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
      const combatant: Combatant = {
        id: randomUUID(),
        displayName: needsNumbers ? `${baseName} ${nextIndex++}` : baseName,
        type: 'monster',
        sourceId: monster.id,
        maxHp: monster.maxHp,
        currentHp: monster.maxHp,
        ac: monster.ac,
        initMod: monster.initMod,
        abilities: monster.abilities ?? null,
        attacks: monster.attacks.map((a) => ({ ...a })),
        conditions: [],
        initiative: d20() + monster.initMod,
        isDowned: false,
      };
      if (combat.phase === 'setup') {
        combat.combatants.push(combatant);
      } else {
        // Insert by initiative (after equal rolls), keeping the current
        // actor's turn: bump the pointer when inserting above it.
        let idx = combat.combatants.findIndex(
          (c) => c.initiative !== null && c.initiative < combatant.initiative!,
        );
        if (idx === -1) idx = combat.combatants.length;
        combat.combatants.splice(idx, 0, combatant);
        if (idx <= combat.currentIndex) combat.currentIndex += 1;
      }
    }
    if (combat.phase === 'setup') this.sortCombatants(combat);
    await this.setCombat(combat);
  }

  async removeCombatant(combatantId: string): Promise<void> {
    const combat = this.getActiveCombat();
    if (!combat) return;
    const idx = combat.combatants.findIndex((c) => c.id === combatantId);
    if (idx === -1) return;
    combat.combatants.splice(idx, 1);
    if (combat.combatants.length === 0) {
      combat.currentIndex = 0;
    } else if (idx < combat.currentIndex) {
      combat.currentIndex -= 1;
    } else if (combat.currentIndex >= combat.combatants.length) {
      combat.currentIndex = 0;
    }
    await this.setCombat(combat);
  }

  // ---- Settings ----

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    await this.settings.set({ ...this.settings.get(), ...patch });
    this.notify();
  }

  setBridgeClientCount(n: number): void {
    this.bridgeClientCount = n;
    this.notify();
  }
}

export const store = new AppStore();
