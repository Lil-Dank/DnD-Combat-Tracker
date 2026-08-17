import type { LogEntry } from './types';
import { DAMAGE_TYPE_DE, conditionLabel, translate, type Lang } from './i18n';
import { displayDice } from './dice';

/**
 * Combat-log rendering. Entries store structured params; surfaces render
 * them as colored segments (PC blue, monster orange, damage red, healing
 * green — log-highlighting style) via i18n templates, so a language switch
 * re-renders history and the colors survive any word order.
 */

export interface LogSegment {
  text: string;
  /** seg-pc | seg-monster | seg-dmg | seg-heal | seg-crit | seg-hit | seg-miss | seg-cond */
  cls?: string;
}

// Sentinel-marked substitution: values are wrapped before the i18n template
// fills its {placeholders}, then the final string splits back into segments.
const M0 = '';
const M1 = '';
const M2 = '';

const mark = (text: string | number, cls?: string): string =>
  cls ? `${M0}${cls}${M1}${text}${M2}` : String(text);

function parseSegments(s: string): LogSegment[] {
  const out: LogSegment[] = [];
  let rest = s;
  while (rest.length > 0) {
    const start = rest.indexOf(M0);
    if (start === -1) {
      out.push({ text: rest });
      break;
    }
    if (start > 0) out.push({ text: rest.slice(0, start) });
    const sep = rest.indexOf(M1, start);
    const end = rest.indexOf(M2, sep);
    if (sep === -1 || end === -1) {
      out.push({ text: rest.slice(start) });
      break;
    }
    out.push({ cls: rest.slice(start + 1, sep), text: rest.slice(sep + 1, end) });
    rest = rest.slice(end + 1);
  }
  return out;
}

const typeCls = (t: 'pc' | 'monster' | undefined): string | undefined =>
  t === 'pc' ? 'seg-pc' : t === 'monster' ? 'seg-monster' : undefined;

const OUTCOME_CLS: Record<string, string> = {
  crit: 'seg-crit',
  hit: 'seg-hit',
  miss: 'seg-miss',
  saved: 'seg-hit',
  failed: 'seg-miss',
};

/** Render one entry as colored segments. */
export function logEntrySegments(lang: Lang, e: LogEntry): LogSegment[] {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  const actor = mark(e.actorName ?? '?', typeCls(e.actorType));
  const target = mark(e.targetName ?? '?', typeCls(e.targetType));

  let text: string;
  switch (e.kind) {
    case 'combatStart':
      text = t('log.combatStart');
      break;
    case 'combatEnd':
      text = t('log.combatEnd');
      break;
    case 'turn':
      text = t('log.turn', { actor });
      break;
    case 'damage':
      text = e.actorName
        ? t('log.damageBy', { actor, target, amount: mark(e.amount ?? 0, 'seg-dmg') })
        : t('log.damage', { target, amount: mark(e.amount ?? 0, 'seg-dmg') });
      break;
    case 'heal':
      text = e.actorName
        ? t('log.healBy', { actor, target, amount: mark(e.amount ?? 0, 'seg-heal') })
        : t('log.heal', { target, amount: mark(e.amount ?? 0, 'seg-heal') });
      break;
    case 'attackRoll': {
      const outcome = mark(t(`log.outcome.${e.outcome ?? 'hit'}`), OUTCOME_CLS[e.outcome ?? 'hit']);
      const base = { actor, attack: e.attackName ?? '?', target, outcome };
      // The d20 math lives on its own sub-line (logRollMath) — the entry
      // itself stays outcome-only so it scans fast.
      text = e.targetName ? t('log.attackNoNums', base) : t('log.attackNoNumsNoTarget', base);
      break;
    }
    case 'save':
      text = t(e.outcome === 'saved' ? 'log.saveSuccess' : 'log.saveFail', {
        actor,
        attack: e.attackName ?? '?',
        total: e.total ?? '?',
      });
      break;
    case 'conditionAdded':
      text = t('log.conditionAdded', {
        target,
        condition: mark(e.condition ? conditionLabel(lang, e.condition) : '?', 'seg-cond'),
      });
      break;
    case 'conditionRemoved':
      text = t('log.conditionRemoved', {
        target,
        condition: mark(e.condition ? conditionLabel(lang, e.condition) : '?', 'seg-cond'),
      });
      break;
    case 'down':
      text = t('log.down', { target: mark(e.targetName ?? '?', 'seg-dmg') });
      break;
    case 'kill':
      text = t('log.kill', { target: mark(e.targetName ?? '?', 'seg-dmg') });
      break;
    default:
      text = '';
  }
  return parseSegments(text);
}

