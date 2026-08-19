import { createServer, type Server } from 'http';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { store } from './state';
import { JsonValue } from './storage';
import { handleAttackEvent } from './kenku';
import { logAttackEvent } from './combatLog';
import { rollD20, rollPool, stripDiceResults, type RollMode } from '../shared/dice';
import { monsterName } from '../shared/i18n';
import { spellActionName } from '../shared/spellAction';
import type {
  AppState,
  Combatant,
  LogEntry,
  MonsterAction,
  PlayerClaimInfo,
} from '../shared/types';
import { abilityMod } from '../shared/types';
import { translate } from '../shared/i18n';

/**
 * LAN webserver for the player companion web app: one HTTP server (static
 * mobile bundle from out/mobile) with an attached WebSocket endpoint.
 * Completely separate from the Stream Deck bridge — this one binds all
 * interfaces so phones on the same Wi-Fi can reach it, and it speaks a
 * player-scoped protocol with Player-View-level disclosure (monster HP/AC
 * never leave the machine). Opt-in: it only runs while settings.playerWeb
 * .enabled is true.
 */

// ---- module state -----------------------------------------------------------

interface Claim {
  token: string;
  playerName: string | null;
}

interface SocketInfo {
  token: string | null;
  pcId: string | null;
  /** Coarse device label from the connection's User-Agent ("iPhone", …). */
  device: string | null;
}

interface PendingSave {
  id: string;
  pcId: string;
  actorName: string;
  attackId: string;
  attackName: string;
  /** Localized ability code + DC for the DM modal heading. */
  ability: string;
  dc: number;
  targetIds: string[];
  damage: number;
  /** Damage on a successful save: legacy default half; some spells deal none. */
  onSuccess: 'half' | 'none';
  /** Dice composition of the rolled damage, for the log (digital rolls). */
  math?: string;
  mathTypes?: (string | null)[];
  socket: WebSocket;
  /** Log attribution captured when the save was started. */
  sourceName?: string;
}

/** A pending Constitution save to keep Concentration after taking damage. */
interface ConcSave {
  id: string;
  pcId: string;
  combatantId: string;
  spellName: string;
  deName: string | null;
  dc: number;
  damage: number;
  /** CON modifier for the digital roll and the manual hint (null = unknown). */
  conMod: number | null;
  socket: WebSocket;
}

const concSaves = new Map<string, ConcSave>();

let httpServer: Server | null = null;
let wss: WebSocketServer | null = null;
let claims: JsonValue<Record<string, Claim>> | null = null;
let currentPort = 0;
let currentlyEnabled = false;
let listenersRegistered = false;
let lastError: string | null = null;
const sockets = new Map<WebSocket, SocketInfo>();
const pendingSaves = new Map<string, PendingSave>();

/** DM-side listener: a player initiated a save-based attack. */
let savePendingListener:
  | ((pending: {
      id: string;
      actorName: string;
      attackName: string;
      ability: string;
      dc: number;
      damage: number;
      onSuccess: 'half' | 'none';
      targetIds: string[];
    }) => void)
  | null = null;

export function onPlayerSavePending(cb: typeof savePendingListener): void {
  savePendingListener = cb;
}

// ---- static files -----------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function mobileRoot(): string {
  // out/main/... → out/mobile (same layout in dev and packaged builds).
  return path.join(__dirname, '..', 'mobile');
}

async function serveStatic(urlPath: string, res: import('http').ServerResponse): Promise<void> {
  const root = mobileRoot();
  let file = path.normalize(path.join(root, decodeURIComponent(urlPath)));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (urlPath === '/' || urlPath === '') file = path.join(root, 'index.html');
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    // SPA fallback: unknown paths get the app shell.
    try {
      const body = await fs.readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(body);
    } catch {
      res.writeHead(404).end('player app bundle missing (out/mobile)');
    }
  }
}

// ---- claims -----------------------------------------------------------------

function claimsMap(): Record<string, Claim> {
  return claims?.get() ?? {};
}

function tokenPcId(token: string | null): string | null {
  if (!token) return null;
  for (const [pcId, claim] of Object.entries(claimsMap())) {
    if (claim.token === token) return pcId;
  }
  return null;
}

function publishClaims(): void {
  const connectedPcIds = new Set(
    [...sockets.values()].filter((s) => s.pcId).map((s) => s.pcId as string),
  );
  const list: PlayerClaimInfo[] = Object.entries(claimsMap()).map(([pcId, claim]) => ({
    pcId,
    playerName: claim.playerName,
    connected: connectedPcIds.has(pcId),
  }));
  store.setPlayerClients(list);
}

/** DM-side kick: frees the PC and boots the phone back to the claim screen. */
export async function kickPlayer(pcId: string): Promise<void> {
  if (!claims) return;
  const map = { ...claimsMap() };
  if (!map[pcId]) return;
  delete map[pcId];
  await claims.set(map);
  for (const [socket, info] of sockets) {
    if (info.pcId === pcId) {
      info.pcId = null;
      info.token = null;
      send(socket, { type: 'kicked' });
    }
  }
  publishClaims();
  broadcastState();
}

// ---- URLs -------------------------------------------------------------------

/** All LAN URLs a phone could use (one per non-internal IPv4 interface). */
export function getPlayerWebUrls(): { urls: string[]; port: number; error: string | null } {
  const port = store.getState().settings.playerWeb.port;
  const urls: string[] = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        urls.push(`http://${info.address}:${port}`);
      }
    }
  }
  return { urls, port, error: lastError };
}

// ---- player-facing state projection ----------------------------------------

