/**
 * Kenku FM for the browser demo — configuration UI only, deliberately silent.
 *
 * The demo shows the whole Kenku feature surface (event sounds, per-attack
 * sounds, playlists, the soundboard panel) against a built-in sample library,
 * but plays no audio and never probes a real Kenku: unsolicited sound is
 * more off-putting than inviting, and probing localhost from a hosted page
 * triggers browser permission/console noise. "Playing" is purely a visual
 * state so the soundboard still demonstrates its feedback.
 */
import type { KenkuLibrary } from '../../../main/kenku';

const SAMPLE_SOUNDS: Array<{ id: string; title: string }> = [
  { id: 'demo-sword', title: 'Sword Clash' },
  { id: 'demo-roar', title: 'Dragon Roar' },
  { id: 'demo-fire', title: 'Fire Whoosh' },
  { id: 'demo-screech', title: 'Goblin Screech' },
  { id: 'demo-thunder', title: 'Thunder Crack' },
  { id: 'demo-horn', title: 'Battle Horn' },
  { id: 'demo-chime', title: 'Healing Chime' },
  { id: 'demo-fanfare', title: 'Victory Fanfare' },
];

const SAMPLE_LIBRARY: KenkuLibrary = {
  playlists: [
    { id: 'demo-pl-battle', title: 'Battle Drums', tracks: [] },
    { id: 'demo-pl-boss', title: 'Boss Fight', tracks: [] },
  ],
  tracks: [],
  soundboards: [
    {
      id: 'demo-board',
      title: 'Fantasy Soundboard (sample)',
      sounds: SAMPLE_SOUNDS.map((s) => s.id),
    },
  ],
  sounds: SAMPLE_SOUNDS,
};

// ---- silent playback bookkeeping (drives the soundboard's playing state) ---

const playingUntil = new Map<string, number>();

function localPlayback(): { sounds: Array<{ id: string }> } {
  const now = Date.now();
  for (const [id, until] of playingUntil) if (until <= now) playingUntil.delete(id);
  return { sounds: [...playingUntil.keys()].map((id) => ({ id })) };
}

// ---- public surface ---------------------------------------------------------

export async function demoKenkuLibrary(): Promise<KenkuLibrary | null> {
  return SAMPLE_LIBRARY;
}

export async function demoKenkuPlaySound(id: string): Promise<boolean> {
  // Visual-only: the button lights up for a moment, nothing is audible.
  playingUntil.set(id, Date.now() + 1500);
  return true;
}

export async function demoKenkuStopSound(id: string): Promise<boolean> {
  playingUntil.delete(id);
  return true;
}

export async function demoKenkuStopAll(): Promise<void> {
  playingUntil.clear();
}

export async function demoKenkuPlayback(): Promise<{ sounds: Array<{ id: string }> } | null> {
  return localPlayback();
}

export async function demoKenkuPlayPlaylist(_id: string): Promise<void> {
  // Silent by design.
}

export async function demoKenkuPausePlayback(): Promise<void> {}
