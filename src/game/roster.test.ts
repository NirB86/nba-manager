import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { rosterOf, rollOverLeagueYear, salaryIn, teamPayroll } from '../engine';
import { createCareer } from './career';
import { convertTwoWay, signTwoWay, twoWayEligible, waivePlayer } from './roster';

const career = () => {
  const league = generateLeague({ seed: 41 });
  return createCareer(league, { teamId: league.teams[2]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'T');
};

describe('roster moves', () => {
  it('waiving leaves dead money on the cap unless he is claimed', () => {
    const save = career();
    const me = save.career.teamId;
    const year = save.league.meta.season;
    // A big, long contract nobody would claim.
    const p = rosterOf(save.league, me)
      .filter((x) => x.contract?.kind !== 'two-way')
      .sort((a, b) => salaryIn(b, year) - salaryIn(a, year))[0]!;
    const before = teamPayroll(save.league, me, year);
    const r = waivePlayer(save, p.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = r.save.league.players.find((x) => x.id === p.id)!;
    if (after.teamId === null) {
      expect(teamPayroll(r.save.league, me, year)).toBe(before);
      expect(r.save.league.deadMoney?.[0]?.playerId).toBe(p.id);
      // Dead money for finished seasons drops off at the roll-over.
      const lastYear = Math.max(...p.contract!.years.map((y) => y.season));
      for (let y = year; y <= lastYear; y++) rollOverLeagueYear(r.save.league);
      expect(r.save.league.deadMoney ?? []).toHaveLength(0);
    } else {
      // Claimed: the claiming team takes the contract, no dead money.
      expect(after.teamId).not.toBe(me);
      expect(r.save.league.deadMoney ?? []).toHaveLength(0);
      expect(teamPayroll(r.save.league, me, year)).toBeLessThan(before);
    }
  });

  it('signs a young free agent to a two-way deal and converts him', () => {
    const save = career();
    const me = save.career.teamId;
    // Make room: clear our two-way spots and one standard spot.
    for (const p of rosterOf(save.league, me).filter((x) => x.contract?.kind === 'two-way')) p.teamId = null;
    const cut = rosterOf(save.league, me).at(-1)!;
    cut.teamId = null;
    const young = save.league.players.find((x) => !x.teamId && x.experience <= 3)!;
    young.contract = null;
    expect(twoWayEligible(save, young).ok).toBe(true);
    const signed = signTwoWay(save, young.id);
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    const p = signed.save.league.players.find((x) => x.id === young.id)!;
    expect(p.contract?.kind).toBe('two-way');
    const conv = convertTwoWay(signed.save, young.id);
    expect(conv.ok).toBe(true);
    if (conv.ok) expect(conv.save.league.players.find((x) => x.id === young.id)!.contract?.kind).toBe('minimum');
  });
});
