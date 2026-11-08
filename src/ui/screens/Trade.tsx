import { useEffect, useMemo, useRef, useState } from 'react';
import { CAP_STATUS_LABEL, capStatus, playerAge, playerOverall, rosterOf, salaryIn, teamName, teamPayroll, type DraftPick, type MultiTrade, type TradeMove } from '../../engine';
import { acceptCounter, assetLabel, counterOffer, evaluateDeal, proposeDeal, tradeDeadlineDay, tradesOpen, type Counter } from '../../game/trades';
import { useCareer } from '../career-context';
import { Card, Ovr, PlayerPhoto, TeamBadge } from '../components';
import { money } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';

const MAX_PARTNERS = 3;
const pctText = (p: number) => `${Math.round(p * 100)}%`;

export function Trade({ teamId, playerId }: { teamId?: string; playerId?: string }) {
  const { save, update } = useCareer();
  const { league } = save;
  const me = save.career.teamId;
  const season = league.meta.season;
  const status = tradesOpen(save);
  // From an offer in the inbox: start from the AI team's offer to counter it.
  const fromOffer = teamId === 'offer' ? save.season.offers?.find((o) => o.id === playerId) : undefined;
  const firstPartner = fromOffer ? fromOffer.fromTeam : teamId && teamId !== me && teamId !== 'offer' ? teamId : null;
  const [partners, setPartners] = useState<string[]>(firstPartner ? [firstPartner] : []);
  // From a player page: their player (with the team) or one of ours (partner chosen next).
  const [moves, setMoves] = useState<TradeMove[]>(
    fromOffer
      ? fromOffer.deal.moves
      : playerId
        ? firstPartner
          ? [{ kind: 'player', id: playerId, from: firstPartner, to: me }]
          : teamId === me
            ? [{ kind: 'player', id: playerId, from: me, to: me }]
            : []
        : [],
  );
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [counter, setCounter] = useState<Counter | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  // Answers and counter offers appear above the builder: bring them into view.
  useEffect(() => {
    if (result || counter) topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result, counter]);

  const teams = [me, ...partners];
  const deal: MultiTrade = { teams, moves: moves.filter((m) => teams.includes(m.from) && teams.includes(m.to)) };
  const verdict = useMemo(() => evaluateDeal(save, deal), [save, partners, moves]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = (id: string) => league.teams.find((t) => t.id === id);
  const available = league.teams.filter((t) => !teams.includes(t.id)).sort((a, b) => a.city.localeCompare(b.city));

  const defaultTo = (from: string) => (from === me ? (partners[0] ?? me) : me);
  const toggle = (kind: TradeMove['kind'], id: string, from: string) => {
    setResult(null);
    setCounter(null);
    setMoves((list) => (list.some((m) => m.id === id) ? list.filter((m) => m.id !== id) : [...list, { kind, id, from, to: defaultTo(from) }]));
  };
  const setDestination = (id: string, to: string) => setMoves((list) => list.map((m) => (m.id === id ? { ...m, to } : m)));
  const addPartner = (id: string) => {
    if (!id || partners.length >= MAX_PARTNERS) return;
    setResult(null);
    setPartners((p) => [...p, id]);
    // A player of ours picked before any partner goes to the first team added.
    setMoves((list) => list.map((m) => (m.from === m.to ? { ...m, to: id } : m)));
  };
  const removePartner = (id: string) => {
    setResult(null);
    setPartners((p) => p.filter((x) => x !== id));
    setMoves((list) => list.filter((m) => m.from !== id && m.to !== id).map((m) => (m.to === id ? { ...m, to: defaultTo(m.from) } : m)));
  };

  const propose = () => {
    const outcome = proposeDeal(save, deal);
    update(() => outcome.save);
    if (outcome.accepted) {
      setResult({ ok: true, text: 'Trade completed. The new players are on your roster.' });
      setMoves([]);
      setCounter(null);
    } else {
      const who = team(outcome.refusedBy)?.name ?? 'other team';
      setCounter(outcome.counter);
      setResult({ ok: false, text: outcome.counter ? `The ${who} said no, but they sent a counter offer.` : `The ${who} said no. Change the offer or try again after the next game.` });
    }
  };
  /** Ask the other teams what it would take, without making the offer. */
  const askCounter = () => {
    const c = counterOffer(save, deal);
    setCounter(c);
    setResult(c ? null : { ok: false, text: 'They have no counter: this offer already works for them, or no small change would.' });
  };
  const takeCounter = (c: Counter) => {
    const next = acceptCounter(save, c);
    if (!next) {
      setCounter(null);
      setResult({ ok: false, text: 'That counter offer is no longer valid.' });
      return;
    }
    update(() => next);
    setCounter(null);
    setMoves([]);
    setResult({ ok: true, text: 'Counter offer accepted. Trade completed.' });
  };
  /** Counter back: load their version into the builder to change it. */
  const editCounter = (c: Counter) => {
    setPartners(c.deal.teams.filter((t) => t !== me));
    setMoves(c.deal.moves);
    setCounter(null);
    setResult({ ok: true, text: 'Their counter is loaded below. Change it and propose your own version.' });
  };

  const picksOf = (id: string) => league.draftPicks.filter((k) => k.ownerTeamId === id).sort((a, b) => a.season - b.season || a.round - b.round);
  const pickLabel = (k: DraftPick) => `${k.season} ${k.round === 1 ? '1st' : '2nd'}${k.originalTeamId !== k.ownerTeamId ? ` (${team(k.originalTeamId)?.abbrev})` : ''}${k.protection ? ` · ${k.protection}` : ''}`;
  const after = teamPayroll(league, me, season) - (verdict.check.salaryOut[me] ?? 0) + (verdict.check.salaryIn[me] ?? 0);
  const canPropose = status.open && verdict.check.valid && moves.length > 0 && !verdict.blocked && verdict.answers.length === partners.length && partners.length > 0;
  const chanceTone = verdict.chance >= 0.6 ? 'var(--good)' : verdict.chance >= 0.3 ? 'var(--warn)' : 'var(--bad)';

  const destinationPicker = (m: TradeMove) =>
    teams.length > 2 ? (
      <select className="dest" value={m.to} onClick={(e) => e.stopPropagation()} onChange={(e) => setDestination(m.id, e.target.value)} aria-label="Send to">
        {teams
          .filter((t) => t !== m.from)
          .map((t) => (
            <option key={t} value={t}>
              → {team(t)?.abbrev}
            </option>
          ))}
      </select>
    ) : null;

  return (
    <>
      <PageHeader title="Trade" subtitle={status.open ? `Trade deadline in ${status.daysLeft} day${status.daysLeft === 1 ? '' : 's'} (day ${tradeDeadlineDay(save) + 1})` : status.reason} />
      <div ref={topRef} className="scroll-anchor" />
      {result && (
        <div className="notice" style={{ borderLeftColor: result.ok ? 'var(--good)' : 'var(--bad)' }}>
          {result.text} {result.ok && <a href={href('c', save.id, 'roster')}>See roster ›</a>}
        </div>
      )}
      {counter && status.open && (
        <Card
          title={
            <span className="team-cell">
              {team(counter.by) && <TeamBadge team={team(counter.by)!} size={22} />} Counter offer from the {team(counter.by)?.name}
            </span>
          }
          className="counter-card"
        >
          <ul className="counter-changes">
            {counter.changes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="counter-deal">
            {counter.deal.teams.map((tid) => {
              const got = counter.deal.moves.filter((m) => m.to === tid);
              return (
                <div key={tid}>
                  <span className="label">{tid === me ? 'You get' : `${team(tid)?.abbrev} get`}</span>
                  <span>{got.map((m) => assetLabel(save, m)).join(', ') || 'nothing'}</span>
                </div>
              );
            })}
          </div>
          <div className="counter-actions">
            <button className="btn btn-primary" type="button" onClick={() => takeCounter(counter)}>
              Accept counter
            </button>
            <button className="btn" type="button" onClick={() => editCounter(counter)}>
              Counter back
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setCounter(null)}>
              Decline
            </button>
          </div>
        </Card>
      )}
      {!status.open ? (
        <Card>
          <p>{status.reason}</p>
        </Card>
      ) : (
        <>
          <div className="partner-row">
            {partners.map((id) => {
              const t = team(id);
              return t ? (
                <span key={id} className="partner-chip">
                  <TeamBadge team={t} size={20} /> {t.name}
                  <button type="button" aria-label={`Remove the ${t.name}`} onClick={() => removePartner(id)}>
                    ×
                  </button>
                </span>
              ) : null;
            })}
            {partners.length < MAX_PARTNERS && (
              <select className="input partner-add" value="" onChange={(e) => addPartner(e.target.value)} aria-label="Add a team to the trade">
                <option value="">{partners.length ? '+ Add another team' : '+ Choose a team to trade with'}</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {teamName(t)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {partners.length === 0 && moves.length > 0 && (
            <p className="notice">Choose a team to trade {league.players.find((x) => x.id === moves[0]!.id)?.lastName ?? 'him'} to.</p>
          )}
          {partners.length > 1 && <p className="muted small" style={{ marginBottom: 12 }}>Multi-team deal: pick where each player or pick goes with the arrow menu next to it.</p>}

          {partners.length > 0 && (
            <div className={`trade-grid teams-${teams.length}`}>
              {teams.map((tid) => {
                const t = team(tid);
                const colors = t?.colors ?? { primary: '#333', secondary: '#ccc' };
                const answer = verdict.answers.find((a) => a.teamId === tid);
                return (
                  <Card
                    key={tid}
                    title={
                      <span className="team-cell">
                        {t && <TeamBadge team={t} size={22} />} {tid === me ? 'Your team' : t?.name}
                      </span>
                    }
                    action={answer ? <span className="chance-chip">{pctText(answer.chance)}</span> : null}
                  >
                    {answer && <p className="small muted" style={{ marginBottom: 8 }}>{answer.message}</p>}
                    <ul className="trade-list">
                      {rosterOf(league, tid).map((p) => {
                        const move = moves.find((m) => m.id === p.id);
                        return (
                          <li key={p.id}>
                            <label className={`trade-item ${move ? 'on' : ''}`}>
                              <input type="checkbox" checked={!!move} onChange={() => toggle('player', p.id, tid)} />
                              <span className="mini-face">
                                <PlayerPhoto photo={p.photo} number={p.jersey} colors={colors} />
                              </span>
                              <span className="trade-name">
                                <strong>{`${p.firstName.charAt(0)}. ${p.lastName}`}</strong>
                                <span className="muted small">
                                  {p.position} · {playerAge(p, season)} · {money(salaryIn(p, season))}
                                  {p.contract?.kind === 'two-way' ? ' · two-way' : ''}
                                  {p.contract?.noTrade ? ' · no-trade' : ''}
                                </span>
                              </span>
                              {move && destinationPicker(move)}
                              <Ovr value={playerOverall(p)} />
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <h3 style={{ margin: '14px 0 6px' }}>Draft picks</h3>
                    <div className="pick-chips">
                      {picksOf(tid).map((k) => {
                        const move = moves.find((m) => m.id === k.id);
                        return (
                          <span key={k.id} className={`pick-chip ${move ? 'on' : ''}`}>
                            <button type="button" onClick={() => toggle('pick', k.id, tid)}>
                              {pickLabel(k)}
                            </button>
                            {move && destinationPicker(move)}
                          </span>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {partners.length > 0 && (
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
                <div className="chance-row">
                  <span className="label">Success chance</span>
                  <strong className="chance-big" style={{ color: verdict.check.valid && moves.length ? chanceTone : 'var(--text-3)' }}>
                    {verdict.check.valid && moves.length ? pctText(verdict.chance) : '—'}
                  </strong>
                </div>
                <div className="warmth" aria-hidden="true">
                  <span style={{ width: `${verdict.check.valid ? verdict.chance * 100 : 0}%`, background: chanceTone }} />
                </div>
                <p>{verdict.message}</p>
              </div>
              <div className="trade-actions">
                <button className="btn" type="button" disabled={!canPropose || verdict.chance >= 0.7} onClick={askCounter} title="Ask what it would take">
                  What would it take?
                </button>
                <button className="btn btn-primary" type="button" disabled={!canPropose} onClick={propose}>
                  Propose trade
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
