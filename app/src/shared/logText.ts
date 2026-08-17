import type { LogEntry } from './types';
import { conditionLabel, translate, type Lang } from './i18n';

/**
 * Render one combat-log entry to text. Entries store structured params, so
 * every surface (DM sidebar, archive, player phones) renders through the
 * dictionaries and a language switch re-renders history.
 */
export function logEntryText(lang: Lang, e: LogEntry): string {
  const t = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
  switch (e.kind) {
    case 'combatStart':
      return t('log.combatStart');
    case 'combatEnd':
      return t('log.combatEnd');
    case 'turn':
      return t('log.turn', { actor: e.actorName ?? '?' });
    case 'damage':
      return e.actorName
        ? t('log.damageBy', { actor: e.actorName, target: e.targetName ?? '?', amount: e.amount ?? 0 })
        : t('log.damage', { target: e.targetName ?? '?', amount: e.amount ?? 0 });
    case 'heal':
      return e.actorName
        ? t('log.healBy', { actor: e.actorName, target: e.targetName ?? '?', amount: e.amount ?? 0 })
        : t('log.heal', { target: e.targetName ?? '?', amount: e.amount ?? 0 });
    case 'attackRoll': {
      const outcome = t(`log.outcome.${e.outcome ?? 'hit'}`);
      const base = {
        actor: e.actorName ?? '?',
        attack: e.attackName ?? '?',
        target: e.targetName ?? '?',
        outcome,
      };
      // Monster rolls reach players with the numbers stripped server-side.
      if (e.total === undefined) {
        return e.targetName
          ? t('log.attackNoNums', base)
          : t('log.attackNoNumsNoTarget', base);
      }
      const withTotal = { ...base, total: e.total };
      return e.targetName
        ? t('log.attack', withTotal)
        : t('log.attackNoTarget', withTotal);
    }
    case 'save':
      return t(e.outcome === 'saved' ? 'log.saveSuccess' : 'log.saveFail', {
        actor: e.actorName ?? '?',
        attack: e.attackName ?? '?',
        total: e.total ?? '?',
      });
    case 'conditionAdded':
      return t('log.conditionAdded', {
        target: e.targetName ?? '?',
        condition: e.condition ? conditionLabel(lang, e.condition) : '?',
      });
    case 'conditionRemoved':
      return t('log.conditionRemoved', {
        target: e.targetName ?? '?',
        condition: e.condition ? conditionLabel(lang, e.condition) : '?',
      });
    case 'down':
      return t('log.down', { target: e.targetName ?? '?' });
    case 'kill':
      return t('log.kill', { target: e.targetName ?? '?' });
    default:
      return '';
  }
}

/** Short source tag ("DM", "Deck", "Phone") for the DM-side log views. */
export function logSourceTag(lang: Lang, e: LogEntry): string {
  return translate(lang, `log.src.${e.source}`);
}
