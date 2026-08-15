import type { AbilityScores } from '../../shared/types';
import { ABILITY_KEYS, abilityMod } from '../../shared/types';
import { useI18n } from './i18n';

/** Stat-block style ability row: score + derived modifier per attribute. */
export function AbilityTable({ abilities }: { abilities: AbilityScores }) {
  const { abilities: labels } = useI18n();
  return (
    <table className="ability-table">
      <thead>
        <tr>
          {ABILITY_KEYS.map((k) => (
            <th key={k}>{labels[k] ?? k.toUpperCase()}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {ABILITY_KEYS.map((k) => {
            const mod = abilityMod(abilities[k]);
            return (
              <td key={k}>
                {abilities[k]}{' '}
                <span className="ability-mod">({mod >= 0 ? `+${mod}` : mod})</span>
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
