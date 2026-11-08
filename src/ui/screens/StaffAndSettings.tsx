import { useRef, useState } from 'react';
import { fullName, teamName, validateLeague, type LeagueFile, type Staff as StaffMember, type StaffRole } from '../../engine';
import { exportSave, type Difficulty, type Role, type ScoutingDepth, type SimMode } from '../../storage/saves';
import { useCareer } from '../career-context';
import { Card, ImageCreditLine, Pill, Segmented, Stars, TeamBadge } from '../components';
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
      <PageHeader title="Staff" subtitle="Tap a name for the full profile · hiring and firing arrives in a coming update" />
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
              <tr key={s.id} className="clickable" onClick={() => (window.location.hash = href('c', save.id, 'staff', s.id))}>
                <td>
                  <a className="row-link" href={href('c', save.id, 'staff', s.id)} onClick={(e) => e.stopPropagation()}>
                    {fullName(s)}
                  </a>
                </td>
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

type RatingKey = keyof StaffMember['ratings'];

const RATING_INFO: Record<RatingKey, { label: string; text: string }> = {
  tactics: { label: 'Tactics', text: 'Game plans, play calls and in-game adjustments.' },
  development: { label: 'Development', text: 'How quickly players improve their skills, especially young players.' },
  motivation: { label: 'Motivation', text: 'Keeps morale and effort up through a long season.' },
  judgment: { label: 'Judgment', text: "Reading a player's true current and future ability." },
  scouting: { label: 'Scouting', text: 'Finding prospects and reading opponents.' },
  medical: { label: 'Medical', text: 'Preventing injuries and speeding up recovery.' },
};

/** The ratings that matter most for each job, most important first. */
const KEY_RATINGS: Record<StaffRole, RatingKey[]> = {
  HC: ['tactics', 'motivation', 'development'],
  AC: ['tactics', 'development', 'motivation'],
  DEV: ['development', 'motivation', 'judgment'],
  SCOUT: ['judgment', 'scouting'],
  MED: ['medical'],
};

const STYLE: Record<RatingKey, string> = {
  tactics: 'Tactician',
  development: 'Player developer',
  motivation: 'Motivator',
  judgment: 'Talent evaluator',
  scouting: 'Prospect hunter',
  medical: 'Injury specialist',
};

const ROLE_DUTY: Record<StaffRole, string> = {
  HC: 'Runs the team: rotation, game plans and the locker room.',
  AC: 'Supports the head coach with game plans and player work.',
  DEV: 'Works with players on their skills between games.',
  SCOUT: 'Evaluates players and prospects for the front office.',
  MED: 'Keeps players healthy and manages recovery from injuries.',
};

/** Overall staff quality on a 0.5-5 star scale, from the role's key ratings. */
function staffStars(s: StaffMember): number {
  const keys = KEY_RATINGS[s.role];
  const weights = keys.map((_, i) => keys.length - i);
  const avg = keys.reduce((sum, k, i) => sum + s.ratings[k] * (weights[i] as number), 0) / weights.reduce((a, b) => a + b, 0);
  return Math.max(0.5, Math.min(5, Math.round((avg / 20) * 10) / 2));
}

export function StaffPage({ staffId }: { staffId: string }) {
  const { save } = useCareer();
  const { league } = save;
  const s = league.staff.find((x) => x.id === staffId);
  const back = href('c', save.id, 'staff');
  if (!s) return <PageHeader title="Staff member not found" back={back} />;
  const team = league.teams.find((t) => t.id === s.teamId);
  const keys = KEY_RATINGS[s.role];
  const best = [...keys].sort((a, b) => s.ratings[b] - s.ratings[a])[0] as RatingKey;
  const weakest = [...keys].sort((a, b) => s.ratings[a] - s.ratings[b])[0] as RatingKey;
  const age = league.meta.season - s.born.year;
  const all = Object.keys(RATING_INFO) as RatingKey[];
  const ordered = [...keys, ...all.filter((k) => !keys.includes(k))];
  const mine = s.teamId === save.career.teamId;

  return (
    <>
      <PageHeader title="" back={back} />
      <section className="pp-head" style={{ ['--pteam' as string]: team?.colors.primary ?? '#3a4256' }}>
        <div className="pp-avatar staff-avatar" aria-hidden="true">
          {s.photo ? (
            <img className="photo" src={s.photo.url} alt="" loading="lazy" />
          ) : (
            <span>
              {s.firstName.charAt(0)}
              {s.lastName.charAt(0)}
            </span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="pp-name">{fullName(s)}</div>
          <div className="pp-meta">
            {ROLE_LABEL[s.role]} · {age} · {s.born.country}
          </div>
          <div className="pp-mood">
            {team ? (
              <span className="team-cell">
                <TeamBadge team={team} size={18} /> {teamName(team)}
              </span>
            ) : (
              <Pill tone="warn">Available</Pill>
            )}
          </div>
        </div>
        <div className="pp-ovr">
          <Stars value={staffStars(s)} />
          <span className="label">{STYLE[best]}</span>
        </div>
      </section>

      <div className="grid-2">
        <Card title="Ratings">
          <ul className="staff-ratings">
            {ordered.map((k) => {
              const v = s.ratings[k];
              const key = keys.includes(k);
              return (
                <li key={k} className={key ? 'key' : ''}>
                  <div className="staff-rating-head">
                    <span>
                      {RATING_INFO[k].label}
                      {key && <span className="key-tag">Key for this job</span>}
                    </span>
                    <span className={`chip ${attrTone(v)}`}>{v}</span>
                  </div>
                  <div className="attr-track">
                    <span className={`attr-fill ${attrTone(v)}`} style={{ width: `${(v / 20) * 100}%` }} />
                  </div>
                  <p className="small muted">{RATING_INFO[k].text}</p>
                </li>
              );
            })}
          </ul>
        </Card>

        <div>
          <Card title="Profile">
            <dl className="facts">
              <dt>Job</dt>
              <dd>{ROLE_DUTY[s.role]}</dd>
              <dt>Style</dt>
              <dd>
                {STYLE[best]}: strongest at {RATING_INFO[best].label.toLowerCase()} ({s.ratings[best]}).
                {weakest !== best && ` Weakest key area: ${RATING_INFO[weakest].label.toLowerCase()} (${s.ratings[weakest]}).`}
              </dd>
              <dt>Age</dt>
              <dd>{age}</dd>
              <dt>Nationality</dt>
              <dd>{s.born.country}</dd>
            </dl>
          </Card>
          <Card title="Contract">
            {s.contract ? (
              <dl className="facts">
                <dt>Salary</dt>
                <dd>{money(s.contract.salary)} a season</dd>
                <dt>Through</dt>
                <dd>
                  {seasonLabel(s.contract.endSeason)}
                  {s.contract.endSeason <= save.season.year && <Pill tone="warn">Expires this season</Pill>}
                </dd>
              </dl>
            ) : (
              <p className="muted">No contract. Available to hire.</p>
            )}
          </Card>
          {mine && (
            <Card title="Impact on your team">
              <p className="small">
                {s.role === 'SCOUT'
                  ? 'Your best scout sets how precise the potential estimates on player pages are. Higher judgment and scouting give narrower ranges.'
                  : 'Coaching, development and medical effects come with the player development and injury systems in a coming update.'}
              </p>
            </Card>
          )}
        </div>
      </div>
      <ImageCreditLine label="Photo" image={s.photo} />
    </>
  );
}
