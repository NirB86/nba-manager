import { useEffect, useRef, useState } from 'react';
import { deleteSave, exportSave, importSaveFile, listSaves, loadSave, type SaveSummary } from '../../storage/saves';
import { playerOverall, type LeagueFile } from '../../engine';
import { photoSrc, TeamBadge } from '../components';
import { MusicButton } from '../MusicControls';
import { ChampionshipTrophy } from '../Trophy';
import { cloudConfigured } from '../../cloud/cloud';
import { cachedLeague, syncLeague, type SyncResult } from '../../cloud/sync';
import { SETUP_SQL, cloudStatus, deleteCloudSave, onCloudStatus, syncSaves, type CloudStatus } from '../../cloud/saves-cloud';
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
    // Careers from your other devices come down, newer ones from here go up.
    void syncSaves().then(() => refresh());
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
    void deleteCloudSave(s.id);
    void refresh();
  };

  const showInstallHint = isIos() && !isStandalone();

  return (
    <div className={`menu ${league ? 'menu-live' : ''}`}>
      <div className="menu-hero">
        {league && <HeroWall league={league.league} />}
        {league?.league.meta.logo ? (
          <img className="menu-league-logo" src={league.league.meta.logo.url} alt="NBA" />
        ) : (
          <img src="icons/favicon.svg" alt="" width={72} height={72} />
        )}
        <MusicButton className="menu-music" />
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

      <div className="menu-body">
      <aside className="menu-side">
      {cloudConfigured() && <LeagueCard league={league} sync={sync} />}

      {showInstallHint && (
        <div className="install-hint">
          <strong>Play it like an app:</strong> tap the Share button in Safari, then <em>Add to Home Screen</em>.
        </div>
      )}

      </aside>
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
        <CloudLine onSynced={refresh} />
      </section>
      </div>
      <footer className="menu-footer muted small">© 2026 NirB86 · v{__APP_VERSION__} · Your careers are saved on this device</footer>
    </div>
  );
}

/** A dimmed wall of the league's players behind the hero, and the trophy in front. */
function HeroWall({ league }: { league: LeagueFile }) {
  // Only as many faces as fill the banner (tiles are about 92 x 104 px), in the small 260 px size.
  const [count] = useState(() => {
    if (typeof window === 'undefined') return 40;
    const cols = Math.ceil(window.innerWidth / (window.innerWidth <= 600 ? 70 : 92)) + 1;
    const rows = Math.ceil(Math.min(window.innerHeight * 0.8, 720) / (window.innerWidth <= 600 ? 80 : 104)) + 1;
    return Math.min(120, cols * rows);
  });
  const faces = league.players
    .filter((p) => p.teamId && p.photo?.source === 'NBA.com')
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .slice(0, count);
  if (!faces.length) return null;
  return (
    <>
      <div className="hero-wall" aria-hidden="true">
        {faces.map((p, i) => (
          <img
            key={p.id}
            src={photoSrc(p.photo!.url, 'sm')}
            alt=""
            decoding="async"
            fetchPriority={i < 24 ? 'high' : 'low'}
            // Fade each face in as it arrives instead of popping in.
            ref={(el) => {
              if (el?.complete) el.classList.add('in');
            }}
            onLoad={(e) => e.currentTarget.classList.add('in')}
          />
        ))}
      </div>
      <ChampionshipTrophy className="hero-trophy" />
    </>
  );
}

/** Every team's logo, scrolling: tap one to start a career. */
function LogoStrip({ league }: { league: LeagueFile }) {
  const teams = league.teams.filter((t) => t.logo);
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
    </>
  );
}

/** Cloud saves status under your careers, with the one-time setup when needed. */
function CloudLine({ onSynced }: { onSynced: () => void }) {
  const [status, setStatus] = useState<CloudStatus>(cloudStatus());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => onCloudStatus(setStatus), []);
  const sync = async () => {
    setBusy(true);
    await syncSaves();
    onSynced();
    setBusy(false);
  };
  if (status.state === 'needs-setup') {
    return (
      <div className="cloud-setup">
        <strong>Cloud saves need a one-time setup (about a minute)</strong>
        <ol>
          <li>Open your Supabase project, then <em>SQL Editor</em> › <em>New query</em>.</li>
          <li>Paste the text below and press <em>Run</em>. It lets each signed-in player reach only their own saves.</li>
          <li>Come back and tap <em>Sync now</em>.</li>
        </ol>
        <pre className="cloud-sql">{SETUP_SQL}</pre>
        <div className="music-row">
          <button className="btn btn-sm" type="button" onClick={() => void navigator.clipboard?.writeText(SETUP_SQL).then(() => setCopied(true))}>
            {copied ? 'Copied' : 'Copy the text'}
          </button>
          <button className="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => void sync()}>
            Sync now
          </button>
        </div>
      </div>
    );
  }
  return (
    <p className="muted small cloud-line">
      {status.state === 'off' && <>{status.reason} Until then saves live on this device; export one to back it up.</>}
      {status.state === 'synced' && <>☁ Cloud saves on: your careers are the same on every device you sign in on. Last synced {new Date(status.at).toLocaleTimeString()}.</>}
      {status.state === 'error' && <>Cloud sync failed ({status.message}). Your careers are safe on this device.</>}{' '}
      {status.state !== 'off' && (
        <button className="btn btn-ghost btn-sm" type="button" disabled={busy} onClick={() => void sync()}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </p>
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