function isBloodied(c: Combatant): boolean {
  return c.currentHp < c.maxHp * 0.5;
}

/**
 * The player log filter: no dice compositions on player surfaces. Attack-roll
 * numbers and damage math stay DM-side; save totals remain (table-announced).
 */
function filterLogForPlayers(log: LogEntry[]): LogEntry[] {
  // Live-combat redaction: attack-roll numbers stay DM-side, and damage math
  // keeps its composition ("2d6 +4" — what was thrown is table knowledge) but
  // loses the per-die results in the brackets. Save totals remain - they're
  // table-announced. Archived fights skip this filter entirely: once combat
  // is over, players may browse the full breakdowns in Past Combats.
  return log.map((e) =>
    e.kind === 'attackRoll' || e.math !== undefined
      ? {
          ...e,
          die: undefined,
          dice: undefined,
          total: e.kind === 'attackRoll' ? undefined : e.total,
          math: e.math === undefined ? undefined : stripDiceResults(e.math),
          // mathTypes stays: the damage TYPE is table knowledge too.
        }
      : e,
  );
}

function playerStateMessage(state: AppState, info: SocketInfo): string {
  const lang = state.settings.language;
  const combat = state.combat;
  const active = combat !== null && combat.phase === 'active';
  const ownPc = info.pcId ? state.pcs.find((p) => p.id === info.pcId) ?? null : null;
  const ownCombatant = active
    ? combat!.combatants.find((c) => c.type === 'pc' && c.sourceId === info.pcId) ?? null
    : null;

  const combatants = active
    ? combat!.combatants.map((c, i) => {
        const base = {
          id: c.id,
          name: monsterName(lang, c.displayName),
          type: c.type,
          isCurrentTurn: i === combat!.currentIndex,
          isDowned: c.isDowned,
          conditions: c.conditions,
          concentration: c.concentration ?? null,
          isBloodied: c.type === 'monster' ? isBloodied(c) : undefined,
        };
        // Player-View disclosure: monster HP/AC never leave the app.
        if (c.type !== 'pc') return base;
        const pcExtra = { currentHp: c.currentHp, maxHp: c.maxHp };
        if (c.sourceId !== info.pcId) return { ...base, ...pcExtra };
        return { ...base, ...pcExtra, ac: c.ac, initiative: c.initiative };
      })
    : [];

  const claimed = claimsMap();
  return JSON.stringify({
    type: 'state',
    language: lang,
    gating: state.settings.playerWeb.gating,
    combatActive: active,
    round: active ? combat!.round : 0,
    currentIndex: active ? combat!.currentIndex : 0,
    myTurn: ownCombatant ? combat!.combatants.indexOf(ownCombatant) === combat!.currentIndex : false,
    claims: state.pcs.map((p) => ({
      pcId: p.id,
      name: p.name,
      taken: p.id in claimed,
      mine: p.id === info.pcId,
      playerName: claimed[p.id]?.playerName ?? null,
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
          spellSlots: ownPc.spellSlots ?? null,
          combatantId: ownCombatant?.id ?? null,
        }
      : null,
    combatants,
    log: active ? filterLogForPlayers(combat!.log).slice(-200) : [],
    archive: store.listArchive().map((a) => ({
      id: a.id,
      templateName: a.templateName,
      endedAt: a.endedAt,
      rounds: a.rounds,
    })),
  });
}

function send(socket: WebSocket, msg: object): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function sendState(socket: WebSocket): void {
  const info = sockets.get(socket);
  if (!info) return;
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(playerStateMessage(store.getState(), info));
  }
}

function broadcastState(): void {
  if (!wss) return;
  const state = store.getState();
  for (const [socket, info] of sockets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(playerStateMessage(state, info));
    }
  }
}

// ---- command validation ------------------------------------------------------

interface PlayerCommand {
  type: string;
  token?: string;
  pcId?: string;
  playerName?: string;
  targets?: string[];
  amount?: number;
  attackId?: string;
  targetIds?: string[];
  d20Total?: number;
  natural?: number;
  damage?: number;
  mode?: string;
  /** Digital attack rolls: 'adv' | 'dis' | absent for a normal roll. */
  advantage?: string;
  action?: MonsterAction;
  actionId?: string;
  archiveId?: string;
  /** Spell casts: the slot level spent (absent for cantrips). */
  slotLevel?: number;
  /** Concentration checks: the pending check id and (manual) rolled total. */
  id?: string;
  total?: number;
}

/** The acting PC's live combatant, or null when it isn't in the fight. */
function ownCombatant(pcId: string): Combatant | null {
  const combat = store.getState().combat;
  if (!combat || combat.phase !== 'active') return null;
  return combat.combatants.find((c) => c.type === 'pc' && c.sourceId === pcId) ?? null;
}

function isMyTurn(pcId: string): boolean {
  const combat = store.getState().combat;
  if (!combat || combat.phase !== 'active') return false;
  const own = ownCombatant(pcId);
  return own !== null && combat.combatants.indexOf(own) === combat.currentIndex;
}

/**
 * Turn gating, enforced here regardless of what the phone UI shows.
 * strict: nothing off-turn. relaxed: self-targeted damage/heal allowed.
 */
function gateAllows(pcId: string, targets: string[], kind: 'hpChange' | 'attack'): boolean {
  if (isMyTurn(pcId)) return true;
  const gating = store.getState().settings.playerWeb.gating;
  if (gating !== 'relaxed' || kind !== 'hpChange') return false;
  const own = ownCombatant(pcId);
  return own !== null && targets.length === 1 && targets[0] === own.id;
}

