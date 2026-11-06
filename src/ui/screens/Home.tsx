import { useState } from 'react';
import { CAP_STATUS_LABEL, capStatus, rosterOf, playerOverall, teamPayroll, teamRating, type ScheduledGame } from '../../engine';
import { advance, lastUserGame, nextUserGame, type AdvanceTarget, type Progress } from '../../game/advance';
import { conferenceRank, leagueWire, ownerMood } from '../../game/news';
import type { SaveGame } from '../../storage/saves';
import { useCareer } from '../career-context';
import { Card, Pill, PlayerFigure, TeamBadge } from '../components';
import { money, seasonLabel } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';
import { recordOf, teamById } from './Season';

const ROUND = ['Play-in', 'First round', 'Conference semis', 'Conference finals', 'NBA Finals'];

function matchupLabel(save: SaveGame, game: ScheduledGame): string {
  if (save.season.phase === 'playoffs') {
    const s = save.season.series.find((x) => x.winner === null && (x.top.teamId === save.career.teamId || x.bottom.teamId === save.career.teamId));
    if (s) {
      const mineTop = s.top.teamId === save.career.teamId;
      const [a, b] = mineTop ? s.wins : [s.wins[1], s.wins[0]];
      return `${ROUND[s.round]} · ${s.bestOf > 1 ? `Game ${s.games.length + 1} · ${a === b ? `Tied ${a}-${b}` : a > b ? `Lead ${a}-${b}` : `Trail ${a}-${b}`}` : 'Win or go home'}`;
    }
  }
  const home = game.home === save.career.teamId;
  const arena = teamById(save, game.home)?.arena ?? '';
  return `${home ? 'Home' : 'Away'} · ${arena}`;
}

