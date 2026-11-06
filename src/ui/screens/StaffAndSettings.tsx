import { useRef, useState } from 'react';
import { fullName, validateLeague, type LeagueFile, type StaffRole } from '../../engine';
import { exportSave, type Difficulty, type Role, type ScoutingDepth, type SimMode } from '../../storage/saves';
import { useCareer } from '../career-context';
import { Card, Segmented } from '../components';
import { attrTone, money, seasonLabel } from '../format';
import { href } from '../router';
import { Icon, PageHeader } from '../Shell';

const ROLE_LABEL: Record<StaffRole, string> = {
  HC: 'Head coach',
  AC: 'Assistant coach',
  SCOUT: 'Scout',
  MED: 'Medical',
  DEV: 'Player development',
};
const ROLE_ORDER: StaffRole[] = ['HC', 'AC', 'DEV', 'SCOUT', 'MED'];

export function Staff() {
  const { save } = useCareer();
  const { league } = save;
  const staff = league.staff
    .filter((s) => s.teamId === save.career.teamId)
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
  const cols = ['tactics', 'development', 'motivation', 'judgment', 'scouting', 'medical'] as const;

  return (
    <>
      <PageHeader title="Staff" subtitle="Hiring and firing arrives in a coming update" />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              {cols.map((c) => (
                <th key={c} className="num hide-sm">
                  {c.slice(0, 3).toUpperCase()}
                </th>
              ))}
              <th className="num">Salary</th>
              <th className="num hide-sm">Thru</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td>{fullName(s)}</td>
                <td>{ROLE_LABEL[s.role]}</td>
                {cols.map((c) => (
                  <td key={c} className={`num hide-sm ${attrTone(s.ratings[c])}-text`}>
                    {s.ratings[c]}
                  </td>
                ))}
                <td className="num">{s.contract ? money(s.contract.salary) : '—'}</td>
                <td className="num muted hide-sm">{s.contract ? seasonLabel(s.contract.endSeason) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Ratings are 1-20: TAC tactics, DEV development, MOT motivation, JUD judgment, SCO scouting, MED medical.</p>
    </>
  );
}

export function Settings() {
  const { save, update } = useCareer();
  const c = save.career;
  const set = (patch: Partial<typeof c>) => update((s) => ({ ...s, career: { ...s.career, ...patch } }));

  return (
    <>
      <PageHeader title="Settings" subtitle={save.name} />
      <Card title="Career">
        <label className="field">
          <span>Career name</span>
          <input className="input" value={save.name} maxLength={60} onChange={(e) => update((s) => ({ ...s, name: e.target.value }))} />
        </label>
        <label className="field">
          <span>Your role</span>
          <Segmented<Role> name="Your role" value={c.role} onChange={(role) => set({ role })} options={[{ value: 'gm', label: 'General Manager' }, { value: 'gm-coach', label: 'GM + Head Coach' }]} />
        </label>
        <label className="field">
          <span>Games</span>
          <Segmented<SimMode> name="Games" value={c.simMode} onChange={(simMode) => set({ simMode })} options={[{ value: 'watch', label: 'Watch' }, { value: 'quick', label: 'Quick sim' }, { value: 'ask', label: 'Ask each game' }]} />
        </label>
        <label className="field">
          <span>Scouting depth</span>
          <Segmented<ScoutingDepth> name="Scouting depth" value={c.scouting} onChange={(scouting) => set({ scouting })} options={[{ value: 'light', label: 'Light' }, { value: 'full', label: 'Full' }]} />
        </label>
        <label className="field">
          <span>Owner patience</span>
          <Segmented<Difficulty> name="Owner patience" value={c.difficulty} onChange={(difficulty) => set({ difficulty })} options={[{ value: 'easy', label: 'Patient' }, { value: 'normal', label: 'Normal' }, { value: 'hard', label: 'Win now' }]} />
        </label>
      </Card>
      <ImagesCard />
      <Card title="Save">
        <p className="muted">Saved automatically on this device. Export a copy to back it up or to continue on another device.</p>
        <div className="row-actions">
          <button className="btn" type="button" onClick={() => exportSave(save)}>
            Export save file
          </button>
          <a className="btn" href={href()}>
            Main menu
          </a>
        </div>
      </Card>
    </>
  );
}

/** Phone-only menu for sections that don't fit in the tab bar. */
export function More() {
  const { save } = useCareer();
  const items = [
    { key: 'schedule', label: 'Schedule', icon: 'calendar' as const },
    { key: 'staff', label: 'Staff', icon: 'staff' as const },
    { key: 'settings', label: 'Settings', icon: 'settings' as const },
  ];
  return (
    <>
      <PageHeader title="More" />
      <ul className="more-list">
        {items.map((i) => (
          <li key={i.key}>
            <a href={href('c', save.id, i.key)}>
              <Icon name={i.icon} /> {i.label}
            </a>
          </li>
        ))}
        <li>
          <a href={href()}>
            <Icon name="back" /> Main menu
          </a>
        </li>
      </ul>
    </>
  );
}

/** Adds photos and logos from a newer league file to this career, matching by id. */
function ImagesCard() {
  const { save, update } = useCareer();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const withPhoto = save.league.players.filter((p) => p.photo).length;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as LeagueFile;
      const check = validateLeague(data);
      if (!check.ok) throw new Error(check.errors[0]);
      const photos = new Map(data.players.filter((p) => p.photo).map((p) => [p.id, p.photo]));
      const teams = new Map(data.teams.map((t) => [t.id, t]));
      let n = 0;
      update((s) => ({
        ...s,
        league: {
          ...s.league,
          players: s.league.players.map((p) => {
            const photo = photos.get(p.id);
            if (!photo) return p;
            n++;
            return { ...p, photo };
          }),
          teams: s.league.teams.map((t) => {
            const src = teams.get(t.id);
            return src ? { ...t, logo: src.logo ?? t.logo, wordmark: src.wordmark ?? t.wordmark } : t;
          }),
        },
      }));
      setMsg(`Added ${n} player photos${[...teams.values()].some((t) => t.logo) ? ' and team logos' : ''}.`);
    } catch (e) {
      setMsg(`That file could not be used: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  return (
    <Card title="Photos and logos">
      <p className="muted">
        {withPhoto ? `${withPhoto} players in this career have photos.` : 'This career has no player photos yet.'} Load a newer league file to add its photos and logos to this career. Your roster, results and stats stay as they are.
      </p>
      <div className="row-actions">
        <button className="btn" type="button" onClick={() => input.current?.click()}>
          Add photos from league file
        </button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {msg && <p className="small" style={{ marginTop: 10 }}>{msg}</p>}
    </Card>
  );
}
