import { useState } from 'react';
import { fullName, type Player } from '../../engine';
import { acceptCounter, evaluateOffer, makeOffer, negotiation, type Offer } from '../../game/contracts';
import { useCareer } from '../career-context';
import { Card } from '../components';
import { money, seasonLabel } from '../format';

const pctText = (p: number) => `${Math.round(p * 100)}%`;
const STEP = 100_000;

/** Offer an extension (own player) or a contract (free agent), with his chance of signing. */
export function ContractOffer({ player, onDone }: { player: Player; onDone: () => void }) {
  const { save, update } = useCareer();
  const elig = negotiation(save, player);
  const start = elig.ok ? elig.negotiation.ask : { salary: 0, years: 1, option: 'none' as const };
  const [offer, setOffer] = useState<Offer>(() => ({ ...start, salary: elig.ok && elig.negotiation.budget ? Math.min(start.salary, elig.negotiation.budget.limit) : start.salary }));
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [counter, setCounter] = useState<Offer | null>(null);

  if (!elig.ok) {
    return (
      <Card title="Contract" className="contract-offer">
        {result?.ok ? (
          <div className="notice" style={{ borderLeftColor: 'var(--good)' }}>
            {result.text}
          </div>
        ) : (
          <p className="muted">{elig.reason}</p>
        )}
      </Card>
    );
  }
  const n = elig.negotiation;
  const verdict = evaluateOffer(save, player, n, offer);
  const tone = verdict.chance >= 0.6 ? 'var(--good)' : verdict.chance >= 0.3 ? 'var(--warn)' : 'var(--bad)';
  const describe = (o: Offer) => `${o.years} yr${o.years > 1 ? 's' : ''} · ${money(o.salary)} a year to start${o.option !== 'none' ? ` · ${o.option} option` : ''}`;
  const lastSeason = n.firstSeason + offer.years - 1;

  const submit = () => {
    const r = makeOffer(save, player.id, offer);
    update(() => r.save);
    if (r.signed) {
      setResult({ ok: true, text: `${fullName(player)} signed: ${describe(offer)}.` });
      setCounter(null);
      onDone();
    } else {
      setCounter(r.counter);
      setResult({ ok: false, text: `${player.lastName} turned it down. His agent sent a counter offer.` });
    }
  };
  const takeCounter = (c: Offer) => {
    update((s) => acceptCounter(s, player.id, c));
    setResult({ ok: true, text: `${fullName(player)} signed: ${describe(c)}.` });
    setCounter(null);
    onDone();
  };

  return (
    <Card title={n.kind === 'extension' ? `Extension for ${player.lastName}` : `Sign ${player.lastName}`} className="contract-offer">
      {result && (
        <div className="notice" style={{ borderLeftColor: result.ok ? 'var(--good)' : 'var(--bad)' }}>
          {result.text}
        </div>
      )}
      {counter && (
        <div className="counter-box">
          <span className="label">His counter offer</span>
          <strong>{describe(counter)}</strong>
          <div className="counter-actions">
            <button className="btn btn-primary" type="button" onClick={() => takeCounter(counter)}>
              Accept counter
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setCounter(null)}>
              Decline
            </button>
          </div>
        </div>
      )}
      <p className="muted small">
        His agent asks for about <strong>{describe(n.ask)}</strong>.{' '}
        {n.kind === 'extension' ? `The new deal starts in ${seasonLabel(n.firstSeason)}, after his current one.` : n.budget ? `You can pay up to ${money(n.budget.limit)} (${n.budget.how}).` : ''}
      </p>
      <div className="offer-form">
        <label>
          <span className="label">First-year salary</span>
          <span className="offer-salary">
            <button type="button" className="btn" aria-label="Lower" onClick={() => setOffer((o) => ({ ...o, salary: Math.max(n.minSalary, o.salary - STEP * 5) }))}>
              −
            </button>
            <strong>{money(offer.salary)}</strong>
            <button type="button" className="btn" aria-label="Raise" onClick={() => setOffer((o) => ({ ...o, salary: Math.min(n.budget ? Math.min(n.maxSalary, n.budget.limit) : n.maxSalary, o.salary + STEP * 5) }))}>
              +
            </button>
          </span>
          <input
            type="range"
            min={n.minSalary}
            max={n.budget ? Math.max(n.minSalary, Math.min(n.maxSalary, n.budget.limit)) : n.maxSalary}
            step={STEP}
            value={offer.salary}
            onChange={(e) => setOffer((o) => ({ ...o, salary: Number(e.target.value) }))}
            aria-label="First-year salary"
          />
        </label>
        <label>
          <span className="label">Years</span>
          <select className="input" value={offer.years} onChange={(e) => setOffer((o) => ({ ...o, years: Number(e.target.value) }))}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y} season{y > 1 ? 's' : ''} (through {seasonLabel(n.firstSeason + y - 1)})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Option in {seasonLabel(lastSeason)}</span>
          <select className="input" value={offer.option} onChange={(e) => setOffer((o) => ({ ...o, option: e.target.value as Offer['option'] }))} disabled={offer.years < 2}>
            <option value="none">No option</option>
            <option value="player">Player option (he likes it)</option>
            <option value="team">Team option (he doesn't)</option>
          </select>
        </label>
      </div>
      <div className="offer-verdict">
        <div className="chance-row">
          <span className="label">Chance he signs</span>
          <strong className="chance-big" style={{ color: verdict.valid ? tone : 'var(--text-3)' }}>
            {verdict.valid ? pctText(verdict.chance) : '—'}
          </strong>
        </div>
        <div className="warmth" aria-hidden="true">
          <span style={{ width: `${verdict.valid ? verdict.chance * 100 : 0}%`, background: tone }} />
        </div>
        <p className="small">{verdict.valid ? verdict.message : verdict.problem}</p>
      </div>
      <button className="btn btn-primary" type="button" disabled={!verdict.valid || n.waitUntilNextDay} onClick={submit}>
        {n.waitUntilNextDay ? 'He wants to wait until after the next game' : n.kind === 'extension' ? 'Offer extension' : 'Offer contract'}
      </button>
    </Card>
  );
}
