// Background music: a shuffled playlist of free-licensed hip hop instrumentals
// (streamed from Wikimedia Commons) plus any tracks the player adds from
// their own device (kept in this device's storage, never uploaded).

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

/** Free-licensed instrumentals on Wikimedia Commons (MP3 versions, which every browser plays). */
export const BUILT_IN: Track[] = [
  {
    id: 'cc-gangsta-synth',
    title: 'Friendly Evil Gangsta Synth Hip Hop',
    artist: 'Mesostic',
    license: 'CC0',
    page: 'https://commons.wikimedia.org/wiki/File:Friendly_Evil_Gangsta_Synth_Hip_Hop.ogg',
    src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/1/10/Friendly_Evil_Gangsta_Synth_Hip_Hop.ogg/Friendly_Evil_Gangsta_Synth_Hip_Hop.ogg.mp3',
  },
  {
    id: 'cc-beat-cook-up-5',
    title: 'Beat Cook Up 5',
    artist: 'JBlanked',
    license: 'CC BY 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:JBlanked_-_05_-_Beat_Cook_Up_5.ogg',
    src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/21/JBlanked_-_05_-_Beat_Cook_Up_5.ogg/JBlanked_-_05_-_Beat_Cook_Up_5.ogg.mp3',
  },
  {
    id: 'cc-beat-cook-up-4',
    title: 'Beat Cook Up 4',
    artist: 'JBlanked',
    license: 'CC BY 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:JBlanked_-_08_-_Beat_Cook_Up_4.ogg',
    src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/8/8c/JBlanked_-_08_-_Beat_Cook_Up_4.ogg/JBlanked_-_08_-_Beat_Cook_Up_4.ogg.mp3',
  },
  {
    id: 'cc-beatmix',
    title: 'Hip hop Beatmix',
    artist: "Filo gèn'",
    license: 'CC BY-SA 4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Hip_hop_Beatmix.ogg',
    src: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/f/f8/Hip_hop_Beatmix.ogg/Hip_hop_Beatmix.ogg.mp3',
  },
];

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
    return { enabled: v.enabled ?? false, volume: typeof v.volume === 'number' ? v.volume : 0.5 };
  } catch {
    return { enabled: false, volume: 0.5 };
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
    audio.preload = 'auto';
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
  // Your own tracks first, then the built-in beats, each group shuffled.
  const mix = (xs: Track[]) => xs.map((t) => ({ t, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.t);
  return [...mix(state.own), ...mix(BUILT_IN)];
}

export async function next(): Promise<void> {
  if (!queue.length) queue = shuffled();
  const track = queue.shift();
  if (!track) return;
  const a = player();
  a.src = track.src;
  set({ current: track });
  try {
    await a.play();
  } catch {
    // Autoplay blocked until the player taps something: startOnFirstTap retries.
  }
}

export async function play(): Promise<void> {
  set({ enabled: true });
  const a = player();
  if (a.src && a.paused && state.current) {
    try {
      await a.play();
      return;
    } catch {
      // fall through to a fresh track
    }
  }
  await next();
}

export function pause() {
  set({ enabled: false });
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
    set({ current: null });
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
