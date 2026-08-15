import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Condition } from '../../shared/types';
import {
  translate,
  conditionLabel,
  abilityLabels,
  damageTypeLabel,
  monsterName,
  setMonsterNameMap,
  type Lang,
} from '../../shared/i18n';
import monstersDe from '../../../resources/srd/monsters.de.json';

// The German monster names are static data, so they are bundled once rather
// than shipped through the IPC state on every change.
setMonsterNameMap(monstersDe as Record<string, string>);

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
}

const Ctx = createContext<I18n>({
  lang: 'en',
  t: (k) => translate('en', k),
  cond: (c) => c,
  abilities: abilityLabels('en'),
  dmg: (d) => d ?? '',
  mon: (n) => n,
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
    }),
    [lang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  return useContext(Ctx);
}
