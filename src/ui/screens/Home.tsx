import { useState } from 'react';
import { CAP_STATUS_LABEL, capStatus, displayRating, rosterOf, playerOverall, teamPayroll, teamRating, type GameResult, type ImageCredit, type Player, type ScheduledGame } from '../../engine';
import { advance, advanceToGameDay, finishLiveGame, lastUserGame, nextUserGame, type AdvanceTarget, type Progress } from '../../game/advance';
import { conferenceRank, leagueWire, ownerMood } from '../../game/news';
import { morale, MORALE_LABEL, type MoraleLevel } from '../../game/morale';
import type { SaveGame } from '../../storage/saves';
import { useCareer } from '../career-context';
import { photoSrc, Card, MoodPill, Pill, PlayerPhoto, TeamBadge, LeagueLogo } from '../components';
import { money } from '../format';
import { href } from '../router';
import { PageHeader } from '../Shell';
import { GameRecap } from './GameRecap';
import { GameCast, WatchChooser, type WatchMode } from './GameCast';
import { OfferCard } from './OfferCard';
import { recordOf, teamById } from './Season';

/** Official headshots are transparent cut-outs: they can stand on a coloured panel. */
const isCutout = (photo?: ImageCredit) => photo?.source === 'NBA.com';

/** The team's best player, for the matchup board. */
function starOf(save: SaveGame, teamId: string): Player | undefined {
  return rosterOf(save.league, teamId).filter((p) => !save.season.injuries?.[p.id]).sort((a, b) => playerOverall(b) - playerOverall(a))[0];
}

const ROUND = ['Play-in', 'First round', 'Conference semis', 'Conference finals', 'NBA Finals'];

function boardLabel(save: SaveGame, game: ScheduledGame | null): string {
  const s = save.season;
  if (s.phase === 'playoffs') {
    const series = s.series.find((x) => x.winner === null && (x.top.teamId === save.career.teamId || x.bottom.teamId === save.career.teamId));
    if (series) {
      const mineTop = series.top.teamId === save.career.teamId;
      const [a, b] = mineTop ? series.wins : [series.wins[1], series.wins[0]];
      return `${ROUND[series.round]} · ${series.bestOf > 1 ? `Game ${series.games.length + 1} · ${a === b ? `Tied ${a}-${b}` : a > b ? `Lead ${a}-${b}` : `Trail ${a}-${b}`}` : 'Win or go home'}`;
    }
  }
  if (!game) return s.phase === 'done' ? 'Season complete' : 'Final';
  return `${game.home === save.career.teamId ? 'Home' : 'Away'} · Day ${s.day + 1}`;
}

