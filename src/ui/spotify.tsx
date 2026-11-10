import { useSyncExternalStore } from 'react';
import { pause } from './music';

/** RapCaviar, Spotify's flagship hip hop playlist. */
export const DEFAULT_PLAYLIST = 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd';
const KEY = 'nba-manager-spotify';

interface SpotifyPrefs {
  on: boolean;
  url: string;
}

function load(): SpotifyPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { on: !!v.on, url: typeof v.url === 'string' && v.url ? v.url : DEFAULT_PLAYLIST };
  } catch {
    return { on: false, url: DEFAULT_PLAYLIST };
  }
}

let prefs = load();
const listeners = new Set<() => void>();
function save(next: SpotifyPrefs) {
  prefs = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the setting lasts for this visit.
  }
  listeners.forEach((l) => l());
}

export function useSpotify(): SpotifyPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}

export function setSpotify(patch: Partial<SpotifyPrefs>) {
  // One music source at a time: Spotify pauses the game's own soundtrack.
  if (patch.on) pause();
  save({ ...prefs, ...patch });
}

/** Spotify's embed address for a playlist, album or track link (or URI). */
export function embedUrl(link: string): string | null {
  const m = link.trim().match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(playlist|album|track|artist)[/:]([A-Za-z0-9]{10,})/);
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : null;
}

/** Spotify's own player, docked in a corner on every screen while it is on. */
export function SpotifyDock() {
  const s = useSpotify();
  const src = s.on ? embedUrl(s.url) : null;
  if (!src) return null;
  return (
    <div className="spotify-dock">
      <iframe title="Spotify player" src={src} width="100%" height="80" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
      <button type="button" className="spotify-close" aria-label="Close Spotify player" onClick={() => setSpotify({ on: false })}>
        ×
      </button>
    </div>
  );
}
