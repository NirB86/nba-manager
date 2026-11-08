import { useState } from 'react';
import { displayRating, fullName, playerAge, playerOverall, marketSalary, type Player } from '../../engine';
import { fitReport } from '../../game/fit';
import { FA_DAYS, draftDone, draftPlayer, freeAgencyDay, simDraft, startFreeAgency, startNewSeason, startOffseason } from '../../game/offseason';
import { potentialRange } from '../../game/scouting';
import { useCareer } from '../career-context';
import { Card, DraftMark, Ovr, PlayerPhoto, TeamBadge } from '../components';
import { money, seasonLabel } from '../format';
import { href, navigate } from '../router';
import { PageHeader } from '../Shell';
import { FitBadge } from './Scouting';

const STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'free-agency', label: 'Free agency' },
  { key: 'camp', label: 'New season' },
] as const;

export function Offseason() {
  const { save, update } = useCareer();
  const o = save.offseason;
  const [busy, setBusy] = useState(false);
  const act = (fn: () => void) => {
    setBusy(true);
    // Let the button show its busy state before the work runs.
    setTimeout(() => {
      try {
        fn();
      } finally {
        setBusy(false);
      }
    }, 20);
  };

  if (!o) {
    return (
      <>
        <PageHeader title="Offseason" subtitle={save.season.phase === 'done' ? 'The season is over' : 'Opens after the NBA Finals'} />
        <Card>
          {save.season.phase === 'done' ? (
            <>
              <p>The draft lottery is ready. Then free agency, then training camp and the {seasonLabel(save.league.meta.season + 1)} season.</p>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act(() => update((s) => startOffseason(s)))}>
                Go to the draft lottery
              </button>
            </>
          ) : (
            <p className="muted">Finish the season and the playoffs first.</p>
          )}
        </Card>
      </>
    );
  }

  const stage = o.stage;
  return (
    <>
      <PageHeader title={stage === 'draft' ? `${o.draftYear} Draft` : 'Free agency'} subtitle={`Offseason · ${seasonLabel(stage === 'draft' ? save.league.meta.season + 1 : save.league.meta.season)} league year`} />
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={s.key === stage ? 'on' : STEPS.findIndex((x) => x.key === stage) > i ? 'done' : ''}>
            {s.label}
          </li>
        ))}
      </ol>
      {stage === 'draft' ? <DraftRoom busy={busy} act={act} /> : <FreeAgency busy={busy} act={act} />}
    </>
  );
}

