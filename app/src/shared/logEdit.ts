import type { Combat, Combatant, LogEntry, LogEntryPatch } from './types';
import { monsterName } from './i18n';

/**
 * DM log editing, shared by the real store and the demo. Pure mutations on a
 * Combat object: patch or delete one entry, and — for damage/heal — re-apply
 * the HP difference to the target so the tracker matches the corrected log.
 *
 * Entries snapshot names in the write-time language and carry no combatant
 * ids, so targets are found by name (raw, or the German localization of the
 * live display name). No match — a dead monster is long spliced out, a rename
 * happened — makes the edit record-only, never a wrong resurrection. Overkill
 * that clamping swallowed is unrecoverable, so refunds are approximate.
 */

function findByLoggedName(combat: Combat, name: string | undefined): Combatant | null {
  if (!name) return null;
  return (
    combat.combatants.find(
      (c) => c.displayName === name || monsterName('de', c.displayName) === name,
    ) ?? null
  );
}

/** Clamped HP shift; PC down/up recomputed silently (no log/audio side effects). */
function adjustHp(combat: Combat, targetName: string | undefined, delta: number): void {
  if (delta === 0) return;
  const c = findByLoggedName(combat, targetName);
  if (!c) return;
  c.currentHp = Math.max(0, Math.min(c.maxHp, c.currentHp + delta));
  if (c.type === 'pc') {
    if (c.currentHp === 0 && !c.isDowned) {
      c.isDowned = true;
      // Down means incapacitated — concentration drops, as on real damage.
      if (c.concentration) c.concentration = null;
    } else if (c.currentHp > 0 && c.isDowned) {
      c.isDowned = false;
    }
  }
}

/** The HP the entry currently accounts for: +heal, −damage, 0 for the rest. */
function hpEffect(e: LogEntry): number {
  if (e.kind === 'damage') return -(e.amount ?? 0);
  if (e.kind === 'heal') return e.amount ?? 0;
  return 0;
}

const PATCH_KEYS: (keyof LogEntryPatch)[] = [
  'actorName',
  'actorType',
  'targetName',
  'targetType',
  'amount',
  'die',
  'dice',
  'total',
  'outcome',
  'attackName',
  'slotLevel',
  'dc',
  'condition',
  'damageType',
];

/**
 * Applies a whitelisted patch to one log entry, mutating `combat`. Returns
 * false when the entry doesn't exist (already deleted on another surface).
 */
export function applyLogEntryEdit(combat: Combat, id: string, patch: LogEntryPatch): boolean {
  const entry = combat.log.find((e) => e.id === id);
  if (!entry) return false;

  const oldEffect = hpEffect(entry);
  const oldTarget = entry.targetName;

  for (const key of PATCH_KEYS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === undefined) delete entry[key];
    else (entry as unknown as Record<string, unknown>)[key] = value;
  }

  // Damage/heal: make the tracker match the corrected entry. Same target —
  // shift by the difference; retargeted — undo on the old, apply on the new.
  const newEffect = hpEffect(entry);
  if (oldEffect !== 0 || newEffect !== 0) {
    if (entry.targetName === oldTarget) {
      adjustHp(combat, oldTarget, newEffect - oldEffect);
    } else {
      adjustHp(combat, oldTarget, -oldEffect);
      adjustHp(combat, entry.targetName, newEffect);
    }
  }
  return true;
}

/**
 * Deletes one log entry, refunding its HP effect (a deleted hit un-happens).
 * Casts never refund slots; down/kill history lines stay unless the DM
 * deletes them too. Returns false when the entry doesn't exist.
 */
export function applyLogEntryDelete(combat: Combat, id: string): boolean {
  const idx = combat.log.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  const entry = combat.log[idx];
  combat.log.splice(idx, 1);
  adjustHp(combat, entry.targetName, -hpEffect(entry));
  return true;
}
