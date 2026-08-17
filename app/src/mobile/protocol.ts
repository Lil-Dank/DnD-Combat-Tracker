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
  | SaveResolvedMsg
  | ArchiveEntryMsg
  | { type: 'claimResult'; ok: boolean; reason?: string }
  | { type: 'savePending'; id: string; damage: number }
  | { type: 'kicked' }
  | { type: 'error'; code: string };