function validAmount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 999;
}

// ---- attack resolution -------------------------------------------------------

/**
 * Same convention as the DM attack modal: sum non-conditional damage rows.
 * `extra` adds an upcast pool ("+2d6 from a level-5 slot") as its own math
 * bracket, typed like the first damage row.
 */
function rollActionDamage(
  action: MonsterAction,
  extra?: { count: number; die: number } | null,
): {
  total: number;
  math: string;
  mathTypes: (string | null)[];
  /** Every individual die result, in roll order (for phone animations). */
  rolls: number[];
} {
  let total = 0;
  const mathParts: string[] = [];
  // One entry per bracket group in the math, so the log can tint the rolled
  // numbers with their damage type.
  const mathTypes: (string | null)[] = [];
  const rolls: number[] = [];
  for (const d of action.onHit.damage) {
    if (d.condition) continue;
    if (d.dice && d.count && d.die) {
      const roll = rollPool([{ count: d.count, die: d.die }], d.bonus ?? 0);
      total += roll.total;
      rolls.push(...roll.perPart[0]);
      const bonus = d.bonus ?? 0;
      const bonusStr = bonus === 0 ? '' : bonus > 0 ? ` +${bonus}` : ` ${bonus}`;
      mathParts.push(`${d.dice} [${roll.perPart[0].join('+')}]${bonusStr}`);
      mathTypes.push(d.type ?? null);
    } else {
      const value = d.average ?? 0;
      total += value;
      mathParts.push(`${value}`);
    }
  }
  if (extra && extra.count > 0) {
    const roll = rollPool([{ count: extra.count, die: extra.die }], 0);
    total += roll.total;
    rolls.push(...roll.perPart[0]);
    mathParts.push(`${extra.count}d${extra.die} [${roll.perPart[0].join('+')}]`);
    mathTypes.push(action.onHit.damage[0]?.type ?? null);
  }
  return { total, math: `${mathParts.join(' + ')} = ${total}`, mathTypes, rolls };
}

/** The upcast dice pool a chosen slot level adds, or null. */
function upcastExtra(
  action: MonsterAction,
  slotLevel: number | undefined,
): { count: number; die: number } | null {
  const meta = action.spell;
  if (!meta?.upcast || typeof slotLevel !== 'number' || slotLevel <= meta.level) return null;
  return { count: meta.upcast.count * (slotLevel - meta.level), die: meta.upcast.die };
}

/**
 * Spends the slot for a spell cast and writes the `cast` log entry — the
 * slot spend is table-public immediately, only the roll reveal is delayed.
 * Non-spell actions pass through; cantrips log without spending. Returns
 * false (nothing spent, nothing logged) when the slot isn't available —
 * callers answer with error `noSlot`.
 */
async function spendSlotForCast(
  ctx: AttackContext,
  slotLevel: number | undefined,
  sourceName: string | undefined,
): Promise<boolean> {
  const meta = ctx.action.spell;
  if (!meta) return true;
  // Log snapshots carry names in the language active when the entry was made.
  const spellName = spellActionName(store.getState().settings.language, ctx.action);
  const conc = meta.concentration
    ? { name: ctx.action.name, deName: meta.deName ?? null }
    : null;
  if (meta.level === 0) {
    return store.castSpell(ctx.pcId, spellName, null, { source: 'player', sourceName }, conc);
  }
  const lvl = typeof slotLevel === 'number' && Number.isInteger(slotLevel) ? slotLevel : -1;
  if (lvl < meta.level || lvl > 9) return false;
  return store.castSpell(ctx.pcId, spellName, lvl, { source: 'player', sourceName }, conc);
}

interface AttackContext {
  pcId: string;
  pc: { name: string };
  action: MonsterAction;
}

/** Names entering the log (or a phone) are localized to the app language. */
function locName(name: string): string {
  return monsterName(store.getState().settings.language, name);
}

/**
 * Broadcast side effects of digital rolls (log entry, verdict sound, damage
 * application) wait until the roller's phone animation has revealed — so
 * nobody reads the log faster than the person who rolled. Slightly under the
 * phone's tumble (3.0s/2.2s) + settle (0.95s) timings.
 */
const ATTACK_REVEAL_MS = 3600;
const DAMAGE_REVEAL_MS = 2900;

/** Coarse device label so anonymous phones are still tellable apart. */
function deviceLabel(ua: string | undefined): string | null {
  if (!ua) return null;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}

/**
 * Log attribution for a player action: the name the player typed when
 * claiming, falling back to the device label from their browser.
 */
function sourceNameOf(info: SocketInfo | undefined): string | undefined {
  if (!info) return undefined;
  const claimed = info.pcId ? claimsMap()[info.pcId]?.playerName : null;
  return claimed || info.device || undefined;
}

/** Shared validation for all attack commands. */
function attackContext(cmd: PlayerCommand, info: SocketInfo): AttackContext | null {
  if (!info.pcId) return null;
  const pc = store.getState().pcs.find((p) => p.id === info.pcId);
  const action = pc?.attacks.find((a) => a.id === cmd.attackId);
  if (!pc || !action) return null;
  return { pcId: info.pcId, pc, action };
}

