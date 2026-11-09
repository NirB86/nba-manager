import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { createCareer } from './career';
import { advance } from './advance';
import { playerHonors } from './awards';

describe('awards and season review', () => {
  it('plays the All-Star Game, hands out awards and reviews the season', async () => {
    const league = generateLeague({ seed: 7 });
    let save = createCareer(league, { teamId: league.teams[0]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'A');
    save = await advance(save, 'season-end');
    const { season } = save;
    expect(season.phase).toBe('done');
    // All-Star Game: twelve per conference, a winner and an MVP from the rosters.
    const as = season.allStar!;
    expect(as).toBeDefined();
    for (const ids of Object.values(as.rosters)) expect(ids).toHaveLength(12);
    expect(Object.values(as.rosters).flat()).toContain(as.mvp);
    // Awards: distinct All-NBA players, a rookie for ROY.
    const a = season.awards!;
    expect(a.mvp).toBeTruthy();
    expect(new Set(a.allNba.flat()).size).toBe(15);
    expect(a.allNba[0]).toContain(a.mvp);
    expect(save.league.players.find((p) => p.id === a.roy)?.experience).toBe(0);
    expect(a.finalsMvp).toBeTruthy();
    expect(save.league.players.find((p) => p.id === a.finalsMvp)?.teamId).toBe(season.champion);
    // History and owner review.
    expect(save.leagueHistory?.at(-1)?.champion).toBe(season.champion);
    expect(save.career.reviews?.at(-1)?.grade).toMatch(/^[A-F]/);
    expect(save.inbox.some((m) => m.subject.startsWith('Season review'))).toBe(true);
    expect(playerHonors(save, a.mvp!).some((h) => h.label === 'MVP')).toBe(true);
  }, 60000);
});