/** Plain-text rendering (tickers, tooltips). */
export function logEntryText(lang: Lang, e: LogEntry): string {
  return logEntrySegments(lang, e)
    .map((s) => s.text)
    .join('');
}

/**
 * Split a damage-math string into segments: dice notation ("2d6", "1W8")
 * gets lr-dice, the numbers actually rolled ("[3+5]") get lr-rolls — or the
 * damage type's own tint when the entry knows which type each bracket group
 * rolled (types aligns with bracket order; null = unknown).
 */
export function rollMathSegments(s: string, types?: (string | null)[]): LogSegment[] {
  return mathSegments(s, types);
}

function mathSegments(s: string, types?: (string | null)[]): LogSegment[] {
  const out: LogSegment[] = [];
  const re = /(\d*[dW]\d+|\[[^\]]*\])/g;
  let last = 0;
  let bracket = 0;
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    if (m[0].startsWith('[')) {
      const type = types?.[bracket++];
      out.push({ text: m[0], cls: type ? `dt-${type}` : 'lr-rolls' });
    } else {
      out.push({ text: m[0], cls: 'lr-dice' });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/**
 * The dice math behind an attack roll ("d20 14 + 5 = 19") as segments that
 * tell the dice apart from what they rolled, or null when the entry carries
 * no numbers (monster rolls on player surfaces, old entries). Manual rolls
 * without a known die show just the total.
 */
export function logRollSegments(lang: Lang, e: LogEntry): LogSegment[] | null {
  if (e.kind === 'damage') {
    return e.math ? mathSegments(displayDice(lang, e.math), e.mathTypes) : null;
  }
  if (e.kind !== 'attackRoll' || e.total === undefined) return null;
  const d20 = lang === 'de' ? 'W20' : 'd20';
  if (e.die === undefined) return [{ text: `= ${e.total}` }];
  const mod = e.total - e.die;
  const modStr = mod === 0 ? '' : ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}`;
  const out: LogSegment[] = [{ text: d20, cls: 'lr-dice' }, { text: ' ' }];
  if (e.dice && e.dice.length > 1) {
    // Adv/dis: both d20s, the discarded one struck through.
    let keptShown = false;
    e.dice.forEach((d, i) => {
      if (i > 0) out.push({ text: ' · ' });
      if (d === e.die && !keptShown) {
        keptShown = true;
        out.push({ text: String(d), cls: 'lr-rolls' });
      } else {
        out.push({ text: String(d), cls: 'lr-dropped' });
      }
    });
  } else {
    out.push({ text: String(e.die), cls: 'lr-rolls' });
  }
  out.push({ text: `${modStr} = ${e.total}` });
  return out;
}

// Damage-type words, matched case-insensitively in display strings. German
// SRD sentences use compounds ("Hiebschaden"), so the optional suffix is
// swallowed into the colored span.
const DT_CANONICAL = Object.keys(DAMAGE_TYPE_DE);
const DT_DE_TO_CANONICAL = Object.fromEntries(
  Object.entries(DAMAGE_TYPE_DE).map(([canon, de]) => [de.toLowerCase(), canon]),
);
const DT_RE_EN = new RegExp(`\\b(${DT_CANONICAL.join('|')})\\b`, 'gi');
// \b guards keep "Gift" from matching inside "vergiftet" and the like.
const DT_RE_DE = new RegExp(
  `\\b(${Object.values(DAMAGE_TYPE_DE).join('|')})(schaden)?\\b`,
  'gi',
);

/**
 * Wrap the damage-type words of a damage display string ("7 (1d8+3)
 * Piercing", "8 (1W8 + 4) Hiebschaden") in dt-<type> segments so surfaces
 * can color them. Only feed damage strings in - plain action text would
 * false-positive on words like "cold".
 */
export function damageTypeSegments(lang: Lang, text: string): LogSegment[] {
  const re = lang === 'de' ? DT_RE_DE : DT_RE_EN;
  const out: LogSegment[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const canon =
      lang === 'de' ? DT_DE_TO_CANONICAL[m[1].toLowerCase()] : m[1].toLowerCase();
    if (!canon) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], cls: `dt-${canon}` });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** Short source tag ("DM", "Deck", "Phone (Alex)") for the DM-side log views. */
export function logSourceTag(lang: Lang, e: LogEntry): string {
  const base = translate(lang, `log.src.${e.source}`);
  return e.sourceName ? `${base} (${e.sourceName})` : base;
}
