import streamDeck from '@elgato/streamdeck';
import WebSocket from 'ws';

export interface BridgeAttackDamage {
  dice: string | null;
  average: number | null;
  type: string;
  condition: string | null;
}

export interface BridgeAttack {
  id: string;
  name: string;
  /** null for save-based actions (breath weapons) — those only roll damage. */
  toHit: number | null;
  /** e.g. "DEX 18" for save actions. */
  save: string | null;
  damage: BridgeAttackDamage[];
}

export type AttackEventPhase =
  | 'attackRoll'
  | 'attackHit'
  | 'attackCrit'
  | 'attackMiss'
  | 'damageRoll'
  | 'damageApplied';

export interface BridgeCombatant {
  id: string;
  /** Monster template id in the app; used for per-attack sound lookups. */
  sourceId: string;
  /** 'pc' | 'monster'; absent on pre-1.4 apps. */
  type?: string;
  displayName: string;
  currentHp: number;
  maxHp: number;
  ac?: number;
  isCurrentTurn: boolean;
  isDowned?: boolean;
  conditions: string[];
  attacks?: BridgeAttack[];
}

export interface BridgeState {
  type: 'state';
  combatants: BridgeCombatant[];
  currentIndex: number;
  round: number;
  /** UI language chosen in the app; drives the picker's own key labels. */
  language?: 'en' | 'de';
}

export type BridgeCommand =
  | { type: 'nextTurn' }
  | { type: 'prevTurn' }
  | { type: 'endCombat' }
  | {
      type: 'applyDamage';
      actorId: string;
      amount: number;
      /** Attacker attribution + dice composition for the app's combat log. */
      actorName?: string;
      actorType?: string;
      math?: string;
      /** Damage type per bracket group of `math`, for log tinting. */
      mathTypes?: (string | null)[];
    }
  | { type: 'applyHeal'; actorId: string; amount: number }
  | { type: 'toggleCondition'; actorId: string; condition: string }
  | {
      /**
       * Attack-flow progress report; app-side it triggers Kenku sounds and,
       * on verdict phases with roll details, a combat-log entry.
       */
      type: 'attackEvent';
      sourceId: string;
      attackId: string;
      phase: AttackEventPhase;
      /** Roll details for the app's combat log (verdict phases only). */
      roll?: {
        actorName: string;
        actorType?: string;
        targetName?: string;
        targetType?: string;
        attackName: string;
        die: number;
        total: number;
      };
    };

const DEFAULT_PORT = 57321;
const RETRY_MS = 3000;

/**
 * WebSocket client for the tracker app's local bridge. Retries forever in the
 * background; the app tolerates us being gone and we tolerate the app being gone.
 */
class Bridge {
  private ws: WebSocket | null = null;
  private port = DEFAULT_PORT;
  private retryTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<(state: BridgeState) => void>();
  state: BridgeState = { type: 'state', combatants: [], currentIndex: 0, round: 0 };
  connected = false;

  start(): void {
    this.connect();
  }

  setPort(port: number): void {
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === this.port) return;
    this.port = port;
    this.ws?.close();
    this.connect();
  }

  onState(listener: (state: BridgeState) => void): void {
    this.listeners.add(listener);
  }

  private connect(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      this.ws?.terminate();
    } catch {
      // ignore
    }
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.ws = ws;

    ws.on('open', () => {
      this.connected = true;
      streamDeck.logger.info(`Bridge connected on port ${this.port}`);
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'state') {
          this.state = msg as BridgeState;
          for (const l of this.listeners) l(this.state);
        }
      } catch {
        // ignore malformed
      }
    });
    const scheduleRetry = () => {
      if (this.ws !== ws) return; // superseded by a newer socket
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        // Losing the app means combat state is unknown; show an empty roster.
        this.state = { type: 'state', combatants: [], currentIndex: 0, round: 0 };
        for (const l of this.listeners) l(this.state);
      }
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.connect();
        }, RETRY_MS);
      }
    };
    ws.on('close', scheduleRetry);
    ws.on('error', scheduleRetry);
  }

  send(cmd: BridgeCommand): boolean {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(cmd));
    return true;
  }
}

export const bridge = new Bridge();
