import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { rosterOf, salaryIn } from '../engine';
import { createCareer } from './career';
import { acceptCounter, evaluateOffer, makeOffer, negotiation, signingBudget } from './contracts';

function testSave() {
  const league = generateLeague({ seed: 33 });
  return createCareer(league, { teamId: league.teams[0]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'Test');
}

describe('contract offers', () => {
  it('opens extensions only near the end of a deal', () => {
    const save = testSave();
    const season = save.league.meta.season;
    for (const p of rosterOf(save.league, save.career.teamId).filter((x) => x.contract?.kind !== 'two-way')) {
      const left = p.contract!.years.filter((y) => y.season >= season).length;
      expect(negotiation(save, p).ok).toBe(left <= 2);
    }
  });

  it('pays the asking price likely, a lowball unlikely, and extends after the current deal', () => {
    const save = testSave();
    const season = save.league.meta.season;
    const p = rosterOf(save.league, save.career.teamId).find((x) => x.contract?.kind !== 'two-way' && negotiation(save, x).ok)!;
    const elig = negotiation(save, p);
    if (!elig.ok) throw new Error(elig.reason);
    const n = elig.negotiation;
    expect(evaluateOffer(save, p, n, n.ask).chance).toBeGreaterThan(0.4);
    expect(evaluateOffer(save, p, n, { ...n.ask, salary: Math.max(n.minSalary, n.ask.salary * 0.6) }).chance).toBeLessThan(0.15);
    const before = salaryIn(p, season);
    const result = makeOffer(save, p.id, n.ask, () => 0);
    expect(result.signed).toBe(true);
    const after = result.save.league.players.find((x) => x.id === p.id)!;
    expect(salaryIn(after, season)).toBe(before);
    expect(after.contract!.years.at(-1)!.season).toBe(n.firstSeason + n.ask.years - 1);
  });

  it('a refusal comes with a counter that can be accepted, and blocks offers until the next day', () => {
    const save = testSave();
    const p = rosterOf(save.league, save.career.teamId).find((x) => x.contract?.kind !== 'two-way' && negotiation(save, x).ok)!;
    const elig = negotiation(save, p);
    if (!elig.ok) throw new Error(elig.reason);
    const result = makeOffer(save, p.id, { ...elig.negotiation.ask, salary: elig.negotiation.minSalary }, () => 0.999);
    expect(result.signed).toBe(false);
    if (result.signed) return;
    const again = negotiation(result.save, p);
    expect(again.ok && again.negotiation.waitUntilNextDay).toBe(true);
    const signed = acceptCounter(result.save, p.id, result.counter);
    expect(signed.inbox[0]!.subject).toContain('extension');
  });

  it('signs a free agent within the team budget', () => {
    const save = testSave();
    const me = save.career.teamId;
    // Make room on the roster.
    const cut = rosterOf(save.league, me).filter((x) => x.contract?.kind !== 'two-way').at(-1)!;
    cut.teamId = null;
    const fa = save.league.players.find((x) => x.teamId === null && x.id !== cut.id)!;
    const elig = negotiation(save, fa);
    if (!elig.ok) throw new Error(elig.reason);
    const budget = signingBudget(save);
    const offer = { ...elig.negotiation.ask, salary: Math.min(elig.negotiation.ask.salary, budget.limit) };
    expect(evaluateOffer(save, fa, elig.negotiation, { ...offer, salary: budget.limit + 1 }).valid).toBe(false);
    const result = makeOffer(save, fa.id, offer, () => 0);
    expect(result.signed).toBe(true);
    expect(result.save.league.players.find((x) => x.id === fa.id)!.teamId).toBe(me);
  });
});