function MatchupBoard() {
  const { save, update } = useCareer();
  const [busy, setBusy] = useState<Progress | null>(null);
  const next = nextUserGame(save);
  const last = lastUserGame(save);
  const game = next ?? last;
  const phase = save.season.phase;

  const [recap, setRecap] = useState<string | null>(null);
  const [chooser, setChooser] = useState(false);
  const [cast, setCast] = useState<{ save: SaveGame; gameId: string; homeId: string; awayId: string; mode: WatchMode } | null>(null);

  /** Play game: instantly, or in 2D (asking first when the career is set to ask). */
  const playGame = () => {
    const sim = save.career.simMode;
    if (sim === 'ask') setChooser(true);
    else if (sim === 'watch') void watch(save.career.watchMode ?? 'full');
    else void run('next-game');
  };
  const pick = (mode: WatchMode | 'instant', remember: boolean) => {
    setChooser(false);
    if (remember) update((s) => ({ ...s, career: { ...s.career, simMode: mode === 'instant' ? 'quick' : 'watch', watchMode: mode === 'instant' ? s.career.watchMode : mode } }));
    if (mode === 'instant') void run('next-game');
    else void watch(mode);
  };
  /** Live game: play the other games up to game day, then you watch and coach yours. */
  const watch = async (mode: WatchMode) => {
    setBusy({ done: 0, total: 1, label: 'Tip-off…' });
    try {
      const ready = await advanceToGameDay(save);
      update(() => ready);
      const g = nextUserGame(ready);
      if (!g) return;
      setRecap(null);
      setCast({ save: ready, gameId: g.id, homeId: g.home, awayId: g.away, mode });
    } finally {
      setBusy(null);
    }
  };
  const finishLive = async (result: GameResult) => {
    if (!cast) return;
    const done = await finishLiveGame(cast.save, cast.gameId, result);
    update(() => done);
    setRecap(cast.gameId);
    setCast(null);
  };

  const run = async (target: AdvanceTarget) => {
    setBusy({ done: 0, total: 1, label: 'Starting…' });
    try {
      const result = await advance(save, target, setBusy);
      update(() => result);
      // Show the game you just played (Play game), not the whole week.
      if (target === 'next-game') {
        const played = lastUserGame(result);
        if (played && played.id !== last?.id && result.season.boxScores[played.id]) setRecap(played.id);
      } else setRecap(null);
    } finally {
      setBusy(null);
    }
  };

  /** Big faded logo and the star player's cut-out behind each half of the board. */
  const art = (teamId: string, right: boolean) => {
    const t = teamById(save, teamId);
    const star = starOf(save, teamId);
    return (
      <>
        {t?.logo && <img className={`matchup-watermark ${right ? 'right' : 'left'}`} src={t.logo.url} alt="" />}
        {star && isCutout(star.photo) && <img className={`matchup-star ${right ? 'right' : 'left'}`} src={star.photo!.url} alt={`${star.firstName} ${star.lastName}`} />}
      </>
    );
  };

  const side = (teamId: string, right: boolean, score?: number) => {
    const t = teamById(save, teamId);
    if (!t) return null;
    return (
      <div className={`matchup-team ${right ? 'right' : ''}`}>
        <TeamBadge team={t} size={54} />
        <span className="display">{t.name}</span>
        {score !== undefined ? <span className="matchup-score">{score}</span> : <span className="meta">{recordOf(save, teamId)} · OVR {teamRating(save.league, teamId)}</span>}
      </div>
    );
  };

  const home = game ? teamById(save, game.home) : undefined;
  const away = game ? teamById(save, game.away) : undefined;
  const style = { ['--home' as string]: home?.colors.primary, ['--away' as string]: away?.colors.primary };

  return (
    <>
    {chooser && <WatchChooser save={save} onPick={pick} onCancel={() => setChooser(false)} />}
    {cast && <GameCast save={cast.save} homeId={cast.homeId} awayId={cast.awayId} mode={cast.mode} onFinish={(r) => void finishLive(r)} />}
    {recap && <GameRecap save={save} gameId={recap} onClose={() => setRecap(null)} />}
    <section className="matchup">
      <div className="matchup-head">
        <span className="strap">
          {next && <span className="live-dot" />}
          {next ? `Next game · ${boardLabel(save, next)}` : boardLabel(save, game)}
        </span>
        <LeagueLogo image={save.league.meta.logo} />
      </div>
      {game && (
        <div className="matchup-board" style={style}>
          {art(game.away, false)}
          {art(game.home, true)}
          {side(game.away, false, next ? undefined : game.as)}
          <span className="matchup-vs">{next ? '@' : 'FINAL'}</span>
          {side(game.home, true, next ? undefined : game.hs)}
        </div>
      )}
      {phase !== 'done' ? (
        <>
          <button className="btn btn-primary btn-lg matchup-play" type="button" disabled={!!busy} onClick={() => (next && save.season.phase !== 'done' ? playGame() : void run('next-game'))}>
            {next ? 'Play game' : 'Continue'}
          </button>
          <div className="matchup-row">
            <button type="button" disabled={!!busy} onClick={() => void run('week')}>
              Sim week
            </button>
            {phase === 'regular' && (
              <button type="button" disabled={!!busy} onClick={() => void run('regular-end')}>
                Sim to playoffs
              </button>
            )}
            <button type="button" disabled={!!busy} onClick={() => void run('season-end')}>
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
        </>
      ) : (
        <a className="btn btn-primary btn-lg matchup-play" href={href('c', save.id, 'offseason')}>
          {save.offseason ? (save.offseason.stage === 'draft' ? 'Back to the draft' : 'Back to free agency') : 'Start the offseason'}
        </a>
      )}
      {last && save.season.boxScores[last.id] && (
        <div className="matchup-foot">
          <a href={href('c', save.id, 'game', last.id)}>Last game box score ›</a>
          <a href={href('c', save.id, 'schedule')}>Schedule ›</a>
        </div>
      )}
    </section>
    </>
  );
}

