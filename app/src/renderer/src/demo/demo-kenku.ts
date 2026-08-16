/**
 * Kenku FM for the browser demo.
 *
 * Real-first: every call probes the configured Kenku Remote and uses it when
 * reachable. In practice Kenku Remote (as of 1.x) sends no CORS headers and
 * 404s preflights, so a hosted page cannot reach it — but the probe is cheap,
 * and if a future Kenku build allows cross-origin calls this lights up
 * automatically.
 *
 * Fallback: a built-in "Fantasy Soundboard" whose sounds are synthesized live
 * with WebAudio — no audio files, nothing fetched. Sample ids are prefixed
 * `demo-` and always play locally, even when a real Kenku is reachable, so the
 * seeded demo configuration works everywhere.
 */
import type { KenkuLibrary } from '../../../main/kenku';
import type { KenkuSettings } from '../../../shared/types';

// ---- real-Kenku probe --------------------------------------------------------

let reachableCache = { value: false, checkedAt: 0 };

function base(settings: KenkuSettings): string {
  return `http://${settings.host}:${settings.port}`;
}

async function realFetch<T>(
  settings: KenkuSettings,
  path: string,
  method: 'GET' | 'PUT' = 'GET',
  body?: object,
): Promise<T | null> {
  try {
    const res = await fetch(base(settings) + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    return null;
  }
}

export async function kenkuReachable(settings: KenkuSettings): Promise<boolean> {
  // Failures cache longer: each failed probe logs a browser CORS/network error
  // to the console, and (today) they all fail — keep the noise down.
  const ttl = reachableCache.value ? 8000 : 60000;
  if (Date.now() - reachableCache.checkedAt < ttl) return reachableCache.value;
  reachableCache.checkedAt = Date.now();
  const ok = (await realFetch(settings, '/v1/soundboard')) !== null;
  reachableCache = { value: ok, checkedAt: Date.now() };
  return ok;
}

// ---- sample library ----------------------------------------------------------

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
      title: 'Fantasy Soundboard (built in)',
      sounds: SAMPLE_SOUNDS.map((s) => s.id),
    },
  ],
  sounds: SAMPLE_SOUNDS,
};

// ---- WebAudio synthesis ------------------------------------------------------

let ctx: AudioContext | null = null;

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, ac.sampleRate * seconds, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function env(ac: AudioContext, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(ac.destination);
  return g;
}

function tone(
  ac: AudioContext,
  type: OscillatorType,
  from: number,
  to: number,
  at: number,
  dur: number,
  peak: number,
): void {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
  o.connect(env(ac, at, peak, 0.01, dur));
  o.start(at);
  o.stop(at + dur + 0.05);
}

function noise(
  ac: AudioContext,
  filter: BiquadFilterType,
  from: number,
  to: number,
  at: number,
  dur: number,
  peak: number,
): void {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur + 0.1);
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
  src.connect(f);
  f.connect(env(ac, at, peak, 0.01, dur));
  src.start(at);
  src.stop(at + dur + 0.1);
}

/** Each sample sound as a tiny synth patch. Returns its duration in seconds. */
function synthesize(id: string): number {
  const ac = audio();
  const t = ac.currentTime + 0.02;
  switch (id) {
    case 'demo-sword':
      noise(ac, 'highpass', 3000, 6000, t, 0.12, 0.25);
      tone(ac, 'square', 2200, 1800, t, 0.18, 0.08);
      tone(ac, 'sine', 5200, 5000, t + 0.02, 0.4, 0.05);
      return 0.6;
    case 'demo-roar':
      tone(ac, 'sawtooth', 110, 55, t, 1.3, 0.3);
      tone(ac, 'sawtooth', 165, 82, t, 1.3, 0.15);
      noise(ac, 'lowpass', 900, 250, t, 1.3, 0.2);
      return 1.5;
    case 'demo-fire':
      noise(ac, 'bandpass', 400, 3200, t, 0.5, 0.3);
      noise(ac, 'bandpass', 3200, 500, t + 0.4, 0.5, 0.25);
      return 1.0;
    case 'demo-screech':
      tone(ac, 'sawtooth', 1900, 700, t, 0.35, 0.18);
      tone(ac, 'square', 2400, 900, t + 0.05, 0.3, 0.1);
      return 0.5;
    case 'demo-thunder':
      noise(ac, 'lowpass', 2500, 80, t, 1.6, 0.4);
      tone(ac, 'sine', 70, 35, t, 1.2, 0.3);
      return 1.8;
    case 'demo-horn': {
      tone(ac, 'sawtooth', 233, 233, t, 0.45, 0.2);
      tone(ac, 'sawtooth', 311, 311, t + 0.45, 0.7, 0.22);
      return 1.3;
    }
    case 'demo-chime': {
      for (const [i, f] of [880, 1108, 1318].entries()) {
        tone(ac, 'sine', f, f, t + i * 0.12, 0.7, 0.12);
      }
      return 1.2;
    }
    case 'demo-fanfare': {
      for (const [i, f] of [523, 659, 784, 1046].entries()) {
        tone(ac, 'square', f, f, t + i * 0.14, i === 3 ? 0.6 : 0.16, 0.1);
      }
      return 1.2;
    }
    default:
      tone(ac, 'sine', 660, 440, t, 0.3, 0.15);
      return 0.4;
  }
}

