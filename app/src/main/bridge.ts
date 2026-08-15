import { WebSocketServer, WebSocket } from 'ws';
import { store } from './state';
import type { AppState } from '../shared/types';
import { abilityCodeLabel, monsterName } from '../shared/i18n';

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
  switch (cmd.type) {
    case 'nextTurn':
      return store.nextTurn();
    case 'prevTurn':
      return store.prevTurn();
    case 'endCombat':
      return store.endCombat();
    case 'applyDamage':
      if (cmd.actorId && typeof cmd.amount === 'number') {
        return store.applyDamage(cmd.actorId, cmd.amount);
      }
      return;
    case 'applyHeal':
      if (cmd.actorId && typeof cmd.amount === 'number') {
        return store.applyHeal(cmd.actorId, cmd.amount);
      }
      return;
    case 'toggleCondition':
      if (cmd.actorId && typeof cmd.condition === 'string') {
        return store.toggleCondition(cmd.actorId, cmd.condition as never);
      }
      return;
    default:
      return;
  }
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
