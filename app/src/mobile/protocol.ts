import type {
  AbilityScores,
  Condition,
  LogEntry,
  MonsterAction,
  PlayerWebGating,
} from '../shared/types';
import type { Lang } from '../shared/i18n';

/** Wire shapes of the player server's WebSocket protocol (server → client). */

export interface WireClaim {
  pcId: string;
  name: string;
  taken: boolean;
  mine: boolean;
  playerName: string | null;
}

export interface WireCombatant {
  id: string;
  name: string;
  type: 'pc' | 'monster';
  isCurrentTurn: boolean;
  isDowned: boolean;
  conditions: Condition[];
  /** Monsters only — HP/AC never cross the wire for them. */
  isBloodied?: boolean;
  /** PCs only. */
  currentHp?: number;
  maxHp?: number;
  /** Own combatant only. */
  ac?: number;
  initiative?: number | null;
}

export interface WireYou {
  pcId: string;
  name: string;
  maxHp: number;
  ac: number;
  initMod: number;
  abilities: AbilityScores | null;
  notes: string;
  attacks: MonsterAction[];
  combatantId: string | null;
}

export interface WireArchiveSummary {
  id: string;
  templateName: string;
  endedAt: number;
  rounds: number;
}

export interface StateMsg {
  type: 'state';
  language: Lang;
  gating: PlayerWebGating;
  combatActive: boolean;
  round: number;
  currentIndex: number;
  myTurn: boolean;
  claims: WireClaim[];
  you: WireYou | null;
  combatants: WireCombatant[];
  log: LogEntry[];
  archive: WireArchiveSummary[];
}

export interface AttackResultMsg {
  type: 'attackResult';
  targetId: string;
  targetName: string;
  die: number | null;
  total: number;
  outcome: 'crit' | 'hit' | 'miss';
  damage: number | null;
}

/** Stage 1 of the split digital flow: the d20 verdict, no damage yet. */
export interface AttackRollResultMsg {
  type: 'attackRollResult';
  targetId: string;
  targetName: string;
  /** The die that counts (higher/lower of `dice` under adv/dis). */
  die: number;
  /** Every d20 thrown: one entry normally, two under adv/dis. */
  dice: number[];
  total: number;
  outcome: 'crit' | 'hit' | 'miss';
}

/**
 * A save-based action is parked for DM adjudication. Digital rolls carry
 * the roller's own damage dice so the phone can reveal them while waiting.
 */
export interface SavePendingMsg {
  type: 'savePending';
  id: string;
  damage: number;
  rolls?: number[];
  math?: string;
  mathTypes?: (string | null)[];
}

/** Stage 2: damage rolled and applied. The roller sees their own numbers. */
export interface DamageResultMsg {
  type: 'damageResult';
  targetId: string;
  targetName: string;
  damage: number;
  /** Every individual die result, in roll order (settle animation). */
  rolls: number[];
  /** Breakdown string ("1d8 [7] +3 = 10"). */
  math: string;
  /** Damage type per bracket group of `math`. */
  mathTypes: (string | null)[];
}

export interface SaveResolvedMsg {
  type: 'saveResolved';
  id: string;
  cancelled?: boolean;
  results: Array<{ targetId: string; targetName: string; saved: boolean; amount: number }>;
}

export interface ArchiveEntryMsg {
  type: 'archiveEntry';
  id: string;
  templateName: string;
  endedAt: number;
  rounds: number;
  log: LogEntry[];
}

export type ServerMsg =
  | StateMsg
  | AttackResultMsg
  | AttackRollResultMsg
  | DamageResultMsg
  | SaveResolvedMsg
  | ArchiveEntryMsg
  | { type: 'claimResult'; ok: boolean; reason?: string }
  | SavePendingMsg
  | { type: 'kicked' }
  | { type: 'error'; code: string };
