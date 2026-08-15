import type { BridgeCombatant } from './bridge';
import { splitNumber, wrapTitle } from './picker';

/** Just the parts of the bridge state the turn keys care about. */
export interface TurnState {
  combatants: BridgeCombatant[];
  currentIndex: number;
}

/** Index of whoever is acting; falls back to the broadcast currentIndex. */
export function currentIndexOf(state: TurnState): number {
  const byFlag = state.combatants.findIndex((c) => c.isCurrentTurn);
  return byFlag === -1 ? state.currentIndex : byFlag;
}

/** The actor `offset` steps along the initiative order (wraps around). */
export function actorAt(state: TurnState, offset: number): BridgeCombatant | undefined {
  const list = state.combatants;
  if (list.length === 0) return undefined;
  const i = (((currentIndexOf(state) + offset) % list.length) + list.length) % list.length;
  return list[i];
}

/** Key-sized actor name: "#3" over the base name, matching the picker screens. */
export function actorKeyName(c: BridgeCombatant | undefined): string {
  if (!c) return '';
  const { base, num } = splitNumber(c.displayName);
  return num !== null ? `#${num}\n${wrapTitle(base, 7, 1)}` : wrapTitle(c.displayName, 7, 2);
}

/** The same name, split into the lines the rendered key draws. */
export function actorKeyLines(c: BridgeCombatant | undefined): string[] {
  const name = actorKeyName(c);
  return name === '' ? [] : name.split('\n');
}

/** Full key title: the label, plus the named actor when a combat is running. */
export function turnKeyTitle(label: string, state: TurnState, offset: number): string {
  const name = actorKeyName(actorAt(state, offset));
  return name ? `${label}\n${name}` : label;
}
