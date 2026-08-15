/**
 * Key labels for the picker screens.
 *
 * The plugin never localizes actor names: the app sends them already
 * translated over the bridge, so the deck and the DM window always agree on
 * what a creature is called. Only the plugin's own static labels live here.
 *
 * Language follows the app's setting, pushed with each state message. It stays
 * English until the app says otherwise, which is also what the test harness
 * asserts against.
 */
export type PluginLang = 'en' | 'de';

let lang: PluginLang = 'en';

export function setPluginLang(next: PluginLang | undefined): void {
  lang = next === 'de' ? 'de' : 'en';
}

export function pluginLang(): PluginLang {
  return lang;
}

type Labels = Record<string, string>;

const en: Labels = {
  back: '← Back',
  cancel: '✕\nCancel',
  enter: '✓\nEnter',
  next: '✓ Next',
  done: '✓ Done',
  doneKey: '✓\nDone',
  more: '▶\nMore',
  endCombat: '✓\nEnd\nCombat',
  endPrompt: 'End\ncombat?\nRound {round}',
  targets: 'targets',
  rollAttack: '🎲\nAttack',
  rollDamage: '🎲\nDamage',
  roll: '🎲\nRoll',
  addDice: '＋\nDice',
  applyDamage: '⚔\nDamage',
  applyHeal: '✚\nHeal',
  howMany: 'How\nmany?',
  extraDice: 'Extra\ndice:',
  whoSaved: 'DMG {amount}\nwho\nsaved?',
  ac: 'AC',
  yes: '✓ Yes',
  no: '✕ No',
  moreDice: 'More\ndice?',
};

const de: Labels = {
  back: '← Zurück',
  cancel: '✕\nAbbruch',
  enter: '✓\nOK',
  done: '✓ Fertig',
  doneKey: '✓\nFertig',
  next: '✓ Weiter',
  more: '▶\nMehr',
  endCombat: '✓\nKampf\nbeenden',
  endPrompt: 'Kampf\nbeenden?\nRunde {round}',
  targets: 'Ziele',
  rollAttack: '🎲\nAngriff',
  rollDamage: '🎲\nSchaden',
  roll: '🎲\nWürfeln',
  addDice: '＋\nWürfel',
  applyDamage: '⚔\nSchaden',
  applyHeal: '✚\nHeilen',
  howMany: 'Wie\nviele?',
  extraDice: 'Extra\nWürfel:',
  whoSaved: 'SCH {amount}\nwer hat\nbestanden?',
  ac: 'RK',
  yes: '✓ Ja',
  no: '✕ Nein',
  moreDice: 'Mehr\nWürfel?',
};

const DICTS: Record<PluginLang, Labels> = { en, de };

/** Label for `key` in the active language, with {placeholder} substitution. */
export function L(key: string, params?: Record<string, string | number>): string {
  const raw = DICTS[lang][key] ?? en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m));
}

/** Conditions as named in the German SRD 5.2.1 glossary. */
const CONDITION_DE: Record<string, string> = {
  Blinded: 'Blind',
  Charmed: 'Bezaubert',
  Deafened: 'Taub',
  Exhaustion: 'Erschöpft',
  Frightened: 'Verängstigt',
  Grappled: 'Gepackt',
  Incapacitated: 'Kampfunfähig',
  Invisible: 'Unsichtbar',
  Paralyzed: 'Gelähmt',
  Petrified: 'Versteinert',
  Poisoned: 'Vergiftet',
  Prone: 'Liegend',
  Restrained: 'Festgesetzt',
  Stunned: 'Betäubt',
  Unconscious: 'Bewusstlos',
};

/**
 * Display name for a condition. The canonical English value is what gets sent
 * back to the app, so only the label changes.
 */
export function conditionLabel(condition: string): string {
  return lang === 'de' ? CONDITION_DE[condition] ?? condition : condition;
}
