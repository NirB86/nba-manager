import { useState } from 'react';
import { displayRating, fullName, playerAge, playerOverall, salaryIn, type Player } from '../../engine';
import { morale, MORALE_LABEL } from '../../game/morale';
import { potentialRange } from '../../game/scouting';
import type { SaveGame } from '../../storage/saves';
import { useCareer } from '../career-context';
import { InjuryPill, MoodPill, Ovr, Pill, PlayerPhoto, Segmented } from '../components';
import { f1, pct, perGame } from './Season';
import { height, money, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';

type SortKey = 'ovr' | 'pos' | 'age' | 'salary' | 'pot' | 'name' | 'pts' | 'reb' | 'ast' | 'min';
const potLabel = ([lo, hi]: [number, number]) => {
  const [a, b] = [displayRating(lo), displayRating(hi)];
  return a === b ? `${a}` : `${a}-${b}`;
};
const POS_ORDER = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 } as const;

export function RosterTable({ save, players, showMood = false }: { save: SaveGame; players: Player[]; showMood?: boolean }) {
  const [sort, setSort] = useState<SortKey>('ovr');
  const [view, setView] = useState<'ratings' | 'stats'>('ratings');
  const league = save.league;
  const stats = (p: Player) => perGame(save.season.stats.regular[p.id]);
  const saveId = save.id;
  const pot = (p: Player) => potentialRange(save, p);
  const teamColors = (id: string | null) => league.teams.find((t) => t.id === id)?.colors ?? { primary: '#3a4256', secondary: '#c3cad8' };
  const season = league.meta.season;
  const value = (p: Player): number | string => {
    switch (sort) {
      case 'ovr': return -playerOverall(p);
      case 'pot': return -pot(p)[1];
      case 'pos': return POS_ORDER[p.position];
      case 'age': return playerAge(p, season);
      case 'salary': return -salaryIn(p, season);
      case 'name': return p.lastName;
      case 'pts': return -stats(p).pts;
      case 'reb': return -stats(p).reb;
      case 'ast': return -stats(p).ast;
      case 'min': return -stats(p).min;
    }
  };
  const sorted = [...players].sort((a, b) => {
    const va = value(a), vb = value(b);
    return va < vb ? -1 : va > vb ? 1 : playerOverall(b) - playerOverall(a);
  });

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={cls}>
      <button type="button" className={sort === key ? 'sort on' : 'sort'} onClick={() => setSort(key)}>
        {label}
      </button>
    </th>
  );

  const hasStats = players.some((p) => (save.season.stats.regular[p.id]?.g ?? 0) > 0);
  const showStats = view === 'stats' && hasStats;
  return (
    <>
    {hasStats && (
      <div className="toolbar">
        <Segmented name="Columns" value={view} onChange={(v) => { setView(v); setSort(v === 'stats' ? 'pts' : 'ovr'); }} options={[{ value: 'ratings', label: 'Ratings' }, { value: 'stats', label: 'Season stats' }]} />
      </div>
    )}
    <div className="table-wrap">
      <table className="table roster">
        <thead>
          {showStats ? (
          <tr>
            <th className="num hide-sm">#</th>
            {th('name', 'Player')}
            <th className="num">GP</th>
            {th('min', 'MIN', 'num hide-sm')}
            {th('pts', 'PTS', 'num')}
            {th('reb', 'REB', 'num')}
            {th('ast', 'AST', 'num')}
            <th className="num hide-sm">FG%</th>
            <th className="num hide-sm">3P%</th>
            {th('ovr', 'OVR', 'num hide-sm')}
          </tr>
          ) : (
          <tr>
            <th className="num hide-sm">#</th>
            {th('name', 'Player')}
            {th('pos', 'Pos')}
            {th('age', 'Age', 'num')}
            <th className="num hide-sm">Ht</th>
            {th('ovr', 'OVR', 'num')}
            {th('pot', 'POT', 'num hide-sm')}
            {th('salary', 'Salary', 'num')}
            <th className="num hide-sm">Thru</th>
            {showMood && <th>Mood</th>}
          </tr>
          )}
        </thead>
        <tbody>
          {sorted.map((p) => {
            const last = p.contract?.years.at(-1)?.season;
            if (showStats) {
              const st = stats(p);
              return (
                <tr key={p.id} onClick={() => (window.location.hash = href('c', saveId, 'player', p.id))}>
                  <td className="num muted hide-sm">{p.jersey}</td>
                  <td>
                    <a href={href('c', saveId, 'player', p.id)} className="row-link" onClick={(e) => e.stopPropagation()}>
                      {fullName(p)}
                    </a>
                  </td>
                  <td className="num">{st.g}</td>
                  <td className="num hide-sm">{f1(st.min)}</td>
                  <td className="num"><strong>{f1(st.pts)}</strong></td>
                  <td className="num">{f1(st.reb)}</td>
                  <td className="num">{f1(st.ast)}</td>
                  <td className="num hide-sm">{pct(st.fgPct)}</td>
                  <td className="num hide-sm">{pct(st.tpPct)}</td>
                  <td className="num hide-sm"><Ovr value={playerOverall(p)} /></td>
                </tr>
              );
            }
            return (
              <tr key={p.id} onClick={() => (window.location.hash = href('c', saveId, 'player', p.id))}>
                <td className="num muted hide-sm">{p.jersey}</td>
                <td>
                  <a href={href('c', saveId, 'player', p.id)} className="row-link" onClick={(e) => e.stopPropagation()}>
                    <span className="mini-face">
                      <PlayerPhoto photo={p.photo} number={p.jersey} colors={teamColors(p.teamId)} />
                    </span>
                    {fullName(p)}
                  </a>
                  <InjuryPill injury={save.season.injuries?.[p.id]} />
                  {p.contract?.kind === 'rookie' && <Pill>Rookie deal</Pill>}
                  {p.contract?.kind === 'two-way' && <Pill>Two-way</Pill>}
                </td>
                <td>{p.position}</td>
                <td className="num">{playerAge(p, season)}</td>
                <td className="num hide-sm">{height(p.heightCm)}</td>
                <td className="num"><Ovr value={playerOverall(p)} /></td>
                <td className="num muted hide-sm">{potLabel(pot(p))}</td>
                <td className="num">{p.contract ? money(salaryIn(p, season)) : '—'}</td>
                <td className="num muted hide-sm">{last ? seasonLabel(last) : '—'}</td>
                {showMood && (
                  <td>
                    {(() => {
                      const m = morale(save, p);
                      return <MoodPill level={m.level} label={MORALE_LABEL[m.level]} />;
                    })()}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}

export function Roster() {
  const { save } = useCareer();
  const players = save.league.players.filter((p) => p.teamId === save.career.teamId);
  const twoWay = players.filter((p) => p.contract?.kind === 'two-way').length;
  return (
    <>
      <PageHeader
        title="Roster"
        subtitle={`${players.length - twoWay} of ${save.league.settings.rosterMax} roster spots${twoWay ? ` + ${twoWay} two-way` : ''} · tap a column to sort, a player for details`}
      />
      <RosterTable save={save} players={players} showMood />
    </>
  );
}