async function resolveAttackRoll(
  socket: WebSocket,
  ctx: AttackContext,
  targetId: string,
  die: number | null,
  total: number,
): Promise<void> {
  const combat = store.getState().combat;
  const target = combat?.combatants.find((c) => c.id === targetId);
  if (!combat || !target) {
    send(socket, { type: 'error', code: 'badTarget' });
    return;
  }
  const outcome =
    die === 20 ? 'crit' : die === 1 ? 'miss' : total >= target.ac ? 'hit' : 'miss';

  const sourceName = sourceNameOf(sockets.get(socket));
  handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase: 'attackRoll' });
  const phase = outcome === 'crit' ? 'attackCrit' : outcome === 'hit' ? 'attackHit' : 'attackMiss';
  handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase });
  logAttackEvent(
    phase,
    {
      actorName: ctx.pc.name,
      actorType: 'pc',
      targetName: locName(target.displayName),
      targetType: target.type,
      attackName: ctx.action.name,
      die: die ?? undefined,
      total,
    },
    'player',
    sourceName,
  );

  let damage: number | null = null;
  if (outcome !== 'miss') {
    const rolled = rollActionDamage(ctx.action);
    damage = rolled.total;
    handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase: 'damageRoll' });
    await store.applyDamage(target.id, damage, {
      source: 'player',
      actorName: ctx.pc.name,
      actorType: 'pc',
      math: rolled.math,
      mathTypes: rolled.mathTypes,
      sourceName,
    });
    handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase: 'damageApplied' });
  }
  send(socket, {
    type: 'attackResult',
    targetId,
    targetName: locName(target.displayName),
    die,
    total,
    outcome,
    damage,
  });
}

async function resolveManualAttack(socket: WebSocket, ctx: AttackContext, cmd: PlayerCommand): Promise<void> {
  const combat = store.getState().combat;
  const targetId = cmd.targetIds?.[0];
  const target = combat?.combatants.find((c) => c.id === targetId);
  if (!combat || !target || typeof cmd.d20Total !== 'number') {
    send(socket, { type: 'error', code: 'badTarget' });
    return;
  }
  // A typed total can't reveal naturals, so the player flags nat 20 / nat 1.
  const outcome =
    cmd.natural === 20
      ? 'crit'
      : cmd.natural === 1
        ? 'miss'
        : cmd.d20Total >= target.ac
          ? 'hit'
          : 'miss';

  const sourceName = sourceNameOf(sockets.get(socket));
  const phase = outcome === 'crit' ? 'attackCrit' : outcome === 'hit' ? 'attackHit' : 'attackMiss';
  handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase });
  logAttackEvent(
    phase,
    {
      actorName: ctx.pc.name,
      actorType: 'pc',
      targetName: locName(target.displayName),
      targetType: target.type,
      attackName: ctx.action.name,
      die: cmd.natural === 20 ? 20 : cmd.natural === 1 ? 1 : undefined,
      total: cmd.d20Total,
    },
    'player',
    sourceName,
  );

  let damage: number | null = null;
  if (outcome !== 'miss' && validAmount(cmd.damage)) {
    damage = cmd.damage;
    await store.applyDamage(target.id, damage, {
      source: 'player',
      actorName: ctx.pc.name,
      actorType: 'pc',
      sourceName,
    });
    handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase: 'damageApplied' });
  }
  send(socket, {
    type: 'attackResult',
    targetId,
    targetName: locName(target.displayName),
    die: null,
    total: cmd.d20Total,
    outcome,
    damage,
  });
}

/** Save-based action: park it for the DM to adjudicate in the desktop modal. */
function startPendingSave(socket: WebSocket, ctx: AttackContext, cmd: PlayerCommand): void {
  const combat = store.getState().combat;
  if (!combat || !ctx.action.save) {
    send(socket, { type: 'error', code: 'badAttack' });
    return;
  }
  const targetIds = (cmd.targetIds ?? []).filter((id) =>
    combat.combatants.some((c) => c.id === id),
  );
  if (targetIds.length === 0) {
    send(socket, { type: 'error', code: 'badTarget' });
    return;
  }
  const rolled = rollActionDamage(ctx.action, upcastExtra(ctx.action, cmd.slotLevel));
  const manual = cmd.mode === 'manual' && validAmount(cmd.damage);
  const damage = manual ? (cmd.damage as number) : rolled.total;
  const damageMath = manual ? undefined : rolled.math;
  const damageMathTypes = manual ? undefined : rolled.mathTypes;
  handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase: 'damageRoll' });

  const pending: PendingSave = {
    id: randomUUID(),
    pcId: ctx.pcId,
    actorName: ctx.pc.name,
    attackId: ctx.action.id,
    attackName: ctx.action.name,
    ability: ctx.action.save.ability,
    dc: ctx.action.save.dc,
    targetIds,
    damage,
    onSuccess: ctx.action.save.onSuccess ?? 'half',
    math: damageMath,
    mathTypes: damageMathTypes,
    socket,
    sourceName: sourceNameOf(sockets.get(socket)),
  };
  pendingSaves.set(pending.id, pending);
  // Digital rolls carry the roller's own dice so the phone can reveal them.
  send(socket, {
    type: 'savePending',
    id: pending.id,
    damage,
    rolls: manual ? undefined : rolled.rolls,
    math: manual ? undefined : rolled.math,
    mathTypes: manual ? undefined : rolled.mathTypes,
  });
  savePendingListener?.({
    id: pending.id,
    actorName: pending.actorName,
    attackName: pending.attackName,
    ability: pending.ability,
    dc: pending.dc,
    damage: pending.damage,
    onSuccess: pending.onSuccess,
    targetIds: pending.targetIds,
  });
}

