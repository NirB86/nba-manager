// Season structure: 82-game schedule, standings, play-in and playoffs, and
// stat accumulation. Pure functions over plain data so a season can be saved,
// synced and resumed anywhere.

import { Rng } from './random';
import { simulateGame, type BoxLine, type DepthChart, type GameResult, type PlayEvent } from './sim/game';
import type { LeagueFile, Team } from './types';
import type { MultiTrade } from './trade';

export interface ScheduledGame {
  id: string;
  day: number;
  home: string;
  away: string;
  /** Final score once played. */
  hs?: number;
  as?: number;
  ot?: number;
}

export type StatKey = Exclude<keyof BoxLine, 'playerId' | 'starter'>;
export type StatTotals = Record<StatKey, number> & { g: number; gs: number };

export interface Series {
  id: string;
  /** 0 = play-in, 1 = first round, 2 = conference semis, 3 = conference finals, 4 = finals. */
  round: number;
  conference: string | null;
  bestOf: number;
  top: { teamId: string; seed: number };
  bottom: { teamId: string; seed: number };
  wins: [number, number];
  games: ScheduledGame[];
  winner: string | null;
}

export interface SeasonState {
  year: number;
  phase: 'regular' | 'playoffs' | 'done';
  day: number;
  games: ScheduledGame[];
  series: Series[];
  champion: string | null;
  stats: { regular: Record<string, StatTotals>; playoffs: Record<string, StatTotals> };
  /** Full box scores kept for some games (the user's team and recent days). */
  boxScores: Record<string, GameResult>;
  /** Recent standout performances, newest first (for news tickers). */
  highlights?: Highlight[];
  /** Trades completed this season, oldest first. */
  trades?: { day: number; teams: string[]; sent: string[]; got: string[] }[];
  /** Offers the AI turned down, remembered for the rest of that day. */
  declinedDeals?: { key: string; day: number }[];
  /** Players who turned down a contract offer, by game day. */
  contractTalks?: { playerId: string; day: number }[];
  /** The mid-level exception has been used this season. */
  mleUsed?: boolean;
  /** Trade offers AI teams sent the user. */
  offers?: { id: string; fromTeam: string; deal: MultiTrade; day: number; expiresDay: number; status: 'open' | 'accepted' | 'declined' | 'expired' }[];
  /** Latest rumors and AI-to-AI trades for the league wire, newest first. */
  rumors?: string[];
  /** Current injuries by player id. */
  injuries?: Record<string, Injury>;
  /** Season awards, set when the regular season ends (Finals MVP after the Finals). */
  awards?: SeasonAwards;
  /** Depth charts set by coaches (the user), by team id. Teams without one use the default rotation. */
  depth?: Record<string, DepthChart>;
  /** The All-Star Game, played just past the middle of the regular season. */
  allStar?: AllStarGame;
}

export interface SeasonAwards {
  mvp: string | null;
  roy: string | null;
  sixth: string | null;
  dpoy: string | null;
  /** First, second and third team, five player ids each. */
  allNba: string[][];
  finalsMvp?: string | null;
  /** Top five in MVP voting with their scores. */
  mvpVoting?: { playerId: string; score: number }[];
}

export interface AllStarGame {
  day: number;
  /** Conference id to the twelve player ids picked. */
  rosters: Record<string, string[]>;
  score: Record<string, number>;
  winner: string;
  mvp: string;
}

export interface Highlight {
  day: number;
  playerId: string;
  teamId: string;
  oppId: string;
  pts: number;
  reb: number;
  ast: number;
  won: boolean;
}

export interface Injury {
  type: string;
  /** Team games still to miss. */
  gamesLeft: number;
  /** Games the injury was expected to cost when it happened. */
  total: number;
  /** Game day it happened. */
  day: number;
}

const INJURY_TYPES: [string, number, number, number][] = [
  // name, weight, min games, max games
  ['Sprained ankle', 30, 1, 6],
  ['Sore knee', 14, 1, 4],
  ['Back spasms', 10, 1, 5],
  ['Hamstring strain', 12, 3, 12],
  ['Bruised hip', 8, 1, 3],
  ['Concussion', 5, 2, 7],
  ['Calf strain', 8, 4, 14],
  ['Broken hand', 4, 15, 30],
  ['High ankle sprain', 4, 10, 25],
  ['Torn meniscus', 3, 20, 45],
  ['Torn ACL', 1, 82, 82],
  ['Torn Achilles', 1, 82, 82],
];

