import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Condition, MonsterAction } from '../../shared/types';
import {
  translate,
  conditionLabel,
  abilityLabels,
  abilityCodeLabel,
  damageTypeLabel,
  monsterName,
  setMonsterNameMap,
  type Lang,
  type MonsterL10n,
} from '../../shared/i18n';
import monstersDe from '../../../resources/srd/monsters.de.json';

// The German monster names are static data, so they are bundled once rather
// than shipped through the IPC state on every change.
setMonsterNameMap(monstersDe as unknown as Record<string, MonsterL10n>);

export interface I18n {
  lang: Lang;
  /** Look up a UI string, substituting {placeholders}. */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** SRD condition name in the active language. */
  cond: (c: Condition) => string;
  /** STR/DEX/… or Stä/Ges/… */
  abilities: Record<string, string>;
  /** SRD damage type in the active language. */
  dmg: (type: string | null | undefined) => string;
  /** Monster name in the active language, falling back to English. */
  mon: (englishName: string) => string;
  /** STR -> STÄ etc., for save-DC chrome. */
  abilityCode: (code: string) => string;
  /**
   * Localized rendering of one monster action, driven by the template's l10n
   * field (present on SRD imports only). Range and damage are pulled from the
   * German sentence when possible; anything unavailable falls back to English.
   */
  locAction: (
    l10n: MonsterL10n | null | undefined,
    a: MonsterAction,
  ) => { name: string; text: string; range: string | null; damage: string | null };
}

const Ctx = createContext<I18n>({
  lang: 'en',
  t: (k) => translate('en', k),
  cond: (c) => c,
  abilities: abilityLabels('en'),
  dmg: (d) => d ?? '',
  mon: (n) => n,
  abilityCode: (c) => c,
  locAction: (_l, a) => ({
    name: a.name,
    text: a.display.text,
    range: a.display.range,
    damage: a.display.damage,
  }),
});

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({
      lang,
      t: (key, params) => translate(lang, key, params),
      cond: (c) => conditionLabel(lang, c),
      abilities: abilityLabels(lang),
      dmg: (type) => damageTypeLabel(lang, type),
      mon: (name) => monsterName(lang, name),
      abilityCode: (code) => abilityCodeLabel(lang, code),
      locAction: (l10n, a) => {
        const e = lang === 'de' ? l10n?.actions?.[a.name] : undefined;
        if (!e) {
          return { name: a.name, text: a.display.text, range: a.display.range, damage: a.display.damage };
        }
        const range = e.text.match(/(?:Reichweite|Distanz)\s+[\d,./]+\s*m/)?.[0] ?? a.display.range;
        const damage =
          e.text.match(/Treffer:\s*([^.]*[Ss]chaden[^.]*)/)?.[1] ??
          e.text.match(/Misserfolg:\s*([^.]*[Ss]chaden[^.]*)/)?.[1] ??
          a.display.damage;
        return { name: e.name, text: e.text, range, damage };
      },
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  return useContext(Ctx);
}