function MatchupHero() {
  const { save, update } = useCareer();
  const [busy, setBusy] = useState<Progress | null>(null);
  const next = nextUserGame(save);
  const last = lastUserGame(save);
  const game = next ?? last;
  const phase = save.season.phase;

  const run = async (target: AdvanceTarget) => {
    setBusy({ done: 0, total: 1, label: 'Starting…' });
    try {
      const result = await advance(save, target, setBusy);
      update(() => result);
    } finally {
      setBusy(null);
    }
  };

  const side = (teamId: string, score?: number, won?: boolean) => {
    const t = teamById(save, teamId);
    if (!t) return null;
    return (
      <div className="matchup-team">
        <TeamBadge team={t} size={70} />
        <span className="display">{t.name}</span>
        {score !== undefined ? (
          <span className="matchup-score" style={{ opacity: won ? 1 : 0.5 }}>{score}</span>
        ) : (
          <span className="small muted">
            {recordOf(save, teamId)} · OVR {teamRating(save.league, teamId)}
          </span>
        )}
      </div>
    );
  };

  const home = game ? teamById(save, game.home) : undefined;
  const away = game ? teamById(save, game.away) : undefined;
  const style = { ['--home' as string]: home?.colors.primary, ['--away' as string]: away?.colors.primary };

  return (
    <section className="matchup" style={style}>
      {game ? (
        <>
          <div className="matchup-top">
            <span>
              {next && <span className="live-dot" />}
              {next ? matchupLabel(save, next) : 'Final'}
            </span>
            <span>{phase === 'regular' ? `Day ${save.season.day + 1}` : phase === 'playoffs' ? 'Playoffs' : ''}</span>
          </div>
          <div className="matchup-teams">
            {side(game.away, next ? undefined : game.as, (game.as ?? 0) > (game.hs ?? 0))}
            <span className="matchup-vs">{next ? '@' : '–'}</span>
            {side(game.home, next ? undefined : game.hs, (game.hs ?? 0) > (game.as ?? 0))}
          </div>
        </>
      ) : (
        <div className="matchup-top">
          <span>{phase === 'done' ? 'Season complete' : 'Your season is over'}</span>
        </div>
      )}

      {phase !== 'done' ? (
        <div className="matchup-actions">
          <button className="btn btn-primary btn-lg" type="button" disabled={!!busy} onClick={() => void run('next-game')}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 4l14 8-14 8z" fill="currentColor" />
            </svg>
            {next ? 'Play game' : 'Continue'}
          </button>
          <div className="row">
            <button className="btn" type="button" disabled={!!busy} onClick={() => void run('week')}>
              Sim week
            </button>
            {phase === 'regular' && (
              <button className="btn" type="button" disabled={!!busy} onClick={() => void run('regular-end')}>
                Sim to playoffs
              </button>
            )}
            <button className="btn" type="button" disabled={!!busy} onClick={() => void run('season-end')}>
              Sim season
            </button>
          </div>
          {busy && (
            <div className="sim-progress" role="status">
              <div className="sim-bar">
                <span style={{ width: `${Math.min(100, (busy.done / busy.total) * 100)}%` }} />
              </div>
              <span className="small muted">Simulating · {busy.label}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="small muted">The offseason (draft, free agency, development) arrives in the next update.</p>
      )}
      {last && save.season.boxScores[last.id] && (
        <a className="small" href={href('c', save.id, 'game', last.id)}>
          Last game box score ›
        </a>
      )}
    </section>
  );
}

function Ticker() {
  const { save } = useCareer();
  const items = leagueWire(save);
  // The list is doubled so the scroll loops seamlessly.
  return (
    <div className="ticker" aria-label="League news">
      <span className="ticker-label">League wire</span>
      <div className="ticker-track">
        {[...items, ...items].map((t, i) => (
          <span key={i} aria-hidden={i >= items.length}>
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Home({ messageId }: { messageId?: string }) {
  const { save, update } = useCareer();
  const { league, career } = save;
  const team = league.teams.find((t) => t.id === career.teamId);
  if (!team) return null;
  const season = league.meta.season;
  const roster = rosterOf(league, team.id).filter((p) => p.contract?.kind !== 'two-way');
  const payroll = teamPayroll(league, team.id, season);
  const status = capStatus(league.settings, payroll);
  const mood = ownerMood(save);
  const open = save.inbox.find((m) => m.id === messageId);
  const last = lastUserGame(save);

  const markRead = (id: string) => update((s) => ({ ...s, inbox: s.inbox.map((m) => (m.id === id ? { ...m, read: true } : m)) }));

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

  const lastResult = (() => {
    if (!last) return null;
    const home = last.home === team.id;
    const mine = (home ? last.hs : last.as) ?? 0;
    const theirs = (home ? last.as : last.hs) ?? 0;
    const opp = teamById(save, home ? last.away : last.home);
    const box = save.season.boxScores[last.id];
    const side = box ? (box.home.teamId === team.id ? box.home : box.away) : null;
    const top = side ? [...side.lines].sort((a, b) => b.pts - a.pts)[0] : null;
    const topName = top ? league.players.find((p) => p.id === top.playerId)?.lastName : null;
    return { won: mine > theirs, mine, theirs, opp, top: top && topName ? `${topName} ${top.pts} pts` : '' };
  })();

  const five = roster.slice(0, 5);

  return (
    <>
      <MatchupHero />
      <Ticker />

      <div className="mini-cards">
        {lastResult ? (
          <a className="mini-card" href={href('c', save.id, 'schedule')}>
            <span className="label">Last game</span>
            <span className="display">
              <span className={lastResult.won ? 'tone-good' : 'tone-bad'}>{lastResult.won ? 'W' : 'L'}</span> {lastResult.mine}-{lastResult.theirs}
            </span>
            <span className="sub">
              vs {lastResult.opp?.name} {lastResult.top ? `· ${lastResult.top}` : ''}
            </span>
          </a>
        ) : (
          <div className="mini-card">
            <span className="label">Season</span>
            <span className="display">{seasonLabel(season)}</span>
            <span className="sub">Opening night</span>
          </div>
        )}
        <div className="mini-card">
          <span className="label">Owner mood</span>
          <span className={`display tone-${mood.tone}`}>{mood.mood.toUpperCase()}</span>
          <span className="sub">Goal: {mood.goal.toLowerCase()}</span>
        </div>
        <a className="mini-card" href={href('c', save.id, 'finances')}>
          <span className="label">Payroll</span>
          <span className="display">{money(payroll)}</span>
          <span className="sub">{CAP_STATUS_LABEL[status]}</span>
        </a>
        <a className="mini-card" href={href('c', save.id, 'league')}>
          <span className="label">Standing</span>
          <span className="display">{recordOf(save, team.id)}</span>
          <span className="sub">{save.season.games.some((g) => g.hs !== undefined) ? conferenceRank(save, team.id) : 'Season tips off soon'}</span>
        </a>
      </div>

      <div className="section-head">
        <h2>Starting five</h2>
        <a className="small" href={href('c', save.id, 'roster')}>
          Full roster ›
        </a>
      </div>
      <div className="five">
        {five.map((p) => (
          <a key={p.id} className="five-card" href={href('c', save.id, 'player', p.id)}>
            <PlayerFigure number={p.jersey} colors={team.colors} size={110} />
            <span className="name">{p.lastName}</span>
            <span className="ovr-big">{playerOverall(p)}</span>
          </a>
        ))}
      </div>

      <Card title="Inbox" action={<Pill tone="accent">{save.inbox.filter((m) => !m.read).length} new</Pill>}>
        <ul className="inbox">
          {save.inbox.slice(0, 8).map((m) => (
            <li key={m.id} className={m.read ? '' : 'unread'}>
              <a href={href('c', save.id, 'home', m.id)}>
                <span className="inbox-from">{m.from}</span>
                <span className="inbox-subject">{m.subject}</span>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
