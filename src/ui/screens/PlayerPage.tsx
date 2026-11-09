import { ATTRIBUTE_GROUPS, displayRating, fullName, playerAge, playerOverall, salaryIn, teamName, type Player } from '../../engine';
import { personalityTraits, potentialRange } from '../../game/scouting';
import { useState } from 'react';
import { negotiation } from '../../game/contracts';
import { convertTwoWay, signTwoWay, twoWayEligible, waiveCost, waivePlayer, type MoveResult } from '../../game/roster';
import { morale, MORALE_LABEL } from '../../game/morale';
import { playerHonors } from '../../game/awards';
import { careerTotals } from '../../game/history';
import { promiseMinutes } from '../../game/demands';
import { useCareer } from '../career-context';
import { ContractOffer } from './ContractOffer';
import { FitReportCard } from './Scouting';
import { Card, ImageCreditLine, MoodPill, Pill, PlayerPhoto } from '../components';
import { attrTone, height, money, ordinal, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';
import { f1, pct, perGame } from './Season';

const POSITION: Record<Player['position'], string> = { PG: 'Point guard', SG: 'Shooting guard', SF: 'Small forward', PF: 'Power forward', C: 'Center' };

export function PlayerPage({ playerId }: { playerId: string }) {
  const { save, update } = useCareer();
  const [offering, setOffering] = useState(false);
  const [moveMsg, setMoveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const move = (r: MoveResult) => {
    if (r.ok) update(() => r.save);
    setMoveMsg({ ok: r.ok, text: r.message });
  };
  const { league } = save;
  const p = league.players.find((x) => x.id === playerId);
  if (!p) return <PageHeader title="Player not found" back={href('c', save.id, 'roster')} />;

  const season = league.meta.season;
  const team = league.teams.find((t) => t.id === p.teamId);
  const draftTeam = league.teams.find((t) => t.id === p.draft?.teamId);
  const ovr = displayRating(playerOverall(p));
  const [potLo, potHi] = potentialRange(save, p).map(displayRating) as [number, number];
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
        {p.photo?.source === 'NBA.com' ? (
          // Official headshots are transparent cut-outs: show the whole image, standing on the banner.
          <img className="spot-cutout" src={p.photo.url} alt={fullName(p)} />
        ) : (
          <div className="spot-photo">
            <PlayerPhoto photo={p.photo} number={p.jersey} colors={colors} frame="portrait" boxAspect={1.25} />
          </div>
        )}
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

      <HonorBadges playerId={p.id} />
      <DemandNotice player={p} />
      {save.season.injuries?.[p.id] && (
        <div className="notice injury-notice">
          <strong>Injured: {save.season.injuries[p.id]!.type}.</strong>{' '}
          {save.season.injuries[p.id]!.gamesLeft >= 60 ? 'Out for the season.' : `Expected back in about ${save.season.injuries[p.id]!.gamesLeft} game${save.season.injuries[p.id]!.gamesLeft === 1 ? '' : 's'}.`}
        </div>
      )}
      <div className="row-actions player-actions">
        {team && !mine && (
          <a className="btn btn-primary" href={href('c', save.id, 'trade', team.id, p.id)}>
            Trade for {p.lastName}
          </a>
        )}
        {mine && (
          <a className="btn" href={href('c', save.id, 'trade', team!.id, p.id)}>
            Trade {p.lastName}
          </a>
        )}
        {mine && p.contract?.kind === 'two-way' && (
          <button className="btn" type="button" onClick={() => move(convertTwoWay(save, p.id))}>
            Convert to standard
          </button>
        )}
        {!team && twoWayEligible(save, p).ok && (
          <button className="btn" type="button" onClick={() => move(signTwoWay(save, p.id))}>
            Sign two-way
          </button>
        )}
        {mine && (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              const cost = waiveCost(save, p);
              const m = (v: number) => `${(v / 1e6).toFixed(1)}M`;
              const text =
                p.contract?.kind === 'two-way'
                  ? `Waive ${fullName(p)}? Two-way deals leave no dead money.`
                  : `Waive ${fullName(p)}? Unless another team claims him, ${m(cost.now + cost.later)} stays on your cap as dead money (${m(cost.now)} this season).`;
              if (window.confirm(text)) move(waivePlayer(save, p.id));
            }}
          >
            Waive
          </button>
        )}
        {(mine || !team) && (
          <button className="btn btn-primary" type="button" onClick={() => setOffering((v) => !v)} title={negotiation(save, p).ok ? '' : (negotiation(save, p) as { reason: string }).reason}>
            {offering ? 'Hide contract offer' : mine ? 'Offer extension' : 'Offer contract'}
          </button>
        )}
      </div>
      {moveMsg && (
        <div className="notice" style={{ borderLeftColor: moveMsg.ok ? 'var(--good)' : 'var(--bad)' }}>
          {moveMsg.text}
        </div>
      )}
      {offering && <ContractOffer player={p} onDone={() => undefined} />}
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
          {!mine && <FitReportCard player={p} />}
          {p.teamId && (() => {
            const m = morale(save, p);
            return (
              <Card title="Morale" action={<MoodPill level={m.level} label={MORALE_LABEL[m.level]} />} className="morale-card">
                <div className="morale-meter" aria-hidden="true">
                  <span style={{ left: `${((m.score + 10) / 20) * 100}%` }} />
                </div>
                <ul className="morale-reasons">
                  {m.reasons.map((r) => (
                    <li key={r.text} className={r.effect > 0.2 ? 'up' : r.effect < -0.2 ? 'down' : ''}>
                      {r.text}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })()}
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
              <dt>College</dt>
              <dd>{p.college ?? (p.born.country !== 'USA' ? 'Came up overseas' : 'Not listed')}</dd>
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
      <CareerStats player={p} />
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

/** Awards and All-Star selections won in this save, grouped by label. */
function HonorBadges({ playerId }: { playerId: string }) {
  const { save } = useCareer();
  const honors = playerHonors(save, playerId);
  if (!honors.length) return null;
  const groups = new Map<string, number[]>();
  for (const h of honors) groups.set(h.label, [...(groups.get(h.label) ?? []), h.season]);
  return (
    <ul className="honors" aria-label="Honors">
      {[...groups.entries()].map(([label, years]) => (
        <li key={label} className={`honor ${/MVP/.test(label) ? 'gold' : ''}`} title={years.map((y) => seasonLabel(y)).join(', ')}>
          {years.length > 1 && <b>{years.length}×</b>} {label}
        </li>
      ))}
    </ul>
  );
}

/** Every past regular season (imported and played in this save), plus the season in progress. */
function CareerStats({ player }: { player: Player }) {
  const { save } = useCareer();
  const past = player.pastSeasons ?? [];
  const cur = save.season.stats.regular[player.id];
  const now = perGame(cur);
  const team = save.league.teams.find((t) => t.id === player.teamId)?.abbrev ?? 'FA';
  const live = cur?.g && !past.some((s) => s.season === save.season.year) ? [{ season: save.season.year, team, g: now.g, min: now.min, pts: now.pts, reb: now.reb, ast: now.ast, fgPct: now.fgPct, tpPct: now.tpPct, current: true }] : [];
  const rows = [...past.map((s) => ({ ...s, current: false })), ...live];
  if (rows.length < 1 || (rows.length === 1 && live.length)) return null;
  const tot = careerTotals([...past, ...live]);
  const avg = (v: number) => (tot.g ? f1(v / tot.g) : '—');
  return (
    <Card title="Career">
      <div className="table-wrap">
        <table className="table compact career-table">
          <thead>
            <tr>
              <th>Season</th>
              <th>Team</th>
              <th className="num">GP</th>
              <th className="num hide-sm">MIN</th>
              <th className="num">PTS</th>
              <th className="num">REB</th>
              <th className="num">AST</th>
              <th className="num hide-sm">FG%</th>
              <th className="num hide-sm">3P%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.season} className={s.current ? 'current' : ''}>
                <td>
                  {seasonLabel(s.season)}
                  {s.current && <span className="muted small"> (now)</span>}
                </td>
                <td>{s.team}</td>
                <td className="num">{s.g}</td>
                <td className="num hide-sm">{f1(s.min)}</td>
                <td className="num">
                  <strong>{f1(s.pts)}</strong>
                </td>
                <td className="num">{f1(s.reb)}</td>
                <td className="num">{f1(s.ast)}</td>
                <td className="num hide-sm">{s.fgPct !== undefined ? pct(s.fgPct) : '—'}</td>
                <td className="num hide-sm">{s.tpPct !== undefined ? pct(s.tpPct) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>Career</th>
              <th>{tot.seasons} yrs</th>
              <th className="num">{tot.g}</th>
              <th className="num hide-sm" />
              <th className="num">{avg(tot.pts)}</th>
              <th className="num">{avg(tot.reb)}</th>
              <th className="num">{avg(tot.ast)}</th>
              <th className="num hide-sm" />
              <th className="num hide-sm" />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">Career totals: {tot.pts.toLocaleString()} points, {tot.reb.toLocaleString()} rebounds, {tot.ast.toLocaleString()} assists{player.experience + 1 > tot.seasons ? ` (seasons before ${seasonLabel(rows[0]!.season)} are not in this league file)` : ''}.</p>
    </Card>
  );
}

/** Trade request (with a promise you can make) and contract holdouts. */
function DemandNotice({ player }: { player: Player }) {
  const { save, update } = useCareer();
  if (player.teamId !== save.career.teamId) return null;
  const req = save.demands?.requests[player.id];
  const hold = save.season.holdouts?.[player.id];
  if (!req && !hold) return null;
  return (
    <>
      {hold ? (
        <div className="notice demand-notice">
          <strong>Holding out for a new contract.</strong> He misses games until you sign him to an extension (Offer contract below), or about {hold} more game{hold === 1 ? '' : 's'} until he reports.
        </div>
      ) : null}
      {req ? (
        <div className="notice demand-notice">
          <strong>{req.leaked ? 'Has asked for a trade (public).' : 'Has asked for a trade.'}</strong>{' '}
          {req.promise
            ? `You promised him about ${req.promise.minutes} minutes a game. Your word is checked on day ${req.promise.due + 1}.`
            : 'Trade him, or promise him a bigger role and set it in the depth chart.'}
          {!req.promise && (
            <button type="button" className="btn btn-sm" onClick={() => update((s) => promiseMinutes(s, player.id))}>
              Promise more minutes
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
