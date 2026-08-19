import type { SpellSlots } from '../../shared/types';

/**
 * Compact read-only spell-slot display: one "L{n} ●●○" group per level with
 * a nonzero max. Used on the Party rows and the combat screen's PC expander.
 */
export function SlotPips({ slots }: { slots: SpellSlots | null | undefined }) {
  if (!slots) return null;
  const groups = slots.max
    .map((max, i) => ({ level: i + 1, max, current: slots.current[i] ?? 0 }))
    .filter((g) => g.max > 0);
  if (!groups.length) return null;
  return (
    <span className="slot-pips">
      {groups.map((g) => (
        <span key={g.level} className="slot-pips-group tnum">
          <b>L{g.level}</b>{' '}
          {g.max <= 6
            ? '●'.repeat(g.current) + '○'.repeat(g.max - g.current)
            : `${g.current}/${g.max}`}
        </span>
      ))}
    </span>
  );
}