/** DM modal resolution: full damage on failure; half or none on success. */
export async function resolvePendingSave(
  id: string,
  results: Array<{ targetId: string; saved: boolean; total?: number }>,
): Promise<void> {
  const pending = pendingSaves.get(id);
  if (!pending) return;
  pendingSaves.delete(id);
  const combat = store.getState().combat;
  const half = pending.onSuccess === 'none' ? 0 : Math.floor(pending.damage / 2);
  const applied: Array<{ targetId: string; targetName: string; saved: boolean; amount: number }> = [];
  for (const r of results) {
    const target = combat?.combatants.find((c) => c.id === r.targetId);
    if (!target || !pending.targetIds.includes(r.targetId)) continue;
    const amount = r.saved ? half : pending.damage;
    void store.appendLog({
      kind: 'save',
      actorName: locName(target.displayName),
      actorType: target.type,
      targetName: pending.actorName,
      targetType: 'pc',
      attackName: pending.attackName,
      total: r.total,
      dc: pending.dc,
      outcome: r.saved ? 'saved' : 'failed',
      source: 'dm',
    });
    if (amount > 0) {
      await store.applyDamage(r.targetId, amount, {
        source: 'player',
        actorName: pending.actorName,
        actorType: 'pc',
        math: pending.math
          ? r.saved
            ? `${pending.math} → ½ ${amount}`
            : pending.math
          : undefined,
        mathTypes: pending.mathTypes,
        sourceName: pending.sourceName,
      });
    }
    applied.push({ targetId: r.targetId, targetName: locName(target.displayName), saved: r.saved, amount });
  }
  handleAttackEvent({ sourceId: pending.pcId, attackId: pending.attackId, phase: 'damageApplied' });
  send(pending.socket, { type: 'saveResolved', id, results: applied });
}

/** DM dismissed the modal (or combat ended) without adjudicating. */
export function dismissPendingSave(id: string): void {
  const pending = pendingSaves.get(id);
  if (!pending) return;
  pendingSaves.delete(id);
  send(pending.socket, { type: 'saveResolved', id, cancelled: true, results: [] });
}

/** Verdict on a Concentration check: log it, break the spell on a failure. */
async function resolveConcSave(pending: ConcSave, die: number | null, total: number): Promise<void> {
  concSaves.delete(pending.id);
  const saved = total >= pending.dc;
  const lang = store.getState().settings.language;
  const label = `${translate(lang, 'spellbook.concentration')} (${
    lang === 'de' && pending.deName ? pending.deName : pending.spellName
  })`;
  const pc = store.getState().pcs.find((p) => p.id === pending.pcId);
  await store.appendLog({
    kind: 'save',
    actorName: pc?.name ?? '?',
    actorType: 'pc',
    attackName: label,
    die: die ?? undefined,
    total,
    dc: pending.dc,
    outcome: saved ? 'saved' : 'failed',
    source: 'player',
    sourceName: sourceNameOf(sockets.get(pending.socket)),
  });
  if (!saved) await store.setConcentration(pending.combatantId, null);
  send(pending.socket, {
    type: 'concSaveResult',
    id: pending.id,
    die,
    total,
    dc: pending.dc,
    saved,
    spellName: pending.spellName,
    deName: pending.deName,
  });
}

/** Combat ended or campaign switched before the player answered. */
function dismissConcSave(id: string): void {
  const pending = concSaves.get(id);
  if (!pending) return;
  concSaves.delete(id);
  send(pending.socket, { type: 'concSaveResult', id, cancelled: true });
}

// ---- command handling --------------------------------------------------------