/** A player's chance of getting hurt in one game, from minutes played and how injury-prone he is. */
function injuryChance(league: LeagueFile, playerId: string, sec: number): number {
  const p = league.players.find((x) => x.id === playerId);
  if (!p || sec <= 0) return 0;
  const prone = 0.45 + (p.personality.injuryProneness / 20) * 1.3;
  const durability = 1.25 - p.attributes.durability * 0.025;
  return 0.021 * prone * durability * Math.min(1.5, sec / (30 * 60));
}

/**
 * After a game: injured players on both teams heal by one game, and players
 * who played may get hurt. `medical(teamId)` is the team's medical staff
 * rating (1-20); a better staff gets players back sooner.
 */
export function updateInjuries(league: LeagueFile, season: SeasonState, result: GameResult, rng: Rng, medical: (teamId: string) => number = () => 10): Injury[] {
  const injuries = (season.injuries ??= {});
  const teams = new Set([result.home.teamId, result.away.teamId]);
  for (const [id, inj] of Object.entries(injuries)) {
    const p = league.players.find((x) => x.id === id);
    if (!p || !p.teamId || !teams.has(p.teamId)) continue;
    inj.gamesLeft--;
    if (inj.gamesLeft <= 0) delete injuries[id];
  }
  const fresh: Injury[] = [];
  for (const side of [result.home, result.away]) {
    for (const l of side.lines) {
      if (injuries[l.playerId] || !rng.chance(injuryChance(league, l.playerId, l.sec))) continue;
      const [type, , lo, hi] = rng.weighted(INJURY_TYPES.map((t) => [t, t[1]] as const));
      const staff = 1.15 - medical(side.teamId) * 0.015;
      const games = Math.max(1, Math.round(rng.int(lo, hi) * (hi >= 82 ? 1 : staff)));
      const injury = { type, gamesLeft: games, total: games, day: season.day };
      injuries[l.playerId] = injury;
      fresh.push({ ...injury, type: `${l.playerId}|${type}` });
    }
  }
  return fresh;
}

function recordHighlights(season: SeasonState, day: number, result: GameResult) {
  const list = (season.highlights ??= []);
  for (const [side, opp] of [[result.home, result.away], [result.away, result.home]] as const) {
    for (const l of side.lines) {
      const reb = l.orb + l.drb;
      const big = l.pts >= 38 || (l.pts >= 10 && reb >= 10 && l.ast >= 10) || reb >= 20 || l.ast >= 16;
      if (big) list.unshift({ day, playerId: l.playerId, teamId: side.teamId, oppId: opp.teamId, pts: l.pts, reb, ast: l.ast, won: side.score > opp.score });
    }
  }
  if (list.length > 40) list.length = 40;
}

// ------------------------------------------------------------------ schedule

/** How many times each pair of teams meets: 4 in division, 3 or 4 in conference, 2 across. */
function pairCounts(league: LeagueFile): Map<string, number> {
  const counts = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const teams = league.teams;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i] as Team;
      const b = teams[j] as Team;
      counts.set(key(a.id, b.id), a.divisionId === b.divisionId ? 4 : a.conferenceId === b.conferenceId ? 4 : 2);
    }
  }
  // Within a conference, each team plays 4 non-division opponents only 3 times:
  // two from each other division, paired in a rotating pattern.
  for (const conf of league.conferences) {
    const divs = conf.divisions.map((d) => teams.filter((t) => t.divisionId === d.id));
    for (let x = 0; x < divs.length; x++) {
      for (let y = x + 1; y < divs.length; y++) {
        const A = divs[x] as Team[];
        const B = divs[y] as Team[];
        if (A.length !== B.length) continue;
        A.forEach((t, i) => {
          for (const off of [0, 1]) {
            const u = B[(i + off + x + y) % B.length] as Team;
            counts.set(key(t.id, u.id), 3);
          }
        });
      }
    }
  }
  return counts;
}

export function generateSchedule(league: LeagueFile, rng: Rng): ScheduledGame[] {
  const matchups: { home: string; away: string }[] = [];
  for (const [k, n] of pairCounts(league)) {
    const [a, b] = k.split('|') as [string, string];
    const aHomeFirst = rng.chance(0.5);
    for (let i = 0; i < n; i++) {
      const aHome = i % 2 === 0 ? aHomeFirst : !aHomeFirst;
      matchups.push(aHome ? { home: a, away: b } : { home: b, away: a });
    }
  }
  rng.shuffle(matchups);

  // Fill days greedily: no team plays twice in a day, about 7 games a day.
  const games: ScheduledGame[] = [];
  let remaining = matchups;
  let day = 0;
  while (remaining.length) {
    const busy = new Set<string>();
    const later: typeof matchups = [];
    let today = 0;
    const cap = rng.int(5, 11);
    for (const m of remaining) {
      if (today < cap && !busy.has(m.home) && !busy.has(m.away)) {
        busy.add(m.home);
        busy.add(m.away);
        games.push({ id: `g${day}-${today}`, day, home: m.home, away: m.away });
        today++;
      } else {
        later.push(m);
      }
    }
    remaining = later;
    day++;
  }
  return games;
}

