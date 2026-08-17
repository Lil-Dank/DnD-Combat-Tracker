import { store } from './state';
import type { CombatantType, LogSource } from '../shared/types';

/**
 * Optional roll details riding on an attackEvent (bridge command, IPC call,
 * or player-web message). Verdict phases carrying them produce one
 * 'attackRoll' log entry; other phases and detail-less events (older
 * clients) log nothing.
 */
export interface AttackRollDetails {
  actorName?: string;
  actorType?: CombatantType;
  targetName?: string;
  attackName?: string;
  /** Raw d20 (absent for manually entered totals without a die). */
  die?: number;
  /** die + toHit, or the manually entered total. */
  total?: number;
}

const VERDICT_OUTCOME: Record<string, 'crit' | 'hit' | 'miss'> = {
  attackCrit: 'crit',
  attackHit: 'hit',
  attackMiss: 'miss',
};

/**
 * Log an attack roll from any surface. Only the verdict phase logs (one line
 * per swing, complete with outcome); damage application is logged separately
 * by store.applyDamage.
 */
export function logAttackEvent(
  phase: string,
  details: AttackRollDetails | undefined,
  source: LogSource,
): void {
  const outcome = VERDICT_OUTCOME[phase];
  if (!outcome || !details?.actorName) return;
  void store.appendLog({
    kind: 'attackRoll',
    actorName: details.actorName,
    actorType: details.actorType,
    targetName: details.targetName,
    attackName: details.attackName,
    die: details.die,
    total: details.total,
    outcome,
    source,
  });
}