async function handleCommand(socket: WebSocket, cmd: PlayerCommand): Promise<void> {
  const info = sockets.get(socket);
  if (!info || !claims) return;

  switch (cmd.type) {
    case 'hello': {
      // Re-attach a device whose token still owns a claim.
      info.token = typeof cmd.token === 'string' ? cmd.token : null;
      info.pcId = tokenPcId(info.token);
      publishClaims();
      sendState(socket);
      return;
    }

    case 'claim': {
      if (typeof cmd.pcId !== 'string' || typeof cmd.token !== 'string') return;
      const pc = store.getState().pcs.find((p) => p.id === cmd.pcId);
      if (!pc) {
        send(socket, { type: 'claimResult', ok: false, reason: 'unknownPc' });
        return;
      }
      const map = { ...claimsMap() };
      const existing = map[cmd.pcId];
      if (existing && existing.token !== cmd.token) {
        send(socket, { type: 'claimResult', ok: false, reason: 'taken' });
        return;
      }
      const name = typeof cmd.playerName === 'string' ? cmd.playerName.trim().slice(0, 40) : '';
      map[cmd.pcId] = { token: cmd.token, playerName: name || null };
      await claims.set(map);
      // One PC per device: release any other claim this token held.
      for (const [pcId, claim] of Object.entries(map)) {
        if (pcId !== cmd.pcId && claim.token === cmd.token) {
          delete map[pcId];
          await claims.set(map);
        }
      }
      info.token = cmd.token;
      info.pcId = cmd.pcId;
      send(socket, { type: 'claimResult', ok: true });
      publishClaims();
      broadcastState();
      return;
    }

    case 'release': {
      if (!info.pcId) return;
      const map = { ...claimsMap() };
      delete map[info.pcId];
      await claims.set(map);
      info.pcId = null;
      info.token = null;
      publishClaims();
      broadcastState();
      return;
    }

    case 'applyDamage':
    case 'applyHeal': {
      if (!info.pcId || !Array.isArray(cmd.targets) || !validAmount(cmd.amount)) return;
      const targets = cmd.targets.filter((t): t is string => typeof t === 'string');
      if (targets.length === 0) return;
      if (!gateAllows(info.pcId, targets, 'hpChange')) {
        send(socket, { type: 'error', code: 'notYourTurn' });
        return;
      }
      const pc = store.getState().pcs.find((p) => p.id === info.pcId);
      const ctx = {
        source: 'player' as const,
        actorName: pc?.name,
        actorType: 'pc' as const,
        sourceName: sourceNameOf(info),
      };
      for (const id of targets) {
        if (cmd.type === 'applyDamage') await store.applyDamage(id, cmd.amount, ctx);
        else await store.applyHeal(id, cmd.amount, ctx);
      }
      return;
    }

    case 'attackRollDigital': {
      // Stage 1 of the split digital flow: just the d20, no damage yet.
      const ctx = attackContext(cmd, info);
      if (!ctx || ctx.action.type === 'save' || ctx.action.save) {
        send(socket, { type: 'error', code: 'badAttack' });
        return;
      }
      const targetIds = cmd.targetIds ?? [];
      if (!gateAllows(ctx.pcId, targetIds, 'attack')) {
        send(socket, { type: 'error', code: 'notYourTurn' });
        return;
      }
      const combat = store.getState().combat;
      const target = combat?.combatants.find((c) => c.id === targetIds[0]);
      if (!combat || !target) {
        send(socket, { type: 'error', code: 'badTarget' });
        return;
      }
      const sourceName = sourceNameOf(info);
      // Spell casts burn their slot here, before the d20 — a miss still
      // spends it, and the cast is logged the moment the words are spoken.
      if (!(await spendSlotForCast(ctx, cmd.slotLevel, sourceName))) {
        send(socket, { type: 'error', code: 'noSlot' });
        return;
      }
      const mode: RollMode =
        cmd.advantage === 'adv' || cmd.advantage === 'dis' ? cmd.advantage : 'normal';
      const { die, dice } = rollD20(mode);
      const total = die + (ctx.action.attack?.toHit ?? 0);
      const outcome =
        die === 20 ? 'crit' : die === 1 ? 'miss' : total >= target.ac ? 'hit' : 'miss';
      handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase: 'attackRoll' });
      const phase =
        outcome === 'crit' ? 'attackCrit' : outcome === 'hit' ? 'attackHit' : 'attackMiss';
      const targetName = locName(target.displayName);
      const targetType = target.type;
      const pcId = ctx.pcId;
      const attackId = ctx.action.id;
      const actorName = ctx.pc.name;
      const attackName = ctx.action.name;
      setTimeout(() => {
        handleAttackEvent({ sourceId: pcId, attackId, phase });
        logAttackEvent(
          phase,
          {
            actorName,
            actorType: 'pc',
            targetName,
            targetType,
            attackName,
            die,
            dice,
            total,
          },
          'player',
          sourceName,
        );
      }, ATTACK_REVEAL_MS);
      send(socket, {
        type: 'attackRollResult',
        targetId: target.id,
        targetName,
        die,
        dice,
        total,
        outcome,
      });
      return;
    }

    case 'damageRollDigital': {
      // Stage 2: roll and apply the damage for a hit confirmed in stage 1.
      const ctx = attackContext(cmd, info);
      if (!ctx) {
        send(socket, { type: 'error', code: 'badAttack' });
        return;
      }
      const targetIds = cmd.targetIds ?? [];
      if (!gateAllows(ctx.pcId, targetIds, 'attack')) {
        send(socket, { type: 'error', code: 'notYourTurn' });
        return;
      }
      const combat = store.getState().combat;
      const target = combat?.combatants.find((c) => c.id === targetIds[0]);
      if (!combat || !target) {
        send(socket, { type: 'error', code: 'badTarget' });
        return;
      }
      // The slot was spent at stage 1; the chosen level rides along again
      // only to add its upcast dice to the pool.
      const rolled = rollActionDamage(ctx.action, upcastExtra(ctx.action, cmd.slotLevel));
      handleAttackEvent({ sourceId: ctx.pcId, attackId: ctx.action.id, phase: 'damageRoll' });
      {
        const targetId = target.id;
        const pcId = ctx.pcId;
        const attackId = ctx.action.id;
        const actorName = ctx.pc.name;
        const sourceName = sourceNameOf(info);
        setTimeout(() => {
          void (async () => {
            await store.applyDamage(targetId, rolled.total, {
              source: 'player',
              actorName,
              actorType: 'pc',
              math: rolled.math,
              mathTypes: rolled.mathTypes,
              sourceName,
            });
            handleAttackEvent({ sourceId: pcId, attackId, phase: 'damageApplied' });
          })();
        }, DAMAGE_REVEAL_MS);
      }
      // The roller sees their own numbers: per-die results for the settle
      // animation plus the breakdown string (other phones still get nothing).
      send(socket, {
        type: 'damageResult',
        targetId: target.id,
        targetName: locName(target.displayName),
        damage: rolled.total,
        rolls: rolled.rolls,
        math: rolled.math,
        mathTypes: rolled.mathTypes,
      });
      return;
    }

    case 'attackDigital':
    case 'attackManual': {
      const ctx = attackContext(cmd, info);
      if (!ctx) {
        send(socket, { type: 'error', code: 'badAttack' });
        return;
      }
      const targetIds = cmd.targetIds ?? [];
      if (!gateAllows(ctx.pcId, targetIds, 'attack')) {
        send(socket, { type: 'error', code: 'notYourTurn' });
        return;
      }
      // Spell casts (save spells and manual-rolled attack spells land here)
      // spend their slot up front.
      if (!(await spendSlotForCast(ctx, cmd.slotLevel, sourceNameOf(info)))) {
        send(socket, { type: 'error', code: 'noSlot' });
        return;
      }
      // Save-based actions go through the DM's adjudication modal.
      if (ctx.action.type === 'save' || ctx.action.save) {
        startPendingSave(socket, ctx, { ...cmd, mode: cmd.type === 'attackManual' ? 'manual' : 'digital' });
        return;
      }
      if (cmd.type === 'attackDigital') {
        const toHit = ctx.action.attack?.toHit ?? 0;
        const die = Math.floor(Math.random() * 20) + 1;
        await resolveAttackRoll(socket, ctx, targetIds[0] ?? '', die, die + toHit);
      } else {
        await resolveManualAttack(socket, ctx, cmd);
      }
      return;
    }

    case 'castSpell': {
      // Utility spells: nothing to roll — spend the slot, log the cast.
      const ctx = attackContext(cmd, info);
      if (!ctx || !ctx.action.spell) {
        send(socket, { type: 'error', code: 'badAttack' });
        return;
      }
      if (!gateAllows(ctx.pcId, [], 'attack')) {
        send(socket, { type: 'error', code: 'notYourTurn' });
        return;
      }
      if (!(await spendSlotForCast(ctx, cmd.slotLevel, sourceNameOf(info)))) {
        send(socket, { type: 'error', code: 'noSlot' });
        return;
      }
      send(socket, { type: 'castResult', actionId: ctx.action.id, slotLevel: cmd.slotLevel ?? null });
      return;
    }

    case 'castHealDigital':
    case 'castHealManual': {
      // Healing spells: same workflow as attacks — the app rolls, or the
      // player rolls physical dice and types the total — applied as healing.
      const ctx = attackContext(cmd, info);
      if (!ctx || !ctx.action.spell?.healing) {
        send(socket, { type: 'error', code: 'badAttack' });
        return;
      }
      const targetIds = cmd.targetIds ?? [];
      if (!gateAllows(ctx.pcId, targetIds, 'attack')) {
        send(socket, { type: 'error', code: 'notYourTurn' });
        return;
      }
      const combat = store.getState().combat;
      const target = combat?.combatants.find((c) => c.id === targetIds[0]);
      if (!combat || !target) {
        send(socket, { type: 'error', code: 'badTarget' });
        return;
      }
      const sourceName = sourceNameOf(info);
      if (!(await spendSlotForCast(ctx, cmd.slotLevel, sourceName))) {
        send(socket, { type: 'error', code: 'noSlot' });
        return;
      }
      const healCtx = {
        source: 'player' as const,
        actorName: ctx.pc.name,
        actorType: 'pc' as const,
        sourceName,
      };
      if (cmd.type === 'castHealManual') {
        if (!validAmount(cmd.amount)) {
          send(socket, { type: 'error', code: 'badTarget' });
          return;
        }
        await store.applyHeal(target.id, cmd.amount, healCtx);
        send(socket, {
          type: 'healResult',
          targetId: target.id,
          targetName: locName(target.displayName),
          amount: cmd.amount,
        });
        return;
      }
      const rolled = rollActionDamage(ctx.action, upcastExtra(ctx.action, cmd.slotLevel));
      {
        const targetId = target.id;
        setTimeout(() => {
          void store.applyHeal(targetId, rolled.total, healCtx);
        }, DAMAGE_REVEAL_MS);
      }
      send(socket, {
        type: 'healResult',
        targetId: target.id,
        targetName: locName(target.displayName),
        amount: rolled.total,
        rolls: rolled.rolls,
        math: rolled.math,
      });
      return;
    }

    case 'longRest': {
      // Like saveAttack: never turn-gated — resting between fights is the point.
      if (!info.pcId) return;
      await store.longRest(info.pcId);
      return;
    }

    case 'concSaveDigital': {
      // Concentration check, app-rolled: d20 + CON modifier vs the DC.
      const pending = typeof cmd.id === 'string' ? concSaves.get(cmd.id) : undefined;
      if (!pending || pending.socket !== socket) return;
      const die = Math.floor(Math.random() * 20) + 1;
      await resolveConcSave(pending, die, die + (pending.conMod ?? 0));
      return;
    }

    case 'concSaveManual': {
      // The player rolled physical dice and typed the total.
      const pending = typeof cmd.id === 'string' ? concSaves.get(cmd.id) : undefined;
      if (!pending || pending.socket !== socket || typeof cmd.total !== 'number') return;
      await resolveConcSave(pending, null, Math.floor(cmd.total));
      return;
    }

    case 'getSpells': {
      // On-demand spellbook reference (all imported spells, no class filter —
      // players browse what they might prepare). Not part of state pushes:
      // ~340 full spell texts would bloat every update. English + German ride
      // together so the phone localizes at render.
      send(socket, {
        type: 'spellList',
        spells: store.getState().spells.map((s) => ({
          id: s.id,
          name: s.name,
          level: s.level,
          school: s.school,
          castingTime: s.castingTime,
          range: s.range,
          components: s.components,
          duration: s.duration,
          concentration: s.concentration,
          ritual: s.ritual,
          text: s.text,
          attack: s.attack,
          save: s.save,
          damage: s.damage,
          healing: s.healing,
          upcast: s.upcast,
          upcastText: s.upcastText,
          l10n: s.l10n ?? null,
        })),
      });
      return;
    }

    case 'saveAttack': {
      // Never turn-gated: editing your character between turns is the point.
      if (!info.pcId || !cmd.action || typeof cmd.action !== 'object') return;
      const action = cmd.action;
      if (typeof action.id !== 'string' || typeof action.name !== 'string') return;
      await store.savePcAttack(info.pcId, action);
      return;
    }

    case 'deleteAttack': {
      if (!info.pcId || typeof cmd.actionId !== 'string') return;
      await store.deletePcAttack(info.pcId, cmd.actionId);
      return;
    }

    case 'getArchive': {
      if (typeof cmd.archiveId !== 'string') return;
      const entry = store.listArchive().find((a) => a.id === cmd.archiveId);
      if (!entry) return;
      send(socket, {
        type: 'archiveEntry',
        id: entry.id,
        templateName: entry.templateName,
        endedAt: entry.endedAt,
        rounds: entry.rounds,
        // Unredacted: the fight is history, Past Combats show everything.
        log: entry.log,
      });
      return;
    }

    default:
      return;
  }
}

