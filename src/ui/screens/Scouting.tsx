import { useEffect, useMemo, useState } from 'react';
import { displayRating, fullName, playerAge, playerOverall, salaryIn, type Player } from '../../engine';
import { fitReport, type FitReport } from '../../game/fit';
import { potentialRange } from '../../game/scouting';
import { useCareer } from '../career-context';
import { FOCUS_LABEL, draftYearOf, ensureDraftClass, inFocus, setFocus, type ScoutFocus } from '../../game/draft-scouting';
import { photoSrc, Card, Ovr, PlayerPhoto, Segmented } from '../components';
import { money } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';

type Pool = 'all' | 'free' | 'trade';
type Group = 'all' | 'guard' | 'wing' | 'big';
type Sort = 'fit' | 'ovr' | 'age' | 'salary';
const GROUP = { PG: 'guard', SG: 'guard', SF: 'wing', PF: 'big', C: 'big' } as const;

/** Grade badge for a fit report. */
export function FitBadge({ fit }: { fit: FitReport }) {
  return (
    <span className={`fit-badge fit-${fit.grade[0]!.toLowerCase()}`} title={fit.summary}>
      {fit.grade}
    </span>
  );
}

export function Scouting() {
  const { save } = useCareer();
  const { league } = save;
  const me = save.career.teamId;
  const season = league.meta.season;
  const [pool, setPool] = useState<Pool>('all');
  const [group, setGroup] = useState<Group>('all');
  const [sort, setSort] = useState<Sort>('fit');
  const [tab, setTab] = useState<'players' | 'draft'>('players');
  const scout = league.staff.filter((s) => s.teamId === me && s.role === 'SCOUT').sort((a, b) => b.ratings.scouting - a.ratings.scouting)[0];

  // Every player not on our team, with his fit report (worked out once per visit).
  const targets = useMemo(
    () => league.players.filter((p) => p.teamId !== me && p.contract?.kind !== 'two-way').map((p) => ({ p, fit: fitReport(save, p) })),
    [save, league, me],
  );
  const list = targets
    .filter(({ p }) => (pool === 'free' ? !p.teamId : pool === 'trade' ? !!p.teamId : true))
    .filter(({ p }) => group === 'all' || GROUP[p.position] === group)
    .sort((a, b) => {
      switch (sort) {
        case 'fit': return b.fit.score - a.fit.score || playerOverall(b.p) - playerOverall(a.p);
        case 'ovr': return playerOverall(b.p) - playerOverall(a.p);
        case 'age': return playerAge(a.p, season) - playerAge(b.p, season);
        case 'salary': return salaryIn(a.p, season) - salaryIn(b.p, season);
      }
    })
    .slice(0, 60);
  const picks = [...targets].sort((a, b) => b.fit.score - a.fit.score || playerOverall(b.p) - playerOverall(a.p)).slice(0, 3);
  const team = (p: Player) => league.teams.find((t) => t.id === p.teamId);
  const pot = (p: Player) => {
    const [lo, hi] = potentialRange(save, p).map(displayRating) as [number, number];
    return lo === hi ? `${lo}` : `${lo}-${hi}`;
  };

  return (
    <>
      <PageHeader title="Scouting" subtitle={scout ? `Chief scout ${scout.firstName} ${scout.lastName} · fit grades for every player outside your team` : 'Fit grades for every player outside your team'} />

      <div className="roster-tabs">
        <Segmented name="Scouting" value={tab} onChange={setTab} options={[{ value: 'players', label: 'NBA players' }, { value: 'draft', label: `${league.meta.season + 1} draft class` }]} />
      </div>
      {tab === 'draft' ? (
        <DraftScoutingView />
      ) : (
      <>
      <section className="scout-picks">
        <div className="section-head">
          <h2>Scout's picks</h2>
        </div>
        <div className="scout-picks-row">
          {picks.map(({ p, fit }) => {
            const t = team(p);
            return (
              <a key={p.id} className="scout-pick" href={href('c', save.id, 'player', p.id)} style={{ ['--team' as string]: t?.colors.primary ?? '#3b4150', ['--team2' as string]: t?.colors.secondary ?? '#c7cbd2' }}>
                <span className="scout-pick-art">
                  {t?.logo && <img className="lc-logo" src={t.logo.url} alt="" />}
                  {p.photo?.source === 'NBA.com' ? <img className="lc-cutout" src={photoSrc(p.photo.url, 'md')} alt="" loading="lazy" decoding="async" /> : <span className="lc-face"><PlayerPhoto photo={p.photo} number={p.jersey} colors={t?.colors ?? { primary: '#3b4150', secondary: '#c7cbd2' }} /></span>}
                  <FitBadge fit={fit} />
                </span>
                <span className="scout-pick-body">
                  <strong>{fullName(p)}</strong>
                  <span className="muted small">{p.position} · {playerAge(p, season)} · {t ? t.abbrev : 'Free agent'} · OVR {displayRating(playerOverall(p))}</span>
                  <span className="small">{fit.summary}</span>
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <div className="toolbar scout-filters">
        <Segmented<Pool> name="Players" value={pool} onChange={setPool} options={[{ value: 'all', label: 'All' }, { value: 'trade', label: 'Trade targets' }, { value: 'free', label: 'Free agents' }]} />
        <Segmented<Group> name="Position" value={group} onChange={setGroup} options={[{ value: 'all', label: 'All' }, { value: 'guard', label: 'Guards' }, { value: 'wing', label: 'Wings' }, { value: 'big', label: 'Bigs' }]} />
        <Segmented<Sort> name="Sort" value={sort} onChange={setSort} options={[{ value: 'fit', label: 'Fit' }, { value: 'ovr', label: 'OVR' }, { value: 'age', label: 'Age' }, { value: 'salary', label: 'Salary' }]} />
      </div>

      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th className="num">Age</th>
                <th className="num">OVR</th>
                <th className="num hide-sm">POT</th>
                <th className="num hide-sm">Salary</th>
                <th className="hide-sm">Role for us</th>
                <th className="num">Fit</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ p, fit }) => {
                const t = team(p);
                return (
                  <tr key={p.id} onClick={() => (window.location.hash = href('c', save.id, 'player', p.id))}>
                    <td>
                      <a className="row-link" href={href('c', save.id, 'player', p.id)} onClick={(e) => e.stopPropagation()}>
                        <span className="mini-face">
                          <PlayerPhoto photo={p.photo} number={p.jersey} colors={t?.colors ?? { primary: '#3b4150', secondary: '#c7cbd2' }} />
                        </span>
                        {fullName(p)}
                      </a>
                      <span className="muted small"> · {t ? t.abbrev : 'FA'}</span>
                    </td>
                    <td>{p.position}</td>
                    <td className="num">{playerAge(p, season)}</td>
                    <td className="num"><Ovr value={playerOverall(p)} /></td>
                    <td className="num muted hide-sm">{pot(p)}</td>
                    <td className="num hide-sm">{p.teamId && p.contract ? money(salaryIn(p, season)) : 'FA'}</td>
                    <td className="hide-sm">{fit.role}</td>
                    <td className="num"><FitBadge fit={fit} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="muted small">Showing the top {list.length}. Tap a player for the full fit report.</p>
      </Card>
      </>
      )}
    </>
  );
}

/** Assign the scouts during the season; the board is what they think of each prospect. */
function DraftScoutingView() {
  const { save, update } = useCareer();
  const ds = save.draftScouting;
  const year = draftYearOf(save);
  useEffect(() => {
    if (ds?.year !== year && !save.offseason) update((s) => {
      const next = structuredClone(s);
      ensureDraftClass(next);
      return next;
    });
  }, [ds?.year, year]); // eslint-disable-line react-hooks/exhaustive-deps
  if (save.offseason) return <Card><p className="muted">The draft is under way: the board is on the Offseason screen.</p></Card>;
  if (!ds || ds.year !== year) return <Card><p className="muted">Your scouts are putting the list together…</p></Card>;
  const focusGroup = new Set(inFocus(ds, ds.focus).map((p) => p.id));
  const est = (p: Player) => potentialRange(save, p).map(displayRating) as [number, number];
  const board = [...ds.prospects].sort((a, b) => {
    const [alo, ahi] = est(a);
    const [blo, bhi] = est(b);
    return blo + bhi + displayRating(playerOverall(b)) - (alo + ahi + displayRating(playerOverall(a)));
  });
  const scouted = Object.values(ds.knowledge).filter((k) => k >= 60).length;
  return (
    <>
      <Card title="Scouting assignment">
        <p className="muted small">Each week your scouts watch one group. The more they see a prospect, the tighter their potential estimate on draft night. Unscouted prospects are a gamble.</p>
        <Segmented<ScoutFocus>
          name="Assignment"
          value={ds.focus}
          onChange={(f) => update((s) => setFocus(s, f))}
          options={(Object.keys(FOCUS_LABEL) as ScoutFocus[]).map((k) => ({ value: k, label: FOCUS_LABEL[k] }))}
        />
        <p className="small">{scouted} of {ds.prospects.length} prospects well scouted.</p>
      </Card>
      <Card title={`Big board · ${year} draft`}>
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Prospect</th>
                <th>Pos</th>
                <th className="num hide-sm">Age</th>
                <th className="hide-sm">From</th>
                <th className="num">OVR</th>
                <th className="num">POT</th>
                <th>Scouted</th>
              </tr>
            </thead>
            <tbody>
              {board.map((p, i) => {
                const [lo, hi] = est(p);
                const k = Math.round(ds.knowledge[p.id] ?? 0);
                return (
                  <tr key={p.id} className={focusGroup.has(p.id) ? 'focus-row' : ''}>
                    <td className="num muted">{i + 1}</td>
                    <td>
                      <strong>{p.firstName} {p.lastName}</strong>
                    </td>
                    <td>{p.position}</td>
                    <td className="num hide-sm">{playerAge(p, year)}</td>
                    <td className="hide-sm muted">{p.college ?? p.born.country}</td>
                    <td className="num"><Ovr value={playerOverall(p)} /></td>
                    <td className="num">{lo === hi ? lo : `${lo}-${hi}`}</td>
                    <td>
                      <span className="know-bar" title={`${k}% scouted`}>
                        <i style={{ width: `${k}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/** Fit report card for a player page. */
export function FitReportCard({ player }: { player: Player }) {
  const { save } = useCareer();
  const fit = fitReport(save, player);
  return (
    <Card title="Fit report" action={<FitBadge fit={fit} />} className="fit-card">
      <p className="fit-summary">{fit.summary}</p>
      <ul className="fit-points">
        {fit.points.map((x) => (
          <li key={x.label + x.text} className={x.effect > 0.2 ? 'up' : x.effect < -0.2 ? 'down' : ''}>
            <span className="label">{x.label}</span> {x.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
