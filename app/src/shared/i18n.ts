/**
 * UI localization. Two languages, no runtime loading: the dictionaries are
 * bundled so the DM window, the Player View and the Stream Deck plugin all
 * resolve the same key to the same string without a fetch.
 *
 * Game terminology (conditions, abilities, damage types) comes from the German
 * SRD 5.2.1 rather than a general translation, so what the app shows matches
 * what a German-speaking table reads in the rules.
 */
import type { Condition } from './types';

export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'de', label: 'Deutsch' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['id'];
export const DEFAULT_LANG: Lang = 'en';

/** Conditions as named in the German SRD 5.2.1 glossary ("Zustände"). */
export const CONDITION_DE: Record<Condition, string> = {
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

/** Ability abbreviations, matching the SRD stat block headers in each language. */
export const ABILITY_DE = { str: 'Stä', dex: 'Ges', con: 'Kon', int: 'Int', wis: 'Wei', cha: 'Cha' };
export const ABILITY_EN = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

/** Damage types, as printed in the German SRD. */
export const DAMAGE_TYPE_DE: Record<string, string> = {
  acid: 'Säure',
  bludgeoning: 'Wucht',
  cold: 'Kälte',
  fire: 'Feuer',
  force: 'Energie',
  lightning: 'Blitz',
  necrotic: 'Nekrotisch',
  piercing: 'Stich',
  poison: 'Gift',
  psychic: 'Psychisch',
  radiant: 'Gleißend',
  slashing: 'Hieb',
  thunder: 'Donner',
};

type Dict = Record<string, string>;

const en: Dict = {
  'app.title': 'Combat Tracker',
  'app.loading': 'Loading…',
  'app.playerViewTitle': 'D&D Combat Tracker - Player View',
  'nav.combat': '⚔ Combat',
  'nav.party': '🛡 Party',
  'nav.monsters': '🐉 Monsters',
  'nav.encounters': '📜 Encounters',
  'nav.settings': '⚙ Settings',
  'nav.openPlayerView': 'Open Player View',
  'nav.closePlayerView': 'Close Player View',
  'nav.fullscreen': '⛶ Fullscreen',
  'nav.deckConnected': '● Stream Deck connected',
  'nav.deckOffline': '○ Stream Deck offline',

  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.delete': 'Delete',
  'common.duplicate': 'Duplicate',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.done': 'Done',
  'common.name': 'Name',
  'common.maxHp': 'Max HP',
  'common.ac': 'AC',
  'common.initMod': 'Init mod',
  'common.quantity': 'Quantity',

  'pcs.title': 'Party',
  'pcs.add': '+ Add Character',
  'pcs.empty': 'No characters yet. Add your players here.',
  'pcs.deleteConfirm': 'Delete {name}?',

  'monsters.title': 'Monster Library',
  'monsters.import': '⤓ Import SRD Monsters',
  'monsters.add': '+ Add Monster',
  'monsters.search': 'Search monsters…',
  'monsters.actions': 'Actions',
  'monsters.source': 'Source',
  'monsters.empty': 'No monsters yet. Import the SRD set or add your own.',
  'monsters.deleteConfirm': 'Delete {name}? It will also be removed from any encounter templates.',
  'monsters.abilities': 'Ability scores',
  'monsters.attacks': 'Attacks',
  'monsters.toHit': 'to hit',
  'monsters.reach': 'reach',
  'monsters.range': 'range',
  'monsters.save': 'save',
  'monsters.dc': 'DC',

  'templates.title': 'Encounter Templates',
  'templates.new': '+ New Template',
  'templates.start': '⚔ Start Combat',
  'templates.monsters': 'monsters',
  'templates.empty': 'No templates yet. Build a reusable encounter here.',
  'templates.deleteConfirm': 'Delete template {name}?',

  'combat.title': 'Combat',
  'combat.round': 'Round {n}',
  'combat.begin': 'Begin Combat',
  'combat.end': 'End Combat',
  'combat.next': 'Next Turn ➜',
  'combat.prev': '⬅ Prev',
  'combat.addMonster': '+ Add Monster',
  'combat.diceRoller': '🎲 Dice Roller',
  'combat.conditions': '☰ Conditions',
  'combat.attacks': '⚔ Attacks',
  'combat.attack': '🎲 Attack',
  'combat.damage': 'Dmg',
  'combat.heal': 'Heal',
  'combat.downed': 'downed',
  'combat.rollAll': 'Roll for all',
  'combat.rollMonsters': 'Roll for monsters only',
  'combat.endConfirm': 'End the current combat?',
  'combat.initiative': 'Initiative',

  'pv.turn': '⚔ Turn',
  'pv.downed': '💀 Downed',
  'pv.bloodied': 'Bloodied',

  'dice.title': 'Dice Roller',
  'dice.roll': '🎲 Roll',
  'dice.addDice': '+ Dice',
  'dice.total': 'Total',
  'dice.applyDamage': '⚔ Damage',
  'dice.applyHeal': '✚ Heal',
  'dice.modifier': 'Modifier',

  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.themeNote': 'Applies to the DM window. The Player View keeps its own look.',
  'settings.language': 'Language',
  'settings.languageNote':
    'Applies to the DM window, the Player View and the Stream Deck plugin. Game terms follow the SRD 5.2.1 in the chosen language.',
  'settings.combatScreen': 'DM Combat Screen',
  'settings.autoOpen':
    'Automatically open the attack quick reference for the monster whose turn it is',
  'settings.playerView': 'Player View',
  'settings.bgColor': 'Background color',
  'settings.bridge': 'Stream Deck bridge',
  'settings.port': 'WebSocket port',
  'settings.portNote':
    'Default 57321. Change only on a port conflict, and set the same port in the Stream Deck plugin settings. Status: {status}.',
  'settings.connected': 'connected',
  'settings.noPlugin': 'no plugin connected',
  'settings.about': 'About / Credits',
  'settings.creditsNote':
    'German rules terminology is taken from the German SRD 5.2.1. Monster names absent from it stay in English.',

  'common.back': '← Back',
  'common.close': 'Close',
  'common.confirm': 'Confirm',
  'common.search': 'Search…',

  'pcs.titleFull': 'Party — Player Characters',
  'pcs.emptyFull':
    'No player characters yet. Add your party here once — they persist and can join any combat.',
  'pcs.editPc': 'Edit PC',
  'pcs.addPc': 'Add PC',

  'templates.emptyTemplate': 'Empty template',
  'templates.combatInProgress': 'A combat is already in progress. End it and start a new one?',
  'templates.endAndStart': 'End & Start New',
  'templates.editTemplate': 'Edit Template',
  'templates.newTemplate': 'New Template',
  'templates.namePlaceholder': 'e.g. Goblin Ambush',
  'templates.inThisEncounter': 'In this encounter',
  'templates.addMonsters': 'Add monsters',
  'templates.searchLibrary': 'Search library…',

  'combat.startCombat': 'Start Combat',
  'combat.noPcs': 'No PCs in the party yet — you can still run a monsters-only combat.',
  'combat.rollAllNote': 'Auto-roll monsters and PCs (d20 + modifier)',
  'combat.rollMonstersNote': 'Players roll at the table; you type in their results',
  'combat.initiativeOrder': 'Initiative Order',
  'combat.enterInitFirst': 'Enter initiative for every PC first',
  'combat.reroll': 'Re-roll',
  'combat.endThisCombat': 'End this combat?',
  'combat.armorClass': 'Armor Class',
  'combat.applyDamage': 'Apply damage (Enter)',
  'combat.applyHealing': 'Apply healing (Shift+Enter)',
  'combat.rollMonsterAttack': 'Roll this monster\u2019s attack (same flow as the Stream Deck)',
  'combat.clickToRemove': 'Click to remove',
  'combat.noCombatants': 'No combatants left. End the combat when you are done.',
  'combat.addMonsterToCombat': 'Add Monster to Combat',

  'monsters.importing': 'Importing…',
  'monsters.manual': 'Manual',
  'monsters.showActions': 'Show actions',
  'monsters.noActions': 'No actions recorded.',
  'monsters.editMonster': 'Edit Monster',
  'monsters.addMonster': 'Add Monster',
  'monsters.abilitiesNote': '(optional — modifiers derive automatically)',
  'monsters.actionsNote': '(attacks, saves, abilities — DM-only reference)',
  'monsters.section.action': 'Action',
  'monsters.section.bonus_action': 'Bonus Action',
  'monsters.section.reaction': 'Reaction',
  'monsters.section.legendary_action': 'Legendary',
  'monsters.section.trait': 'Trait',
  'monsters.type.attack': 'Attack roll',
  'monsters.type.save': 'Saving throw',
  'monsters.type.other': 'Other',
  'monsters.kind.melee': 'Melee',
  'monsters.kind.ranged': 'Ranged',
  'monsters.kind.melee_or_ranged': 'Melee or Ranged',

  'attack.pickAttack': 'Pick an attack',
  'attack.rollAttack': '🎲 Roll Attack',
  'attack.rollDamage': '🎲 Roll Damage',
  'attack.whoSaved': 'Who saved? →',
  'attack.apply': '⚔ Apply {total}',

  'dice.amount': 'Amount',
  'dice.extraAmount': 'Extra amount',
  'dice.applyTo': 'Apply to',
  'dice.pickOneOrMore': '(pick one or more)',
  'dice.rollFirst': 'Roll first',
};

const de: Dict = {
  'app.title': 'Kampf-Tracker',
  'app.loading': 'Lädt…',
  'app.playerViewTitle': 'D&D Kampf-Tracker – Spieleransicht',
  'nav.combat': '⚔ Kampf',
  'nav.party': '🛡 Gruppe',
  'nav.monsters': '🐉 Monster',
  'nav.encounters': '📜 Begegnungen',
  'nav.settings': '⚙ Einstellungen',
  'nav.openPlayerView': 'Spieleransicht öffnen',
  'nav.closePlayerView': 'Spieleransicht schließen',
  'nav.fullscreen': '⛶ Vollbild',
  'nav.deckConnected': '● Stream Deck verbunden',
  'nav.deckOffline': '○ Stream Deck getrennt',

  'common.add': 'Hinzufügen',
  'common.edit': 'Bearbeiten',
  'common.delete': 'Löschen',
  'common.duplicate': 'Duplizieren',
  'common.save': 'Speichern',
  'common.cancel': 'Abbrechen',
  'common.done': 'Fertig',
  'common.name': 'Name',
  'common.maxHp': 'Max. TP',
  'common.ac': 'RK',
  'common.initMod': 'Ini-Mod',
  'common.quantity': 'Anzahl',

  'pcs.title': 'Gruppe',
  'pcs.add': '+ Charakter hinzufügen',
  'pcs.empty': 'Noch keine Charaktere. Trage hier deine Spieler ein.',
  'pcs.deleteConfirm': '{name} löschen?',

  'monsters.title': 'Monsterbibliothek',
  'monsters.import': '⤓ SRD-Monster importieren',
  'monsters.add': '+ Monster hinzufügen',
  'monsters.search': 'Monster suchen…',
  'monsters.actions': 'Aktionen',
  'monsters.source': 'Quelle',
  'monsters.empty': 'Noch keine Monster. Importiere den SRD-Satz oder lege eigene an.',
  'monsters.deleteConfirm':
    '{name} löschen? Das Monster wird auch aus allen Begegnungsvorlagen entfernt.',
  'monsters.abilities': 'Attributswerte',
  'monsters.attacks': 'Angriffe',
  'monsters.toHit': 'Angriffswurf',
  'monsters.reach': 'Reichweite',
  'monsters.range': 'Distanz',
  'monsters.save': 'Rettungswurf',
  'monsters.dc': 'SG',

  'templates.title': 'Begegnungsvorlagen',
  'templates.new': '+ Neue Vorlage',
  'templates.start': '⚔ Kampf starten',
  'templates.monsters': 'Monster',
  'templates.empty': 'Noch keine Vorlagen. Erstelle hier eine wiederverwendbare Begegnung.',
  'templates.deleteConfirm': 'Vorlage {name} löschen?',

  'combat.title': 'Kampf',
  'combat.round': 'Runde {n}',
  'combat.begin': 'Kampf beginnen',
  'combat.end': 'Kampf beenden',
  'combat.next': 'Nächster Zug ➜',
  'combat.prev': '⬅ Zurück',
  'combat.addMonster': '+ Monster hinzufügen',
  'combat.diceRoller': '🎲 Würfeln',
  'combat.conditions': '☰ Zustände',
  'combat.attacks': '⚔ Angriffe',
  'combat.attack': '🎲 Angriff',
  'combat.damage': 'Schaden',
  'combat.heal': 'Heilen',
  'combat.downed': 'kampfunfähig',
  'combat.rollAll': 'Für alle würfeln',
  'combat.rollMonsters': 'Nur für Monster würfeln',
  'combat.endConfirm': 'Den laufenden Kampf beenden?',
  'combat.initiative': 'Initiative',

  'pv.turn': '⚔ Zug',
  'pv.downed': '💀 Kampfunfähig',
  'pv.bloodied': 'Blutend',

  'dice.title': 'Würfeln',
  'dice.roll': '🎲 Würfeln',
  'dice.addDice': '+ Würfel',
  'dice.total': 'Summe',
  'dice.applyDamage': '⚔ Schaden',
  'dice.applyHeal': '✚ Heilen',
  'dice.modifier': 'Modifikator',

  'settings.title': 'Einstellungen',
  'settings.appearance': 'Darstellung',
  'settings.theme': 'Design',
  'settings.themeNote': 'Gilt für das SL-Fenster. Die Spieleransicht behält ihr eigenes Aussehen.',
  'settings.language': 'Sprache',
  'settings.languageNote':
    'Gilt für das SL-Fenster, die Spieleransicht und das Stream-Deck-Plugin. Spielbegriffe folgen dem SRD 5.2.1 in der gewählten Sprache.',
  'settings.combatScreen': 'SL-Kampfbildschirm',
  'settings.autoOpen':
    'Die Angriffsübersicht des Monsters, das gerade am Zug ist, automatisch öffnen',
  'settings.playerView': 'Spieleransicht',
  'settings.bgColor': 'Hintergrundfarbe',
  'settings.bridge': 'Stream-Deck-Brücke',
  'settings.port': 'WebSocket-Port',
  'settings.portNote':
    'Standard 57321. Nur bei Portkonflikten ändern und denselben Port in den Plugin-Einstellungen eintragen. Status: {status}.',
  'settings.connected': 'verbunden',
  'settings.noPlugin': 'kein Plugin verbunden',
  'settings.about': 'Über / Danksagungen',
  'settings.creditsNote':
    'Die deutschen Regelbegriffe stammen aus dem deutschen SRD 5.2.1. Monsternamen, die dort nicht vorkommen, bleiben englisch.',

  'common.back': '← Zurück',
  'common.close': 'Schließen',
  'common.confirm': 'Bestätigen',
  'common.search': 'Suchen…',

  'pcs.titleFull': 'Gruppe – Spielercharaktere',
  'pcs.emptyFull':
    'Noch keine Spielercharaktere. Lege deine Gruppe einmal an – sie bleibt gespeichert und kann an jedem Kampf teilnehmen.',
  'pcs.editPc': 'Charakter bearbeiten',
  'pcs.addPc': 'Charakter hinzufügen',

  'templates.emptyTemplate': 'Leere Vorlage',
  'templates.combatInProgress': 'Es läuft bereits ein Kampf. Beenden und einen neuen starten?',
  'templates.endAndStart': 'Beenden & neu starten',
  'templates.editTemplate': 'Vorlage bearbeiten',
  'templates.newTemplate': 'Neue Vorlage',
  'templates.namePlaceholder': 'z. B. Goblin-Hinterhalt',
  'templates.inThisEncounter': 'In dieser Begegnung',
  'templates.addMonsters': 'Monster hinzufügen',
  'templates.searchLibrary': 'Bibliothek durchsuchen…',

  'combat.startCombat': 'Kampf starten',
  'combat.noPcs':
    'Noch keine Charaktere in der Gruppe – ein reiner Monsterkampf ist trotzdem möglich.',
  'combat.rollAllNote': 'Monster und Charaktere automatisch auswürfeln (W20 + Modifikator)',
  'combat.rollMonstersNote': 'Die Spieler würfeln am Tisch; du trägst ihre Ergebnisse ein',
  'combat.initiativeOrder': 'Initiativreihenfolge',
  'combat.enterInitFirst': 'Zuerst für jeden Charakter die Initiative eintragen',
  'combat.reroll': 'Neu würfeln',
  'combat.endThisCombat': 'Diesen Kampf beenden?',
  'combat.armorClass': 'Rüstungsklasse',
  'combat.applyDamage': 'Schaden anwenden (Enter)',
  'combat.applyHealing': 'Heilung anwenden (Umschalt+Enter)',
  'combat.rollMonsterAttack': 'Angriff dieses Monsters würfeln (wie über das Stream Deck)',
  'combat.clickToRemove': 'Zum Entfernen klicken',
  'combat.noCombatants': 'Keine Teilnehmer mehr. Beende den Kampf, wenn du fertig bist.',
  'combat.addMonsterToCombat': 'Monster zum Kampf hinzufügen',

  'monsters.importing': 'Importiere…',
  'monsters.manual': 'Eigen',
  'monsters.showActions': 'Aktionen anzeigen',
  'monsters.noActions': 'Keine Aktionen hinterlegt.',
  'monsters.editMonster': 'Monster bearbeiten',
  'monsters.addMonster': 'Monster hinzufügen',
  'monsters.abilitiesNote': '(optional – Modifikatoren werden automatisch berechnet)',
  'monsters.actionsNote': '(Angriffe, Rettungswürfe, Fähigkeiten – nur für den SL)',
  'monsters.section.action': 'Aktion',
  'monsters.section.bonus_action': 'Bonusaktion',
  'monsters.section.reaction': 'Reaktion',
  'monsters.section.legendary_action': 'Legendär',
  'monsters.section.trait': 'Merkmal',
  'monsters.type.attack': 'Angriffswurf',
  'monsters.type.save': 'Rettungswurf',
  'monsters.type.other': 'Sonstiges',
  'monsters.kind.melee': 'Nahkampf',
  'monsters.kind.ranged': 'Fernkampf',
  'monsters.kind.melee_or_ranged': 'Nah- oder Fernkampf',

  'attack.pickAttack': 'Angriff wählen',
  'attack.rollAttack': '🎲 Angriff würfeln',
  'attack.rollDamage': '🎲 Schaden würfeln',
  'attack.whoSaved': 'Wer hat bestanden? →',
  'attack.apply': '⚔ {total} anwenden',

  'dice.amount': 'Anzahl',
  'dice.extraAmount': 'Weitere Anzahl',
  'dice.applyTo': 'Anwenden auf',
  'dice.pickOneOrMore': '(eine oder mehrere auswählen)',
  'dice.rollFirst': 'Zuerst würfeln',
};

const DICTS: Record<Lang, Dict> = { en, de };

/**
 * Look up `key`, substituting `{placeholders}`. Falls back to English and then
 * to the key itself, so a missing translation degrades to readable text rather
 * than a blank label.
 */
export function translate(
  lang: Lang,
  key: string,
  params?: Record<string, string | number>,
): string {
  const raw = DICTS[lang]?.[key] ?? DICTS.en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m));
}

