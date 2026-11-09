// Advancing time in a career: plays days of the season and writes news to
// the inbox. Runs in small chunks so the screen stays responsive.

import { Rng, fullName, newSeed, playerOverall, simulateDay, standings, teamName, type DayReport, type GameResult, type PlayEvent, type ScheduledGame, type SeasonState } from '../engine';
import type { InboxMessage, SaveGame } from '../storage/saves';
import { weeklyMarket } from './market';
import { announceAwards, computeFinalsMvp, maybeAllStar, seasonReview } from './awards';

export type AdvanceTarget = 'next-game' | 'week' | 'regular-end' | 'season-end';

export interface Progress {
  done: number;
  total: number;
  label: string;
}

const ROUND_NAME = ['Play-in', 'First round', 'Conference semifinals', 'Conference finals', 'NBA Finals'];

export function nextUserGame(save: SaveGame): ScheduledGame | null {
  const season = save.season;
  const me = save.career.teamId;
  if (season.phase === 'regular') {
    return season.games.filter((g) => g.hs === undefined && (g.home === me || g.away === me)).sort((a, b) => a.day - b.day)[0] ?? null;
  }
  if (season.phase === 'playoffs') {
    const s = season.series.find((x) => x.winner === null && (x.top.teamId === me || x.bottom.teamId === me));
    if (!s) return null;
    const n = s.games.length;
    const topHome = s.bestOf === 1 || [0, 1, 4, 6].includes(n);
    return { id: `${s.id}-g${n + 1}`, day: season.day, home: topHome ? s.top.teamId : s.bottom.teamId, away: topHome ? s.bottom.teamId : s.top.teamId };
  }
  return null;
}

export function lastUserGame(save: SaveGame): ScheduledGame | null {
  const me = save.career.teamId;
  const all = [...save.season.games, ...save.season.series.flatMap((s) => s.games)];
  return all.filter((g) => g.hs !== undefined && (g.home === me || g.away === me)).sort((a, b) => b.day - a.day)[0] ?? null;
}

function message(save: SaveGame, id: string, from: string, subject: string, body: string): InboxMessage {
  return { id: `${id}-${save.season.year}`, from, subject, body, date: dateLabel(save.season), read: false };
}

/**
 * Everything that follows a simulated day: injury news, the weekly trade
 * market, the All-Star break, and news (awards, series, the title) when
 * the season moves to a new stage.
 */
function afterDay(save: SaveGame, report: DayReport, rng: Rng, before: { phase: SeasonState['phase']; series: number; day: number }) {
  const { season } = save;
  injuryNews(save, report);
  // Once a game week: offers, AI trades and rumors.
  if (season.phase === 'regular' && season.day !== before.day && season.day % 7 === 0) weeklyMarket(save, rng);
  if (season.phase === 'regular' && season.day !== before.day) maybeAllStar(save, rng);
  if (report.phaseChanged) {
    if (before.phase === 'regular' && season.phase === 'playoffs') announceAwards(save);
    news(save, before.phase, before.series);
    if (season.phase === 'done') seasonReview(save);
  }
}

/** Injury news: your players to the inbox, stars elsewhere to the league wire. */
function injuryNews(save: SaveGame, report: DayReport) {
  const me = save.career.teamId;
  for (const { playerId, injury } of report.injured) {
    const p = save.league.players.find((x) => x.id === playerId);
    if (!p) continue;
    const out = injury.gamesLeft >= 82 ? 'out for the season' : `out about ${injury.gamesLeft} game${injury.gamesLeft === 1 ? '' : 's'}`;
    if (p.teamId === me) {
      save.inbox.unshift({ id: `injury-${p.id}-${save.season.day}`, from: 'Medical staff', subject: `${fullName(p)}: ${injury.type.toLowerCase()}, ${out}`, body: `${fullName(p)} picked up a ${injury.type.toLowerCase()} and will be ${out}. He is off the game roster until he is healthy; the rotation adjusts on its own.`, date: dateLabel(save.season), read: false });
    } else if (playerOverall(p) >= 72 || injury.gamesLeft >= 15) {
      const team = save.league.teams.find((t) => t.id === p.teamId);
      save.season.rumors = [`Injury: ${team?.name ?? ''} ${p.lastName} ${out}`, ...(save.season.rumors ?? [])].slice(0, 6);
    }
  }
}

