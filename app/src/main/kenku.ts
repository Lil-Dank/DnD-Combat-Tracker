/**
 * Kenku FM Remote integration.
 *
 * Kenku FM (kenku.fm) plays the audio; this module only talks to its Remote
 * HTTP API — listing playlists/sounds, starting them, pausing playback. The
 * audio output device is therefore chosen inside Kenku FM, not here.
 *
 * Every call is fail-soft: short timeout, errors swallowed. Kenku being
 * closed, the remote being disabled, or a wrong port must never block, delay
 * or error the combat flow — sounds are a garnish, not a dependency. Nothing
 * here is awaited by store mutations.
 *
 * Endpoint spellings verified against a live Kenku FM 1.x instance.
 */
import type { KenkuAttackTrigger, KenkuEventId, KenkuSoundRef } from '../shared/types';
import { store } from './state';

// ---- HTTP client ------------------------------------------------------------

const TIMEOUT_MS = 1500;

const PATHS = {
  playlist: '/v1/playlist',
  playlistPlay: '/v1/playlist/play',
  playlistPlayback: '/v1/playlist/playback',
  playlistPause: '/v1/playlist/playback/pause',
  soundboard: '/v1/soundboard',
  soundboardPlay: '/v1/soundboard/play',
  soundboardStop: '/v1/soundboard/stop',
  soundboardPlayback: '/v1/soundboard/playback',
} as const;

function base(): string {
  const { host, port } = store.getState().settings.kenku;
  return `http://${host}:${port}`;
}

async function request<T>(
  path: string,
  method: 'GET' | 'PUT' = 'GET',
  body?: object,
): Promise<T | null> {
  try {
    const res = await fetch(base() + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    return null;
  }
}

export interface KenkuPlaylist {
  id: string;
  title: string;
  tracks: string[];
}
export interface KenkuTrack {
  id: string;
  title: string;
}
export interface KenkuSoundboard {
  id: string;
  title: string;
  sounds: string[];
}
export interface KenkuSound {
  id: string;
  title: string;
}

export interface KenkuLibrary {
  playlists: KenkuPlaylist[];
  tracks: KenkuTrack[];
  soundboards: KenkuSoundboard[];
  sounds: KenkuSound[];
}

/** Playlists and soundboards in one shot; null when Kenku is unreachable. */
export async function getLibrary(): Promise<KenkuLibrary | null> {
  const [pl, sb] = await Promise.all([
    request<{ playlists: KenkuPlaylist[]; tracks: KenkuTrack[] }>(PATHS.playlist),
    request<{ soundboards: KenkuSoundboard[]; sounds: KenkuSound[] }>(PATHS.soundboard),
  ]);
  if (!pl || !sb) return null;
  return {
    playlists: pl.playlists ?? [],
    tracks: pl.tracks ?? [],
    soundboards: sb.soundboards ?? [],
    sounds: sb.sounds ?? [],
  };
}

export async function playSound(id: string): Promise<boolean> {
  return (await request(PATHS.soundboardPlay, 'PUT', { id })) !== null;
}

export async function stopSound(id: string): Promise<boolean> {
  return (await request(PATHS.soundboardStop, 'PUT', { id })) !== null;
}

export async function stopAllSounds(): Promise<void> {
  const playback = await request<{ sounds: Array<{ id: string }> }>(PATHS.soundboardPlayback);
  for (const s of playback?.sounds ?? []) void stopSound(s.id);
}

export async function playPlaylist(id: string): Promise<boolean> {
  return (await request(PATHS.playlistPlay, 'PUT', { id })) !== null;
}

export async function pausePlayback(): Promise<boolean> {
  return (await request(PATHS.playlistPause, 'PUT')) !== null;
}

export async function getSoundboardPlayback(): Promise<{ sounds: Array<{ id: string }> } | null> {
  return request(PATHS.soundboardPlayback);
}

export async function checkConnection(): Promise<boolean> {
  return (await request(PATHS.soundboard)) !== null;
}

// ---- connection status polling ----------------------------------------------

let pollTimer: NodeJS.Timeout | null = null;

async function refreshConnection(): Promise<void> {
  const { enabled } = store.getState().settings.kenku;
  const connected = enabled ? await checkConnection() : false;
  store.setKenkuConnected(connected);
}

/** Starts the status poll; safe to call again after settings changes. */
export function startKenkuStatusPolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  void refreshConnection();
  pollTimer = setInterval(() => void refreshConnection(), 10_000);
}