// ---- lifecycle ---------------------------------------------------------------

/**
 * (Re)points the claims store at a campaign's player-claims.json and
 * re-identifies every live socket against it via its token. Tokens are
 * deliberately KEPT - that is what re-attaches a phone when the DM switches
 * back to a campaign it claimed in. Only kickPlayer clears tokens.
 */
export async function remountClaims(filePath: string): Promise<void> {
  claims = new JsonValue<Record<string, Claim>>(filePath, {});
  await claims.load();
  for (const info of sockets.values()) {
    info.pcId = tokenPcId(info.token);
  }
}

/**
 * The campaign hot-swap, ordered so phones never see mixed state: stale
 * pending saves are dismissed, the new campaign's claims are loaded and
 * sockets re-identified BEFORE the store mount broadcasts the new state.
 */
export async function handleCampaignSwitch(id: string): Promise<void> {
  if (id === store.activeCampaignId || !store.hasCampaign(id)) return;
  for (const pid of [...pendingSaves.keys()]) dismissPendingSave(pid);
  for (const pid of [...concSaves.keys()]) dismissConcSave(pid);
  await remountClaims(store.campaignFilePath(id, 'player-claims.json'));
  await store.mountCampaign(id);
  publishClaims();
}

export function startPlayerServer(): void {
  void remountClaims(store.campaignFilePath(store.activeCampaignId, 'player-claims.json')).then(
    () => publishClaims(),
  );

  if (!listenersRegistered) {
    listenersRegistered = true;
    store.onChange((state) => {
      broadcastState();
      // Combat over → any save the DM never adjudicated is moot.
      if (!state.combat || state.combat.phase !== 'active') {
        for (const id of [...pendingSaves.keys()]) dismissPendingSave(id);
        for (const id of [...concSaves.keys()]) dismissConcSave(id);
      }
      const { enabled, port } = state.settings.playerWeb;
      if (enabled !== currentlyEnabled || (enabled && port !== currentPort)) {
        restart();
      }
    });
    // Damage hit a concentrating PC → prompt the phone that claims it.
    store.onConcentrationCheck((check) => {
      const entry = [...sockets.entries()].find(([, info]) => info.pcId === check.pcId);
      if (!entry) return; // unclaimed: the DM adjudicates via the chip
      const [socket] = entry;
      const pc = store.getState().pcs.find((p) => p.id === check.pcId);
      const conMod = pc?.abilities ? abilityMod(pc.abilities.con) : null;
      const pending: ConcSave = { id: randomUUID(), ...check, conMod, socket };
      concSaves.set(pending.id, pending);
      send(socket, {
        type: 'concSave',
        id: pending.id,
        spellName: check.spellName,
        deName: check.deName,
        dc: check.dc,
        damage: check.damage,
        conMod,
      });
    });
  }
  restart();
}

