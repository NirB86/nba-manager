// Season honors: the All-Star Game, regular-season awards (MVP, Rookie of
// the Year, Sixth Man, Defensive Player, All-NBA), the Finals MVP and the
// owner's review of your season. Everything is decided from the season's
// stats and team records, so it works the same for real and fictional leagues.

import {
  Rng,
  fullName,
  playerOverall,
  simulateGame,
  standings,
  teamName,
  teamRating,
  type LeagueFile,
  type Player,
  type SeasonAwards,
  type SeasonState,
  type StatTotals,
} from '../engine';
import type { InboxMessage, SaveGame } from '../storage/saves';

export interface LeagueSeasonRecord {
  season: number;
  champion: string | null;
  runnerUp: string | null;
  awards?: SeasonAwards;
  allStarMvp?: string | null;
  allStars?: string[];
}

const push = (save: SaveGame, m: InboxMessage) => {
  if (!save.inbox.some((x) => x.id === m.id)) save.inbox.unshift(m);
};
const msg = (save: SaveGame, id: string, from: string, subject: string, body: string): InboxMessage => ({
  id: `${id}-${save.season.year}`,
  from,
  subject,
  body,
  date: save.season.phase === 'regular' ? `Regular season, day ${save.season.day + 1}` : save.season.phase === 'playoffs' ? 'Playoffs' : 'Offseason',
  read: false,
});
const wire = (save: SaveGame, line: string) => {
  save.season.rumors = [line, ...(save.season.rumors ?? [])].slice(0, 6);
};

function regularDays(season: SeasonState) {
  return season.games.reduce((m, g) => Math.max(m, g.day), 0) + 1;
}

/** The day the All-Star Game is played: about 55% of the way through the schedule. */
export function allStarDay(season: SeasonState) {
  return Math.round(regularDays(season) * 0.55);
}

function wins(league: LeagueFile, season: SeasonState) {
  const map = new Map<string, { w: number; l: number; pct: number }>();
  for (const r of standings(league, season.games)) map.set(r.teamId, { w: r.w, l: r.l, pct: r.w + r.l ? r.w / (r.w + r.l) : 0.5 });
  return map;
}

const per = (t: StatTotals, k: keyof StatTotals) => (t.g ? t[k] / t.g : 0);

/** Box-score impact per game: the basis of most votes. */
export function impact(t: StatTotals) {
  return per(t, 'pts') + 1.2 * (per(t, 'orb') + per(t, 'drb')) + 1.5 * per(t, 'ast') + 2 * per(t, 'stl') + 2 * per(t, 'blk') - per(t, 'tov');
}

function defense(p: Player, t: StatTotals) {
  const a = p.attributes;
  const rating = (a.perimeterD + a.interiorD + a.steals + a.blocks + a.rebounding * 0.5 + a.iq * 0.5) / 5;
  return 3 * per(t, 'stl') + 3 * per(t, 'blk') + 0.5 * per(t, 'drb') + rating * 0.35;
}

interface Candidate {
  p: Player;
  t: StatTotals;
  teamPct: number;
}

function candidates(save: SaveGame, minGamesShare: number): Candidate[] {
  const { league, season } = save;
  const records = wins(league, season);
  const teamGames = Math.max(1, ...[...records.values()].map((r) => r.w + r.l));
  const min = Math.floor(teamGames * minGamesShare);
  const out: Candidate[] = [];
  for (const p of league.players) {
    const t = season.stats.regular[p.id];
    if (!t || t.g < min || !p.teamId) continue;
    out.push({ p, t, teamPct: records.get(p.teamId)?.pct ?? 0.5 });
  }
  return out;
}

/** MVP score: individual impact, weighted by how well the team did. */
const mvpScore = (c: Candidate) => impact(c.t) * (0.6 + c.teamPct * 0.8);