export function newSeason(league: LeagueFile, rng: Rng): SeasonState {
  return {
    year: league.meta.season,
    phase: 'regular',
    day: 0,
    games: generateSchedule(league, rng),
    series: [],
    champion: null,
    stats: { regular: {}, playoffs: {} },
    boxScores: {},
  };
}

// ------------------------------------------------------------------ standings

export interface StandingRow {
  teamId: string;
  w: number;
  l: number;
  pct: number;
  gb: number;
  home: [number, number];
  away: [number, number];
  conf: [number, number];
  pf: number;
  pa: number;
  last10: [number, number];
  streak: string;
}

export function standings(league: LeagueFile, games: ScheduledGame[]): StandingRow[] {
  const rows = new Map<string, StandingRow & { results: boolean[] }>();
  for (const t of league.teams) {
    rows.set(t.id, { teamId: t.id, w: 0, l: 0, pct: 0, gb: 0, home: [0, 0], away: [0, 0], conf: [0, 0], pf: 0, pa: 0, last10: [0, 0], streak: '-', results: [] });
  }
  const confOf = new Map(league.teams.map((t) => [t.id, t.conferenceId]));
  const played = games.filter((g) => g.hs !== undefined).sort((a, b) => a.day - b.day);
  for (const g of played) {
    const h = rows.get(g.home);
    const a = rows.get(g.away);
    if (!h || !a || g.hs === undefined || g.as === undefined) continue;
    const homeWon = g.hs > g.as;
    const sameConf = confOf.get(g.home) === confOf.get(g.away);
    h.pf += g.hs;
    h.pa += g.as;
    a.pf += g.as;
    a.pa += g.hs;
    if (homeWon) {
      h.w++; a.l++; h.home[0]++; a.away[1]++;
      if (sameConf) { h.conf[0]++; a.conf[1]++; }
    } else {
      a.w++; h.l++; a.away[0]++; h.home[1]++;
      if (sameConf) { a.conf[0]++; h.conf[1]++; }
    }
    h.results.push(homeWon);
    a.results.push(!homeWon);
  }
  const out = [...rows.values()].map(({ results, ...r }) => {
    const gp = r.w + r.l;
    const last = results.slice(-10);
    let streak = '-';
    if (results.length) {
      const lastWin = results[results.length - 1];
      let n = 0;
      for (let i = results.length - 1; i >= 0 && results[i] === lastWin; i--) n++;
      streak = `${lastWin ? 'W' : 'L'}${n}`;
    }
    return { ...r, pct: gp ? r.w / gp : 0, last10: [last.filter(Boolean).length, last.filter((x) => !x).length] as [number, number], streak };
  });
  return out;
}

/** Conference standings, best first, with games-behind filled in. */
export function conferenceStandings(league: LeagueFile, games: ScheduledGame[], conferenceId: string): StandingRow[] {
  const confTeams = new Set(league.teams.filter((t) => t.conferenceId === conferenceId).map((t) => t.id));
  const rows = standings(league, games)
    .filter((r) => confTeams.has(r.teamId))
    .sort((a, b) => b.pct - a.pct || b.w - a.w || b.pf - b.pa - (a.pf - a.pa) || a.teamId.localeCompare(b.teamId));
  const lead = rows[0];
  for (const r of rows) r.gb = lead ? (lead.w - r.w + (r.l - lead.l)) / 2 : 0;
  return rows;
}

// ------------------------------------------------------------------ simulation

const emptyTotals = (): StatTotals => ({ g: 0, gs: 0, sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0 });
const STAT_KEYS: StatKey[] = ['sec', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'orb', 'drb', 'ast', 'stl', 'blk', 'tov', 'pf', 'pm'];

function addStats(table: Record<string, StatTotals>, result: GameResult) {
  for (const side of [result.home, result.away]) {
    for (const l of side.lines) {
      const t = (table[l.playerId] ??= emptyTotals());
      t.g++;
      if (l.starter) t.gs++;
      for (const k of STAT_KEYS) t[k] += l[k];
    }
  }
}