/** Team mood at a glance, and who is unhappy. */
function LockerRoom() {
  const { save } = useCareer();
  const players = rosterOf(save.league, save.career.teamId).filter((p) => p.contract?.kind !== 'two-way');
  const moods = players.map((p) => ({ p, m: morale(save, p) }));
  const order: MoraleLevel[] = ['thrilled', 'happy', 'content', 'unhappy', 'angry'];
  const count = (l: MoraleLevel) => moods.filter((x) => x.m.level === l).length;
  const upset = moods.filter((x) => x.m.level === 'unhappy' || x.m.level === 'angry');
  return (
    <section className="locker">
      <div className="section-head">
        <h2>Locker room</h2>
      </div>
      <div className="locker-bar" role="img" aria-label={order.map((l) => `${count(l)} ${MORALE_LABEL[l].toLowerCase()}`).join(', ')}>
        {order.map((l) => (count(l) ? <span key={l} className={`mood-${l}`} style={{ flex: count(l) }} /> : null))}
      </div>
      <div className="locker-legend">
        {order.map((l) => (count(l) ? <MoodPill key={l} level={l} label={`${count(l)} ${MORALE_LABEL[l]}`} /> : null))}
      </div>
      {upset.length > 0 && (
        <ul className="locker-upset">
          {upset.map(({ p, m }) => (
            <li key={p.id}>
              <a href={href('c', save.id, 'player', p.id)}>
                <strong>{p.firstName} {p.lastName}</strong> · {m.reasons.find((r) => r.effect < 0)?.text ?? MORALE_LABEL[m.level]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Ticker() {
  const { save } = useCareer();
  const items = leagueWire(save);
  return (
    <div className="ticker" aria-label="League news">
      <span className="ticker-label">League wire</span>
      <div className="ticker-track">
        {[...items, ...items].map((t, i) => (
          <span key={i} aria-hidden={i >= items.length} className={t.startsWith('Rumor') ? 'rumor' : ''}>
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
  const started = save.season.games.some((g) => g.hs !== undefined);

  const markRead = (id: string) => update((s) => ({ ...s, inbox: s.inbox.map((m) => (m.id === id ? { ...m, read: true } : m)) }));

  if (open) {
    if (!open.read) queueMicrotask(() => markRead(open.id));
    return (
      <>
        <PageHeader title={open.subject} subtitle={`${open.from} · ${open.date}`} back={href('c', save.id, 'home')} />
        <Card>
          <p className="message-body">{open.body}</p>
        </Card>
        {open.offerId && <OfferCard offerId={open.offerId} />}
      </>
    );
  }

  const lastResult = (() => {
    if (!last) return null;
    const home = last.home === team.id;
    const mine = (home ? last.hs : last.as) ?? 0;
    const theirs = (home ? last.as : last.hs) ?? 0;
    return { won: mine > theirs, mine, theirs, opp: teamById(save, home ? last.away : last.home) };
  })();

  const headline = save.inbox.find((m) => !m.read) ?? save.inbox[0];
  // Starting five: the best healthy players.
  const five = roster.filter((p) => !save.season.injuries?.[p.id]).slice(0, 5);
  const hurt = roster.filter((p) => save.season.injuries?.[p.id]);

  return (
    <>
      <MatchupBoard />
      <Ticker />

      {headline && (
        <a className="headline" href={href('c', save.id, 'home', headline.id)}>
          <span className="headline-tag">{headline.read ? 'Inbox' : 'New'}</span>
          <span className="headline-text">{headline.subject}</span>
        </a>
      )}

      <div className="mini-cards">
        <a className="mini-card" href={href('c', save.id, 'league')}>
          <span className="label">Record</span>
          <span className="display">{recordOf(save, team.id)}</span>
          <span className="sub">{started ? conferenceRank(save, team.id) : 'Season tips off soon'}</span>
        </a>
        <a className="mini-card" href={href('c', save.id, 'schedule')}>
          <span className="label">Last game</span>
          {lastResult ? (
            <>
              <span className="display">
                <span className={lastResult.won ? 'tone-good' : 'tone-bad'}>{lastResult.won ? 'W' : 'L'}</span> {lastResult.mine}-{lastResult.theirs}
              </span>
              <span className="sub">vs {lastResult.opp?.name}</span>
            </>
          ) : (
            <>
              <span className="display">—</span>
              <span className="sub">Opening night</span>
            </>
          )}
        </a>
        <div className="mini-card">
          <span className="label">Owner</span>
          <span className={`display tone-${mood.tone}`}>{mood.mood.toUpperCase()}</span>
          <span className="sub">{mood.goal}</span>
        </div>
        <a className="mini-card" href={href('c', save.id, 'finances')}>
          <span className="label">Payroll</span>
          <span className="display">{money(payroll)}</span>
          <span className="sub">{CAP_STATUS_LABEL[status]}</span>
        </a>
      </div>

      <div className="section-head">
        <h2>Starting lineup</h2>
        <a className="small" href={href('c', save.id, 'roster')}>
          Full roster ›
        </a>
      </div>
      {hurt.length > 0 && (
        <p className="injury-line">
          <strong>Injured:</strong>{' '}
          {hurt.map((p, k) => (
            <span key={p.id}>
              {k > 0 && ', '}
              <a href={href('c', save.id, 'player', p.id)}>{p.lastName}</a> ({save.season.injuries![p.id]!.type.toLowerCase()}, {save.season.injuries![p.id]!.gamesLeft >= 60 ? 'season' : `${save.season.injuries![p.id]!.gamesLeft} g`})
            </span>
          ))}
        </p>
      )}
      <div className="lineup-cards">
        {five.map((p) => (
          <a key={p.id} className="lineup-card" href={href('c', save.id, 'player', p.id)}>
            <span className="lc-art">
              <span className="lc-num" aria-hidden="true">{p.jersey}</span>
              {team.logo && <img className="lc-logo" src={team.logo.url} alt="" />}
              {isCutout(p.photo) ? (
                <img className="lc-cutout" src={photoSrc(p.photo!.url, 'md')} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="lc-face">
                  <PlayerPhoto photo={p.photo} number={p.jersey} colors={team.colors} />
                </span>
              )}
              <span className="lc-ovr">{displayRating(playerOverall(p))}</span>
            </span>
            <span className="lc-name">
              <small>{p.firstName}</small>
              {p.lastName}
            </span>
            <span className="lc-pos">
              {p.position} · #{p.jersey}
            </span>
          </a>
        ))}
      </div>

      <LockerRoom />

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
