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
  'settings.credits': 'Monster data: SRD 5.2.1 by Wizards of the Coast, licensed under',
  'settings.creditsDataset': '. Dataset: Open5e (srd-2024).',
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
  'attack.heading': '🎲 {name} attacks',
  'attack.pickTargetsFor': '{name} — pick targets',
  'attack.pickTargetFor': '{name} — pick a target',
  'attack.severalAllowed': '(save-based: several allowed)',
  'attack.vsTarget': 'vs {name} — AC {ac}',
  'attack.whoSucceeded': 'Who succeeded the {ability} save DC {dc}?',
  'attack.savedTakeHalf': '(saved take {half} instead of {full})',
  'attack.recharge': 'Recharge {min}+',
  'combat.step1': '1. Pick an encounter template',
  'combat.step2': '2. Choose the PCs joining the fight',
  'combat.step3': '3. Initiative',
  'combat.hpAc': 'HP {hp} · AC {ac}',
  'combat.setupHint':
    'Monsters are rolled automatically (🎲 to re-roll). Drag rows to break ties manually.',
  'combat.mod': 'mod',
  'unit.square': 'sq',
  'unit.squares': 'sq',



  'common.ok': 'OK',
  'common.section': 'Section',
  'common.type': 'Type',
  'common.kind': 'Kind',
  'common.dc': 'DC',

  'pcs.save': 'Save',

  'monsters.libraryEmpty':
    'The library is empty. Add monsters manually, or import the bundled SRD 5.2.1 set.',
  'monsters.f.toHit': 'To hit',
  'monsters.f.longRange': 'Long range',
  'monsters.f.saveAbility': 'Save ability',
  'monsters.f.damageDice': 'Damage dice',
  'monsters.f.flatDamage': 'Flat damage',
  'monsters.f.onlyIf': 'Only if…',
  'monsters.f.addDamage': '+ Add damage',
  'monsters.f.addAction': '+ Add action',

  'templates.noLibrary':
    'Add monsters to the library first — templates are built from monster-library entries.',
  'templates.emptyNote':
    'No encounter templates yet. A template is a reusable blueprint of monsters with quantities.',
  'templates.nameLabel': 'Template name',
  'templates.saveTemplate': 'Save Template',

  'combat.header': 'Combat',
  'combat.roundBadge': 'Round {n}',
  'combat.needTemplate':
    'Combat starts from an encounter template. Build one on the Encounters screen first.',
  'combat.rollInitiative': 'Roll Initiative →',
  'combat.beginCombat': '▶ Begin Combat',
  'combat.dmgBtn': '⚔ Dmg',
  'combat.healBtn': '✚ Heal',
  'combat.initiativeAuto':
    'Initiative is rolled automatically; the monster joins the order at its roll.',
  'combat.moreRefine': '…{n} more, refine search',
  'combat.toHit': 'to hit',
  'combat.saveDc': '{ability} save DC {dc}',
  'combat.targetsCount': '{ability} save DC {dc} — {n} target(s)',

  'dice.die': 'Die',
  'dice.addExtra': '＋ Add extra dice',
  'dice.rollPool': '🎲 Roll {pool}',

  'attack.crit': '💥 CRIT!',
  'attack.nat1': 'NAT 1 — MISS',
  'attack.hit': '✔ HIT',
  'attack.miss': '✘ MISS',
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
  'settings.credits': 'Monsterdaten: SRD 5.2.1 von Wizards of the Coast, lizenziert unter',
  'settings.creditsDataset': '. Datensatz: Open5e (srd-2024).',
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
  'attack.heading': '🎲 {name} greift an',
  'attack.pickTargetsFor': '{name} – Ziele wählen',
  'attack.pickTargetFor': '{name} – Ziel wählen',
  'attack.severalAllowed': '(Rettungswurf: mehrere möglich)',
  'attack.vsTarget': 'gegen {name} – RK {ac}',
  'attack.whoSucceeded': 'Wer hat den {ability}-Rettungswurf SG {dc} bestanden?',
  'attack.savedTakeHalf': '(Bestandene erleiden {half} statt {full})',
  'attack.recharge': 'Aufladung {min}+',
  'combat.step1': '1. Begegnungsvorlage wählen',
  'combat.step2': '2. Teilnehmende Charaktere wählen',
  'combat.step3': '3. Initiative',
  'combat.hpAc': 'TP {hp} · RK {ac}',
  'combat.setupHint':
    'Monster werden automatisch ausgewürfelt (🎲 zum Neuwürfeln). Ziehe Zeilen, um Gleichstände manuell zu klären.',
  'combat.mod': 'Mod.',
  'unit.square': 'Feld',
  'unit.squares': 'Felder',



  'common.ok': 'OK',
  'common.section': 'Abschnitt',
  'common.type': 'Typ',
  'common.kind': 'Art',
  'common.dc': 'SG',

  'pcs.save': 'Speichern',

  'monsters.libraryEmpty':
    'Die Bibliothek ist leer. Lege Monster manuell an oder importiere den mitgelieferten SRD-5.2.1-Satz.',
  'monsters.f.toHit': 'Angriffsbonus',
  'monsters.f.longRange': 'Weite Distanz',
  'monsters.f.saveAbility': 'Rettungswurf-Attribut',
  'monsters.f.damageDice': 'Schadenswürfel',
  'monsters.f.flatDamage': 'Fester Schaden',
  'monsters.f.onlyIf': 'Nur wenn…',
  'monsters.f.addDamage': '+ Schaden hinzufügen',
  'monsters.f.addAction': '+ Aktion hinzufügen',

  'templates.noLibrary':
    'Lege zuerst Monster in der Bibliothek an – Vorlagen werden aus Bibliothekseinträgen gebaut.',
  'templates.emptyNote':
    'Noch keine Begegnungsvorlagen. Eine Vorlage ist ein wiederverwendbarer Bauplan aus Monstern mit Anzahl.',
  'templates.nameLabel': 'Vorlagenname',
  'templates.saveTemplate': 'Vorlage speichern',

  'combat.header': 'Kampf',
  'combat.roundBadge': 'Runde {n}',
  'combat.needTemplate':
    'Ein Kampf beginnt mit einer Begegnungsvorlage. Lege zuerst eine im Bereich „Begegnungen“ an.',
  'combat.rollInitiative': 'Initiative würfeln →',
  'combat.beginCombat': '▶ Kampf beginnen',
  'combat.dmgBtn': '⚔ Schaden',
  'combat.healBtn': '✚ Heilen',
  'combat.initiativeAuto':
    'Die Initiative wird automatisch gewürfelt; das Monster reiht sich entsprechend ein.',
  'combat.moreRefine': '…{n} weitere, Suche eingrenzen',
  'combat.toHit': 'Angriffswurf',
  'combat.saveDc': '{ability}-Rettungswurf SG {dc}',
  'combat.targetsCount': '{ability}-Rettungswurf SG {dc} – {n} Ziel(e)',

  'dice.die': 'Würfel',
  'dice.addExtra': '＋ Weitere Würfel',
  'dice.rollPool': '🎲 {pool} würfeln',

  'attack.crit': '💥 KRITISCH!',
  'attack.nat1': 'NAT 1 – DANEBEN',
  'attack.hit': '✔ TREFFER',
  'attack.miss': '✘ DANEBEN',
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