function DraftRoom({ busy, act }: { busy: boolean; act: (fn: () => void) => void }) {
  const { save, update } = useCareer();
  const o = save.offseason!;
  const me = save.career.teamId;
  const slot = o.order[o.onClock];
  const myTurn = slot?.teamId === me && !draftDone(save);
  const team = (id: string) => save.league.teams.find((t) => t.id === id);
  const myPicks = o.order.filter((s) => s.teamId === me && s.overall > (slot?.overall ?? 999) - 1);
  const pot = (p: Player) => {
    const [lo, hi] = potentialRange(save, p).map(displayRating) as [number, number];
    return lo === hi ? `${lo}` : `${lo}-${hi}`;
  };
  const board = [...o.prospects].sort((a, b) => (b.potential + playerOverall(b)) - (a.potential + playerOverall(a)));

  return (
    <>
      <section className="draft-clock">
        <DraftMark logo={save.league.meta.logo} year={o.draftYear} />
        {draftDone(save) ? (
          <div>
            <span className="label">Draft complete</span>
            <strong>All {o.made.length} picks are in.</strong>
          </div>
        ) : (
          <div>
            <span className="label">On the clock · pick {slot!.overall} (round {slot!.round})</span>
            <strong className="team-cell">
              {team(slot!.teamId) && <TeamBadge team={team(slot!.teamId)!} size={26} />} {myTurn ? 'You are on the clock' : team(slot!.teamId)?.name}
            </strong>
            <span className="muted small">{myPicks.length ? `Your picks: ${myPicks.map((s) => `#${s.overall}`).join(', ')}` : 'No more picks for you this year.'}</span>
          </div>
        )}
        <div className="draft-actions">
          {!draftDone(save) && !myTurn && (
            <button className="btn" type="button" disabled={busy} onClick={() => act(() => update((s) => simDraft(s, 'until-user')))}>
              Sim to my pick
            </button>
          )}
          {!draftDone(save) && (
            <button className="btn" type="button" disabled={busy} onClick={() => act(() => update((s) => simDraft(s, 'all')))}>
              {myPicks.length ? 'Auto-draft the rest' : 'Sim the rest'}
            </button>
          )}
          {draftDone(save) && (
            <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act(() => update((s) => startFreeAgency(s)))}>
              Start free agency
            </button>
          )}
        </div>
      </section>

      <div className="grid-2 draft-grid">
        <Card title={`Prospects (${o.prospects.length})`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num hide-sm">Rk</th>
                  <th>Prospect</th>
                  <th>Pos</th>
                  <th className="num">Age</th>
                  <th className="num">OVR</th>
                  <th className="num">POT</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {board.slice(0, 40).map((p, i) => (
                  <tr key={p.id}>
                    <td className="num muted hide-sm">{i + 1}</td>
                    <td>
                      <strong>{fullName(p)}</strong>
                      <span className="muted small"> · {p.college ?? p.born.country}</span>
                    </td>
                    <td>{p.position}</td>
                    <td className="num">{o.draftYear - p.born.year}</td>
                    <td className="num"><Ovr value={playerOverall(p)} /></td>
                    <td className="num muted">{pot(p)}</td>
                    <td>
                      <button className="btn btn-sm btn-primary" type="button" disabled={!myTurn || busy} onClick={() => act(() => update((s) => draftPlayer(s, p.id)))}>
                        Draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Draft board">
          <ol className="draft-board">
            {[...o.made].reverse().slice(0, 30).map((m) => {
              const p = save.league.players.find((x) => x.id === m.playerId);
              const t = team(m.teamId);
              return (
                <li key={m.overall} className={m.teamId === me ? 'mine' : ''}>
                  <span className="draft-no">{m.overall}</span>
                  {t && <TeamBadge team={t} size={22} />}
                  <span>
                    <strong>{p ? fullName(p) : '—'}</strong>
                    <span className="muted small"> · {p?.position} · OVR {p ? displayRating(playerOverall(p)) : ''}</span>
                  </span>
                </li>
              );
            })}
            {!o.made.length && <li className="muted">No picks yet.</li>}
          </ol>
        </Card>
      </div>
    </>
  );
}

function FreeAgency({ busy, act }: { busy: boolean; act: (fn: () => void) => void }) {
  const { save, update } = useCareer();
  const o = save.offseason!;
  const me = save.career.teamId;
  const year = save.league.meta.season;
  const mine = save.league.players.filter((p) => !p.teamId && o.birdRights[p.id] === me);
  const pool = save.league.players
    .filter((p) => !p.teamId && o.birdRights[p.id] !== me)
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .slice(0, 40);
  const roster = save.league.players.filter((p) => p.teamId === me && p.contract?.kind !== 'two-way').length;
  const ask = (p: Player) => marketSalary(save.league.settings, playerOverall(p), playerAge(p, year), p.experience);

  const row = (p: Player) => {
    const fit = fitReport(save, p);
    return (
      <tr key={p.id} onClick={() => navigate('c', save.id, 'player', p.id)}>
        <td>
          <a className="row-link" href={href('c', save.id, 'player', p.id)} onClick={(e) => e.stopPropagation()}>
            <span className="mini-face">
              <PlayerPhoto photo={p.photo} number={p.jersey} colors={{ primary: '#3b4150', secondary: '#c7cbd2' }} />
            </span>
            {fullName(p)}
          </a>
        </td>
        <td>{p.position}</td>
        <td className="num">{playerAge(p, year)}</td>
        <td className="num"><Ovr value={playerOverall(p)} /></td>
        <td className="num hide-sm">{money(ask(p))}</td>
        <td className="num"><FitBadge fit={fit} /></td>
      </tr>
    );
  };
  const head = (
    <thead>
      <tr>
        <th>Player</th>
        <th>Pos</th>
        <th className="num">Age</th>
        <th className="num">OVR</th>
        <th className="num hide-sm">Asks</th>
        <th className="num">Fit</th>
      </tr>
    </thead>
  );

  return (
    <>
      <section className="draft-clock">
        <div>
          <span className="label">Free agency · day {o.faDay} of {FA_DAYS}</span>
          <strong>{roster} of {save.league.settings.rosterMax} roster spots filled</strong>
          <span className="muted small">Tap a player to make an offer. Other teams sign players each day, and your own free agents start shopping around after day 3.</span>
        </div>
        <div className="draft-actions">
          {o.faDay < FA_DAYS ? (
            <button className="btn" type="button" disabled={busy} onClick={() => act(() => update((s) => freeAgencyDay(s)))}>
              Next day
            </button>
          ) : null}
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act(() => {
              update((s) => startNewSeason(s));
              navigate('c', save.id, 'home');
            })}>
            {o.faDay < FA_DAYS ? 'Skip to the new season' : `Start the ${seasonLabel(year)} season`}
          </button>
        </div>
      </section>
      {mine.length > 0 && (
        <Card title="Your free agents (Bird rights)">
          <p className="muted small">You can go over the cap to re-sign these players.</p>
          <div className="table-wrap">
            <table className="table">
              {head}
              <tbody>{mine.map(row)}</tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title="Best available">
        <div className="table-wrap">
          <table className="table">
            {head}
            <tbody>{pool.map(row)}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
