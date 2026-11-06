import { CAP_STATUS_LABEL, capStatus, fullName, playerAge, playerOverall, rosterOf, teamName, teamPayroll, teamRating } from '../../engine';
import { ownerExpectation } from '../../game/career';
import { dateLabel } from '../../game/advance';
import { ContinueControls, SeasonCards, recordOf } from './Season';
import { useCareer } from '../career-context';
import { Card, Ovr, Pill, Stat } from '../components';
import { money, ordinal, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';

export function Home({ messageId }: { messageId?: string }) {
  const { save, update } = useCareer();
  const { league, career } = save;
  const team = league.teams.find((t) => t.id === career.teamId);
  if (!team) return null;
  const season = league.meta.season;
  const roster = rosterOf(league, team.id);
  const payroll = teamPayroll(league, team.id, season);
  const status = capStatus(league.settings, payroll);
  const exp = ownerExpectation(league, team.id);
  const open = save.inbox.find((m) => m.id === messageId);

  const markRead = (id: string) =>
    update((s) => ({ ...s, inbox: s.inbox.map((m) => (m.id === id ? { ...m, read: true } : m)) }));

  if (open) {
    if (!open.read) queueMicrotask(() => markRead(open.id));
    return (
      <>
        <PageHeader title={open.subject} subtitle={`${open.from} · ${open.date}`} back={href('c', save.id, 'home')} />
        <Card>
          <p className="message-body">{open.body}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={teamName(team)}
        subtitle={`${seasonLabel(season)} · ${dateLabel(save.season)}`}
      />
      <ContinueControls />
      <SeasonCards />

      <div className="stats-row">
        <Stat label="Team rating" value={<Ovr value={teamRating(league, team.id)} label="Team rating" />} hint={`${ordinal(exp.rank)} of ${league.teams.length}`} />
        <Stat label="Record" value={recordOf(save, team.id)} hint={dateLabel(save.season)} />
        <Stat label="Payroll" value={money(payroll)} hint={CAP_STATUS_LABEL[status]} />
        <Stat label="Owner's goal" value={<span className="stat-text">{exp.goal}</span>} />
      </div>

      <div className="grid-2">
        <Card title="Inbox" action={<Pill tone="accent">{save.inbox.filter((m) => !m.read).length} new</Pill>}>
          <ul className="inbox">
            {save.inbox.map((m) => (
              <li key={m.id} className={m.read ? '' : 'unread'}>
                <a href={href('c', save.id, 'home', m.id)}>
                  <span className="inbox-from">{m.from}</span>
                  <span className="inbox-subject">{m.subject}</span>
                </a>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Key players" action={<a href={href('c', save.id, 'roster')}>Full roster</a>}>
          <ul className="player-list">
            {roster.slice(0, 5).map((p) => (
              <li key={p.id}>
                <a href={href('c', save.id, 'player', p.id)}>
                  <Ovr value={playerOverall(p)} />
                  <span className="pl-name">
                    <strong>{fullName(p)}</strong>
                    <span className="muted small">
                      {p.position} · {playerAge(p, season)} yrs · {money(p.contract?.years[0]?.salary ?? 0)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