/** Feet or meters per battle-grid square (D&D squares are 5 ft = 1,5 m). */
const FEET_PER_SQUARE = 5;
const METERS_PER_SQUARE = 1.5;

/**
 * Annotates every distance in a range/reach string with its size in grid
 * squares, for play on a 1-inch battle map: "reach 10 ft." becomes
 * "reach 10 ft. (2 sq)", "Reichweite 3 m" becomes "Reichweite 3 m (2 Felder)".
 * Compound strings annotate each segment ("reach 5 ft. (1 sq) or range
 * 150 ft. (30 sq)"). Strings without a recognizable distance pass through.
 */
export function rangeWithSquares(lang: Lang, range: string | null): string | null {
  if (!range) return range;
  return range.replace(
    /(\d+(?:[.,]\d+)?)(\s*\/\s*(\d+(?:[.,]\d+)?))?\s*(ft\.?|m)(?![A-Za-z])/gi,
    (whole, first, _pair, second, unit) => {
      const per = unit.toLowerCase().startsWith('m') ? METERS_PER_SQUARE : FEET_PER_SQUARE;
      const toSq = (v: string) => Math.round(parseFloat(v.replace(',', '.')) / per);
      const a = toSq(first);
      const b = second ? toSq(second) : null;
      const label = translate(lang, b !== null || a !== 1 ? 'unit.squares' : 'unit.square');
      return `${whole} (${b !== null ? `${a}/${b}` : a} ${label})`;
    },
  );
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

/** German ability codes as printed in SRD stat blocks (STR -> STÄ). */
const ABILITY_CODES_DE: Record<string, string> = {
  STR: 'STÄ', DEX: 'GES', CON: 'KON', INT: 'INT', WIS: 'WEI', CHA: 'CHA',
};

export function abilityCodeLabel(lang: Lang, code: string): string {
  return lang === 'de' ? ABILITY_CODES_DE[code.toUpperCase()] ?? code : code;
}

/** Localized name + rules text for one monster action. */
export interface MonsterActionL10n {
  name: string;
  text: string;
}

/** Everything the German SRD provides for one monster. */
export interface MonsterL10n {
  name: string;
  actions: Record<string, MonsterActionL10n>;
}

/**
 * Monster localization from the German SRD, injected at startup from
 * resources/srd/monsters.de.json and stored on imported monster templates.
 * Anything missing from it keeps its English form rather than being
 * machine-translated.
 */
let monsterMap: Record<string, MonsterL10n> = {};

export function setMonsterNameMap(map: Record<string, MonsterL10n | string>): void {
  monsterMap = {};
  for (const [k, v] of Object.entries(map ?? {})) {
    monsterMap[k] = typeof v === 'string' ? { name: v, actions: {} } : v;
  }
}

export function monsterL10n(englishName: string): MonsterL10n | undefined {
  return monsterMap[englishName];
}

export function monsterName(lang: Lang, englishName: string): string {
  if (lang !== 'de') return englishName;
  const direct = monsterMap[englishName];
  if (direct) return direct.name;
  // Combat instances carry a trailing number ("Goblin Warrior 3"): translate
  // the base name and keep the number, so the deck and the DM list agree.
  const m = englishName.match(/^(.*?)(\s+\d+)$/);
  if (m && monsterMap[m[1]]) return monsterMap[m[1]].name + m[2];
  return englishName;
}
