import { useState } from 'react';
import { displayRating, playerOverall, salaryIn, type TradeMove } from '../../engine';
import { answerOffer } from '../../game/market';
import { assetLabel, evaluateDeal } from '../../game/trades';
import { useCareer } from '../career-context';
import { Card, PlayerPhoto, TeamBadge } from '../components';
import { money } from '../format';
import { href } from '../router';

/** A trade offer from an AI team: what you give, what you get, and your answer. */
export function OfferCard({ offerId }: { offerId: string }) {
  const { save, update } = useCareer();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const offer = save.season.offers?.find((o) => o.id === offerId);
  if (!offer) return null;
  const me = save.career.teamId;
  const from = save.league.teams.find((t) => t.id === offer.fromTeam);
  const season = save.league.meta.season;
  const expired = offer.status === 'open' && offer.expiresDay < save.season.day;
  const status = expired ? 'expired' : offer.status;
  const check = evaluateDeal(save, offer.deal).check;

  const row = (m: TradeMove) => {
    const p = m.kind === 'player' ? save.league.players.find((x) => x.id === m.id) : undefined;
    const t = save.league.teams.find((x) => x.id === m.from);
    return (
      <li key={m.id} className="offer-asset">
        {p ? (
          <>
            <span className="mini-face">
              <PlayerPhoto photo={p.photo} number={p.jersey} colors={t?.colors ?? { primary: '#333', secondary: '#ccc' }} />
            </span>
            <a href={href('c', save.id, 'player', p.id)}>{assetLabel(save, m)}</a>
            <span className="muted small">
              {p.position} · OVR {displayRating(playerOverall(p))} · {money(salaryIn(p, season))}
            </span>
          </>
        ) : (
          <span>{assetLabel(save, m)}</span>
        )}
      </li>
    );
  };

  const answer = (accept: boolean) => {
    const r = answerOffer(save, offerId, accept);
    update(() => r.save);
    setResult({ ok: r.ok, text: r.message });
  };

  return (
    <Card title={<span className="team-cell">{from && <TeamBadge team={from} size={22} />} Offer from the {from?.name}</span>} className="offer-card">
      {result && (
        <div className="notice" style={{ borderLeftColor: result.ok ? 'var(--good)' : 'var(--bad)' }}>
          {result.text} {result.ok && status === 'accepted' && <a href={href('c', save.id, 'roster')}>See roster ›</a>}
        </div>
      )}
      <div className="offer-sides">
        <div>
          <span className="label">You get</span>
          <ul>{offer.deal.moves.filter((m) => m.to === me).map(row)}</ul>
        </div>
        <div>
          <span className="label">You give</span>
          <ul>{offer.deal.moves.filter((m) => m.from === me).map(row)}</ul>
        </div>
      </div>
      <p className="small muted">
        Salary in {money(check.salaryIn[me] ?? 0)} · out {money(check.salaryOut[me] ?? 0)}
        {status === 'open' ? ` · stands until day ${offer.expiresDay + 1}` : ''}
      </p>
      {status === 'open' ? (
        <div className="counter-actions">
          <button className="btn btn-primary" type="button" onClick={() => answer(true)} disabled={!check.valid}>
            Accept
          </button>
          <a className="btn" href={href('c', save.id, 'trade', 'offer', offer.id)}>
            Counter
          </a>
          <button className="btn btn-ghost" type="button" onClick={() => answer(false)}>
            Decline
          </button>
        </div>
      ) : (
        <p className="strap black" style={{ display: 'inline-block' }}>
          {status === 'accepted' ? 'Accepted' : status === 'declined' ? 'Declined' : 'Expired'}
        </p>
      )}
    </Card>
  );
}
