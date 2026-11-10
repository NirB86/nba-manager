// Background music: a shuffled playlist of the hip hop album the game ships
// with (Joint C Beat Laboratory, "Tales from Underground vol.1", CC BY-NC 4.0),
// plus any tracks the player adds from their own device (kept in this device's
// storage, never uploaded).

import { useSyncExternalStore } from 'react';
import { kvGet, kvSet } from '../storage/saves';

export interface Track {
  id: string;
  title: string;
  artist: string;
  license?: string;
  page?: string;
  src: string;
  own?: boolean;
}

export const ALBUM = {
  title: 'Tales from Underground vol.1',
  artist: 'Joint C Beat Laboratory',
  license: 'CC BY-NC 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
  page: 'https://freemusicarchive.org/music/jcbl/tales-from-underground-vol1',
};

const ALBUM_TRACKS: [string, string][] = [
  ['blooming-poison', 'Blooming Poison'],
  ['brain-war', 'Brain War'],
  ['delete', 'Delete'],
  ['pinocchio', 'Pinocchio'],
  ['mars-is-dangerous', 'Mars Is Dangerous'],
  ['bad-trip', 'Bad Trip'],
  ['nerves', 'Nerves'],
  ['back-in-to-the-toxic', 'Back in to the Toxic'],
  ['endorphin-release', 'Endorphin Release'],
  ['resident-evil', 'Resident Evil'],
  ['war-with-yourself', 'War with Yourself'],
];

/** The game's soundtrack: files in public/music, credited with their license. */
export const BUILT_IN: Track[] = ALBUM_TRACKS.map(([file, title]) => ({
  id: `jcbl-${file}`,
  title,
  artist: ALBUM.artist,
  license: ALBUM.license,
  page: `${ALBUM.page}/${file}`,
  src: `${import.meta.env.BASE_URL}music/tales-from-underground/${file}.mp3`,
}));

interface OwnTrack {
  id: string;
  name: string;
  blob: Blob;
}

const OWN_KEY = 'music-own';
const PREFS_KEY = 'nba-manager-music';

interface MusicState {
  enabled: boolean;
  playing: boolean;
  volume: number;
  current: Track | null;
  own: Track[];
}

function loadPrefs(): { enabled: boolean; volume: number } {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
    return { enabled: v.enabled ?? true, volume: typeof v.volume === 'number' ? v.volume : 0.4 };
  } catch {
    return { enabled: true, volume: 0.4 };
  }
}

let state: MusicState = { ...loadPrefs(), playing: false, current: null, own: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<MusicState>) => {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ enabled: state.enabled, volume: state.volume }));
  } catch {
    // Storage blocked: music still works for this visit.
  }
  emit();
};

let audio: HTMLAudioElement | null = null;
let queue: Track[] = [];
let ownUrls: string[] = [];

function player(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('ended', () => void next());
    audio.addEventListener('error', () => void next());
    audio.addEventListener('pause', () => set({ playing: false }));
    audio.addEventListener('play', () => set({ playing: true }));
  }
  audio.volume = state.volume;
  return audio;
}

const all = () => [...state.own, ...BUILT_IN];

function shuffled(): Track[] {
  // Your own tracks first, then the album, each group shuffled.
  const mix = (xs: Track[]) => xs.map((t) => ({ t, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.t);
  return [...mix(state.own), ...mix(BUILT_IN)];
}

async function startTrack(track: Track) {
  audio?.pause();
  set({ current: track });
  const a = player();
  a.src = track.src;
  try {
    await a.play();
  } catch {
    // Autoplay blocked until the player taps something: startOnFirstTap retries.
  }
}

export async function next(): Promise<void> {
  if (!queue.length) queue = shuffled();
  const track = queue.shift();
  if (track) await startTrack(track);
}

/** Play a particular track from the list. */
export async function playTrack(id: string): Promise<void> {
  const track = all().find((t) => t.id === id);
  if (!track) return;
  set({ enabled: true });
  await startTrack(track);
}

export async function play(): Promise<void> {
  set({ enabled: true });
  const cur = state.current;
  if (cur && audio?.src && audio.paused) {
    try {
      await audio.play();
      return;
    } catch {
      // fall through to a fresh track
    }
  }
  await next();
}

export function pause() {
  set({ enabled: false, playing: false });
  audio?.pause();
}

export function setVolume(v: number) {
  set({ volume: v });
  if (audio) audio.volume = v;
}

async function loadOwn() {
  const stored = (await kvGet<OwnTrack[]>(OWN_KEY)) ?? [];
  ownUrls.forEach((u) => URL.revokeObjectURL(u));
  ownUrls = [];
  const own = stored.map((t) => {
    const src = URL.createObjectURL(t.blob);
    ownUrls.push(src);
    return { id: t.id, title: t.name.replace(/\.[a-z0-9]+$/i, ''), artist: 'Your music', src, own: true };
  });
  queue = [];
  set({ own });
}

/** Add audio files from the device. They stay in this device's storage. */
export async function addOwn(files: FileList | File[]) {
  const stored = (await kvGet<OwnTrack[]>(OWN_KEY)) ?? [];
  for (const f of Array.from(files)) {
    if (!f.type.startsWith('audio/')) continue;
    stored.push({ id: `own-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, blob: f });
  }
  await kvSet(OWN_KEY, stored);
  await loadOwn();
}

export async function removeOwn(id: string) {
  const stored = ((await kvGet<OwnTrack[]>(OWN_KEY)) ?? []).filter((t) => t.id !== id);
  await kvSet(OWN_KEY, stored);
  if (state.current?.id === id) {
    audio?.pause();
    set({ current: null, playing: false });
  }
  await loadOwn();
}

let started = false;
/** Browsers only allow sound after a tap: if music is on, start with the first one. */
export function startOnFirstTap() {
  if (started) return;
  started = true;
  void loadOwn();
  const go = () => {
    window.removeEventListener('pointerdown', go);
    window.removeEventListener('keydown', go);
    if (state.enabled && !state.playing) void play();
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

export function useMusic(): MusicState & { tracks: Track[] } {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  return { ...s, tracks: all() };
}
