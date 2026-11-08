// Advancing time in a career: plays days of the season and writes news to
// the inbox. Runs in small chunks so the screen stays responsive.

import { Rng, fullName, newSeed, simulateDay, standings, teamName, type ScheduledGame, type SeasonState, type Series } from '../engine';
import type { InboxMessage, SaveGame } from '../storage/saves';

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

export function dateLabel(season: SeasonState): string {
  if (season.phase === 'regular') return `Regular season, day ${season.day + 1}`;
  if (season.phase === 'playoffs') return 'Playoffs';
  return 'Offseason';
}

/** Play forward to the target. Returns a new save; the original is untouched. */
export async function advance(original: SaveGame, target: AdvanceTarget, onProgress?: (p: Progress) => void): Promise<SaveGame> {
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
    const phaseBefore = season.phase;
    const seriesBefore = season.series.length;
    const report = simulateDay(league, season, rng, (g) => isMine(g) || g.id.startsWith('finals'));
    steps++;
    const playedMine = report.played.some((p) => isMine(p.game));
    if (report.phaseChanged) news(save, phaseBefore, seriesBefore);
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
    const mvp = finals ? finalsMvp(save, finals) : null;
    push(message(save, 'champion', 'League office', season.champion === me ? 'WE ARE CHAMPIONS!' : `${name(season.champion)} win the title`,
      `${name(season.champion)} won the NBA Finals${finals ? ` ${Math.max(...finals.wins)}-${Math.min(...finals.wins)}` : ''}.${mvp ? ` Finals MVP: ${mvp}.` : ''} The offseason (draft, free agency, player development) arrives in the next update.`));
  }
}

function playoffBound(save: SaveGame): boolean {
  const me = save.career.teamId;
  return save.season.series.some((s) => s.top.teamId === me || s.bottom.teamId === me);
}

function finalsMvp(save: SaveGame, finals: Series): string | null {
  const totals = new Map<string, number>();
  for (const g of finals.games) {
    const box = save.season.boxScores[g.id];
    if (!box) continue;
    const side = box.home.teamId === finals.winner ? box.home : box.away;
    for (const l of side.lines) totals.set(l.playerId, (totals.get(l.playerId) ?? 0) + l.pts + 1.2 * (l.orb + l.drb) + 1.5 * l.ast);
  }
  const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  const p = best ? save.league.players.find((x) => x.id === best[0]) : undefined;
  return p ? fullName(p) : null;
}
