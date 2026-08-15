/** Dice rolling for the deck: "2d8+2", "1d4", "3d6-1" (spaces tolerated). */

export interface DiceRoll {
  total: number;
  rolls: number[];
  bonus: number;
}

export function parseDice(s: string): { count: number; die: number; bonus: number } | null {
  const m = s.replace(/\s/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!m) return null;
  return {
    count: parseInt(m[1], 10),
    die: parseInt(m[2], 10),
    bonus: m[3] ? parseInt(m[3], 10) : 0,
  };
}

export function rollDice(dice: string): DiceRoll | null {
  const parsed = parseDice(dice);
  if (!parsed) return null;
  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(Math.random() * parsed.die) + 1);
  }
  return {
    total: rolls.reduce((a, b) => a + b, 0) + parsed.bonus,
    rolls,
    bonus: parsed.bonus,
  };
}

export function rollD20(modifier: number): { die: number; total: number } {
  const die = Math.floor(Math.random() * 20) + 1;
  return { die, total: die + modifier };
}

export interface DicePoolPart {
  count: number;
  die: number;
}

/** Roll a pool of mixed dice plus one flat modifier (total floored at 0). */
export function rollPool(parts: DicePoolPart[], modifier: number): number {
  let sum = 0;
  for (const part of parts) {
    for (let i = 0; i < part.count; i++) {
      sum += Math.floor(Math.random() * part.die) + 1;
    }
  }
  return Math.max(0, sum + modifier);
}
