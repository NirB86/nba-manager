import { useEffect, useRef, useState } from 'react';
import { deleteSave, exportSave, importSaveFile, listSaves, loadSave, type SaveSummary } from '../../storage/saves';
import { displayRating, playerOverall, type LeagueFile } from '../../engine';
import { TeamBadge } from '../components';
import { cloudConfigured } from '../../cloud/cloud';
import { cachedLeague, syncLeague, type SyncResult } from '../../cloud/sync';
import type { CachedLeague } from '../../cloud/cloud';
import { seasonLabel, timeAgo } from '../format';
import { href, navigate } from '../router';

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function MainMenu() {
  const [saves, setSaves] = useState<SaveSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => listSaves().then(setSaves).catch(() => setSaves([]));
  const [league, setLeague] = useState<CachedLeague | undefined>(undefined);
  const [sync, setSync] = useState<SyncResult | 'syncing'>('syncing');
  useEffect(() => {
    void refresh();
    void cachedLeague().then(setLeague);
    void syncLeague().then((r) => {
      setSync(r);
      if (r.status === 'updated' || r.status === 'current') setLeague(r.league);
    });
  }, []);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const save = await importSaveFile(file);
      navigate('c', save.id, 'home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import that file.');
    }
  };

  const onExport = async (id: string) => {
    const save = await loadSave(id);
    if (save) exportSave(save);
  };

  const onDelete = async (s: SaveSummary) => {
    if (!window.confirm(`Delete "${s.name}"? This cannot be undone. Export it first if you want a backup.`)) return;
    await deleteSave(s.id);
    void refresh();
  };

  const showInstallHint = isIos() && !isStandalone();

  return (
    <div className={`menu ${league ? 'menu-live' : ''}`}>
      <div className="menu-hero">
        {league && <HeroStars league={league.league} />}
        {league?.league.meta.logo ? (
          <img className="menu-league-logo" src={league.league.meta.logo.url} alt="NBA" />
        ) : (
          <img src="icons/favicon.svg" alt="" width={72} height={72} />
        )}
        <span className="eyebrow">Basketball franchise management</span>
        <h1>
          NBA <span>Manager</span>
        </h1>
        <p className="muted">Run the franchise. Build the roster. Hang the banner.</p>
        <div className="menu-actions">
          <a className="btn btn-primary btn-lg" href={href('new')}>
            New career
          </a>
          <button className="btn btn-lg" type="button" onClick={() => fileInput.current?.click()}>
            Import save
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              void onImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {league && <LogoStrip league={league.league} />}

      {cloudConfigured() && <LeagueCard league={league} sync={sync} />}

      {showInstallHint && (
        <div className="install-hint">
          <strong>Play it like an app:</strong> tap the Share button in Safari, then <em>Add to Home Screen</em>.
        </div>
      )}

      <section className="saves">
        <h2>Your careers</h2>
        {saves === null && <p className="muted">Loading…</p>}
        {saves?.length === 0 && <p className="muted">No careers yet. Start a new one to take over a franchise.</p>}
        <ul className="save-list">
          {saves?.map((s) => {
            // Real-league careers borrow the logo and arena photo from the downloaded league.
            const t = s.leagueSource === 'real' ? league?.league.teams.find((x) => x.id === s.teamId) : undefined;
            return (
            <li key={s.id} className={`save-item ${t?.arenaPhoto ? 'has-photo' : ''}`} style={{ ['--save-team' as string]: s.colors.primary }}>
              {t?.arenaPhoto && <img className="save-photo" src={t.arenaPhoto.url} alt="" />}
              <a className="save-main" href={href('c', s.id, 'home')}>
                <TeamBadge team={{ ...s, logo: t?.logo }} size={48} />
                <div>
                  <div className="save-name">{s.name}</div>
                  <div className="muted small">
                    {s.teamName} · {seasonLabel(s.season)} · {s.leagueSource === 'fictional' ? 'Fictional league' : s.leagueSource === 'real' ? 'Real league' : 'Custom league'}
                  </div>
                  <div className="muted small">Saved {timeAgo(s.updatedAt)}</div>
                </div>
              </a>
              <div className="save-actions">
                <button className="btn btn-sm" type="button" onClick={() => void onExport(s.id)}>
                  Export
                </button>
                <button className="btn btn-sm btn-danger" type="button" onClick={() => void onDelete(s)}>
                  Delete
                </button>
              </div>
            </li>
            );
          })}
        </ul>
        <p className="muted small">Saves live on this device. Export a save to back it up or move it to another device. Cloud sync is coming.</p>
      </section>
      <footer className="menu-footer muted small">© 2026 NirB86 · v{__APP_VERSION__} · Your careers are saved on this device</footer>
    </div>
  );
}