export function dateLabel(season: SeasonState): string {
  if (season.phase === 'regular') return `Regular season, day ${season.day + 1}`;
  if (season.phase === 'playoffs') return 'Playoffs';
  return 'Offseason';
}

/** Play forward to the target. Returns a new save; the original is untouched. */
/**
 * \`onPlayByPlay\`: when given, your game is recorded possession by possession
 * (for the 2D view) and handed over with its id.
 */
/**
 * Play the other games until the day of your next game, so it can be played
 * live. Returns a new save; your game is still to be played.
 */
export async function advanceToGameDay(original: SaveGame): Promise<SaveGame> {
  const save = structuredClone(original);
  const { league, season } = save;
  const me = save.career.teamId;
  const rng = new Rng(newSeed());
  for (let guard = 0; guard < 200 && season.phase === 'regular'; guard++) {
    const next = season.games.filter((g) => g.hs === undefined && (g.home === me || g.away === me)).sort((a, b) => a.day - b.day)[0];
    if (!next || next.day <= season.day) break;
    const before = { phase: season.phase, series: season.series.length, day: season.day };
    const report = simulateDay(league, season, rng, (g) => g.home === me || g.away === me);
    afterDay(save, report, rng, before);
    if (guard % 6 === 5) await new Promise((r) => setTimeout(r, 0));
  }
  return save;
}

/** Record a game you played live, and play the rest of that day. */
export async function finishLiveGame(original: SaveGame, gameId: string, result: GameResult): Promise<SaveGame> {
  const save = structuredClone(original);
  const { league, season } = save;
  const me = save.career.teamId;
  const rng = new Rng(newSeed());
  const before = { phase: season.phase, series: season.series.length, day: season.day };
  const report = simulateDay(league, season, rng, (g) => g.home === me || g.away === me || g.id.startsWith('finals'), undefined, { [gameId]: result });
  afterDay(save, report, rng, before);
  return save;
}

export async function advance(original: SaveGame, target: AdvanceTarget, onProgress?: (p: Progress) => void, onPlayByPlay?: (gameId: string, log: PlayEvent[]) => void): Promise<SaveGame> {
  const save = structuredClone(original);
  const { league, season } = save;
  const me = save.career.teamId;
  const rng = new Rng(newSeed());
  const startDay = season.day;
  const regularDays = Math.max(...season.games.map((g) => g.day)) + 1;

  const isMine = (g: ScheduledGame) => g.home === me || g.away === me;
  const stop = (playedMine: boolean, phaseChanged: boolean): boolean => {
    if (season.phase === 'done') return true;
    switch (target) {
      case 'next-game':
        return playedMine || (phaseChanged && season.phase === 'playoffs' && !userAlive(save));
      case 'week':
        return season.day - startDay >= 7 || phaseChanged;
      case 'regular-end':
        return season.phase !== 'regular';
      case 'season-end':
        return false;
    }
  };

  const estimate = target === 'season-end' ? regularDays - season.day + 70 : target === 'regular-end' ? regularDays - season.day : 7;
  let steps = 0;
  for (;;) {
    const before = { phase: season.phase, series: season.series.length, day: season.day };
    const report = simulateDay(league, season, rng, (g) => isMine(g) || g.id.startsWith('finals'), onPlayByPlay ? isMine : undefined);
    for (const p of report.played) if (p.log && onPlayByPlay) onPlayByPlay(p.game.id, p.log);
    steps++;
    afterDay(save, report, rng, before);
    const playedMine = report.played.some((p) => isMine(p.game));
    if (steps % 4 === 0) {
      onProgress?.({ done: steps, total: Math.max(steps, estimate), label: dateLabel(season) });
      await new Promise((r) => setTimeout(r, 0));
    }
    if (stop(playedMine, report.phaseChanged)) break;
    if (report.played.length === 0 && season.phase !== 'playoffs') break;
  }
  return save;
}

