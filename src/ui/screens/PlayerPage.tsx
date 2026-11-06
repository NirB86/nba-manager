import { ATTRIBUTE_GROUPS, fullName, playerAge, playerOverall, stars, teamName } from '../../engine';
import { personalityTraits, potentialRange } from '../../game/scouting';
import { useCareer } from '../career-context';
import { AttrBar, Card, Ovr, Pill, Stars, TeamBadge } from '../components';
import { height, money, ordinal, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';
import { f1, pct, perGame } from './Season';

export function PlayerPage({ playerId }: { playerId: string }) {
  const { save } = useCareer();
  const { league } = save;
  const p = league.players.find((x) => x.id === playerId);
  if (!p) return <PageHeader title="Player not found" back={href('c', save.id, 'roster')} />;

  const season = league.meta.season;
  const team = league.teams.find((t) => t.id === p.teamId);
  const draftTeam = league.teams.find((t) => t.id === p.draft?.teamId);
  const ovr = playerOverall(p);
  const [potLo, potHi] = potentialRange(save, p);
  const back = team ? (team.id === save.career.teamId ? href('c', save.id, 'roster') : href('c', save.id, 'team', team.id)) : href('c', save.id, 'league');

  return (
    <>
      <PageHeader title="" back={back} />
      <div className="player-hero" style={{ ['--team' as string]: team?.colors.primary ?? '#64748b' }}>
        <div className="player-hero-num">{p.jersey}</div>
        <div className="player-hero-main">
          <h1>{fullName(p)}</h1>
          <p>
            {p.position} · {playerAge(p, season)} years · {height(p.heightCm)} ({p.heightCm} cm) · {p.weightKg} kg · {p.born.country}
          </p>
          <p className="player-hero-team">
            {team ? (
              <a href={href('c', save.id, 'team', team.id)}>
                <TeamBadge team={team} size={22} /> {teamName(team)}
              </a>
            ) : (
              <Pill tone="warn">Free agent</Pill>
            )}
          </p>
        </div>
        <div className="player-hero-ratings">
          <div>
            <span className="muted small">Overall</span>
            <Ovr value={ovr} />
            <Stars value={stars(ovr)} />
          </div>
          <div>
            <span className="muted small">Potential (scout estimate)</span>
            <span className="pot-range">{potLo === potHi ? potLo : `${potLo}–${potHi}`}</span>
            <Stars value={stars(Math.round((potLo + potHi) / 2))} />
          </div>
        </div>
      </div>

      <div className="grid-2">
        <Card title="Attributes" className="span-rows">
          <div className="attr-groups">
            {ATTRIBUTE_GROUPS.map((g) => (
              <div key={g.name} className="attr-group">
                <h3>{g.name}</h3>
                {g.keys.map((k) => (
                  <AttrBar key={k.key} label={k.label} value={p.attributes[k.key]} />
                ))}
              </div>
            ))}
          </div>
        </Card>

        <SeasonStats playerId={p.id} />

        <Card title="Contract">
          {p.contract ? (
            <>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>Season</th>
                    <th className="num">Salary</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.contract.years.map((y) => (
                    <tr key={y.season}>
                      <td>{seasonLabel(y.season)}</td>
                      <td className="num">{money(y.salary)}</td>
                      <td>
                        {p.contract?.option?.season === y.season && (
                          <Pill tone="accent">{p.contract.option.type === 'player' ? 'Player option' : 'Team option'}</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted small">
                {p.contract.kind === 'rookie' ? 'Rookie-scale contract' : p.contract.kind === 'max' ? 'Max contract' : p.contract.kind === 'minimum' ? 'Minimum contract' : 'Standard contract'}
                {p.contract.noTrade ? ' · No-trade clause' : ''} · Total {money(p.contract.years.reduce((s, y) => s + y.salary, 0))}
              </p>
            </>
          ) : (
            <p className="muted">No contract. This player can be signed by any team.</p>
          )}
        </Card>

        <Card title="Background">
          <dl className="facts">
            <dt>Draft</dt>
            <dd>
              {p.draft
                ? `${p.draft.season}, round ${p.draft.round}, ${ordinal(p.draft.pick)} pick${draftTeam ? ` by ${draftTeam.abbrev}` : ''}`
                : 'Undrafted'}
            </dd>
            <dt>Experience</dt>
            <dd>{p.experience === 0 ? 'Rookie' : `${p.experience} season${p.experience === 1 ? '' : 's'}`}</dd>
            <dt>Personality</dt>
            <dd className="traits">
              {personalityTraits(p).map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </dd>
          </dl>
        </Card>
      </div>
    </>
  );
}

function SeasonStats({ playerId }: { playerId: string }) {
  const { save } = useCareer();
  const rows = (['regular', 'playoffs'] as const)
    .map((k) => ({ k, t: save.season.stats[k][playerId] }))
    .filter((r) => (r.t?.g ?? 0) > 0);
  if (!rows.length) return null;
  return (
    <Card title={`${seasonLabel(save.season.year)} stats`}>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th />
              <th className="num">GP</th>
              <th className="num">MIN</th>
              <th className="num">PTS</th>
              <th className="num">REB</th>
              <th className="num">AST</th>
              <th className="num hide-sm">STL</th>
              <th className="num hide-sm">BLK</th>
              <th className="num">FG%</th>
              <th className="num hide-sm">3P%</th>
              <th className="num hide-sm">FT%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ k, t }) => {
              const s = perGame(t);
              return (
                <tr key={k}>
                  <td>{k === 'regular' ? 'Season' : 'Playoffs'}</td>
                  <td className="num">{s.g}</td>
                  <td className="num">{f1(s.min)}</td>
                  <td className="num"><strong>{f1(s.pts)}</strong></td>
                  <td className="num">{f1(s.reb)}</td>
                  <td className="num">{f1(s.ast)}</td>
                  <td className="num hide-sm">{f1(s.stl)}</td>
                  <td className="num hide-sm">{f1(s.blk)}</td>
                  <td className="num">{pct(s.fgPct)}</td>
                  <td className="num hide-sm">{pct(s.tpPct)}</td>
                  <td className="num hide-sm">{pct(s.ftPct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
