import { describe, expect, it } from 'vitest';
import { Rng, rosterOf, salaryFloor, teamPayroll } from '../engine';
import { generateLeague } from '../engine/generator';
import { advance } from './advance';
import { createCareer } from './career';
import { assessTax, finance, profit } from './finance';
import { matchOfferSheet, pendingOptions, setOptionChoice, simDraft, startFreeAgency, startOffseason } from './offseason';

const career = (seed: number) => {
  const league = generateLeague({ seed });
  return createCareer(league, { teamId: league.teams[2]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'R');
};

describe('contract rules', () => {
  it('decides options when free agency opens: your team option is your call', async () => {
    let save = await advance(career(91), 'season-end');
    save = simDraft(startOffseason(save, new Rng(1)), 'all', new Rng(1));
    const year = save.offseason!.draftYear;
    const me = save.career.teamId;
    const [a, b] = rosterOf(save.league, me).filter((p) => p.contract && p.contract.kind !== 'two-way' && p.contract.years.some((y) => y.season === year));
    for (const p of [a!, b!]) p.contract!.option = { season: year, type: 'team' };
    expect(pendingOptions(save).map((x) => x.player.id)).toEqual(expect.arrayContaining([a!.id, b!.id]));
    save = setOptionChoice(save, a!.id, 'decline');
    save = setOptionChoice(save, b!.id, 'exercise');
    save = startFreeAgency(save, new Rng(2));
    const A = save.league.players.find((p) => p.id === a!.id)!;
    const B = save.league.players.find((p) => p.id === b!.id)!;
    expect(A.teamId).toBeNull();
    expect(save.offseason!.birdRights[A.id]).toBe(me);
    expect(B.teamId).toBe(me);
    expect(B.contract!.option).toBeNull();
    expect(B.contract!.years.some((y) => y.season === year)).toBe(true);
  }, 60000);

  it('makes a former first-round pick a restricted free agent you can match', async () => {
    let save = await advance(career(92), 'season-end');
    save = simDraft(startOffseason(save, new Rng(1)), 'all', new Rng(1));
    const me = save.career.teamId;
    const old = save.league.meta.season;
    const p = rosterOf(save.league, me).find((x) => x.contract && x.contract.kind !== 'two-way')!;
    p.born.year = old - 22;
    p.draft = { season: old - 4, round: 1, pick: 5, teamId: me };
    p.contract = { years: [{ season: old, salary: 8_000_000 }], option: null, kind: 'rookie', noTrade: false, signedSeason: old - 3 };
    save = startFreeAgency(save, new Rng(3));
    expect(save.offseason!.rfa?.[p.id]).toBe(me);
    // Another team's offer sheet arrives; matching keeps him.
    save.offseason!.offerSheets = [{ playerId: p.id, teamId: save.league.teams[0]!.id, salary: 20_000_000, years: 3, day: save.offseason!.faDay }];
    save = matchOfferSheet(save, p.id);
    const after = save.league.players.find((x) => x.id === p.id)!;
    expect(after.teamId).toBe(me);
    expect(after.contract!.years[0]!.salary).toBe(20_000_000);
    expect(save.offseason!.offerSheets).toHaveLength(0);
  }, 60000);

  it('charges the salary floor shortfall', () => {
    const save = career(93);
    const me = save.career.teamId;
    const year = save.league.meta.season;
    // Strip most of the payroll.
    for (const p of rosterOf(save.league, me).slice(0, 6)) p.contract!.years = p.contract!.years.map((y) => ({ ...y, salary: save.league.settings.minimumSalary }));
    const payroll = teamPayroll(save.league, me, year);
    const floor = salaryFloor(save.league.settings);
    finance(save);
    assessTax(save);
    if (payroll < floor) {
      expect(save.finance!.ledger.floor).toBe(floor - payroll);
      expect(profit(save.finance!.ledger)).toBeLessThan(0);
    } else expect(save.finance!.ledger.floor).toBe(0);
  });
});
