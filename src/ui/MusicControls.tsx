import { useRef, useState } from 'react';
import { addOwn, next, pause, play, playTrack, removeOwn, setVolume, useMusic } from './music';
import { DEFAULT_PLAYLIST, embedUrl, setSpotify, useSpotify } from './spotify';
import { Card } from './components';

/** Small play/pause button with the current track, for headers and the menu. */
export function MusicButton({ className = '' }: { className?: string }) {
  const m = useMusic();
  const on = m.playing;
  return (
    <button
      type="button"
      className={`music-btn ${on ? 'on' : ''} ${className}`}
      onClick={() => (on ? pause() : void play())}
      aria-label={on ? `Pause music: ${m.current?.title ?? ''}` : 'Play music'}
      title={on && m.current ? `${m.current.title} · ${m.current.artist}` : 'Play music'}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {on ? <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /> : <path d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM2 2l20 20" />}
      </svg>
      <span className="music-label">{on && m.current ? m.current.title : 'Music'}</span>
    </button>
  );
}

/** Settings card: on/off, volume, next track, the playlist with credits, and your own music. */
export function MusicSettings() {
  const m = useMusic();
  const file = useRef<HTMLInputElement>(null);
  return (
    <Card title="Music" action={<MusicButton />}>
      <p className="muted small">The game makes its own hip hop beats (lo-fi and boom bap, with drums, bass and keys). Add your own songs from this device and they play first; they stay on this device. Tap a track to play it.</p>
      <div className="music-row">
        <label className="music-volume">
          <span className="label">Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={m.volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Music volume" />
        </label>
        <button className="btn btn-sm" type="button" onClick={() => void next()}>
          Next track
        </button>
        <button className="btn btn-sm btn-primary" type="button" onClick={() => file.current?.click()}>
          Add your own music
        </button>
        <input
          ref={file}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addOwn(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <ul className="music-list">
        {m.tracks.map((t) => (
          <li key={t.id} className={m.current?.id === t.id ? 'now' : ''}>
            <button type="button" className="music-track" onClick={() => void playTrack(t.id)}>
              <strong>{t.title}</strong>
              <span className="muted small">
                {' '}
                · {t.artist}
                {t.license && (
                  <>
                    {' '}
                    · <a href={t.page} target="_blank" rel="noreferrer">{t.license}</a>
                  </>
                )}
              </span>
            </button>
            {t.own && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void removeOwn(t.id)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <SpotifySettings />
    </Card>
  );
}

/** Real hip hop through Spotify's own player (the user's Spotify account). */
function SpotifySettings() {
  const sp = useSpotify();
  const [link, setLink] = useState(sp.url);
  const valid = !!embedUrl(link);
  return (
    <div className="spotify-settings">
      <h3>Real hip hop on Spotify</h3>
      <p className="muted small">
        Plays a Spotify playlist through Spotify's own player, docked in the corner on every screen. Logged in to Spotify in this browser you hear full songs; otherwise Spotify plays 30-second previews. Turning it on pauses the game's beats.
      </p>
      <label className="spotify-link">
        <span className="label">Playlist link</span>
        <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder={DEFAULT_PLAYLIST} aria-invalid={!valid} />
      </label>
      {!valid && <p className="small" style={{ color: 'var(--bad)' }}>Paste a Spotify playlist, album or track link.</p>}
      <div className="music-row">
        <button className="btn btn-sm btn-primary" type="button" disabled={!valid} onClick={() => setSpotify({ on: true, url: link })}>
          {sp.on ? 'Update player' : 'Show Spotify player'}
        </button>
        {sp.on && (
          <button className="btn btn-sm" type="button" onClick={() => setSpotify({ on: false })}>
            Hide player
          </button>
        )}
        {link !== DEFAULT_PLAYLIST && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => setLink(DEFAULT_PLAYLIST)}>
            Use RapCaviar
          </button>
        )}
      </div>
    </div>
  );
}