/** Pick the regular-season awards from the stats so far. */
export function computeAwards(save: SaveGame): SeasonAwards {
  const pool = candidates(save, 0.6);
  const byMvp = [...pool].sort((a, b) => mvpScore(b) - mvpScore(a));
  const mvp = byMvp[0]?.p.id ?? null;
  const roy = pool.filter((c) => c.p.experience === 0).sort((a, b) => impact(b.t) - impact(a.t))[0]?.p.id ?? null;
  const sixth = pool.filter((c) => c.t.gs <= c.t.g * 0.3).sort((a, b) => impact(b.t) - impact(a.t))[0]?.p.id ?? null;
  const dpoy = [...pool].sort((a, b) => defense(b.p, b.t) - defense(a.p, a.t))[0]?.p.id ?? null;
  // All-NBA: by MVP score, two guards, two forwards and a center on each team where possible.
  const slots: Record<string, string> = { PG: 'G', SG: 'G', SF: 'F', PF: 'F', C: 'C' };
  const need = { G: 2, F: 2, C: 1 } as Record<string, number>;
  const used = new Set<string>();
  const allNba: string[][] = [];
  for (let team = 0; team < 3; team++) {
    const left = { ...need };
    const picks: string[] = [];
    for (const c of byMvp) {
      if (used.has(c.p.id)) continue;
      const g = slots[c.p.position] ?? 'F';
      if ((left[g] ?? 0) <= 0) continue;
      left[g]!--;
      picks.push(c.p.id);
      used.add(c.p.id);
      if (picks.length === 5) break;
    }
    // Not enough at a position: fill with the best left.
    for (const c of byMvp) {
      if (picks.length >= 5) break;
      if (!used.has(c.p.id)) {
        picks.push(c.p.id);
        used.add(c.p.id);
      }
    }
    allNba.push(picks);
  }
  return { mvp, roy, sixth, dpoy, allNba, mvpVoting: byMvp.slice(0, 5).map((c) => ({ playerId: c.p.id, score: Math.round(mvpScore(c) * 10) / 10 })) };
}

const nameOf = (league: LeagueFile, id: string | null | undefined) => {
  const p = id ? league.players.find((x) => x.id === id) : undefined;
  return p ? fullName(p) : '—';
};
const teamOf = (league: LeagueFile, id: string | null | undefined) => {
  const p = id ? league.players.find((x) => x.id === id) : undefined;
  const t = p?.teamId ? league.teams.find((x) => x.id === p.teamId) : undefined;
  return t ? t.abbrev : '';
};

/** Pick and play the All-Star Game once the season reaches the break. */
export function maybeAllStar(save: SaveGame, rng: Rng) {
  const { league, season } = save;
  if (season.allStar || season.phase !== 'regular' || season.day < allStarDay(season)) return;
  const pool = candidates(save, 0.35);
  const rosters: Record<string, string[]> = {};
  for (const conf of league.conferences) {
    const teamIds = new Set(league.teams.filter((t) => t.conferenceId === conf.id).map((t) => t.id));
    rosters[conf.id] = pool
      .filter((c) => c.p.teamId && teamIds.has(c.p.teamId))
      .sort((a, b) => mvpScore(b) + playerOverall(b.p) * 0.05 - (mvpScore(a) + playerOverall(a.p) * 0.05))
      .slice(0, 12)
      .map((c) => c.p.id);
  }
  const [east, west] = league.conferences;
  if (!east || !west || (rosters[east.id]?.length ?? 0) < 5 || (rosters[west.id]?.length ?? 0) < 5) return;
  const players = (ids: string[]) => ids.map((id) => league.players.find((p) => p.id === id)!).filter(Boolean);
  // Separate rng stream so the exhibition never shifts the real season's results.
  const result = simulateGame(new Rng(rng.int(1, 2 ** 30)), { teamId: east.id, players: players(rosters[east.id]!) }, { teamId: west.id, players: players(rosters[west.id]!) });
  const winner = result.home.score > result.away.score ? east.id : west.id;
  const winSide = winner === east.id ? result.home : result.away;
  const mvp = [...winSide.lines].sort((a, b) => b.pts + b.ast + b.orb + b.drb - (a.pts + a.ast + a.orb + a.drb))[0]?.playerId ?? rosters[winner]![0]!;
  season.allStar = { day: season.day, rosters, score: { [east.id]: result.home.score, [west.id]: result.away.score }, winner, mvp };

  const me = save.career.teamId;
  const mine = Object.values(rosters).flat().filter((id) => league.players.find((p) => p.id === id)?.teamId === me);
  const wName = league.conferences.find((c) => c.id === winner)?.name ?? 'The winners';
  push(
    save,
    msg(
      save,
      'all-star',
      'League office',
      `All-Star Game: ${wName} win ${Math.max(result.home.score, result.away.score)}-${Math.min(result.home.score, result.away.score)}`,
      `${nameOf(league, mvp)} (${teamOf(league, mvp)}) was named All-Star MVP. ${
        mine.length ? `Our All-Star${mine.length > 1 ? 's' : ''}: ${mine.map((id) => nameOf(league, id)).join(', ')}.` : 'None of our players made the team this year.'
      }`,
    ),
  );
  wire(save, `All-Star MVP: ${nameOf(league, mvp)} (${teamOf(league, mvp)})`);
}

