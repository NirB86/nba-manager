import { useState } from 'react';
import { CAP_STATUS_LABEL, capStatus, rosterOf, teamName, teamSummaries } from '../../engine';
import { useCareer } from '../career-context';
import { Card, ImageCreditLine, Ovr, Pill, Segmented, Stat, TeamBadge } from '../components';
import { money } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';
import { RosterTable } from './Roster';
import { HistoryView } from './History';
import { LeadersView, PlayoffsView, StandingsView } from './Season';

export function League() {
  const { save } = useCareer();
  const { league } = save;
  const [view, setView] = useState<'standings' | 'playoffs' | 'leaders' | 'teams' | 'fa' | 'history'>(save.season.phase === 'regular' ? 'standings' : 'playoffs');
  const ranked = teamSummaries(league).sort((a, b) => b.rating - a.rating);
  const rank = new Map(ranked.map((s, i) => [s.team.id, i + 1]));
  const freeAgents = league.players.filter((p) => p.teamId === null);

  return (
    <>
      <PageHeader title="League" subtitle={`${league.meta.name} · ${league.teams.length} teams`} />
      <div className="toolbar">
        <Segmented
          name="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'standings', label: 'Standings' },
            { value: 'playoffs', label: 'Playoffs' },
            { value: 'leaders', label: 'Leaders' },
            { value: 'teams', label: 'Team ratings' },
            { value: 'fa', label: `Free agents (${freeAgents.length})` },
            { value: 'history', label: 'History' },
          ]}
        />
      </div>

      {view === 'standings' && <StandingsView />}
      {view === 'playoffs' && <PlayoffsView />}
      {view === 'leaders' && <LeadersView />}
      {view === 'history' && <HistoryView />}
      {view === 'teams' &&
        league.conferences.map((conf) => (
          <Card key={conf.id} title={conf.name}>
            <p className="muted small">Ranked by team rating (roster strength), not by record.</p>
            {conf.divisions.map((div) => (
              <div key={div.id} className="division">
                <h3>{div.name}</h3>
                <ul className="team-rows">
                  {ranked
                    .filter((s) => s.team.divisionId === div.id)
                    .map((s) => {
                      const status = capStatus(league.settings, s.payroll);
                      const mine = s.team.id === save.career.teamId;
                      return (
                        <li key={s.team.id} className={mine ? 'mine' : ''}>
                          <a href={href('c', save.id, 'team', s.team.id)}>
                            <span className="rank muted">{rank.get(s.team.id)}</span>
                            <TeamBadge team={s.team} size={32} />
                            <span className="team-row-name">
                              <strong>{teamName(s.team)}</strong>
                              {mine && <Pill tone="accent">You</Pill>}
                              <span className="muted small">
                                {money(s.payroll)} · {CAP_STATUS_LABEL[status]}
                              </span>
                            </span>
                            <Ovr value={s.rating} shown label="Team rating" />
                          </a>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </Card>
        ))}

      {view === 'fa' && (
        <>
          <p className="muted small">Signing free agents arrives in a coming update.</p>
          <RosterTable save={save} players={freeAgents} />
        </>
      )}
    </>
  );
}

export function TeamPage({ teamId }: { teamId: string }) {
  const { save } = useCareer();
  const { league } = save;
  const team = league.teams.find((t) => t.id === teamId);
  if (!team) return <PageHeader title="Team not found" back={href('c', save.id, 'league')} />;
  const summary = teamSummaries(league).find((s) => s.team.id === teamId);
  const conf = league.conferences.find((c) => c.id === team.conferenceId);
  const div = conf?.divisions.find((d) => d.id === team.divisionId);
  const hc = league.staff.find((s) => s.teamId === team.id && s.role === 'HC');
  const picks = league.draftPicks.filter((p) => p.ownerTeamId === team.id && p.round === 1);
  const roster = rosterOf(league, team.id);

  return (
    <>
      <PageHeader
        title={teamName(team)}
        teamId={team.id}
        eyebrow={`${conf?.name ?? ''} · ${div?.name} Division`}
        subtitle={`${team.arena} · ${team.market} market`}
        back={href('c', save.id, 'league')}
      />
      <div className="stats-row">
        <Stat label="Team rating" value={<Ovr value={summary?.rating ?? 0} shown />} />
        <Stat label="Payroll" value={money(summary?.payroll ?? 0)} hint={summary ? CAP_STATUS_LABEL[capStatus(league.settings, summary.payroll)] : ''} />
        <Stat label="Head coach" value={<span className="stat-text">{hc ? <a className="row-link" href={href('c', save.id, 'staff', hc.id)}>{`${hc.firstName} ${hc.lastName}`}</a> : 'Vacant'}</span>} />
        <Stat label="First-round picks" value={picks.length} hint="Next 7 drafts" />
      </div>
      {team.id !== save.career.teamId && (
        <div className="row-actions" style={{ marginTop: 0, marginBottom: 16 }}>
          <a className="btn btn-primary" href={href('c', save.id, 'trade', team.id)}>
            Propose a trade
          </a>
        </div>
      )}
      <RosterTable save={save} players={roster} />
      <ImageCreditLine label="Logo" image={team.logo} />
      <ImageCreditLine label="Wordmark" image={team.wordmark} />
    </>
  );
}