function restart(): void {
  stopPlayerServer();
  const { enabled, port } = store.getState().settings.playerWeb;
  currentlyEnabled = enabled;
  currentPort = port;
  if (!enabled) {
    store.setPlayerClients([]);
    return;
  }
  lastError = null;

  httpServer = createServer((req, res) => {
    void serveStatic(new URL(req.url ?? '/', 'http://x').pathname, res);
  });
  httpServer.on('error', (err) => {
    lastError = String((err as NodeJS.ErrnoException).code ?? err.message);
    console.error('Player web: server error', err);
    store.setPlayerClients([]);
  });

  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  // ws re-emits the http server's errors (EADDRINUSE!) on the socket server;
  // unhandled, that's an uncaught main-process exception — Electron then
  // blocks startup behind a modal error dialog and the DM window never opens
  // when another instance holds the port. The http handler above already
  // reports the failure in Settings.
  wss.on('error', (err) => {
    console.error('Player web: websocket server error', err);
  });
  wss.on('connection', (socket, req) => {
    sockets.set(socket, {
      token: null,
      pcId: null,
      device: deviceLabel(req.headers['user-agent']),
    });
    sendState(socket);
    socket.on('message', (data) => {
      try {
        const cmd = JSON.parse(data.toString()) as PlayerCommand;
        void handleCommand(socket, cmd);
      } catch {
        // Ignore malformed messages.
      }
    });
    socket.on('close', () => {
      sockets.delete(socket);
      publishClaims();
    });
    socket.on('error', () => {
      // Socket errors are followed by 'close'.
    });
  });

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Player web: listening on 0.0.0.0:${port}`);
    publishClaims();
  });
}

export function stopPlayerServer(): void {
  for (const id of [...pendingSaves.keys()]) dismissPendingSave(id);
  if (wss) {
    wss.close();
    for (const client of wss.clients) client.terminate();
    wss = null;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
  sockets.clear();
}
