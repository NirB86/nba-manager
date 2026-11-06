import { ATTRIBUTE_GROUPS, fullName, playerAge, playerOverall, salaryIn, teamName, type Attributes, type Player } from '../../engine';
import { personalityTraits, potentialRange } from '../../game/scouting';
import { useCareer } from '../career-context';
import { Card, ImageCreditLine, Pill, PlayerPhoto, TeamBadge } from '../components';
import { attrTone, height, money, ordinal, ovrTone, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';
import { f1, pct, perGame } from './Season';

const POSITION: Record<Player['position'], string> = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center' };

/** Six skill areas for the radar, each the average of its attributes (1-20). */
function skillAreas(a: Attributes) {
  const avg = (...v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  return [
    { key: 'SHOOT', v: avg(a.three, a.midRange, a.freeThrow) },
    { key: 'PLAY', v: avg(a.passing, a.ballHandling, a.vision) },
    { key: 'DEF', v: avg(a.perimeterD, a.interiorD, a.steals, a.blocks) },
    { key: 'REB', v: a.rebounding },
    { key: 'ATH', v: avg(a.speed, a.vertical, a.strength, a.stamina) },
    { key: 'IQ', v: avg(a.iq, a.inside, a.finishing) },
  ];
}

function Radar({ attrs }: { attrs: Attributes }) {
  const areas = skillAreas(attrs);
  const pt = (i: number, r: number) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / 3;
    return [Math.cos(angle) * r, Math.sin(angle) * r] as const;
  };
  const ring = (r: number) => areas.map((_, i) => pt(i, r).join(',')).join(' ');
  const shape = areas.map((a, i) => pt(i, (a.v / 20) * 48).join(',')).join(' ');
  const label = areas.map((a) => `${a.key.toLowerCase()} ${Math.round(a.v)}`).join(', ');
  return (
    <svg width="140" height="140" viewBox="-62 -62 124 124" role="img" aria-label={`Skill profile: ${label}`}>
      <polygon points={ring(48)} fill="none" stroke="rgba(255,255,255,0.14)" />
      <polygon points={ring(32)} fill="none" stroke="rgba(255,255,255,0.08)" />
      <polygon points={ring(16)} fill="none" stroke="rgba(255,255,255,0.06)" />
      <polygon points={shape} fill="color-mix(in srgb, var(--accent) 28%, transparent)" stroke="var(--accent)" strokeWidth="1.6" />
      {areas.map((a, i) => {
        const [x, y] = pt(i, 57);
        return (
          <text key={a.key} x={x} y={y + 3} textAnchor="middle" fontSize="8.5" fill="rgba(244,246,251,0.7)" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" letterSpacing="0.5">
            {a.key}
          </text>
        );
      })}
    </svg>
  );
}

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
  const colors = team?.colors ?? { primary: '#3a4256', secondary: '#c3cad8' };
  const traits = personalityTraits(p);
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

  return (
    <>
      <PageHeader title="" back={back} />
      <section className="pp-head" style={{ ['--pteam' as string]: colors.primary }}>
        <div className="pp-avatar">
          <PlayerPhoto photo={p.photo} number={p.jersey} colors={colors} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="pp-name">{fullName(p)}</div>
          <div className="pp-meta">
            {p.position} · #{p.jersey} · {playerAge(p, season)} · {height(p.heightCm)} · {p.born.country}
          </div>
          <div className="pp-mood">
            {team ? (
              <a href={href('c', save.id, 'team', team.id)} className="team-cell">
                <TeamBadge team={team} size={18} /> {teamName(team)}
              </a>
            ) : (
              <Pill tone="warn">Free agent</Pill>
            )}
          </div>
        </div>
        <div className="pp-ovr">
          <div className={`pp-ovr-tile ${ovrTone(ovr)}`} title="Overall rating">
            {ovr}
          </div>
          <span className="label" title="Potential, as estimated by your scouts">
            POT {potLo === potHi ? potLo : `${potLo}-${potHi}`}
          </span>
        </div>
      </section>

      <div className="pp-grid">
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="pp-top">
            <div className="pp-radar">
              <Radar attrs={p.attributes} />
            </div>
            <div className="pp-stats">
              {stats.map((s) => (
                <div key={s.k}>
                  <div className="v">{s.v}</div>
                  <div className="k">{s.k}</div>
                </div>
              ))}
            </div>
          </div>
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
              <dt>Draft</dt>
              <dd>{p.draft ? `${p.draft.season}, round ${p.draft.round}, ${ordinal(p.draft.pick)} pick${draftTeam ? ` by ${draftTeam.abbrev}` : ''}` : 'Undrafted'}</dd>
              <dt>Experience</dt>
              <dd>{p.experience === 0 ? 'Rookie' : `${p.experience} season${p.experience === 1 ? '' : 's'}`}</dd>
              <dt>Character</dt>
              <dd className="traits">
                {traits.map((x) => (
                  <Pill key={x}>{x}</Pill>
                ))}
              </dd>
            </dl>
          </Card>
        </div>

        <div className="pp-attrs">
          {ATTRIBUTE_GROUPS.map((g) => (
            <div key={g.name} className="pp-attr-group">
              <h3>{g.name}</h3>
              {g.keys.map((k) => {
                const v = p.attributes[k.key];
                return (
                  <div key={k.key} className="pp-attr">
                    <span>{k.label}</span>
                    <span className={`chip ${attrTone(v)}`}>{v}</span>
                  </div>
                );
              })}
            </div>
          ))}
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