/** Hand out the regular-season awards (called when the playoffs start). */
export function announceAwards(save: SaveGame) {
  const { league, season } = save;
  if (season.awards) return;
  const a = computeAwards(save);
  season.awards = a;
  const me = save.career.teamId;
  const line = (label: string, id: string | null) => `${label}: ${nameOf(league, id)}${id ? ` (${teamOf(league, id)})` : ''}`;
  const ours = [a.mvp, a.roy, a.sixth, a.dpoy, ...a.allNba.flat()].filter((id) => id && league.players.find((p) => p.id === id)?.teamId === me);
  push(
    save,
    msg(
      save,
      'awards',
      'League office',
      `${nameOf(league, a.mvp)} is the MVP`,
      [
        line('Most Valuable Player', a.mvp),
        line('Rookie of the Year', a.roy),
        line('Sixth Man of the Year', a.sixth),
        line('Defensive Player of the Year', a.dpoy),
        ...a.allNba.map((t, i) => `All-NBA ${['First', 'Second', 'Third'][i]} Team: ${t.map((id) => nameOf(league, id)).join(', ')}`),
        ours.length ? `Congratulations to our ${[...new Set(ours)].map((id) => nameOf(league, id)).join(', ')}.` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  );
  wire(save, `MVP: ${nameOf(league, a.mvp)} (${teamOf(league, a.mvp)})`);
}

/** Finals MVP: best impact on the winning side across the Finals games we kept. */
export function computeFinalsMvp(save: SaveGame): string | null {
  const finals = save.season.series.find((s) => s.round === 4);
  if (!finals?.winner) return null;
  const totals = new Map<string, number>();
  for (const g of finals.games) {
    const box = save.season.boxScores[g.id];
    if (!box) continue;
    const side = box.home.teamId === finals.winner ? box.home : box.away;
    for (const l of side.lines) totals.set(l.playerId, (totals.get(l.playerId) ?? 0) + l.pts + 1.2 * (l.orb + l.drb) + 1.5 * l.ast + 2 * (l.stl + l.blk));
  }
  const best = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];
  // No box scores: the champion's best player by playoff impact.
  const ps = save.season.stats.playoffs;
  return (
    save.league.players
      .filter((p) => p.teamId === finals.winner && ps[p.id])
      .sort((a, b) => impact(ps[b.id]!) - impact(ps[a.id]!))[0]?.id ?? null
  );
}

/** What the owner expected: from where the team ranked in strength at the end of the season. */
export function ownerExpectation(league: LeagueFile, teamId: string): { label: string; wins: number } {
  const ranked = [...league.teams].sort((a, b) => teamRating(league, b.id) - teamRating(league, a.id));
  const rank = ranked.findIndex((t) => t.id === teamId) + 1;
  const n = league.teams.length;
  const wins = Math.round(58 - ((rank - 1) / Math.max(1, n - 1)) * 34);
  const label = rank <= 3 ? 'Win the title' : rank <= 8 ? 'Reach the conference finals' : rank <= 14 ? 'Make the playoffs' : rank <= 20 ? 'Compete for the play-in' : 'Develop the young players';
  return { label, wins };
}

const GRADES = ['F', 'D', 'C', 'B', 'A', 'A+'] as const;

/** The owner's end-of-season review, plus the league record for this season. */
export function seasonReview(save: SaveGame) {
  const { league, season } = save;
  const me = save.career.teamId;
  if (season.awards) season.awards.finalsMvp ??= computeFinalsMvp(save);
  else season.awards = { ...computeAwards(save), finalsMvp: computeFinalsMvp(save) };
  const finals = season.series.find((s) => s.round === 4);
  const runnerUp = finals?.winner ? (finals.top.teamId === finals.winner ? finals.bottom.teamId : finals.top.teamId) : null;
  const record: LeagueSeasonRecord = { season: league.meta.season, champion: season.champion, runnerUp, awards: season.awards, allStarMvp: season.allStar?.mvp ?? null, allStars: season.allStar ? Object.values(season.allStar.rosters).flat() : [] };
  save.leagueHistory = [...(save.leagueHistory ?? []).filter((r) => r.season !== record.season), record];

  const row = standings(league, season.games).find((r) => r.teamId === me);
  const w = row?.w ?? 0;
  const l = row?.l ?? 0;
  const deepest = season.series.filter((s) => s.top.teamId === me || s.bottom.teamId === me).reduce((m, s) => Math.max(m, s.round + (s.winner === me ? 1 : 0)), -1);
  const expected = ownerExpectation(league, me);
  const goalRound = expected.label.startsWith('Win') ? 5 : expected.label.startsWith('Reach') ? 3 : expected.label.startsWith('Make') ? 1 : expected.label.startsWith('Compete') ? 0 : -1;
  // Score: wins against expectation, plus playoff progress against the goal.
  const score = (w - expected.wins) / 6 + (deepest - goalRound) * 0.6 + (season.champion === me ? 1.5 : 0);
  const idx = Math.max(0, Math.min(GRADES.length - 1, Math.round(2.5 + score)));
  const grade = GRADES[idx]!;
  const stage = season.champion === me ? 'won the championship' : deepest >= 4 ? 'reached the Finals' : deepest >= 3 ? 'reached the conference finals' : deepest >= 2 ? 'reached the second round' : deepest >= 1 ? 'made the playoffs' : deepest === 0 ? 'lost in the play-in' : 'missed the playoffs';
  const mood = idx >= 4 ? 'I am delighted. This is exactly the direction I want.' : idx === 3 ? 'A good year. Let us build on it.' : idx === 2 ? 'Acceptable, but I expect more next season.' : 'This was not good enough. Things need to change quickly.';
  const team = league.teams.find((t) => t.id === me);
  save.career.reviews = [...(save.career.reviews ?? []).filter((r) => r.season !== league.meta.season), { season: league.meta.season, grade, wins: w, losses: l, expectation: expected.label }];
  push(
    save,
    msg(
      save,
      'review',
      'Owner',
      `Season review: ${grade}`,
      `The goal for the ${team ? teamName(team) : 'team'} this season was: ${expected.label.toLowerCase()} (around ${expected.wins} wins). We went ${w}-${l} and ${stage}. ${mood}${
        season.awards.finalsMvp ? `\nFinals MVP: ${nameOf(league, season.awards.finalsMvp)}.` : ''
      }`,
    ),
  );
}

/** Honors a player has won in this save, newest first, for badges on his page. */
export function playerHonors(save: SaveGame, playerId: string): { season: number; label: string }[] {
  const out: { season: number; label: string }[] = [];
  const records: LeagueSeasonRecord[] = [...(save.leagueHistory ?? [])];
  const cur = save.season;
  if (cur.awards && !records.some((r) => r.season === save.league.meta.season)) records.push({ season: save.league.meta.season, champion: cur.champion, runnerUp: null, awards: cur.awards });
  for (const r of records) {
    const a = r.awards;
    if (a?.mvp === playerId) out.push({ season: r.season, label: 'MVP' });
    if (a?.finalsMvp === playerId) out.push({ season: r.season, label: 'Finals MVP' });
    if (a?.dpoy === playerId) out.push({ season: r.season, label: 'Defensive POY' });
    if (a?.roy === playerId) out.push({ season: r.season, label: 'Rookie of the Year' });
    if (a?.sixth === playerId) out.push({ season: r.season, label: 'Sixth Man' });
    a?.allNba.forEach((t, i) => t.includes(playerId) && out.push({ season: r.season, label: `All-NBA ${i + 1}${['st', 'nd', 'rd'][i]}` }));
    if (r.allStarMvp === playerId) out.push({ season: r.season, label: 'All-Star MVP' });
    if (r.allStars?.includes(playerId)) out.push({ season: r.season, label: 'All-Star' });
  }
  const thisYear = save.league.meta.season;
  if (cur.allStar && !records.some((r) => r.season === thisYear && r.allStars)) {
    if (cur.allStar.mvp === playerId && !out.some((o) => o.season === thisYear && o.label === 'All-Star MVP')) out.push({ season: thisYear, label: 'All-Star MVP' });
    if (Object.values(cur.allStar.rosters).flat().includes(playerId)) out.push({ season: thisYear, label: 'All-Star' });
  }
  return out.sort((a, b) => b.season - a.season);
}