/** Players available tonight: injured players sit, unless a team would have fewer than eight. */
export function availablePlayers(league: LeagueFile, season: SeasonState, teamId: string) {
  const all = league.players.filter((p) => p.teamId === teamId);
  const healthy = all.filter((p) => !season.injuries?.[p.id]);
  return healthy.length >= 8 ? healthy : all;
}

function playGame(league: LeagueFile, rng: Rng, g: ScheduledGame, log?: PlayEvent[], played?: GameResult, season?: SeasonState): GameResult {
  const roster = (teamId: string) => (season ? availablePlayers(league, season, teamId) : league.players.filter((p) => p.teamId === teamId));
  const result = played ?? simulateGame(rng, { teamId: g.home, players: roster(g.home), depth: season?.depth?.[g.home] }, { teamId: g.away, players: roster(g.away), depth: season?.depth?.[g.away] }, log);
  g.hs = result.home.score;
  g.as = result.away.score;
  g.ot = result.overtimes;
  return result;
}

export interface DayReport {
  played: { game: ScheduledGame; result: GameResult; log?: PlayEvent[] }[];
  phaseChanged: boolean;
  /** New injuries today: player id and the injury. */
  injured: { playerId: string; injury: Injury }[];
}

/**
 * Play the next day of the season in place. `keepBox` decides which games keep
 * a full box score in the save.
 */
/**
 * `played`: results of games already played live (coached by the user), by
 * game id. They are recorded instead of being simulated.
 */
export function simulateDay(league: LeagueFile, season: SeasonState, rng: Rng, keepBox: (g: ScheduledGame) => boolean, logFor?: (g: ScheduledGame) => boolean, played?: Record<string, GameResult>): DayReport {
  const report: DayReport = { played: [], phaseChanged: false, injured: [] };
  const medical = (teamId: string) => league.staff.find((m) => m.teamId === teamId && m.role === 'MED')?.ratings.medical ?? 10;
  const injuries = (result: GameResult) => {
    for (const x of updateInjuries(league, season, result, rng, medical)) {
      const [playerId, type] = x.type.split('|') as [string, string];
      report.injured.push({ playerId, injury: { ...x, type } });
    }
  };
  if (season.phase === 'done') return report;

  if (season.phase === 'regular') {
    const today = season.games.filter((g) => g.day === season.day && g.hs === undefined);
    for (const g of today) {
      const log = logFor?.(g) ? [] : undefined;
      const result = playGame(league, rng, g, log, played?.[g.id], season);
      addStats(season.stats.regular, result);
      injuries(result);
      recordHighlights(season, season.day, result);
      if (keepBox(g)) season.boxScores[g.id] = result;
      report.played.push({ game: g, result, log });
    }
    season.day++;
    if (season.games.every((g) => g.hs !== undefined)) {
      season.phase = 'playoffs';
      season.series = playInRound(league, season);
      report.phaseChanged = true;
    }
    return report;
  }

  // Playoffs: every unfinished series in the current round plays one game.
  const active = season.series.filter((s) => s.winner === null);
  for (const s of active) {
    const n = s.games.length;
    // 2-2-1-1-1: the higher seed hosts games 1, 2, 5 and 7.
    const topHome = s.bestOf === 1 || [0, 1, 4, 6].includes(n);
    const g: ScheduledGame = {
      id: `${s.id}-g${n + 1}`,
      day: season.day,
      home: topHome ? s.top.teamId : s.bottom.teamId,
      away: topHome ? s.bottom.teamId : s.top.teamId,
    };
    const log = logFor?.(g) ? [] : undefined;
    const result = playGame(league, rng, g, log, played?.[g.id], season);
    addStats(season.stats.playoffs, result);
    injuries(result);
    recordHighlights(season, season.day, result);
    if (keepBox(g)) season.boxScores[g.id] = result;
    s.games.push(g);
    const topWon = (g.home === s.top.teamId) === ((g.hs ?? 0) > (g.as ?? 0));
    s.wins[topWon ? 0 : 1]++;
    const needed = Math.ceil(s.bestOf / 2);
    if (s.wins[0] >= needed) s.winner = s.top.teamId;
    else if (s.wins[1] >= needed) s.winner = s.bottom.teamId;
    report.played.push({ game: g, result, log });
  }
  season.day++;
  if (season.series.every((s) => s.winner !== null)) {
    const next = nextRound(league, season);
    if (next.length) {
      season.series.push(...next);
    } else {
      season.phase = 'done';
      season.champion = season.series.find((s) => s.round === 4)?.winner ?? null;
    }
    report.phaseChanged = true;
  }
  return report;
}

