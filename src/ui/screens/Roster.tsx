import { useState } from 'react';
import { fullName, playerAge, playerOverall, salaryIn, type Player } from '../../engine';
import { potentialRange } from '../../game/scouting';
import type { SaveGame } from '../../storage/saves';
import { useCareer } from '../career-context';
import { Ovr, Pill } from '../components';
import { height, money, seasonLabel } from '../format';
import { href } from '../router';

type SortKey = 'ovr' | 'pos' | 'age' | 'salary' | 'pot' | 'name';
const potLabel = ([lo, hi]: [number, number]) => (lo === hi ? `${lo}` : `${lo}-${hi}`);
const POS_ORDER = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 } as const;

export function RosterTable({ save, players }: { save: SaveGame; players: Player[] }) {
  const [sort, setSort] = useState<SortKey>('ovr');
  const league = save.league;
  const saveId = save.id;
  const pot = (p: Player) => potentialRange(save, p);
  const season = league.meta.season;
  const value = (p: Player): number | string => {
    switch (sort) {
      case 'ovr': return -playerOverall(p);
      case 'pot': return -pot(p)[1];
      case 'pos': return POS_ORDER[p.position];
      case 'age': return playerAge(p, season);
      case 'salary': return -salaryIn(p, season);
      case 'name': return p.lastName;
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

  return (
    <div className="table-wrap">
      <table className="table roster">
        <thead>
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
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const last = p.contract?.years.at(-1)?.season;
            return (
              <tr key={p.id} onClick={() => (window.location.hash = href('c', saveId, 'player', p.id))}>
                <td className="num muted hide-sm">{p.jersey}</td>
                <td>
                  <a href={href('c', saveId, 'player', p.id)} className="row-link" onClick={(e) => e.stopPropagation()}>
                    {fullName(p)}
                  </a>
                  {p.contract?.kind === 'rookie' && <Pill>Rookie deal</Pill>}
                </td>
                <td>{p.position}</td>
                <td className="num">{playerAge(p, season)}</td>
                <td className="num hide-sm">{height(p.heightCm)}</td>
                <td className="num"><Ovr value={playerOverall(p)} /></td>
                <td className="num muted hide-sm">{potLabel(pot(p))}</td>
                <td className="num">{p.contract ? money(salaryIn(p, season)) : '—'}</td>
                <td className="num muted hide-sm">{last ? seasonLabel(last) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Roster() {
  const { save } = useCareer();
  const players = save.league.players.filter((p) => p.teamId === save.career.teamId);
  return (
    <>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Roster</h1>
            <p className="muted">
              {players.length} of {save.league.settings.rosterMax} roster spots · tap a column to sort, a player for details
            </p>
          </div>
        </div>
      </div>
      <RosterTable save={save} players={players} />
    </>
  );
}
