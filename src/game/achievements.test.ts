import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { ACHIEVEMENTS, markAchievementsSeen, newAchievements } from './achievements';
import { advance } from './advance';
import { createCareer } from './career';

describe('achievements', () => {
  it('unlocks milestones during a season, once each', async () => {
    const league = generateLeague({ seed: 61 });
    let save = createCareer(league, { teamId: league.teams[6]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'A');
    expect(newAchievements(save)).toHaveLength(0);
    save = await advance(save, 'season-end');
    const ids = (save.achievements ?? []).map((a) => a.id);
    expect(ids).toContain('first-win');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => ACHIEVEMENTS.some((a) => a.id === id))).toBe(true);
    // Nothing new to unlock right after a check, and the check itself does not change the save.
    const before = JSON.stringify(save.achievements);
    expect(newAchievements(save)).toHaveLength(0);
    expect(JSON.stringify(save.achievements)).toBe(before);
    expect(markAchievementsSeen(save).achievements!.every((a) => a.seen)).toBe(true);
  }, 60000);
});
