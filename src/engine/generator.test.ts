import { describe, expect, it } from 'vitest';
import { generateLeague } from './generator';
import { validateLeague } from './validate';
import { playerOverall, teamPayroll, teamSummaries } from './index';

describe('generateLeague', () => {
  const league = generateLeague({ seed: 12345, season: 2026 });

  it('builds 30 teams in 2 conferences and 6 divisions', () => {
    expect(league.teams).toHaveLength(30);
    expect(league.conferences).toHaveLength(2);
    for (const conf of league.conferences) {
      expect(league.teams.filter((t) => t.conferenceId === conf.id)).toHaveLength(15);
    }
  });

  it('gives every team a full roster with contracts and unique jerseys', () => {
    for (const team of league.teams) {
      const roster = league.players.filter((p) => p.teamId === team.id);
      expect(roster).toHaveLength(15);
      expect(roster.every((p) => p.contract && p.contract.years.length > 0)).toBe(true);
      expect(new Set(roster.map((p) => p.jersey)).size).toBe(15);
      for (const pos of ['PG', 'SG', 'SF', 'PF', 'C']) {
        expect(roster.filter((p) => p.position === pos).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('is a valid league file', () => {
    const result = validateLeague(JSON.parse(JSON.stringify(league)));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const again = generateLeague({ seed: 12345, season: 2026 });
    expect(again.players.map((p) => [p.firstName, p.lastName, playerOverall(p)])).toEqual(
      league.players.map((p) => [p.firstName, p.lastName, playerOverall(p)]),
    );
  });

  it('produces a believable talent spread', () => {
    const rostered = league.players.filter((p) => p.teamId);
    const ovrs = rostered.map(playerOverall).sort((a, b) => b - a);
    expect(ovrs[0]).toBeGreaterThanOrEqual(85);
    expect(ovrs.at(-1)).toBeGreaterThanOrEqual(40);
    const ratings = teamSummaries(league).map((s) => s.rating);
    expect(Math.max(...ratings) - Math.min(...ratings)).toBeGreaterThanOrEqual(5);
  });

  it('keeps payrolls in a realistic band around the cap', () => {
    const cap = league.settings.salaryCap;
    const payrolls = league.teams.map((t) => teamPayroll(league, t.id, 2026) / cap).sort((a, b) => a - b);
    const median = payrolls[15] ?? 0;
    expect(median).toBeGreaterThan(0.85);
    expect(median).toBeLessThan(1.3);
    expect(payrolls[0]).toBeGreaterThan(0.6);
    expect(payrolls.at(-1)).toBeLessThan(1.6);
  });

  it('gives each team 7 years of first- and second-round picks', () => {
    expect(league.draftPicks).toHaveLength(30 * 7 * 2);
  });
});

describe('validateLeague', () => {
  it('rejects junk', () => {
    expect(validateLeague(null).ok).toBe(false);
    expect(validateLeague({ format: 'other' }).ok).toBe(false);
  });

  it('reports bad attributes and unknown teams', () => {
    const league = generateLeague({ seed: 1 });
    const broken = JSON.parse(JSON.stringify(league));
    broken.players[0].attributes.three = 25;
    broken.players[1].teamId = 't-nope';
    const result = validateLeague(broken);
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toMatch(/three/);
    expect(result.errors.join('\n')).toMatch(/t-nope/);
  });
});
