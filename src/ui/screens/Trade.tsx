import { useMemo, useState } from 'react';
import { CAP_STATUS_LABEL, capStatus, playerAge, playerOverall, rosterOf, salaryIn, teamName, teamPayroll, type DraftPick, type Player, type TradeOffer } from '../../engine';
import { completeTrade, evaluateOffer, tradeDeadlineDay, tradesOpen } from '../../game/trades';
import { useCareer } from '../career-context';
import { Card, Ovr, PlayerPhoto, TeamBadge } from '../components';
import { money } from '../format';
import { href, navigate } from '../router';
import { PageHeader } from '../Shell';

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function pickLabel(save: ReturnType<typeof useCareer>['save'], k: DraftPick): string {
  const from = save.league.teams.find((t) => t.id === k.originalTeamId);
  return `${k.season} ${k.round === 1 ? '1st' : '2nd'}${k.originalTeamId !== k.ownerTeamId ? ` (${from?.abbrev})` : ''}${k.protection ? ` · ${k.protection}` : ''}`;
}

function Side({
  title,
  teamId,
  players,
  picks,
  chosenPlayers,
  chosenPicks,
  onPlayer,
  onPick,
}: {
  title: string;
  teamId: string;
  players: Player[];
  picks: DraftPick[];
  chosenPlayers: string[];
  chosenPicks: string[];
  onPlayer: (id: string) => void;
  onPick: (id: string) => void;
}) {
  const { save } = useCareer();
  const team = save.league.teams.find((t) => t.id === teamId);
  const season = save.league.meta.season;
  return (
    <Card
      title={
        <span className="team-cell">
          {team && <TeamBadge team={team} size={22} />} {title}
        </span>
      }
    >
      <ul className="trade-list">
        {players.map((p) => {
          const on = chosenPlayers.includes(p.id);
          return (
            <li key={p.id}>
              <label className={`trade-item ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => onPlayer(p.id)} />
                <span className="mini-face">
                  <PlayerPhoto photo={p.photo} number={p.jersey} colors={team?.colors ?? { primary: '#333', secondary: '#ccc' }} />
                </span>
                <span className="trade-name">
                  <strong>{`${p.firstName.charAt(0)}. ${p.lastName}`}</strong>
                  <span className="muted small">
                    {p.position} · {playerAge(p, season)} · {money(salaryIn(p, season))}
                    {p.contract?.kind === 'two-way' ? ' · two-way' : ''}
                    {p.contract?.noTrade ? ' · no-trade' : ''}
                  </span>
                </span>
                <Ovr value={playerOverall(p)} />
              </label>
            </li>
          );
        })}
      </ul>
      <h3 style={{ margin: '14px 0 6px' }}>Draft picks</h3>
      <div className="pick-chips">
        {picks.length === 0 && <span className="muted small">No picks to trade.</span>}
        {picks.map((k) => (
          <button key={k.id} type="button" className={`pick-chip ${chosenPicks.includes(k.id) ? 'on' : ''}`} onClick={() => onPick(k.id)}>
            {pickLabel(save, k)}
          </button>
        ))}
      </div>
    </Card>
  );
}

export function Trade({ teamId, playerId }: { teamId?: string; playerId?: string }) {
  const { save, update } = useCareer();
  const { league } = save;
  const me = save.career.teamId;
  const others = league.teams.filter((t) => t.id !== me).sort((a, b) => a.city.localeCompare(b.city));
  const otherId = teamId && teamId !== me ? teamId : (others[0]?.id ?? '');
  const [myPlayers, setMyPlayers] = useState<string[]>([]);
  const [myPicks, setMyPicks] = useState<string[]>([]);
  const [theirPlayers, setTheirPlayers] = useState<string[]>(playerId ? [playerId] : []);
  const [theirPicks, setTheirPicks] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const season = league.meta.season;
  const status = tradesOpen(save);

  const offer: TradeOffer = { fromTeam: otherId, toTeam: me, give: { players: theirPlayers, picks: theirPicks }, get: { players: myPlayers, picks: myPicks } };
  const verdict = useMemo(() => evaluateOffer(save, offer), [save, otherId, myPlayers, myPicks, theirPlayers, theirPicks]); // eslint-disable-line react-hooks/exhaustive-deps

  const picksOf = (id: string) => league.draftPicks.filter((k) => k.ownerTeamId === id).sort((a, b) => a.season - b.season || a.round - b.round);
  const payroll = teamPayroll(league, me, season);
  const after = payroll - (verdict.check.salaryOut[me] ?? 0) + (verdict.check.salaryIn[me] ?? 0);
  const other = league.teams.find((t) => t.id === otherId);

  const reset = () => {
    setMyPlayers([]);
    setMyPicks([]);
    setTheirPlayers([]);
    setTheirPicks([]);
  };

  const propose = () => {
    if (!verdict.accept) return;
    update((s) => completeTrade(s, offer));
    setDone(`Trade completed with the ${other ? teamName(other) : 'other team'}. The new players are on your roster.`);
    reset();
  };

  return (
    <>
      <PageHeader
        title="Trade"
        subtitle={status.open ? `Trade deadline in ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} (day ${tradeDeadlineDay(save) + 1})` : status.reason}
      />
      {done && (
        <div className="notice">
          {done} <a href={href('c', save.id, 'roster')}>See roster ›</a>
        </div>
      )}
      <label className="field" htmlFor="trade-team" style={{ maxWidth: 420 }}>
        <span>Trade with</span>
        <select
          id="trade-team"
          className="input"
          value={otherId}
          onChange={(e) => {
            reset();
            navigate('c', save.id, 'trade', e.target.value);
          }}
        >
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {teamName(t)}
            </option>
          ))}
        </select>
      </label>

      {!status.open ? (
        <Card>
          <p>{status.reason}</p>
        </Card>
      ) : (
        <>
          <div className="grid-2">
            <Side title="You send" teamId={me} players={rosterOf(league, me)} picks={picksOf(me)} chosenPlayers={myPlayers} chosenPicks={myPicks} onPlayer={(id) => setMyPlayers((l) => toggle(l, id))} onPick={(id) => setMyPicks((l) => toggle(l, id))} />
            <Side title={`You receive from the ${other?.name ?? ''}`} teamId={otherId} players={rosterOf(league, otherId)} picks={picksOf(otherId)} chosenPlayers={theirPlayers} chosenPicks={theirPicks} onPlayer={(id) => setTheirPlayers((l) => toggle(l, id))} onPick={(id) => setTheirPicks((l) => toggle(l, id))} />
          </div>

          <div className="trade-bar">
            <div className="trade-money">
              <span>
                <span className="label">Salary out</span> {money(verdict.check.salaryOut[me] ?? 0)}
              </span>
              <span>
                <span className="label">Salary in</span> {money(verdict.check.salaryIn[me] ?? 0)}
              </span>
              <span>
                <span className="label">Payroll after</span> {money(after)} · {CAP_STATUS_LABEL[capStatus(league.settings, after)]}
              </span>
            </div>
            <div className="trade-verdict">
              <div className="warmth" aria-hidden="true">
                <span style={{ width: `${((verdict.warmth + 1) / 2) * 100}%`, background: verdict.accept ? 'var(--good)' : verdict.warmth > -0.4 ? 'var(--warn)' : 'var(--bad)' }} />
              </div>
              <p>
                <strong>{other?.name}:</strong> {verdict.message}
              </p>
            </div>
            <button className="btn btn-primary" type="button" disabled={!verdict.accept} onClick={propose}>
              Make trade
            </button>
          </div>
        </>
      )}
    </>
  );
}
