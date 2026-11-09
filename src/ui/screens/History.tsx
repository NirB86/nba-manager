import { fullName } from '../../engine';
import { HOF_THRESHOLD, RECORD_LABEL, seasonRecords, type RecordStat } from '../../game/history';
import { useCareer } from '../career-context';
import { Card, PlayerPhoto, TeamBadge } from '../components';
import { seasonLabel } from '../format';
import { href } from '../router';
import { f1 } from './Season';

/** Champions and award winners by year, records, and the Hall of Fame. */
export function HistoryView() {
  const { save } = useCareer();
  const { league } = save;
  const team = (id: string | null | undefined) => (id ? league.teams.find((t) => t.id === id) : undefined);
  const pname = (id: string | null | undefined) => {
    if (!id) return '—';
    const p = league.players.find((x) => x.id === id);
    if (p) return <a className="row-link" href={href('c', save.id, 'player', p.id)}>{fullName(p)}</a>;
    return save.hallOfFame?.find((h) => h.id === id)?.name ?? 'Retired';
  };
  const seasons = [...(save.leagueHistory ?? [])].reverse();
  const game = save.records?.game ?? {};
  const hof = [...(save.hallOfFame ?? [])].reverse();

  return (
    <>
      <Card title="Champions">
        {seasons.length ? (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Champion</th>
                  <th className="hide-sm">Runner-up</th>
                  <th>MVP</th>
                  <th className="hide-sm">Finals MVP</th>
                  <th className="hide-sm">Best record</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((r) => {
                  const c = team(r.champion);
                  const ru = team(r.runnerUp);
                  const best = r.best ? team(r.best.teamId) : undefined;
                  return (
                    <tr key={r.season} className={r.champion === save.career.teamId ? 'mine' : ''}>
                      <td>{seasonLabel(r.season)}</td>
                      <td>
                        {c ? (
                          <span className="hist-team">
                            <TeamBadge team={c} size={22} /> {c.name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="hide-sm">{ru?.name ?? '—'}</td>
                      <td>{pname(r.awards?.mvp)}</td>
                      <td className="hide-sm">{pname(r.awards?.finalsMvp)}</td>
                      <td className="hide-sm">{best && r.best ? `${best.abbrev} ${r.best.w}-${r.best.l}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">History starts after your first Finals. Every champion and award winner will be listed here.</p>
        )}
      </Card>

      <Card title="Single-game records">
        {Object.keys(game).length ? (
          <ul className="records">
            {(Object.keys(RECORD_LABEL) as RecordStat[]).map((k) => {
              const r = game[k];
              if (!r) return null;
              const opp = team(r.oppId);
              return (
                <li key={k}>
                  <span className="rec-value">{r.value}</span>
                  <span>
                    <strong>{RECORD_LABEL[k]}</strong>
                    <br />
                    {pname(r.playerId)} <span className="muted small">vs {opp?.abbrev} · {seasonLabel(r.season)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">Records are tracked from the first game you play.</p>
        )}
      </Card>

      <Card title="Best seasons">
        <div className="best-seasons">
          {(['pts', 'reb', 'ast'] as const).map((stat) => {
            const rows = seasonRecords(save, stat);
            return (
              <div key={stat}>
                <h3>{stat === 'pts' ? 'Points' : stat === 'reb' ? 'Rebounds' : 'Assists'} per game</h3>
                {rows.length ? (
                  <ol>
                    {rows.map((r) => (
                      <li key={`${r.playerId}-${r.season}`}>
                        <strong>{f1(r.value)}</strong> {pname(r.playerId)} <span className="muted small">{r.team} {seasonLabel(r.season)}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted small">No completed seasons yet.</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="muted small">At least 50 games. Includes seasons imported with the league file.</p>
      </Card>

      <Card title="Hall of Fame">
        {hof.length ? (
          <ul className="hof">
            {hof.map((h) => {
              const t = team(h.teamId);
              return (
                <li key={h.id}>
                  <span className="hof-face">
                    <PlayerPhoto photo={h.photo} number={0} colors={t?.colors ?? { primary: '#333', secondary: '#999' }} />
                  </span>
                  <span>
                    <strong>{h.name}</strong> <span className="muted small">{h.position} · inducted {h.inducted}</span>
                    <br />
                    <span className="small">
                      {h.totals.pts.toLocaleString()} pts · {h.totals.reb.toLocaleString()} reb · {h.totals.ast.toLocaleString()} ast · peak {h.peakOvr}
                    </span>
                    {h.honors.length > 0 && <span className="hof-honors">{h.honors.join(' · ')}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">
            When a great player retires, he is voted in here. Voters look at MVPs, All-NBA and All-Star selections, career points and peak rating (score {HOF_THRESHOLD}+).
          </p>
        )}
      </Card>
    </>
  );
}