export function conditionLabel(lang: Lang, c: Condition): string {
  return lang === 'de' ? CONDITION_DE[c] ?? c : c;
}

export function abilityLabels(lang: Lang): Record<string, string> {
  return lang === 'de' ? ABILITY_DE : ABILITY_EN;
}

export function damageTypeLabel(lang: Lang, type: string | null | undefined): string {
  if (!type) return '';
  return lang === 'de' ? DAMAGE_TYPE_DE[type.toLowerCase()] ?? type : type;
}

/**
 * Monster names from the German SRD, injected at startup from
 * resources/srd/monsters.de.json. Names missing from that file keep their
 * English form rather than being machine-translated.
 */
let monsterNames: Record<string, string> = {};

export function setMonsterNameMap(map: Record<string, string>): void {
  monsterNames = map ?? {};
}

export function monsterName(lang: Lang, englishName: string): string {
  if (lang !== 'de') return englishName;
  const direct = monsterNames[englishName];
  if (direct) return direct;
  // Combat instances carry a trailing number ("Goblin Warrior 3"): translate
  // the base name and keep the number, so the deck and the DM list agree.
  const m = englishName.match(/^(.*?)(\s+\d+)$/);
  if (m && monsterNames[m[1]]) return monsterNames[m[1]] + m[2];
  return englishName;
}
