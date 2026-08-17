import { WebSocketServer, WebSocket } from 'ws';
import { store } from './state';
import type { AppState } from '../shared/types';
import { abilityCodeLabel, monsterName } from '../shared/i18n';
import { handleAttackEvent, type AttackEventPayload } from './kenku';
import { logAttackEvent, type AttackRollDetails } from './combatLog';

/**
 * Local WebSocket bridge for the Stream Deck plugin. The app is the server;
 * the plugin connects as a client on 127.0.0.1:<bridgePort>.
 */

let wss: WebSocketServer | null = null;
let currentPort = 0;
let listenersRegistered = false;
let commandListener: (() => void) | null = null;

/** Notified whenever the plugin sends a command (used to focus the DM view). */
export function onBridgeCommand(cb: () => void): void {
  commandListener = cb;
}

interface BridgeCommand {
  type: string;
  actorId?: string;
  amount?: number;
  condition?: string;
  sourceId?: string;
  attackId?: string;
  phase?: string;
  /** Optional attackEvent roll details for the combat log (v1.4+ plugins). */
  roll?: AttackRollDetails;
}

function stateMessage(state: AppState): string {
  const combat = state.combat;
  const active = combat !== null && combat.phase === 'active';
  // Actor names are localized here rather than in the plugin: the German SRD
  // name map is app-side data, and this keeps the deck and the DM window
  // showing the same name for the same creature.
  const lang = state.settings.language;
  const templates = new Map(state.monsters.map((m) => [m.id, m]));
  return JSON.stringify({
    type: 'state',
    language: lang,
    combatants: active
      ? combat!.combatants.map((c, i) => ({
          id: c.id,
          sourceId: c.sourceId,
          type: c.type,
          displayName: monsterName(lang, c.displayName),
          currentHp: c.currentHp,
          maxHp: c.maxHp,
          ac: c.ac,
          isCurrentTurn: i === combat!.currentIndex,
          isDowned: c.isDowned,
          conditions: c.conditions,
          // Rollable actions for the deck's Attack flow (attack rolls, plus
          // save actions that deal damage — e.g. breath weapons).
          attacks: c.attacks
            .filter((a) => a.type === 'attack' || (a.type === 'save' && a.onHit.damage.length > 0))
            .map((a) => ({
              id: a.id,
              // Deck labels use the German SRD action name when the template
              // carries one; manual monsters have no l10n and stay as typed.
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
    currentIndex: active ? combat!.currentIndex : 0,
    round: active ? combat!.round : 0,
  });
}

const KNOWN_COMMANDS = new Set([
  'nextTurn',
  'prevTurn',
  'endCombat',
  'applyDamage',
  'applyHeal',
  'toggleCondition',
]);

async function handleCommand(cmd: BridgeCommand): Promise<void> {
  // Any hardware action means the DM is running combat — surface that screen.
  if (KNOWN_COMMANDS.has(cmd.type)) commandListener?.();
  const ctx = { source: 'deck' as const };
  switch (cmd.type) {
    case 'nextTurn':
      return store.nextTurn(ctx);
    case 'prevTurn':
      return store.prevTurn(ctx);
    case 'endCombat':
      return store.endCombat(ctx);
    case 'applyDamage':
      if (cmd.actorId && typeof cmd.amount === 'number') {
        return store.applyDamage(cmd.actorId, cmd.amount, ctx);
      }
      return;
    case 'applyHeal':
      if (cmd.actorId && typeof cmd.amount === 'number') {
        return store.applyHeal(cmd.actorId, cmd.amount, ctx);
      }
      return;
    case 'toggleCondition':
      if (cmd.actorId && typeof cmd.condition === 'string') {
        return store.toggleCondition(cmd.actorId, cmd.condition as never, ctx);
      }
      return;
    case 'attackEvent': {
      // Deliberately absent from KNOWN_COMMANDS: a sound trigger should not
      // yank the DM window to the Combat screen.
      const c = cmd as unknown as AttackEventPayload & { type: string };
      // sourceId is recommended but optional - the handler can resolve the
      // per-attack sound from the attack id alone (older clients).
      if (typeof c.attackId === 'string' && c.phase) {
        handleAttackEvent({ sourceId: c.sourceId ?? '', attackId: c.attackId, phase: c.phase });
        // Log the verdict. Clients that don't send roll details (older
        // plugins, third-party bridge users) still get a log line - the
        // attacker resolves from the current turn / attack id.
        logAttackEvent(c.phase, cmd.roll ?? synthesizeRollDetails(c.sourceId, c.attackId), 'deck');
      }
      return;
    }
    default:
      return;
  }
}

/**
 * Fallback attacker resolution for verdict logging when a client sent no
 * roll block: prefer the current-turn combatant when it matches the attack,
 * else name the attack's owning template/PC.
 */
function synthesizeRollDetails(
  sourceId: string | undefined,
  attackId: string,
): AttackRollDetails | undefined {
  const state = store.getState();
  const combat = state.combat;
  if (combat && combat.phase === 'active') {
    const current = combat.combatants[combat.currentIndex];
    if (current?.attacks.some((a) => a.id === attackId)) {
      const action = current.attacks.find((a) => a.id === attackId);
      return {
        actorName: current.displayName,
        actorType: current.type,
        attackName: action?.name,
      };
    }
  }
  const owner =
    state.monsters.find((m) => m.id === sourceId) ??
    state.pcs.find((p) => p.id === sourceId) ??
    state.monsters.find((m) => m.attacks.some((a) => a.id === attackId)) ??
    state.pcs.find((p) => p.attacks.some((a) => a.id === attackId));
  if (!owner) return undefined;
  const action = owner.attacks.find((a) => a.id === attackId);
  const isPc = state.pcs.some((p) => p.id === owner.id);
  return { actorName: owner.name, actorType: isPc ? 'pc' : 'monster', attackName: action?.name };
}

function broadcast(): void {
  if (!wss) return;
  const msg = stateMessage(store.getState());
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

export function startBridge(): void {
  const port = store.getState().settings.bridgePort;
  stopBridge();
  currentPort = port;
  try {
    wss = new WebSocketServer({ host: '127.0.0.1', port });
  } catch (err) {
    console.error('Bridge: failed to start WebSocket server', err);
    return;
  }
  wss.on('error', (err) => {
    console.error('Bridge: server error', err);
  });
  wss.on('connection', (socket) => {
    store.setBridgeClientCount(wss?.clients.size ?? 0);
    socket.send(stateMessage(store.getState()));
    socket.on('message', (data) => {
      try {
        const cmd = JSON.parse(data.toString()) as BridgeCommand;
        void handleCommand(cmd);
      } catch {
        // Ignore malformed messages.
      }
    });
    socket.on('close', () => {
      store.setBridgeClientCount(wss?.clients.size ?? 0);
    });
    socket.on('error', () => {
      // Individual socket errors are handled by 'close'.
    });
  });

  if (!listenersRegistered) {
    listenersRegistered = true;
    store.onChange((state) => {
      broadcast();
      // If the DM changes the port in settings, restart the server on it.
      if (state.settings.bridgePort !== currentPort) {
        startBridge();
      }
    });
  }
}

export function stopBridge(): void {
  if (wss) {
    wss.close();
    for (const client of wss.clients) client.terminate();
    wss = null;
  }
}
