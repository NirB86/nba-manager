import { useEffect, useRef, useState } from 'react';
import { deleteSave, exportSave, importSaveFile, listSaves, loadSave, type SaveSummary } from '../../storage/saves';
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
    <div className="menu">
      <div className="menu-hero">
        <img src="icons/favicon.svg" alt="" width={72} height={72} />
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
          {saves?.map((s) => (
            <li key={s.id} className="save-item" style={{ ['--save-team' as string]: s.colors.primary }}>
              <a className="save-main" href={href('c', s.id, 'home')}>
                <TeamBadge team={s} size={48} />
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
          ))}
        </ul>
        <p className="muted small">Saves live on this device. Export a save to back it up or move it to another device. Cloud sync is coming.</p>
      </section>
      <footer className="menu-footer muted small">© 2026 NirB86 · v{__APP_VERSION__} · Your careers are saved on this device</footer>
    </div>
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
          {m.players} players · {m.photos} photos · updated {new Date(m.updatedAt).toLocaleDateString()} · {status}
        </p>
      </div>
      <a className="btn btn-sm" href={href('account')}>
        Account
      </a>
    </div>
  );
}