/** The league's best players as cut-outs, standing along the hero banner. */
function HeroStars({ league }: { league: LeagueFile }) {
  const stars = league.players
    .filter((p) => p.teamId && p.photo?.source === 'NBA.com')
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .slice(0, 3);
  if (!stars.length) return null;
  return (
    <div className="hero-stars" aria-hidden="true">
      {stars.map((p, i) => (
        <img key={p.id} src={p.photo!.url} alt="" style={{ ['--i' as string]: i }} />
      ))}
    </div>
  );
}

/** Every team's logo, scrolling: tap one to start a career. */
function LogoStrip({ league }: { league: LeagueFile }) {
  const teams = league.teams.filter((t) => t.logo);
  const top = [...league.players].filter((p) => p.teamId).sort((a, b) => playerOverall(b) - playerOverall(a)).slice(0, 10);
  if (!teams.length) return null;
  return (
    <>
      <div className="logo-strip" aria-label="Pick a team for a new career">
        <div className="logo-track">
          {[...teams, ...teams].map((t, i) => (
            <a key={`${t.id}-${i}`} href={href('new')} title={`${t.city} ${t.name}`} aria-hidden={i >= teams.length} tabIndex={i >= teams.length ? -1 : 0}>
              <img src={t.logo!.url} alt={`${t.city} ${t.name}`} loading="lazy" />
            </a>
          ))}
        </div>
      </div>
      <section className="menu-top">
        <h2>The league's best</h2>
        <div className="menu-top-row">
          {top.map((p, i) => {
            const t = league.teams.find((x) => x.id === p.teamId);
            return (
              <div key={p.id} className="top-card" style={{ ['--team' as string]: t?.colors.primary ?? '#333', ['--team2' as string]: t?.colors.secondary ?? '#ccc' }}>
                <span className="top-rank">{i + 1}</span>
                {t?.logo && <img className="top-logo" src={t.logo.url} alt="" />}
                {p.photo && <img className="top-photo" src={p.photo.url} alt="" loading="lazy" />}
                <span className="top-ovr">{displayRating(playerOverall(p))}</span>
                <span className="top-name">
                  <small>{p.firstName}</small>
                  {p.lastName}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function LeagueCard({ league, sync }: { league: CachedLeague | undefined; sync: SyncResult | 'syncing' }) {
  const status = sync === 'syncing' ? 'Checking for updates…' : sync.status === 'updated' ? 'Just updated' : sync.status === 'current' ? 'Up to date' : sync.status === 'error' ? `Could not update: ${sync.message}` : '';
  if (!league) {
    return (
      <div className="league-card">
        <div>
          <span className="eyebrow">NBA league</span>
          <p className="muted small">{sync !== 'syncing' && sync.status === 'signed-out' ? 'Sign in to download the current NBA rosters, contracts and photos.' : status}</p>
        </div>
        {sync !== 'syncing' && sync.status === 'signed-out' && (
          <a className="btn btn-primary" href={href('account')}>
            Sign in
          </a>
        )}
      </div>
    );
  }
  const m = league.manifest;
  return (
    <div className="league-card">
      <div>
        <span className="eyebrow">{m.name}</span>
        <p className="muted small">
          {m.players} players · {m.photos} photos · updated {new Date(m.updatedAt).toLocaleDateString()}{status ? ` · ${status}` : ''}
        </p>
      </div>
      <a className="btn btn-sm" href={href('account')}>
        Account
      </a>
    </div>
  );
}