// ---- local playback bookkeeping (for the soundboard modal's poll) -----------

const playingUntil = new Map<string, number>();

function markPlaying(id: string, seconds: number): void {
  playingUntil.set(id, Date.now() + seconds * 1000);
}

function localPlayback(): { sounds: Array<{ id: string }> } {
  const now = Date.now();
  for (const [id, until] of playingUntil) if (until <= now) playingUntil.delete(id);
  return { sounds: [...playingUntil.keys()].map((id) => ({ id })) };
}

// ---- drum-loop "playlists" ---------------------------------------------------

let loopTimer: ReturnType<typeof setInterval> | null = null;

function startDrumLoop(fast: boolean): void {
  stopDrumLoop();
  const ac = audio();
  const beat = fast ? 0.32 : 0.5;
  let step = 0;
  const schedule = () => {
    const t = ac.currentTime + 0.02;
    // kick on every beat, accent every 4th, hat between
    tone(ac, 'sine', step % 4 === 0 ? 160 : 130, 45, t, 0.18, step % 4 === 0 ? 0.35 : 0.22);
    noise(ac, 'highpass', 6000, 7000, t + beat / 2, 0.05, 0.05);
    if (fast && step % 8 === 4) tone(ac, 'sawtooth', 98, 65, t, beat * 0.9, 0.08);
    step++;
  };
  schedule();
  loopTimer = setInterval(schedule, beat * 1000);
}

function stopDrumLoop(): void {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = null;
}

// ---- public surface (mirrors what demo-api needs) ---------------------------

export async function demoKenkuLibrary(settings: KenkuSettings): Promise<KenkuLibrary | null> {
  if (await kenkuReachable(settings)) {
    const [pl, sb] = await Promise.all([
      realFetch<{ playlists: KenkuLibrary['playlists']; tracks: KenkuLibrary['tracks'] }>(settings, '/v1/playlist'),
      realFetch<{ soundboards: KenkuLibrary['soundboards']; sounds: KenkuLibrary['sounds'] }>(settings, '/v1/soundboard'),
    ]);
    if (pl && sb) {
      // Real library plus the built-in board, so seeded demo config still shows.
      return {
        playlists: [...(pl.playlists ?? []), ...SAMPLE_LIBRARY.playlists],
        tracks: pl.tracks ?? [],
        soundboards: [...(sb.soundboards ?? []), ...SAMPLE_LIBRARY.soundboards],
        sounds: [...(sb.sounds ?? []), ...SAMPLE_LIBRARY.sounds],
      };
    }
  }
  return SAMPLE_LIBRARY;
}

export async function demoKenkuPlaySound(settings: KenkuSettings, id: string): Promise<boolean> {
  if (!id.startsWith('demo-') && (await kenkuReachable(settings))) {
    return (await realFetch(settings, '/v1/soundboard/play', 'PUT', { id })) !== null;
  }
  markPlaying(id, synthesize(id));
  return true;
}

export async function demoKenkuStopSound(settings: KenkuSettings, id: string): Promise<boolean> {
  if (!id.startsWith('demo-') && (await kenkuReachable(settings))) {
    return (await realFetch(settings, '/v1/soundboard/stop', 'PUT', { id })) !== null;
  }
  playingUntil.delete(id);
  return true;
}

export async function demoKenkuStopAll(settings: KenkuSettings): Promise<void> {
  playingUntil.clear();
  stopDrumLoop();
  if (await kenkuReachable(settings)) {
    const pb = await realFetch<{ sounds: Array<{ id: string }> }>(settings, '/v1/soundboard/playback');
    for (const s of pb?.sounds ?? []) void realFetch(settings, '/v1/soundboard/stop', 'PUT', { id: s.id });
  }
}

export async function demoKenkuPlayback(
  settings: KenkuSettings,
): Promise<{ sounds: Array<{ id: string }> } | null> {
  const local = localPlayback();
  if (await kenkuReachable(settings)) {
    const real = await realFetch<{ sounds: Array<{ id: string }> }>(settings, '/v1/soundboard/playback');
    return { sounds: [...(real?.sounds ?? []), ...local.sounds] };
  }
  return local;
}

export async function demoKenkuPlayPlaylist(settings: KenkuSettings, id: string): Promise<void> {
  if (!id.startsWith('demo-') && (await kenkuReachable(settings))) {
    await realFetch(settings, '/v1/playlist/play', 'PUT', { id });
    return;
  }
  startDrumLoop(id === 'demo-pl-boss');
}

export async function demoKenkuPausePlayback(settings: KenkuSettings): Promise<void> {
  stopDrumLoop();
  if (await kenkuReachable(settings)) await realFetch(settings, '/v1/playlist/playback/pause', 'PUT');
}