function userAlive(save: SaveGame): boolean {
  const me = save.career.teamId;
  return save.season.series.some((s) => s.winner === null && (s.top.teamId === me || s.bottom.teamId === me));
}

/** Inbox news when the season moves to a new stage. */
function news(save: SaveGame, phaseBefore: SeasonState['phase'], seriesBefore: number) {
  const { league, season } = save;
  const me = save.career.teamId;
  const name = (id: string) => {
    const t = league.teams.find((x) => x.id === id);
    return t ? teamName(t) : id;
  };
  const push = (m: InboxMessage) => {
    if (!save.inbox.some((x) => x.id === m.id)) save.inbox.unshift(m);
  };

  if (phaseBefore === 'regular' && season.phase === 'playoffs') {
    const row = standings(league, season.games).find((r) => r.teamId === me);
    const inPlayIn = season.series.find((s) => s.top.teamId === me || s.bottom.teamId === me);
    const seeds = season.series.length;
    const record = row ? `${row.w}-${row.l}` : '';
    push(
      message(save, 'regular-end', 'Assistant GM', 'The regular season is over', inPlayIn
        ? `We finished ${record} and head to the play-in tournament as the ${inPlayIn.top.teamId === me ? inPlayIn.top.seed : inPlayIn.bottom.seed} seed.`
        : seeds && row
          ? `We finished ${record}. ${playoffBound(save) ? 'We are in the playoffs.' : 'We missed the playoffs this year.'}`
          : `We finished ${record}.`),
    );
  }

  const newSeries = season.series.slice(seriesBefore);
  const finishedRound = season.series.slice(0, seriesBefore).filter((s) => s.winner !== null);
  for (const s of finishedRound) {
    if (s.top.teamId !== me && s.bottom.teamId !== me) continue;
    const won = s.winner === me;
    const opp = s.top.teamId === me ? s.bottom.teamId : s.top.teamId;
    const score = `${Math.max(...s.wins)}-${Math.min(...s.wins)}`;
    push(message(save, `series-${s.id}`, 'Head coach', won ? `We beat the ${name(opp)}` : `Eliminated by the ${name(opp)}`,
      won ? `${ROUND_NAME[s.round]}: we won ${s.bestOf > 1 ? `the series ${score}` : 'the game'}. On to the next one.` : `${ROUND_NAME[s.round]}: we lost ${s.bestOf > 1 ? `the series ${score}` : 'the game'}. Our season is over.`));
  }
  for (const s of newSeries) {
    if (s.top.teamId !== me && s.bottom.teamId !== me) continue;
    const opp = s.top.teamId === me ? s.bottom.teamId : s.top.teamId;
    push(message(save, `next-${s.id}`, 'Head coach', `${ROUND_NAME[s.round]}: ${name(opp)}`, `Next up: the ${name(opp)}${s.bestOf > 1 ? ` in a best-of-${s.bestOf} series` : ''}. ${s.top.teamId === me ? 'We have home-court advantage.' : 'They have home-court advantage.'}`));
  }

  if (season.phase === 'done' && season.champion) {
    const finals = season.series.find((s) => s.round === 4);
    const mvpId = computeFinalsMvp(save);
    const mvpP = mvpId ? league.players.find((x) => x.id === mvpId) : undefined;
    const mvp = mvpP ? fullName(mvpP) : null;
    push(message(save, 'champion', 'League office', season.champion === me ? 'WE ARE CHAMPIONS!' : `${name(season.champion)} win the title`,
      `${name(season.champion)} won the NBA Finals${finals ? ` ${Math.max(...finals.wins)}-${Math.min(...finals.wins)}` : ''}.${mvp ? ` Finals MVP: ${mvp}.` : ''} The offseason starts from the home screen: draft lottery, the draft, free agency, then training camp.`));
  }
}

function playoffBound(save: SaveGame): boolean {
  const me = save.career.teamId;
  return save.season.series.some((s) => s.top.teamId === me || s.bottom.teamId === me);
}

