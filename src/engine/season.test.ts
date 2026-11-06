import { describe, expect, it } from 'vitest';
import { generateLeague } from './generator';
import { Rng } from './random';
import { conferenceStandings, generateSchedule, newSeason, simulateDay } from './season';

describe('schedule', () => {
  const league = generateLeague({ seed: 7 });
  const games = generateSchedule(league, new Rng(1));

  it('gives every team 82 games, 41 at home', () => {
    expect(games).toHaveLength(1230);
    for (const t of league.teams) {
      expect(games.filter((g) => g.home === t.id || g.away === t.id)).toHaveLength(82);
      const home = games.filter((g) => g.home === t.id).length;
      expect(home).toBeGreaterThanOrEqual(39);
      expect(home).toBeLessThanOrEqual(43);
    }
  });

  it('never has a team play twice in one day, and fits a real season length', () => {
    const byDay = new Map<number, string[]>();
    for (const g of games) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g.home, g.away]);
    for (const teams of byDay.values()) expect(new Set(teams).size).toBe(teams.length);
    expect(byDay.size).toBeLessThan(200);
  });
});

describe('a full season', () => {
  const league = generateLeague({ seed: 11 });
  const season = newSeason(league, new Rng(2));
  const rng = new Rng(3);
  let guard = 0;
  while (season.phase !== 'done' && guard++ < 400) simulateDay(league, season, rng, () => false);

  it('finishes with a champion', () => {
    expect(season.phase).toBe('done');
    expect(season.champion).toBeTruthy();
  });

  it('runs play-in, four playoff rounds and a best-of-seven Finals', () => {
    expect(season.series.filter((s) => s.round === 0)).toHaveLength(6);
    expect(season.series.filter((s) => s.round === 1)).toHaveLength(8);
    expect(season.series.filter((s) => s.round === 2)).toHaveLength(4);
    expect(season.series.filter((s) => s.round === 3)).toHaveLength(2);
    const finals = season.series.find((s) => s.round === 4);
    expect(finals).toBeTruthy();
    expect(Math.max(...(finals?.wins ?? [0]))).toBe(4);
    expect(finals?.games.length).toBeGreaterThanOrEqual(4);
  });

  it('records stats and plausible standings', () => {
    const east = conferenceStandings(league, season.games, 'east');
    expect(east.reduce((s, r) => s + r.w + r.l, 0)).toBe(15 * 82);
    expect(east[0]!.w).toBeGreaterThan(48);
    expect(east.at(-1)!.w).toBeLessThan(35);
    const scorers = Object.values(season.stats.regular).filter((t) => t.g >= 50).map((t) => t.pts / t.g).sort((a, b) => b - a);
    console.log('top ppg', scorers.slice(0, 8).map((x) => x.toFixed(1)).join(' '), '| 50th', scorers[49]?.toFixed(1));
    expect(scorers[0]).toBeGreaterThan(22);
    expect(scorers[0]).toBeLessThan(40);
  });
});
