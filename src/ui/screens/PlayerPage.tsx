import { ATTRIBUTE_GROUPS, fullName, playerAge, playerOverall, salaryIn, teamName, type Player } from '../../engine';
import { personalityTraits, potentialRange } from '../../game/scouting';
import { useCareer } from '../career-context';
import { Card, ImageCreditLine, Pill, PlayerPhoto } from '../components';
import { attrTone, height, money, ordinal, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';
import { f1, pct, perGame } from './Season';

const POSITION: Record<Player['position'], string> = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center' };

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
  const colors = team?.colors ?? { primary: '#3b4150', secondary: '#c7cbd2' };
  const st = perGame(save.season.stats.regular[p.id]);
  const t = save.season.stats.regular[p.id];
  const ts = t && t.fga + t.fta ? t.pts / (2 * (t.fga + 0.44 * t.fta)) : 0;
  const has = st.g > 0;
  const stats = [
    { k: 'Points', v: has ? f1(st.pts) : '—' },
    { k: 'Rebounds', v: has ? f1(st.reb) : '—' },
    { k: 'Assists', v: has ? f1(st.ast) : '—' },
    { k: '3P%', v: has ? pct(st.tpPct) : '—' },
    { k: 'TS%', v: has ? pct(ts) : '—' },
    { k: 'Minutes', v: has ? f1(st.min) : '—' },
  ];
  const years = p.contract?.years ?? [];
  const lastYear = years.at(-1)?.season;
  const mine = p.teamId === save.career.teamId;

  return (
    <>
      <PageHeader title="" back={back} />
      <section className="spot" style={{ ['--pteam' as string]: colors.primary, ['--pteam2' as string]: colors.secondary }}>
        <span className="spot-num" aria-hidden="true">
          {p.jersey}
        </span>
        <div className="spot-photo">
          <PlayerPhoto photo={p.photo} number={p.jersey} colors={colors} />
        </div>
        <div className="spot-straps">
          <span className="spot-tag">{mine ? 'Player spotlight' : team ? 'Scouting target' : 'Free agent'}</span>
          <span className="spot-name">{fullName(p)}</span>
          <span className="spot-meta">
            {p.position} · #{p.jersey} · Age {playerAge(p, season)} · {height(p.heightCm)} ·{' '}
            {team ? <a href={href('c', save.id, 'team', team.id)}>{team.name}</a> : 'Unsigned'}
          </span>
        </div>
      </section>

      <section className="statboard">
        <div className="statboard-ovr">
          <span className="label">Overall</span>
          <span className="big">{ovr}</span>
          <span className="pot" title="Potential, as estimated by your scouts">
            POT {potLo === potHi ? potLo : `${potLo}-${potHi}`}
          </span>
        </div>
        <div className="statboard-grid">
          {stats.map((s) => (
            <div key={s.k}>
              <span className="label">{s.k}</span>
              <span className="v">{s.v}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <Card title="Scouting report">
          <div className="pp-attrs">
            {ATTRIBUTE_GROUPS.map((g) => (
              <div key={g.name} className="pp-attr-group">
                <span className="strap black">{g.name}</span>
                {g.keys.map((k) => {
                  const v = p.attributes[k.key];
                  return (
                    <div key={k.key} className="pp-bar">
                      <span>{k.label}</span>
                      <span className="attr-track">
                        <span className={`attr-fill ${attrTone(v)}`} style={{ width: `${(v / 20) * 100}%` }} />
                      </span>
                      <span>{v}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        <div>
          <Card title="Contract">
            {p.contract ? (
              <>
                <div className="timeline">
                  {years.map((y) => {
                    const opt = p.contract?.option?.season === y.season ? p.contract.option.type : null;
                    return (
                      <div key={y.season} className={opt ? 'option' : 'paid'}>
                        <span>{seasonLabel(y.season)}</span>
                        <span>{money(y.salary)}</span>
                        {opt && <span style={{ fontSize: 11 }}>{opt === 'player' ? 'Player option' : 'Team option'}</span>}
                      </div>
                    );
                  })}
                  {lastYear !== undefined && (
                    <div className="free">
                      <span>{seasonLabel(lastYear + 1)}</span>
                      <span>Free agent</span>
                    </div>
                  )}
                </div>
                <p className="small muted" style={{ marginTop: 10 }}>
                  {p.contract.kind === 'rookie' ? 'Rookie-scale contract' : p.contract.kind === 'max' ? 'Max contract' : p.contract.kind === 'minimum' ? 'Minimum contract' : p.contract.kind === 'two-way' ? 'Two-way contract' : 'Standard contract'}
                  {p.contract.noTrade ? ' · No-trade clause' : ''} · This season {money(salaryIn(p, season))}
                </p>
              </>
            ) : (
              <p className="muted">No contract. Any team can sign this player.</p>
            )}
          </Card>
          <Card title="Profile">
            <dl className="facts">
              <dt>Position</dt>
              <dd>{POSITION[p.position]}</dd>
              <dt>Team</dt>
              <dd>{team ? teamName(team) : 'Free agent'}</dd>
              <dt>Born</dt>
              <dd>
                {p.born.year} · {p.born.country}
              </dd>
              <dt>Draft</dt>
              <dd>{p.draft ? `${p.draft.season}, round ${p.draft.round}, ${ordinal(p.draft.pick)} pick${draftTeam ? ` by ${draftTeam.abbrev}` : ''}` : 'Undrafted'}</dd>
              <dt>Experience</dt>
              <dd>{p.experience === 0 ? 'Rookie' : `${p.experience} season${p.experience === 1 ? '' : 's'}`}</dd>
              <dt>Character</dt>
              <dd className="traits">
                {personalityTraits(p).map((x) => (
                  <Pill key={x}>{x}</Pill>
                ))}
              </dd>
            </dl>
          </Card>
        </div>
      </div>

      <SeasonStats playerId={p.id} />
      <ImageCreditLine label="Photo" image={p.photo} />
    </>
  );
}

function SeasonStats({ playerId }: { playerId: string }) {
  const { save } = useCareer();
  const rows = (['regular', 'playoffs'] as const).map((k) => ({ k, t: save.season.stats[k][playerId] })).filter((r) => (r.t?.g ?? 0) > 0);
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
                  <td className="num">
                    <strong>{f1(s.pts)}</strong>
                  </td>
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
