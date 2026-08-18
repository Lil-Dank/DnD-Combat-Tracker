import { app } from 'electron';
import { promises as fs } from 'fs';
import * as path from 'path';
import type { AbilityScores, MonsterAction, MonsterTemplate, Spell } from '../shared/types';
import type { MonsterL10n } from '../shared/i18n';
import { store } from './state';

/**
 * SRD 5.2.1 monster import.
 *
 * The bundled resources/srd/monsters.json is precompiled by scripts/build-srd.mjs
 * from the Open5e srd-2024 dataset (github.com/open5e/open5e-api), which carries
 * "System Reference Document 5.2.1" by Wizards of the Coast under CC-BY-4.0.
 * Actions arrive in the MonsterAction schema (display layer + parsed attack /
 * save / damage layers); initiative modifiers use the stat block's initiative
 * bonus, falling back to the DEX modifier in the build script.
 */

interface BundledMonster {
  name: string;
  maxHp: number;
  ac: number;
  initMod: number;
  abilities?: AbilityScores | null;
  attacks: MonsterAction[];
}

/** Same lookup as the monster data, for the German name map beside it. */
export function srdGermanNamesPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'srd', 'monsters.de.json')
    : path.join(app.getAppPath(), 'resources', 'srd', 'monsters.de.json');
}

/**
 * Loads the German monster localization (names plus per-action name/text).
 * Missing or unreadable file is not fatal: everything simply stays English.
 */
export async function loadGermanMonsterNames(): Promise<Record<string, MonsterL10n>> {
  try {
    return JSON.parse(await fs.readFile(srdGermanNamesPath(), 'utf8'));
  } catch {
    return {};
  }
}

function srdDataPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'srd', 'monsters.json')
    : path.join(app.getAppPath(), 'resources', 'srd', 'monsters.json');
}

export async function importSrdMonsters(): Promise<{ imported: number }> {
  const raw = await fs.readFile(srdDataPath(), 'utf-8');
  const data: BundledMonster[] = JSON.parse(raw);
  const l10nDe = await loadGermanMonsterNames();
  const monsters: Omit<MonsterTemplate, 'id'>[] = [];
  for (const m of data) {
    if (!m.name || typeof m.maxHp !== 'number') continue;
    monsters.push({
      name: m.name,
      maxHp: m.maxHp,
      ac: typeof m.ac === 'number' ? m.ac : 10,
      initMod: typeof m.initMod === 'number' ? m.initMod : 0,
      abilities: m.abilities ?? null,
      attacks: Array.isArray(m.attacks) ? m.attacks : [],
      source: 'srd',
      l10n: l10nDe[m.name] ? { de: l10nDe[m.name] } : null,
    });
  }
  const imported = await store.importMonsters(monsters);
  return { imported };
}

// ---- Spells (resources/srd/spells.json, built by scripts/build-srd-spells.mjs) ----

function srdSpellsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'srd', 'spells.json')
    : path.join(app.getAppPath(), 'resources', 'srd', 'spells.json');
}

function srdGermanSpellsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'srd', 'spells.de.json')
    : path.join(app.getAppPath(), 'resources', 'srd', 'spells.de.json');
}

/** German spell name + rules text, keyed by English name. Missing file = English. */
export async function loadGermanSpellL10n(): Promise<Record<string, { name: string; text: string }>> {
  try {
    return JSON.parse(await fs.readFile(srdGermanSpellsPath(), 'utf8'));
  } catch {
    return {};
  }
}

export async function importSrdSpells(): Promise<{ imported: number }> {
  const raw = await fs.readFile(srdSpellsPath(), 'utf-8');
  const data: Omit<Spell, 'id' | 'source' | 'l10n'>[] = JSON.parse(raw);
  const l10nDe = await loadGermanSpellL10n();
  const spells: Omit<Spell, 'id'>[] = [];
  for (const s of data) {
    if (!s.name || typeof s.level !== 'number') continue;
    spells.push({
      ...s,
      source: 'srd',
      l10n: l10nDe[s.name] ? { de: l10nDe[s.name] } : null,
    });
  }
  const imported = await store.importSpells(spells);
  return { imported };
}
