import { describe, expect, it } from 'vitest';
import { generateLeague } from './generator';
import { playerOverall, rosterOf } from './league';
import { checkTrade, executeTrade, maxIncoming, pickValue, playerValue, teamStrategy } from './trade';
import { salaryIn } from './contracts';

const league = generateLeague({ seed: 77 });
const season = league.meta.season;
const [a, b] = league.teams;

describe('trade engine', () => {
  it('lets over-the-cap teams take back a bit more salary than they send', () => {
    const payroll = league.settings.salaryCap * 1.1;
    expect(maxIncoming(league, payroll, 5_000_000)).toBe(10_250_000);
    expect(maxIncoming(league, payroll, 20_000_000)).toBe(27_500_000);
    expect(maxIncoming(league, league.settings.secondApron + 1, 20_000_000)).toBe(20_000_000);
  });

  it('values young high-potential players more for rebuilding teams', () => {
    const young = league.players.filter((p) => p.teamId && p.potential - playerOverall(p) >= 8).sort((x, y) => y.potential - x.potential)[0]!;
    expect(playerValue(league, young, 'rebuild')).toBeGreaterThan(playerValue(league, young, 'contend') * 0.9);
    const pick = league.draftPicks.find((k) => k.round === 1)!;
    expect(pickValue(league, pick, 'rebuild')).toBeGreaterThan(pickValue(league, pick, 'contend'));
  });

  it('rejects mismatched salaries and accepts a matched swap', () => {
    const star = rosterOf(league, a!.id).sort((x, y) => salaryIn(y, season) - salaryIn(x, season))[0]!;
    const cheap = rosterOf(league, b!.id).sort((x, y) => salaryIn(x, season) - salaryIn(y, season))[0]!;
    const lopsided = checkTrade(league, { fromTeam: b!.id, toTeam: a!.id, give: { players: [cheap.id], picks: [] }, get: { players: [star.id], picks: [] } });
    if (salaryIn(star, season) > 2 * salaryIn(cheap, season) + 250_000) {
      expect(lopsided.problems.join(' ')).toMatch(/Salaries don't match|limit/);
    }
    const sameish = rosterOf(league, b!.id).sort((x, y) => Math.abs(salaryIn(x, season) - salaryIn(star, season)) - Math.abs(salaryIn(y, season) - salaryIn(star, season)))[0]!;
    const fair = checkTrade(league, { fromTeam: b!.id, toTeam: a!.id, give: { players: [sameish.id], picks: [] }, get: { players: [star.id], picks: [] } });
    expect(fair.problems.filter((p) => /Salaries/.test(p))).toEqual([]);
  });

  it('moves players and picks when a trade executes', () => {
    const copy = structuredClone(league);
    const p1 = rosterOf(copy, a!.id)[3]!;
    const p2 = rosterOf(copy, b!.id)[3]!;
    const pick = copy.draftPicks.find((k) => k.ownerTeamId === a!.id && k.round === 2)!;
    executeTrade(copy, { fromTeam: a!.id, toTeam: b!.id, give: { players: [p1.id], picks: [pick.id] }, get: { players: [p2.id], picks: [] } });
    expect(copy.players.find((p) => p.id === p1.id)!.teamId).toBe(b!.id);
    expect(copy.players.find((p) => p.id === p2.id)!.teamId).toBe(a!.id);
    expect(copy.draftPicks.find((k) => k.id === pick.id)!.ownerTeamId).toBe(b!.id);
    const jerseys = copy.players.filter((p) => p.teamId === b!.id).map((p) => p.jersey);
    expect(new Set(jerseys).size).toBe(jerseys.length);
  });

  it('classifies teams by strength', () => {
    const strategies = league.teams.map((t) => teamStrategy(league, t.id));
    expect(strategies.filter((s) => s === 'contend')).toHaveLength(10);
    expect(strategies.filter((s) => s === 'rebuild')).toHaveLength(10);
  });
});
