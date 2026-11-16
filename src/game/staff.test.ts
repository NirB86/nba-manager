import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { rosterOf, teamEdge } from '../engine';
import { createCareer } from './career';
import { fireStaff, hireStaff, seasonGoal, staffPayroll } from './staff';

const career = () => {
  const league = generateLeague({ seed: 95 });
  return createCareer(league, { teamId: league.teams[4]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'S');
};

describe('staff and goals', () => {
  it('lets a scout go and hires a free one into the open spot', () => {
    let save = career();
    const me = save.career.teamId;
    const scout = save.league.staff.find((s) => s.teamId === me && s.role === 'SCOUT')!;
    const free = save.league.staff.find((s) => !s.teamId && s.role === 'SCOUT');
    if (!free) return;
    // Both scout spots are taken.
    expect(hireStaff(save, free.id).ok).toBe(false);
    const fired = fireStaff(save, scout.id);
    expect(fired.ok).toBe(true);
    if (!fired.ok) return;
    save = fired.save;
    expect(save.finance!.ledger.ops).toBe(scout.contract!.salary);
    const hired = hireStaff(save, free.id);
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;
    expect(hired.save.league.staff.find((s) => s.id === free.id)!.teamId).toBe(me);
    expect(staffPayroll(hired.save)).toBeGreaterThan(0);
  });

  it('a better head coach gives a bigger edge', () => {
    const save = career();
    const me = save.career.teamId;
    const hc = save.league.staff.find((s) => s.teamId === me && s.role === 'HC')!;
    hc.ratings.tactics = 18;
    const good = teamEdge(save.league, save.season, me);
    hc.ratings.tactics = 4;
    expect(teamEdge(save.league, save.season, me)).toBeLessThan(good);
    expect(good).toBeGreaterThan(0);
  });

  it("keeps the owner's goal for the season after the roster changes", () => {
    const save = career();
    const me = save.career.teamId;
    const before = seasonGoal(save);
    // Gut the roster: the current ranking would say "rebuild", but the season's goal stays.
    for (const p of rosterOf(save.league, me).slice(0, 4)) p.teamId = null;
    expect(seasonGoal(save).goal).toBe(before.goal);
  });
});
