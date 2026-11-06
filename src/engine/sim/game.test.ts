import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generator';
import { teamRating } from '../league';
import { Rng } from '../random';
import { simulateGame, type GameResult, type SimTeam } from './game';

const league = generateLeague({ seed: 2024 });
const simTeam = (id: string): SimTeam => ({ teamId: id, players: league.players.filter((p) => p.teamId === id) });

function sum(results: GameResult[], key: 'pts' | 'fga' | 'tpa' | 'fta' | 'tov' | 'orb' | 'drb' | 'ast' | 'stl' | 'blk' | 'fgm' | 'tpm' | 'ftm') {
  let s = 0;
  for (const g of results) for (const side of [g.home, g.away]) for (const l of side.lines) s += l[key];
  return s;
}

describe('simulateGame', () => {
  const rng = new Rng(99);
  const results: GameResult[] = [];
  const teams = league.teams.map((t) => t.id);
  for (let i = 0; i < 600; i++) {
    const h = teams[i % 30] as string;
    const a = teams[(i * 7 + 3) % 30] as string;
    if (h === a) continue;
    results.push(simulateGame(rng, simTeam(h), simTeam(a)));
  }
  const n = results.length * 2; // team-games
  const per = (k: Parameters<typeof sum>[1]) => sum(results, k) / n;

  it('produces NBA-like team averages', () => {
    const stats = {
      pts: per('pts'),
      fga: per('fga'),
      threeRate: sum(results, 'tpa') / sum(results, 'fga'),
      fgPct: sum(results, 'fgm') / sum(results, 'fga'),
      threePct: sum(results, 'tpm') / sum(results, 'tpa'),
      ftRate: sum(results, 'fta') / sum(results, 'fga'),
      ftPct: sum(results, 'ftm') / sum(results, 'fta'),
      tov: per('tov'),
      ast: per('ast'),
      reb: per('orb') + per('drb'),
      orbPct: sum(results, 'orb') / (sum(results, 'orb') + sum(results, 'drb')),
      stl: per('stl'),
      blk: per('blk'),
    };
    console.log(JSON.stringify(stats, (_, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
    expect(stats.pts).toBeGreaterThan(106);
    expect(stats.pts).toBeLessThan(122);
    expect(stats.threeRate).toBeGreaterThan(0.33);
    expect(stats.threeRate).toBeLessThan(0.47);
    expect(stats.fgPct).toBeGreaterThan(0.44);
    expect(stats.fgPct).toBeLessThan(0.51);
    expect(stats.threePct).toBeGreaterThan(0.33);
    expect(stats.threePct).toBeLessThan(0.39);
    expect(stats.ftRate).toBeGreaterThan(0.18);
    expect(stats.ftRate).toBeLessThan(0.3);
    expect(stats.tov).toBeGreaterThan(11);
    expect(stats.tov).toBeLessThan(16.5);
    expect(stats.ast).toBeGreaterThan(22);
    expect(stats.ast).toBeLessThan(30);
    expect(stats.reb).toBeGreaterThan(39);
    expect(stats.reb).toBeLessThan(48);
  });

  it('gives every game a winner and 240 minutes per team in regulation', () => {
    for (const g of results) {
      expect(g.home.score).not.toBe(g.away.score);
      const total = (side: GameResult['home']) => side.lines.reduce((s, l) => s + l.sec, 0);
      expect(total(g.home)).toBe(5 * (48 * 60 + g.overtimes * 300));
      const pts = g.home.lines.reduce((s, l) => s + l.pts, 0);
      expect(pts).toBe(g.home.score);
    }
  });

  it('plays stars more than bench players', () => {
    const minutes = new Map<string, number>();
    for (const g of results) for (const l of [...g.home.lines, ...g.away.lines]) minutes.set(l.playerId, (minutes.get(l.playerId) ?? 0) + l.sec);
    const team = teams[0] as string;
    const roster = simTeam(team).players;
    const games = results.filter((g) => g.home.teamId === team || g.away.teamId === team).length;
    const mpg = roster.map((p) => (minutes.get(p.id) ?? 0) / 60 / games).sort((a, b) => b - a);
    expect(mpg[0]).toBeGreaterThan(28);
    expect(mpg[0]).toBeLessThan(40);
    expect(mpg[9]).toBeLessThan(18);
  });

  it('lets the better team win more often, not always', () => {
    const ratings = new Map(teams.map((t) => [t, teamRating(league, t)]));
    let favWins = 0;
    let decided = 0;
    let homeWins = 0;
    for (const g of results) {
      if (g.home.score > g.away.score) homeWins++;
      const diff = (ratings.get(g.home.teamId) ?? 0) - (ratings.get(g.away.teamId) ?? 0);
      if (Math.abs(diff) < 4) continue;
      decided++;
      const homeWon = g.home.score > g.away.score;
      if ((diff > 0) === homeWon) favWins++;
    }
    const favRate = favWins / decided;
    const homeRate = homeWins / results.length;
    console.log(JSON.stringify({ favRate, homeRate, decided }));
    expect(favRate).toBeGreaterThan(0.62);
    expect(favRate).toBeLessThan(0.92);
    expect(homeRate).toBeGreaterThan(0.5);
    expect(homeRate).toBeLessThan(0.65);
  });
});