// ---- event engine ------------------------------------------------------------

/**
 * Delayed sounds waiting to fire. Cleared when combat ends, so a slow-fuse
 * "monster killed" sting cannot land in the post-combat silence.
 */
const pending = new Set<NodeJS.Timeout>();

export function cancelPendingSounds(): void {
  for (const t of pending) clearTimeout(t);
  pending.clear();
}

function fire(ref: { soundId: string; delayMs?: number }): void {
  const delay = ref.delayMs ?? 0;
  if (delay <= 0) {
    void playSound(ref.soundId);
    return;
  }
  const timer = setTimeout(() => {
    pending.delete(timer);
    void playSound(ref.soundId);
  }, delay);
  pending.add(timer);
}

/** Plays the sound configured for an app event, if any. */
export function triggerKenkuEvent(event: KenkuEventId): void {
  const kenku = store.getState().settings.kenku;
  if (!kenku.enabled) return;
  const ref = kenku.eventSounds[event];
  if (ref) fire(ref);
}

/**
 * The store's combat-event listener: event sound plus the playlist lifecycle
 * (start the template's playlist with combat, pause it when combat ends).
 * Wired in index.ts.
 */
export function handleCombatEvent(event: KenkuEventId): void {
  const kenku = store.getState().settings.kenku;

  if (event === 'combatStart') {
    triggerKenkuEvent(event);
    if (!kenku.enabled) return;
    const state = store.getState();
    const template = state.encounterTemplates.find(
      (t) => t.id === state.combat?.sourceTemplateId,
    );
    if (template?.kenkuPlaylistId) void playPlaylist(template.kenkuPlaylistId);
    return;
  }

  if (event === 'combatEnd') {
    // A delayed sting must not fire into the post-combat silence; the end
    // sound itself is triggered after the purge.
    cancelPendingSounds();
    triggerKenkuEvent(event);
    if (!kenku.enabled) return;
    const state = store.getState();
    const template = state.encounterTemplates.find(
      (t) => t.id === state.combat?.sourceTemplateId,
    );
    // Only pause when this combat actually started music - the DM's own
    // Kenku playback from an unrelated session is not ours to stop.
    if (template?.kenkuPlaylistId) void pausePlayback();
    return;
  }

  triggerKenkuEvent(event);
}

export interface AttackEventPayload {
  /** Monster template id of the attacker (combatant.sourceId). */
  sourceId: string;
  attackId: string;
  phase: 'attackRoll' | 'attackHit' | 'attackCrit' | 'attackMiss' | 'damageRoll' | 'damageApplied';
}

/** Phase → the per-attack trigger it satisfies (crit counts as a hit). */
const PHASE_TRIGGER: Record<AttackEventPayload['phase'], KenkuAttackTrigger | null> = {
  attackRoll: 'attackRoll',
  attackHit: 'attackHit',
  attackCrit: 'attackHit',
  attackMiss: null,
  damageRoll: 'damageRoll',
  damageApplied: 'damageApplied',
};

/** Phase → the global event sound it fires (verdict phases only). */
const PHASE_EVENT: Partial<Record<AttackEventPayload['phase'], KenkuEventId>> = {
  attackHit: 'attackHit',
  attackCrit: 'attackCrit',
  attackMiss: 'attackMiss',
};

/**
 * One handler for attack-flow sounds from both the DM window (IPC) and the
 * Stream Deck (bridge command): fires the attack's own configured sound when
 * its trigger matches the phase, plus the global crit/hit/miss event sound.
 */
export function handleAttackEvent(payload: AttackEventPayload): void {
  const kenku = store.getState().settings.kenku;
  if (!kenku.enabled) return;

  const trigger = PHASE_TRIGGER[payload.phase];
  if (trigger) {
    const monster = store.getState().monsters.find((m) => m.id === payload.sourceId);
    const action = monster?.attacks.find((a) => a.id === payload.attackId);
    if (action?.kenkuSound && action.kenkuSound.trigger === trigger) {
      fire(action.kenkuSound);
    }
  }

  const event = PHASE_EVENT[payload.phase];
  if (event) triggerKenkuEvent(event);
}
