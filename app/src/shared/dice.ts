/** Display form of stored dice notation: German reads W, not d. */
export function displayDice(lang: string, s: string): string {
  return lang === 'de' ? s.replace(/(\d)d(\d)/g, '$1W$2').replace(/\bd(\d)/g, 'W$1') : s;
}

/** "2d6 [3+5] +4 = 12" → "2d6 +4 = 12": the thrown composition without the
 *  per-die results — what player surfaces may see of a live roll. */
export function stripDiceResults(s: string): string {
  return s.replace(/\s*\[[^\]]*\]/g, '');
}

/** "2d8+2" / "1d4" / "3d6-1" (spaces tolerated) → parts, or null. */
export function parseDice(s: string): { count: number; die: number; bonus: number } | null {
  const m = s.replace(/\s/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  return { count: parseInt(m[1], 10), die: parseInt(m[2], 10), bonus: m[3] ? parseInt(m[3], 10) : 0 };
}

export function formatDice(count: number, die: number, bonus: number): string {
  return `${count}d${die}${bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : ''}`;
}

/** SRD-style average: floor(count * (die + 1) / 2) + bonus. */
export function averageOf(count: number, die: number, bonus: number): number {
  return Math.floor((count * (die + 1)) / 2) + bonus;
}

export type RollMode = 'normal' | 'adv' | 'dis';

/**
 * Roll a d20 honoring advantage/disadvantage: two dice, keep the higher
 * (adv) or lower (dis); the bonus is applied by the caller AFTER choosing.
 * `dice` lists every die thrown so surfaces can show the discarded one.
 */
export function rollD20(mode: RollMode = 'normal'): { die: number; dice: number[] } {
  const one = () => 1 + Math.floor(Math.random() * 20);
  const first = one();
  if (mode === 'normal') return { die: first, dice: [first] };
  const second = one();
  const die = mode === 'adv' ? Math.max(first, second) : Math.min(first, second);
  return { die, dice: [first, second] };
}

export interface DicePoolPart {
  count: number;
  die: number;
}

export interface PoolRoll {
  total: number;
  /** Individual die results, one array per pool part. */
  perPart: number[][];
}

/**
 * Roll a pool of mixed dice ("2d8 + 1d4 + …") plus one flat modifier.
 * The total never goes below 0.
 */
export function rollPool(parts: DicePoolPart[], modifier: number): PoolRoll {
  const perPart: number[][] = [];
  let sum = 0;
  for (const part of parts) {
    const rolls: number[] = [];
    for (let i = 0; i < part.count; i++) {
      rolls.push(Math.floor(Math.random() * part.die) + 1);
    }
    perPart.push(rolls);
    sum += rolls.reduce((a, b) => a + b, 0);
  }
  return { total: Math.max(0, sum + modifier), perPart };
}

/** "2d8+1 +1d4 +2d6" — first part carries the modifier. */
export function formatPool(parts: DicePoolPart[], modifier: number): string {
  if (parts.length === 0) return '';
  const modStr = modifier > 0 ? `+${modifier}` : modifier < 0 ? `${modifier}` : '';
  const first = `${parts[0].count}d${parts[0].die}${modStr}`;
  return [first, ...parts.slice(1).map((p) => `+${p.count}d${p.die}`)].join(' ');
}
