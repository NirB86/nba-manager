import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { advance } from './advance';
import { createCareer } from './career';
import { acceptJob, luxuryTaxBill, ownerVerdict, profit, revenue } from './finance';

describe('finances', () => {
  it('books a season of revenue and expenses', async () => {
    const league = generateLeague({ seed: 31 });
    let save = createCareer(league, { teamId: league.teams[4]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'F');
    save = await advance(save, 'season-end');
    const l = save.finance!.ledger;
    expect(l.homeGames).toBeGreaterThanOrEqual(41);
    const avgCrowd = l.attendance / l.homeGames;
    expect(avgCrowd).toBeGreaterThan(9000);
    expect(avgCrowd).toBeLessThanOrEqual(18500);
    const cap = save.league.settings.salaryCap;
    // Revenue in the same ballpark as the cap times two to three, like a real team.
    expect(revenue(l)).toBeGreaterThan(cap * 1.2);
    expect(revenue(l)).toBeLessThan(cap * 4);
    expect(Number.isFinite(profit(l))).toBe(true);
    expect(save.finance!.confidenceHistory?.length).toBe(1);
    console.log('ledger', JSON.stringify(l), 'confidence', save.finance!.confidence);
  }, 60000);

  it('taxes progressively and fires after a disaster', async () => {
    const league = generateLeague({ seed: 32 });
    const cba = league.settings;
    expect(luxuryTaxBill(cba, cba.luxuryTax - 1)).toBe(0);
    const step = cba.salaryCap * 0.035;
    expect(luxuryTaxBill(cba, cba.luxuryTax + step)).toBeCloseTo(step * 1.5, -2);
    expect(luxuryTaxBill(cba, cba.luxuryTax + 3 * step)).toBeGreaterThan(step * 5.5);

    let save = createCareer(league, { teamId: league.teams[0]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'F');
    save = await advance(save, 'season-end');
    save.finance!.confidence = 10;
    save.finance!.confidenceHistory = [{ season: 1, value: 10 }];
    ownerVerdict(save, 'F');
    expect(save.career.fired).toBe(true);
    expect(save.jobOffers).toHaveLength(3);
    const next = acceptJob(save, save.jobOffers![0]!.teamId);
    expect(next.career.teamId).toBe(save.jobOffers![0]!.teamId);
    expect(next.career.fired).toBe(false);
    expect(next.finance!.confidence).toBe(55);
  }, 60000);
});
