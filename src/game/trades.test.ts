import { describe, expect, it } from 'vitest';
import { checkMultiTrade, playerOverall, rosterOf, type MultiTrade } from '../engine';
import { counterOffer, dealKey, evaluateDeal, proposeDeal } from './trades';
import { generateLeague } from '../engine/generator';
import { createCareer } from './career';

async function testSave() {
  const league = generateLeague({ seed: 91 });
  return createCareer(league, { teamId: league.teams[0]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'Test');
}

describe('multi-team trades', () => {
  it('checks every team in a three-team deal', async () => {
    const save = await testSave();
    const me = save.career.teamId;
    const [b, c] = save.league.teams.map((t) => t.id).filter((t) => t !== me) as [string, string];
    const pick = (team: string) => save.league.draftPicks.find((k) => k.ownerTeamId === team)!;
    const deal: MultiTrade = { teams: [me, b, c], moves: [
      { kind: 'pick', id: pick(me).id, from: me, to: b },
      { kind: 'pick', id: pick(b).id, from: b, to: c },
      { kind: 'pick', id: pick(c).id, from: c, to: me },
    ] };
    const check = checkMultiTrade(save.league, deal);
    expect(check.valid).toBe(true);
    expect(Object.keys(check.gain).sort()).toEqual([me, b, c].sort());
    const verdict = evaluateDeal(save, deal);
    expect(verdict.answers).toHaveLength(2);
    expect(verdict.chance).toBeCloseTo(verdict.answers[0]!.chance * verdict.answers[1]!.chance);
  });

  it('remembers a refusal for the day and offers a counter', async () => {
    const save = await testSave();
    const me = save.career.teamId;
    const other = save.league.teams.find((t) => t.id !== me)!.id;
    // Ask for their best player for our worst one with a matching salary.
    const star = rosterOf(save.league, other).filter((p) => !p.contract?.noTrade).sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;
    const deal = rosterOf(save.league, me)
      .filter((p) => !p.contract?.noTrade)
      .sort((a, b) => playerOverall(a) - playerOverall(b))
      .map((p): MultiTrade => ({ teams: [me, other], moves: [{ kind: 'player', id: star.id, from: other, to: me }, { kind: 'player', id: p.id, from: me, to: other }] }))
      .find((d) => checkMultiTrade(save.league, d).valid)!;
    expect(deal).toBeDefined();
    expect(evaluateDeal(save, deal).chance).toBeLessThan(0.5);
    const result = proposeDeal(save, deal, () => 0.999);
    expect(result.accepted).toBe(false);
    if (result.accepted) return;
    expect(result.save.season.declinedDeals?.[0]?.key).toBe(dealKey(deal));
    expect(evaluateDeal(result.save, deal).blocked).toBe(true);
    const counter = counterOffer(save, deal);
    if (counter) {
      expect(dealKey(counter.deal)).not.toBe(dealKey(deal));
      expect(counter.changes.length).toBeGreaterThan(0);
      expect(evaluateDeal(save, counter.deal).answers.every((a) => a.chance >= 0.7)).toBe(true);
    }
  });

  it('accepts when the roll is under the chance', async () => {
    const save = await testSave();
    const me = save.career.teamId;
    const other = save.league.teams.find((t) => t.id !== me)!.id;
    const k = save.league.draftPicks.find((x) => x.ownerTeamId === me && x.round === 1)!;
    const result = proposeDeal(save, { teams: [me, other], moves: [{ kind: 'pick', id: k.id, from: me, to: other }] }, () => 0);
    expect(result.accepted).toBe(true);
    expect(result.save.league.draftPicks.find((x) => x.id === k.id)!.ownerTeamId).toBe(other);
    expect(save.league.draftPicks.find((x) => x.id === k.id)!.ownerTeamId).toBe(me);
  });

  it('counters a deal that is a little short with a small extra ask', async () => {
    const save = await testSave();
    const me = save.career.teamId;
    const mine = rosterOf(save.league, me).sort((a, b) => playerOverall(b) - playerOverall(a))[4]!;
    const deals = save.league.teams
      .filter((t) => t.id !== me)
      .flatMap((t) => rosterOf(save.league, t.id).filter((p) => playerOverall(p) === playerOverall(mine) + 1 || playerOverall(p) === playerOverall(mine) + 2).map((p): MultiTrade => ({
        teams: [me, t.id],
        moves: [{ kind: 'player', id: p.id, from: t.id, to: me }, { kind: 'player', id: mine.id, from: me, to: t.id }],
      })))
      .filter((d) => checkMultiTrade(save.league, d).valid && evaluateDeal(save, d).chance < 0.5);
    const counters = deals.map((d) => counterOffer(save, d)).filter((c) => c !== null);
    expect(counters.length).toBeGreaterThan(0);
    for (const c of counters) expect(evaluateDeal(save, c.deal).answers.every((a) => a.chance >= 0.7)).toBe(true);
  });
});
