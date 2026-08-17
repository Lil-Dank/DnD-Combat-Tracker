import type { AbilityScores } from '../../shared/types';
import { ABILITY_KEYS } from '../../shared/types';

/**
 * Ability-score form model (strings while typing) shared by the monster
 * editor and the Party screen's PC stat block.
 */

export type AbilitiesForm = Record<(typeof ABILITY_KEYS)[number], string>;

export const emptyAbilities = (): AbilitiesForm => ({
  str: '', dex: '', con: '', int: '', wis: '', cha: '',
});

export function abilitiesToForm(a: AbilityScores | null | undefined): AbilitiesForm {
  if (!a) return emptyAbilities();
  return {
    str: String(a.str), dex: String(a.dex), con: String(a.con),
    int: String(a.int), wis: String(a.wis), cha: String(a.cha),
  };
}

/** All blank → null; otherwise blanks default to 10. */
export function formToAbilities(f: AbilitiesForm): AbilityScores | null {
  if (ABILITY_KEYS.every((k) => f[k].trim() === '')) return null;
  const parse = (s: string) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : 10;
  };
  return {
    str: parse(f.str), dex: parse(f.dex), con: parse(f.con),
    int: parse(f.int), wis: parse(f.wis), cha: parse(f.cha),
  };
}
