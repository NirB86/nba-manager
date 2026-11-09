import {
  CAP_STATUS_LABEL,
  capStatus,
  fullName,
  playerOverall,
  displayRating,
  projectedCba,
  rosterOf,
  salaryIn,
  teamPayroll,
  type CapStatus,
  type CbaSettings,
} from '../../engine';
import { useState } from 'react';
import { useCareer } from '../career-context';
import { ARENA_CAPACITY, demand, financeView, luxuryTaxBill, ownerBudget, profit, revenue, type SeasonLedger } from '../../game/finance';
import { Card, DraftMark, Pill, Stat } from '../components';
import { money, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';

const STATUS_TONE: Record<CapStatus, 'good' | 'neutral' | 'warn' | 'bad'> = {
  'under-cap': 'good',
  'over-cap': 'neutral',
  taxpayer: 'warn',
  'first-apron': 'bad',
  'second-apron': 'bad',
};

/** Payroll against the four cap lines, on one horizontal scale. */
function CapMeter({ cba, payroll }: { cba: CbaSettings; payroll: number }) {
  // Start the scale at half the cap so the lines near the top are readable.
  const min = Math.min(cba.salaryCap * 0.5, payroll * 0.9);
  const max = Math.max(cba.secondApron * 1.08, payroll * 1.04);
  const pct = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const status = capStatus(cba, payroll);
  const lines = [
    { key: 'cap', label: 'Salary cap', value: cba.salaryCap },
    { key: 'tax', label: 'Luxury tax', value: cba.luxuryTax },
    { key: 'a1', label: '1st apron', value: cba.firstApron },
    { key: 'a2', label: '2nd apron', value: cba.secondApron },
  ];
  return (
    <div className="cap-meter">
      <div className="cap-track" role="img" aria-label={`Payroll ${money(payroll)}: ${CAP_STATUS_LABEL[status]}`}>
        <div className={`cap-fill status-${STATUS_TONE[status]}`} style={{ width: pct(payroll) }} title={`Payroll ${money(payroll)}`} />
        {lines.map((l, i) => (
          <div key={l.key} className="cap-line" style={{ left: pct(l.value) }} title={`${l.label}: ${money(l.value)}`}>
            <span className="cap-line-num">{i + 1}</span>
          </div>
        ))}
      </div>
      <ul className="cap-legend">
        {lines.map((l, i) => {
          const diff = l.value - payroll;
          return (
            <li key={l.key}>
              <span className="cap-line-num">{i + 1}</span>
              <span>
                <strong>{l.label}</strong> {money(l.value)}
                <br />
                <span className={diff >= 0 ? 'muted' : 'over'}>{diff >= 0 ? `${money(diff)} under` : `${money(-diff)} over`}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Finances() {
  const { save } = useCareer();
  const { league } = save;
  const teamId = save.career.teamId;
  const season = league.meta.season;
  const seasons = [season, season + 1, season + 2, season + 3];
  const cba = league.settings;
  const payroll = teamPayroll(league, teamId, season);
  const status = capStatus(cba, payroll);
  const roster = rosterOf(league, teamId).sort((a, b) => salaryIn(b, season) - salaryIn(a, season));
  const picks = league.draftPicks.filter((p) => p.ownerTeamId === teamId);

  const room = cba.salaryCap - payroll;
  const toTax = cba.luxuryTax - payroll;
  const toApron = cba.secondApron - payroll;

  return (
    <>
      <PageHeader title="Finances" subtitle={`Cap sheet · ${seasonLabel(season)}`} />
      <div className="stats-row">
        <Stat label="Payroll" value={money(payroll)} hint={<Pill tone={STATUS_TONE[status]}>{CAP_STATUS_LABEL[status]}</Pill>} />
        <Stat label={room >= 0 ? 'Cap space' : 'Over the cap by'} value={money(Math.abs(room))} />
        <Stat label={toTax >= 0 ? 'Room under the tax' : 'Over the tax by'} value={money(Math.abs(toTax))} />
        <Stat label={toApron >= 0 ? 'Room under 2nd apron' : 'Over 2nd apron by'} value={money(Math.abs(toApron))} />
      </div>

      <ClubBooks />

      <Card title="Payroll against the cap lines">
        <CapMeter cba={cba} payroll={payroll} />
      </Card>

      <Card title="Contracts">
        <div className="table-wrap">
          <table className="table capsheet">
            <thead>
              <tr>
                <th>Player</th>
                {seasons.map((s) => (
                  <th key={s} className="num">
                    {seasonLabel(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a className="row-link" href={href('c', save.id, 'player', p.id)}>
                      {fullName(p)}
                    </a>
                    <span className="muted small"> · {displayRating(playerOverall(p))}</span>
                  </td>
                  {seasons.map((s) => {
                    const v = salaryIn(p, s);
                    const opt = p.contract?.option?.season === s ? p.contract.option.type : null;
                    return (
                      <td key={s} className={`num ${opt ? 'opt' : ''}`}>
                        {v ? money(v) : ''}
                        {opt && <span className="opt-tag">{opt === 'player' ? 'PO' : 'TO'}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {(league.deadMoney ?? [])
                .filter((d) => d.teamId === teamId && d.years.some((y) => seasons.includes(y.season)))
                .map((d) => (
                  <tr key={`dead-${d.playerId}`} className="dead-row">
                    <td>
                      {d.name} <span className="muted small">· waived (dead money)</span>
                    </td>
                    {seasons.map((s) => {
                      const v = d.years.find((y) => y.season === s)?.salary ?? 0;
                      return (
                        <td key={s} className="num">
                          {v ? money(v) : ''}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total committed</th>
                {seasons.map((s) => (
                  <th key={s} className="num">
                    {money(teamPayroll(league, teamId, s))}
                  </th>
                ))}
              </tr>
              <tr className="muted">
                <td>Salary cap (projected)</td>
                {seasons.map((s, i) => (
                  <td key={s} className="num">
                    {money(projectedCba(cba, i).salaryCap)}
                  </td>
                ))}
              </tr>
              <tr className="muted">
                <td>Luxury tax (projected)</td>
                {seasons.map((s, i) => (
                  <td key={s} className="num">
                    {money(projectedCba(cba, i).luxuryTax)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="muted small">PO = player option, TO = team option. Future cap lines assume {Math.round(cba.capGrowth * 100)}% growth a year.</p>
      </Card>

      <Card title="Draft picks owned" action={<DraftMark logo={league.meta.logo} year={season + 1} />}>
        <ul className="picks">
          {picks
            .sort((a, b) => a.season - b.season || a.round - b.round)
            .map((pk) => {
              const from = league.teams.find((t) => t.id === pk.originalTeamId);
              return (
                <li key={pk.id}>
                  <strong>{pk.season}</strong> {pk.round === 1 ? '1st' : '2nd'} round
                  {pk.originalTeamId !== teamId && from && <span className="muted"> · via {from.abbrev}</span>}
                  {pk.protection && <Pill tone="accent">{pk.protection}</Pill>}
                </li>
              );
            })}
        </ul>
        <OwedPicks />
      </Card>
    </>
  );
}

function OwedPicks() {
  const { save } = useCareer();
  const { league } = save;
  const owed = league.draftPicks.filter((p) => p.originalTeamId === save.career.teamId && p.ownerTeamId !== save.career.teamId);
  if (!owed.length) return <p className="muted small">You own all of your own picks.</p>;
  return (
    <p className="muted small">
      Owed to other teams:{' '}
      {owed
        .map((p) => `${p.season} ${p.round === 1 ? '1st' : '2nd'} to ${league.teams.find((t) => t.id === p.ownerTeamId)?.abbrev ?? '?'}${p.protection ? ` (${p.protection.toLowerCase()})` : ''}`)
        .join(' · ')}
    </p>
  );
}

const m = (v: number) => `${v < 0 ? '−' : ''}$${(Math.abs(v) / 1e6).toFixed(1)}M`;

/** Season books, ticket pricing, the owner's budget and confidence. */
function ClubBooks() {
  const { save, update } = useCareer();
  const f = financeView(save);
  const l = f.ledger;
  const me = save.career.teamId;
  const payroll = teamPayroll(save.league, me, save.league.meta.season);
  const budget = ownerBudget(save);
  const tax = luxuryTaxBill(save.league.settings, payroll);
  const [price, setPrice] = useState(f.ticketPrice);
  const fill = demand(save, price);
  const crowd = Math.round(ARENA_CAPACITY * fill);
  const conf = f.confidence;
  const confTone = conf >= 70 ? 'good' : conf >= 45 ? 'neutral' : conf >= 25 ? 'warn' : 'bad';
  const setTicket = (v: number) => {
    if (v === f.ticketPrice) return;
    update((s) => {
      const fin = structuredClone(financeView(s));
      fin.ticketPrice = v;
      return { ...s, finance: fin };
    });
  };
  const rows: [string, number][] = [
    ['Tickets', l.tickets],
    ['Playoff gates', l.playoffs],
    ['Media rights', l.media],
    ['Merchandise', l.merch],
  ];
  const costs: [string, number][] = [
    ['Player salaries', l.payroll],
    ['Luxury tax', l.tax],
    ['Operations', l.ops ?? 0],
  ];
  return (
    <>
      <div className="stats-row">
        <Stat label="Owner confidence" value={`${Math.round(conf)}`} hint={<Pill tone={confTone}>{conf >= 70 ? 'Secure' : conf >= 45 ? 'Stable' : conf >= 25 ? 'Under pressure' : 'Job at risk'}</Pill>} />
        <Stat label="Profit this season" value={m(profit(l))} hint={<span className="muted small">{l.homeGames} home games</span>} />
        <Stat label="Owner payroll budget" value={money(budget)} hint={<Pill tone={payroll > budget * 1.02 ? 'bad' : 'good'}>{payroll > budget * 1.02 ? `${money(payroll - budget)} over` : 'Within budget'}</Pill>} />
        <Stat label="Projected tax bill" value={tax ? m(tax) : 'None'} />
      </div>
      <div className="books-grid">
        <Card title={`Books · ${seasonLabel(l.season)}`}>
          <table className="table compact books">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{m(v)}</td>
                </tr>
              ))}
              <tr className="sum">
                <th>Revenue</th>
                <th className="num">{m(revenue(l))}</th>
              </tr>
              {costs.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{v ? m(-v) : '—'}</td>
                </tr>
              ))}
              <tr className={`sum ${profit(l) < 0 ? 'loss' : 'gain'}`}>
                <th>Profit</th>
                <th className="num">{m(profit(l))}</th>
              </tr>
            </tbody>
          </table>
          <p className="muted small">The tax bill is assessed on the payroll at the end of the regular season. Losing money and going over the owner's budget cost you confidence.</p>
        </Card>
        <Card title="Ticket prices">
          <label className="ticket-price">
            <span>
              Average ticket <strong>${price}</strong>
            </span>
            <input type="range" min={40} max={300} step={5} value={price} onChange={(e) => setPrice(Number(e.target.value))} onPointerUp={() => setTicket(price)} onKeyUp={() => setTicket(price)} onBlur={() => setTicket(price)} />
          </label>
          <div className="ticket-proj">
            <span>
              Expected crowd <strong>{crowd.toLocaleString()}</strong> / {ARENA_CAPACITY.toLocaleString()} ({Math.round(fill * 100)}%)
            </span>
            <span>
              Gate per game <strong>{m(crowd * price)}</strong>
            </span>
          </div>
          <div className="crowd-bar" aria-hidden>
            <i style={{ width: `${Math.round(fill * 100)}%` }} />
          </div>
          <p className="muted small">
            Winning and stars fill the building; high prices empty it. Playoff tickets sell at 1.6× this price.
            {l.homeGames ? ` Average crowd so far: ${Math.round(l.attendance / l.homeGames).toLocaleString()}.` : ''}
          </p>
        </Card>
      </div>
      {f.history.length > 0 && <BooksHistory history={f.history} />}
    </>
  );
}

function BooksHistory({ history }: { history: SeasonLedger[] }) {
  return (
    <Card title="Past seasons">
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr>
              <th>Season</th>
              <th className="num">Revenue</th>
              <th className="num hide-sm">Salaries</th>
              <th className="num hide-sm">Tax</th>
              <th className="num">Profit</th>
              <th className="num hide-sm">Avg crowd</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((l) => (
              <tr key={l.season}>
                <td>{seasonLabel(l.season)}</td>
                <td className="num">{m(revenue(l))}</td>
                <td className="num hide-sm">{m(l.payroll)}</td>
                <td className="num hide-sm">{l.tax ? m(l.tax) : '—'}</td>
                <td className={`num ${profit(l) < 0 ? 'over' : ''}`}>{m(profit(l))}</td>
                <td className="num hide-sm">{l.homeGames ? Math.round(l.attendance / l.homeGames).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
