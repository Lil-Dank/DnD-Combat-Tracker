import { DEFAULT_LANG, type Lang } from './i18n';

// Shared data model used by main, preload, and renderer.

// ---- Monster actions (schema derived from SRD 5.2.1, see docs/monster-attack-schema) ----

export type ActionSection = 'action' | 'bonus_action' | 'reaction' | 'legendary_action' | 'trait';
export type ActionKind = 'attack' | 'save' | 'other';
export type AttackKind = 'melee' | 'ranged' | 'melee_or_ranged';

export interface DamageInstance {
  /** SRD average value; the damage roller falls back to this when dice is null. */
  average: number | null;
  /** e.g. "2d6+5"; null for the flat-number attacks ("Hit: 1 Piercing damage"). */
  dice: string | null;
  count: number | null;
  die: number | null;
  bonus: number | null;
  /** Standard damage type, or "variable" (Draconic Origin case). */
  type: string;
  /** e.g. "if the attack roll had Advantage" — conditional bonus damage. */
  condition: string | null;
}

export interface ActionEffect {
  kind:
    | 'condition'
    | 'save'
    | 'ongoing_damage'
    | 'hp_max_reduction'
    | 'forced_movement'
    | 'swallow'
    | 'instant_death'
    | 'other';
  condition?: string | null;
  escapeDC?: number | null;
  appliesIf?: string | null;
  text: string;
}

export interface AttackRollInfo {
  kind: AttackKind;
  toHit: number;
  /** e.g. "with Advantage if the target is Grappled by the ankheg". */
  toHitNote: string | null;
  /** ft — required when kind includes melee. */
  reach: number | null;
  /** Required when kind includes ranged; long may be null (fixed-range attacks). */
  range: { normal: number; long: number | null } | null;
  usage:
    | { type: 'recharge'; min: number }
    | { type: 'form'; text: string }
    | { type: 'per_day'; times: number }
    | null;
}

export interface SaveInfo {
  ability: string;
  dc: number;
}

export interface MonsterAction {
  id: string;
  name: string;
  section: ActionSection;
  /** Discriminator: attack roll | saving-throw action | anything else. */
  type: ActionKind;
  order: number;
  /** Present when type === 'attack'. */
  attack: AttackRollInfo | null;
  /** Present when type === 'save' and parseable. */
  save: SaveInfo | null;
  onHit: {
    /** May be empty (grapple-only attacks) when effects is non-empty. */
    damage: DamageInstance[];
    alternateDamage: { average: number | null; dice: string | null; type: string; when: string } | null;
    effects: ActionEffect[];
  };
  /** Free text; returning-thrown-weapon entries only. */
  onHitOrMiss: string | null;
  /** Always-populated render layer; text is the raw SRD sentence (safety net). */
  display: {
    toHit: string | null;
    range: string | null;
    damage: string | null;
    text: string;
  };
}

export interface PC {
  id: string;
  name: string;
  maxHp: number;
  ac: number;
  initMod: number;
}

export type MonsterSource = 'manual' | 'srd';

/** Ability scores; modifiers are derived (floor((score − 10) / 2)). */
export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);

export interface MonsterTemplate {
  id: string;
  name: string;
  maxHp: number;
  ac: number;
  initMod: number;
  /** Optional — manual monsters may omit them. */
  abilities?: AbilityScores | null;
  attacks: MonsterAction[];
  source: MonsterSource;
}

export interface EncounterEntry {
  monsterTemplateId: string;
  quantity: number;
}

export interface EncounterTemplate {
  id: string;
  name: string;
  entries: EncounterEntry[];
}

export const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Exhaustion',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;

export type Condition = (typeof CONDITIONS)[number];

export type CombatantType = 'pc' | 'monster';

export interface Combatant {
  id: string;
  displayName: string;
  type: CombatantType;
  /** For PCs, the library PC id; for monsters, the monster template id. */
  sourceId: string;
  maxHp: number;
  currentHp: number;
  ac: number;
  initMod: number;
  abilities?: AbilityScores | null;
  attacks: MonsterAction[];
  conditions: Condition[];
  /** null while waiting for the DM to enter a PC's rolled initiative. */
  initiative: number | null;
  isDowned: boolean;
}

export type CombatPhase = 'setup' | 'active';

export interface Combat {
  id: string;
  sourceTemplateId: string;
  phase: CombatPhase;
  combatants: Combatant[];
  currentIndex: number;
  round: number;
}

export type ThemeId = 'phb' | 'electron' | 'dark' | 'light';

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'phb', label: 'PHB Style (Default)' },
  { id: 'electron', label: 'Default Electron' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

export interface Settings {
  playerViewBgColor: string;
  bridgePort: number;
  theme: ThemeId;
  /** Auto-open the attack quick reference for the monster whose turn it is. */
  autoOpenAttacks: boolean;
  /** UI language for both windows and the Stream Deck plugin. */
  language: Lang;
}

export const DEFAULT_SETTINGS: Settings = {
  playerViewBgColor: '#1a1423',
  bridgePort: 57321,
  theme: 'phb',
  autoOpenAttacks: true,
  language: DEFAULT_LANG,
};

/** Full snapshot pushed to every window on any change. */
export interface AppState {
  pcs: PC[];
  monsters: MonsterTemplate[];
  encounterTemplates: EncounterTemplate[];
  combat: Combat | null;
  settings: Settings;
  bridgeClientCount: number;
}
