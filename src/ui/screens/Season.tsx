import { useState } from 'react';
import {
  conferenceStandings,
  fullName,
  standings,
  teamName,
  type BoxLine,
  type GameResult,
  type ScheduledGame,
  type Series,
  type StatTotals,
} from '../../engine';
import { advance, lastUserGame, nextUserGame, type AdvanceTarget, type Progress } from '../../game/advance';
import type { SaveGame } from '../../storage/saves';
import { useCareer } from '../career-context';
import { Card, Segmented, TeamBadge } from '../components';
import { href } from '../router';
import { PageHeader } from '../Shell';

const ROUND_NAME = ['Play-in', 'First round', 'Conference semifinals', 'Conference finals', 'NBA Finals'];

// ------------------------------------------------------------ helpers

export function teamById(save: SaveGame, id: string) {
  return save.league.teams.find((t) => t.id === id);
}

export function allGames(save: SaveGame): ScheduledGame[] {
  return [...save.season.games, ...save.season.series.flatMap((s) => s.games)];
}

export function perGame(t: StatTotals | undefined) {
  const g = t?.g || 0;
  const d = (v: number) => (g ? v / g : 0);
  return {
    g,
    min: d((t?.sec ?? 0) / 60),
    pts: d(t?.pts ?? 0),
    reb: d((t?.orb ?? 0) + (t?.drb ?? 0)),
    ast: d(t?.ast ?? 0),
    stl: d(t?.stl ?? 0),
    blk: d(t?.blk ?? 0),
    tov: d(t?.tov ?? 0),
    fgPct: t && t.fga ? t.fgm / t.fga : 0,
    tpPct: t && t.tpa ? t.tpm / t.tpa : 0,
    ftPct: t && t.fta ? t.ftm / t.fta : 0,
  };
}

export const f1 = (v: number) => v.toFixed(1);
export const pct = (v: number) => (v ? v.toFixed(3).replace(/^0/, '') : '—');

export function recordOf(save: SaveGame, teamId: string): string {
  const row = standings(save.league, save.season.games).find((r) => r.teamId === teamId);
  return row ? `${row.w}-${row.l}` : '0-0';
}

// ------------------------------------------------------------ continue