// ------------------------------------------------------------------ playoffs

function seeds(league: LeagueFile, season: SeasonState, conferenceId: string) {
  return conferenceStandings(league, season.games, conferenceId).map((r, i) => ({ teamId: r.teamId, seed: i + 1 }));
}

function series(id: string, round: number, conference: string | null, bestOf: number, a: { teamId: string; seed: number }, b: { teamId: string; seed: number }): Series {
  const [top, bottom] = a.seed <= b.seed ? [a, b] : [b, a];
  return { id, round, conference, bestOf, top, bottom, wins: [0, 0], games: [], winner: null };
}

function playInRound(league: LeagueFile, season: SeasonState): Series[] {
  const out: Series[] = [];
  for (const conf of league.conferences) {
    const s = seeds(league, season, conf.id);
    if (s.length < 10) continue;
    out.push(series(`pi-${conf.id}-78`, 0, conf.id, 1, s[6]!, s[7]!), series(`pi-${conf.id}-910`, 0, conf.id, 1, s[8]!, s[9]!));
  }
  return out;
}

const loserOf = (s: Series) => (s.winner === s.top.teamId ? s.bottom : s.top);
const winnerOf = (s: Series) => (s.winner === s.top.teamId ? s.top : s.bottom);

function nextRound(league: LeagueFile, season: SeasonState): Series[] {
  const has = (id: string) => season.series.some((s) => s.id === id);
  const get = (id: string) => season.series.find((s) => s.id === id);
  const out: Series[] = [];

  for (const conf of league.conferences) {
    const c = conf.id;
    const s78 = get(`pi-${c}-78`);
    const s910 = get(`pi-${c}-910`);
    // Play-in, second game: loser of 7v8 hosts winner of 9v10 for the 8th seed.
    if (s78 && s910 && !has(`pi-${c}-8`)) {
      const l = loserOf(s78);
      const w = winnerOf(s910);
      out.push(series(`pi-${c}-8`, 0, c, 1, { teamId: l.teamId, seed: 8 }, { teamId: w.teamId, seed: 9 }));
    }
  }
  if (out.length) return out;

  const maxRound = Math.max(...season.series.map((s) => s.round));
  if (maxRound === 0) {
    for (const conf of league.conferences) {
      const c = conf.id;
      const s = seeds(league, season, c);
      const seventh = { teamId: winnerOf(get(`pi-${c}-78`)!).teamId, seed: 7 };
      const eighth = { teamId: winnerOf(get(`pi-${c}-8`)!).teamId, seed: 8 };
      const seed = (n: number) => s[n - 1]!;
      out.push(
        series(`r1-${c}-1`, 1, c, 7, seed(1), eighth),
        series(`r1-${c}-4`, 1, c, 7, seed(4), seed(5)),
        series(`r1-${c}-3`, 1, c, 7, seed(3), seed(6)),
        series(`r1-${c}-2`, 1, c, 7, seed(2), seventh),
      );
    }
    return out;
  }
  if (maxRound === 1 || maxRound === 2) {
    const prefix = maxRound === 1 ? 'r1' : 'r2';
    for (const conf of league.conferences) {
      const c = conf.id;
      const prev = season.series.filter((s) => s.round === maxRound && s.conference === c);
      // Bracket order is kept by creation order: (1v8, 4v5) and (3v6, 2v7).
      for (let i = 0; i + 1 < prev.length; i += 2) {
        const a = winnerOf(prev[i]!);
        const b = winnerOf(prev[i + 1]!);
        out.push(series(`${prefix === 'r1' ? 'r2' : 'r3'}-${c}-${i / 2}`, maxRound + 1, c, 7, a, b));
      }
    }
    return out;
  }
  if (maxRound === 3) {
    const finals = season.series.filter((s) => s.round === 3);
    if (finals.length === 2) {
      // Home court in the Finals goes to the better regular-season record.
      const table = new Map(standings(league, season.games).map((r) => [r.teamId, r]));
      const [a, b] = finals.map(winnerOf) as [Series['top'], Series['top']];
      const ra = table.get(a.teamId)?.pct ?? 0;
      const rb = table.get(b.teamId)?.pct ?? 0;
      out.push(series('finals', 4, null, 7, { teamId: a.teamId, seed: ra >= rb ? 1 : 2 }, { teamId: b.teamId, seed: ra >= rb ? 2 : 1 }));
    }
    return out;
  }
  return out;
}

export function emptyStatTotals(): StatTotals {
  return emptyTotals();
}
