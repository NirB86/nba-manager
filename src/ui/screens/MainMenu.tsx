import { useEffect, useRef, useState } from 'react';
import { deleteSave, exportSave, importSaveFile, listSaves, loadSave, type SaveSummary } from '../../storage/saves';
import { TeamBadge } from '../components';
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
  useEffect(() => {
    void refresh();
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
        <img src="icons/favicon.svg" alt="" width={56} height={56} />
        <h1>NBA Manager</h1>
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
            <li key={s.id} className="save-item">
              <a className="save-main" href={href('c', s.id, 'home')}>
                <TeamBadge team={s} size={44} />
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
      <footer className="menu-footer muted small">© 2026 NirB86 · v{__APP_VERSION__} · All teams and players are fictional</footer>
    </div>
  );
}