export function ContinueControls() {
  const { save, update } = useCareer();
  const [busy, setBusy] = useState<Progress | null>(null);
  const phase = save.season.phase;

  const run = async (target: AdvanceTarget) => {
    setBusy({ done: 0, total: 1, label: 'Starting…' });
    try {
      const next = await advance(save, target, setBusy);
      update(() => next);
    } finally {
      setBusy(null);
    }
  };

  if (phase === 'done') {
    return <p className="muted small">The season is over. The offseason (draft, free agency, development) arrives in the next update.</p>;
  }

  return (
    <div className="continue">
      <button className="btn btn-primary btn-lg" type="button" disabled={!!busy} onClick={() => void run('next-game')}>
        {nextUserGame(save) ? 'Play next game ▸' : 'Continue ▸'}
      </button>
      <div className="continue-more">
        <button className="btn" type="button" disabled={!!busy} onClick={() => void run('week')}>
          Sim 1 week
        </button>
        {phase === 'regular' && (
          <button className="btn" type="button" disabled={!!busy} onClick={() => void run('regular-end')}>
            Sim to playoffs
          </button>
        )}
        <button className="btn" type="button" disabled={!!busy} onClick={() => void run('season-end')}>
          Sim to end of season
        </button>
      </div>
      {busy && (
        <div className="sim-progress" role="status">
          <div className="sim-bar">
            <span style={{ width: `${Math.min(100, (busy.done / busy.total) * 100)}%` }} />
          </div>
          <span className="muted small">Simulating · {busy.label}</span>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ game cards

export function GameCard({ game, title }: { game: ScheduledGame; title: string }) {
  const { save } = useCareer();
  const home = teamById(save, game.home);
  const away = teamById(save, game.away);
  if (!home || !away) return null;
  const played = game.hs !== undefined;
  const hasBox = !!save.season.boxScores[game.id];
  const body = (
    <div className="game-card">
      <div className="game-team">
        <TeamBadge team={away} size={36} />
        <span>{away.abbrev}</span>
        {played && <strong className={(game.as ?? 0) > (game.hs ?? 0) ? 'win' : ''}>{game.as}</strong>}
      </div>
      <span className="muted small">{played ? `Final${game.ot ? ` / ${game.ot > 1 ? game.ot : ''}OT` : ''}` : '@'}</span>
      <div className="game-team">
        {played && <strong className={(game.hs ?? 0) > (game.as ?? 0) ? 'win' : ''}>{game.hs}</strong>}
        <span>{home.abbrev}</span>
        <TeamBadge team={home} size={36} />
      </div>
    </div>
  );
  return (
    <Card title={title}>
      {played && hasBox ? (
        <a className="plain-link" href={href('c', save.id, 'game', game.id)}>
          {body}
          <span className="small">Box score ›</span>
        </a>
      ) : (
        body
      )}
    </Card>
  );
}

export function SeasonCards() {
  const { save } = useCareer();
  const next = nextUserGame(save);
  const last = lastUserGame(save);
  return (
    <div className="grid-2">
      {next ? <GameCard game={next} title="Next game" /> : null}
      {last ? <GameCard game={last} title="Last game" /> : null}
    </div>
  );
}

// ------------------------------------------------------------ schedule

export function Schedule() {
  const { save } = useCareer();
  const me = save.career.teamId;
  const mine = allGames(save)
    .filter((g) => g.home === me || g.away === me)
    .sort((a, b) => a.day - b.day);
  let w = 0;
  let l = 0;
  return (
    <>
      <PageHeader title="Schedule" subtitle={`Record ${recordOf(save, me)}`} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Opponent</th>
              <th>Result</th>
              <th className="num hide-sm">Record</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((g, i) => {
              const homeGame = g.home === me;
              const opp = teamById(save, homeGame ? g.away : g.home);
              const played = g.hs !== undefined;
              const myScore = homeGame ? g.hs : g.as;
              const theirs = homeGame ? g.as : g.hs;
              const won = played && (myScore ?? 0) > (theirs ?? 0);
              const isPlayoff = !save.season.games.includes(g);
              if (played && !isPlayoff) {
                if (won) w++;
                else l++;
              }
              return (
                <tr key={g.id}>
                  <td className="num muted">{isPlayoff ? 'PO' : i + 1}</td>
                  <td>
                    <span className="muted">{homeGame ? 'vs' : '@'}</span> {opp ? teamName(opp) : '?'}
                  </td>
                  <td>
                    {played ? (
                      save.season.boxScores[g.id] ? (
                        <a href={href('c', save.id, 'game', g.id)}>
                          <strong className={won ? 'result-w' : 'result-l'}>{won ? 'W' : 'L'}</strong> {myScore}-{theirs}
                        </a>
                      ) : (
                        <span>
                          <strong className={won ? 'result-w' : 'result-l'}>{won ? 'W' : 'L'}</strong> {myScore}-{theirs}
                        </span>
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num muted hide-sm">{played && !isPlayoff ? `${w}-${l}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------ box score

function BoxTable({ save, side }: { save: SaveGame; side: GameResult['home'] }) {
  const team = teamById(save, side.teamId);
  const player = (id: string) => save.league.players.find((p) => p.id === id);
  const lines = [...side.lines].sort((a, b) => Number(b.starter) - Number(a.starter) || b.sec - a.sec);
  const tot = lines.reduce(
    (t, l) => {
      for (const k of ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov'] as const) t[k] = (t[k] ?? 0) + l[k];
      return t;
    },
    { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0 } as Record<string, number>,
  );
  const row = (l: Pick<BoxLine, 'fgm' | 'fga' | 'tpm' | 'tpa' | 'ftm' | 'fta'>) => (
    <>
      <td className="num">{l.fgm}-{l.fga}</td>
      <td className="num hide-sm">{l.tpm}-{l.tpa}</td>
      <td className="num hide-sm">{l.ftm}-{l.fta}</td>
    </>
  );
  return (
    <Card title={team ? teamName(team) : side.teamId}>
      <div className="table-wrap">
        <table className="table compact box">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">MIN</th>
              <th className="num">PTS</th>
              <th className="num">REB</th>
              <th className="num">AST</th>
              <th className="num">FG</th>
              <th className="num hide-sm">3PT</th>
              <th className="num hide-sm">FT</th>
              <th className="num hide-sm">STL</th>
              <th className="num hide-sm">BLK</th>
              <th className="num hide-sm">TO</th>
              <th className="num hide-sm">+/-</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const p = player(l.playerId);
              return (
                <tr key={l.playerId} className={l.starter ? 'starter' : ''}>
                  <td>
                    <a className="row-link" href={href('c', save.id, 'player', l.playerId)}>
                      {p ? `${p.firstName.charAt(0)}. ${p.lastName}` : l.playerId}
                    </a>
                  </td>
                  <td className="num">{Math.round(l.sec / 60)}</td>
                  <td className="num">
                    <strong>{l.pts}</strong>
                  </td>
                  <td className="num">{l.orb + l.drb}</td>
                  <td className="num">{l.ast}</td>
                  {row(l)}
                  <td className="num hide-sm">{l.stl}</td>
                  <td className="num hide-sm">{l.blk}</td>
                  <td className="num hide-sm">{l.tov}</td>
                  <td className="num hide-sm">{l.pm > 0 ? `+${l.pm}` : l.pm}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th>Team</th>
              <th />
              <th className="num">{tot.pts}</th>
              <th className="num">{(tot.orb ?? 0) + (tot.drb ?? 0)}</th>
              <th className="num">{tot.ast}</th>
              <th className="num">{tot.fgm}-{tot.fga}</th>
              <th className="num hide-sm">{tot.tpm}-{tot.tpa}</th>
              <th className="num hide-sm">{tot.ftm}-{tot.fta}</th>
              <th className="num hide-sm">{tot.stl}</th>
              <th className="num hide-sm">{tot.blk}</th>
              <th className="num hide-sm">{tot.tov}</th>
              <th className="hide-sm" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

export function BoxScore({ gameId }: { gameId: string }) {
  const { save } = useCareer();
  const box = save.season.boxScores[gameId];
  const back = href('c', save.id, 'schedule');
  if (!box) return <PageHeader title="Box score not available" back={back} />;
  const home = teamById(save, box.home.teamId);
  const away = teamById(save, box.away.teamId);
  const periods = box.home.quarters.length;
  return (
    <>
      <PageHeader title={`${away?.abbrev} ${box.away.score} @ ${home?.abbrev} ${box.home.score}`} subtitle={box.overtimes ? `Final, ${box.overtimes} overtime${box.overtimes > 1 ? 's' : ''}` : 'Final'} back={back} />
      <Card title="By quarter">
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th />
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i} className="num">
                    {i < 4 ? `Q${i + 1}` : `OT${i - 3 > 1 ? i - 3 : ''}`}
                  </th>
                ))}
                <th className="num">Final</th>
              </tr>
            </thead>
            <tbody>
              {[box.away, box.home].map((side) => (
                <tr key={side.teamId}>
                  <td>{teamById(save, side.teamId)?.abbrev}</td>
                  {side.quarters.map((q, i) => (
                    <td key={i} className="num">
                      {q}
                    </td>
                  ))}
                  <td className="num">
                    <strong>{side.score}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <BoxTable save={save} side={box.away} />
      <BoxTable save={save} side={box.home} />
    </>
  );
}

// ------------------------------------------------------------ standings, playoffs, leaders

export function StandingsView() {
  const { save } = useCareer();
  const { league, season } = save;
  const started = season.games.some((g) => g.hs !== undefined);
  return (
    <>
      {league.conferences.map((conf) => {
        const rows = conferenceStandings(league, season.games, conf.id);
        return (
          <Card key={conf.id} title={conf.name}>
            {!started && <p className="muted small">No games played yet.</p>}
            <div className="table-wrap">
              <table className="table compact standings">
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Team</th>
                    <th className="num">W</th>
                    <th className="num">L</th>
                    <th className="num">PCT</th>
                    <th className="num">GB</th>
                    <th className="num hide-sm">Home</th>
                    <th className="num hide-sm">Away</th>
                    <th className="num hide-sm">L10</th>
                    <th className="num hide-sm">Strk</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const t = teamById(save, r.teamId);
                    return (
                      <tr key={r.teamId} className={`${r.teamId === save.career.teamId ? 'mine' : ''} ${i === 5 || i === 9 ? 'cutline' : ''}`}>
                        <td className="num muted">{i + 1}</td>
                        <td>
                          <a className="row-link team-cell" href={href('c', save.id, 'team', r.teamId)}>
                            {t && <TeamBadge team={t} size={22} />} {t ? t.name : r.teamId}
                          </a>
                        </td>
                        <td className="num">{r.w}</td>
                        <td className="num">{r.l}</td>
                        <td className="num">{pct(r.pct)}</td>
                        <td className="num">{i === 0 ? '—' : r.gb}</td>
                        <td className="num hide-sm">{r.home.join('-')}</td>
                        <td className="num hide-sm">{r.away.join('-')}</td>
                        <td className="num hide-sm">{r.last10.join('-')}</td>
                        <td className="num hide-sm">{r.streak}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted small">Top 6 go to the playoffs; 7-10 play in. Lines mark the cut-offs.</p>
          </Card>
        );
      })}
    </>
  );
}

function SeriesRow({ s }: { s: Series }) {
  const { save } = useCareer();
  const side = (x: Series['top'], wins: number) => {
    const t = teamById(save, x.teamId);
    const lost = s.winner && s.winner !== x.teamId;
    return (
      <div className={`series-team ${lost ? 'lost' : ''} ${x.teamId === save.career.teamId ? 'mine' : ''}`}>
        <span className="muted small">{x.seed}</span>
        {t && <TeamBadge team={t} size={24} />}
        <span className="grow">{t?.name}</span>
        <strong>{wins}</strong>
      </div>
    );
  };
  return (
    <div className="series">
      {side(s.top, s.wins[0])}
      {side(s.bottom, s.wins[1])}
    </div>
  );
}

export function PlayoffsView() {
  const { save } = useCareer();
  const { season } = save;
  if (!season.series.length) return <p className="muted">The playoffs start after the regular season.</p>;
  const rounds = [...new Set(season.series.map((s) => s.round))].sort((a, b) => a - b);
  return (
    <>
      {season.champion && (
        <Card>
          <div className="champion">
            {teamById(save, season.champion) && <TeamBadge team={teamById(save, season.champion)!} size={56} />}
            <div>
              <div className="muted small">{season.year}-{String(season.year + 1).slice(2)} champions</div>
              <h2>{teamName(teamById(save, season.champion)!)}</h2>
            </div>
          </div>
        </Card>
      )}
      {rounds.map((r) => (
        <Card key={r} title={ROUND_NAME[r]}>
          <div className="series-grid">
            {season.series
              .filter((s) => s.round === r)
              .map((s) => (
                <SeriesRow key={s.id} s={s} />
              ))}
          </div>
        </Card>
      ))}
    </>
  );
}

const LEADER_STATS: { key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'; label: string }[] = [
  { key: 'pts', label: 'Points' },
  { key: 'reb', label: 'Rebounds' },
  { key: 'ast', label: 'Assists' },
  { key: 'stl', label: 'Steals' },
  { key: 'blk', label: 'Blocks' },
];

export function LeadersView() {
  const { save } = useCareer();
  const [which, setWhich] = useState<'regular' | 'playoffs'>('regular');
  const table = save.season.stats[which];
  const entries = Object.entries(table);
  const maxG = Math.max(0, ...entries.map(([, t]) => t.g));
  const minG = which === 'regular' ? Math.max(1, Math.floor(maxG * 0.6)) : 1;
  if (!entries.length) return <p className="muted">No games played yet.</p>;
  return (
    <>
      <div className="toolbar">
        <Segmented name="Stats" value={which} onChange={setWhich} options={[{ value: 'regular', label: 'Regular season' }, { value: 'playoffs', label: 'Playoffs' }]} />
      </div>
      <div className="leaders">
        {LEADER_STATS.map((st) => {
          const top = entries
            .filter(([, t]) => t.g >= minG)
            .map(([id, t]) => ({ id, v: perGame(t)[st.key] }))
            .sort((a, b) => b.v - a.v)
            .slice(0, 5);
          return (
            <Card key={st.key} title={`${st.label} per game`}>
              <ol className="leader-list">
                {top.map((x) => {
                  const p = save.league.players.find((y) => y.id === x.id);
                  const t = p?.teamId ? teamById(save, p.teamId) : undefined;
                  return (
                    <li key={x.id}>
                      <a className="row-link" href={href('c', save.id, 'player', x.id)}>
                        {p ? fullName(p) : x.id}
                      </a>
                      <span className="muted small"> {t?.abbrev ?? 'FA'}</span>
                      <strong className="leader-val">{f1(x.v)}</strong>
                    </li>
                  );
                })}
              </ol>
            </Card>
          );
        })}
      </div>
      {which === 'regular' && <p className="muted small">Minimum {minG} games played.</p>}
    </>
  );
}

