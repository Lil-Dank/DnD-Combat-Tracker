import { DEFAULT_LANG, type Lang, type MonsterL10n } from './i18n';

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
  /**
   * Optional Kenku FM sound fired during this action's attack flow (DM window
   * and Stream Deck both), at the configured trigger point.
   */
  kenkuSound?: {
    soundId: string;
    title: string;
    trigger: KenkuAttackTrigger;
    delayMs?: number;
  } | null;
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
  /**
   * The PC's attack/save actions — same schema as monster actions so the DM
   * attack modal, Stream Deck picker, and player web app all roll them with
   * one code path. Editable in the Party screen and (own PC only) from the
   * player web app.
   */
  attacks: MonsterAction[];
  /** Optional stat block: six scores (modifiers derive) like manual monsters. */
  abilities?: AbilityScores | null;
  /** Free-text notes (class/level, passive perception, whatever the table wants). */
  notes?: string;
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
  /**
   * Localized name/action data, attached at import time for SRD monsters.
   * Manual monsters never carry it, so a language change only affects their
   * surrounding UI text - exactly the intended split.
   */
  l10n?: { de?: MonsterL10n } | null;
}

export interface EncounterEntry {
  monsterTemplateId: string;
  quantity: number;
}

export interface EncounterTemplate {
  id: string;
  name: string;
  entries: EncounterEntry[];
  /** Kenku FM playlist started when combat begins from this template. */
  kenkuPlaylistId?: string | null;
  /** Cached for display while Kenku is offline. */
  kenkuPlaylistTitle?: string | null;
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
  /** Chronological combat log; moved to the archive when combat ends. */
  log: LogEntry[];
}

// ---- Combat log -----------------------------------------------------------

/** Where an action originated. */
export type LogSource = 'dm' | 'deck' | 'player';

export type LogKind =
  | 'combatStart'
  | 'combatEnd'
  | 'turn'
  | 'damage'
  | 'heal'
  | 'attackRoll'
  | 'save'
  | 'conditionAdded'
  | 'conditionRemoved'
  | 'down'
  | 'kill';

/**
 * One combat-log line. Structured params, not prose: every surface renders
 * entries through i18n keys so a language switch re-renders history.
 */
export interface LogEntry {
  id: string;
  /** Unix ms. */
  ts: number;
  round: number;
  kind: LogKind;
  /** Display name of who acted (turn entries: whose turn began). */
  actorName?: string;
  actorType?: CombatantType;
  targetName?: string;
  targetType?: CombatantType;
  /** Damage/heal amount. */
  amount?: number;
  /** Attack rolls: the raw d20. */
  die?: number;
  /** Attack rolls: die + toHit; saves: the save total. */
  total?: number;
  outcome?: 'crit' | 'hit' | 'miss' | 'saved' | 'failed';
  /** attackRoll entries: the action's name (e.g. "Scimitar"). */
  attackName?: string;
  /** damage entries: the dice composition ("2d6 [3+5] +4 = 12"), DM-only. */
  math?: string;
  /** Damage type per bracket group of `math`, for type-tinted rendering. */
  mathTypes?: (string | null)[];
  condition?: Condition;
  source: LogSource;
  /** Player-sourced entries: the claim's player name or a device label. */
  sourceName?: string;
}

/** An ended combat's log, kept until the DM deletes it. */
export interface ArchivedCombat {
  id: string;
  /** Template name at the time the combat ended (templates can be renamed). */
  templateName: string;
  endedAt: number;
  rounds: number;
  log: LogEntry[];
}

export type ThemeId = 'phb' | 'electron' | 'dark' | 'light';

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'dark', label: 'Dark (Default)' },
  { id: 'phb', label: 'PHB Style' },
  { id: 'electron', label: 'Default Electron' },
  { id: 'light', label: 'Light' },
];

// ---- Kenku FM integration -------------------------------------------------

/** App happenings that can trigger a configured Kenku FM sound. */
export type KenkuEventId =
  | 'combatStart'
  | 'combatEnd'
  | 'turnChange'
  | 'damageApplied'
  | 'healApplied'
  | 'pcDowned'
  | 'monsterKilled'
  | 'attackCrit'
  | 'attackHit'
  | 'attackMiss';

/** A configured Kenku sound: id + cached title (shown while Kenku is offline). */
export interface KenkuSoundRef {
  soundId: string;
  title: string;
  /** Wait this long after the event before playing. */
  delayMs?: number;
}

/** When a per-attack sound fires during the attack flow. */
export type KenkuAttackTrigger = 'attackRoll' | 'attackHit' | 'damageRoll' | 'damageApplied';

export interface KenkuSettings {
  enabled: boolean;
  /** Kenku Remote address (enable it in Kenku FM's settings). */
  host: string;
  port: number;
  eventSounds: Partial<Record<KenkuEventId, KenkuSoundRef>>;
}

export const DEFAULT_KENKU_SETTINGS: KenkuSettings = {
  enabled: false,
  host: '127.0.0.1',
  port: 3333,
  eventSounds: {},
};

// ---- Player web companion --------------------------------------------------

/** Off-turn behavior for the player web app. Enforced server-side. */
export type PlayerWebGating = 'strict' | 'relaxed';

export interface PlayerWebSettings {
  /** Off by default — the app is fully functional without it. */
  enabled: boolean;
  /** HTTP+WebSocket port, bound on all interfaces (LAN). */
  port: number;
  /** strict: no actions off-turn; relaxed: self-targeted damage/heal allowed. */
  gating: PlayerWebGating;
}

export const DEFAULT_PLAYER_WEB_SETTINGS: PlayerWebSettings = {
  enabled: false,
  port: 57322,
  gating: 'strict',
};

/** A PC claim as shown to the DM (claims live in data/player-claims.json). */
export interface PlayerClaimInfo {
  pcId: string;
  /** Optional name the player typed when claiming. */
  playerName: string | null;
  /** Whether a socket holding this claim's token is currently connected. */
  connected: boolean;
}

export interface Settings {
  playerViewBgColor: string;
  bridgePort: number;
  theme: ThemeId;
  /** Auto-open the attack quick reference for the monster whose turn it is. */
  autoOpenAttacks: boolean;
  /** UI language for both windows and the Stream Deck plugin. */
  language: Lang;
  /** Kenku FM Remote integration (sounds play through Kenku, not this app). */
  kenku: KenkuSettings;
  /** LAN webserver for players' phones. */
  playerWeb: PlayerWebSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  playerViewBgColor: '#1a1423',
  bridgePort: 57321,
  theme: 'dark',
  autoOpenAttacks: true,
  language: DEFAULT_LANG,
  kenku: DEFAULT_KENKU_SETTINGS,
  playerWeb: DEFAULT_PLAYER_WEB_SETTINGS,
};

/** Full snapshot pushed to every window on any change. */
export interface AppState {
  pcs: PC[];
  monsters: MonsterTemplate[];
  encounterTemplates: EncounterTemplate[];
  combat: Combat | null;
  settings: Settings;
  bridgeClientCount: number;
  /** Whether Kenku Remote answered the most recent connection check. */
  kenkuConnected: boolean;
  /** Current PC claims from the player web server (empty while disabled). */
  playerClients: PlayerClaimInfo[];
}
