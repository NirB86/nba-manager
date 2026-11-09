// Background music: a shuffled playlist of original hip hop beats the game
// synthesises itself (beats.ts), plus any tracks the player adds from their
// own device (kept in this device's storage, never uploaded).

import { useSyncExternalStore } from 'react';
import { kvGet, kvSet } from '../storage/saves';
import { BeatPlayer, PRESETS, type BeatPreset } from './beats';

export interface Track {
  id: string;
  title: string;
  artist: string;
  license?: string;
  page?: string;
  src: string;
  own?: boolean;
  /** A beat the game synthesises live, instead of an audio file. */
  beat?: BeatPreset;
}

/** Original beats made by the game itself (see beats.ts): no files, no licences. */
export const BUILT_IN: Track[] = PRESETS.map((p) => ({ id: p.id, title: p.title, artist: `NBA Manager beats · ${p.bpm} BPM`, src: '', beat: p }));

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
let beat: BeatPlayer | null = null;
let beatTimer: number | null = null;
let queue: Track[] = [];
let ownUrls: string[] = [];
/** How long one beat plays before the next track (seconds). */
const BEAT_SECONDS = 150;

function player(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = 'auto';
    audio.addEventListener('ended', () => void next());
    audio.addEventListener('error', () => void next());
    audio.addEventListener('pause', () => {
      if (!beat) set({ playing: false });
    });
    audio.addEventListener('play', () => set({ playing: true }));
  }
  audio.volume = state.volume;
  return audio;
}

const all = () => [...state.own, ...BUILT_IN];

function shuffled(): Track[] {
  // Your own tracks first, then the game's beats, each group shuffled.
  const mix = (xs: Track[]) => xs.map((t) => ({ t, r: Math.random() })).sort((a, b) => a.r - b.r).map((x) => x.t);
  return [...mix(state.own), ...mix(BUILT_IN)];
}

function stopBeat() {
  if (beatTimer !== null) window.clearTimeout(beatTimer);
  beatTimer = null;
  beat?.stop();
  beat = null;
}

async function startTrack(track: Track) {
  stopBeat();
  audio?.pause();
  set({ current: track });
  if (track.beat) {
    beat = new BeatPlayer(track.beat, state.volume);
    try {
      await beat.start();
      set({ playing: true });
      beatTimer = window.setTimeout(() => void next(), BEAT_SECONDS * 1000);
    } catch {
      set({ playing: false });
    }
    return;
  }
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
  if (cur && !cur.beat && audio?.src && audio.paused) {
    try {
      await audio.play();
      return;
    } catch {
      // fall through to a fresh track
    }
  }
  if (cur?.beat) {
    await startTrack(cur);
    return;
  }
  await next();
}

export function pause() {
  set({ enabled: false, playing: false });
  stopBeat();
  audio?.pause();
}

export function setVolume(v: number) {
  set({ volume: v });
  if (audio) audio.volume = v;
  beat?.setVolume(v);
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
