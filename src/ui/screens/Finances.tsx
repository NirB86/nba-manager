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
import { useCareer } from '../career-context';
import { Card, Pill, Stat } from '../components';
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

      <Card title="Draft picks owned">
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
