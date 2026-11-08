import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { rosterOf } from '../engine';
import { advance } from './advance';
import { createCareer } from './career';
import { morale } from './morale';

describe('morale', () => {
  it('starts mostly content or happy and moves with minutes and results', async () => {
    const league = generateLeague({ seed: 12 });
    const start = createCareer(league, { teamId: league.teams[0]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'T');
    const before = rosterOf(start.league, start.career.teamId).map((p) => morale(start, p).level);
    expect(before.filter((l) => l === 'unhappy' || l === 'angry').length).toBeLessThanOrEqual(3);

    const save = await advance(start, 'week');
    await advance(save, 'week');
    const after = await advance(save, 'week');
    const all = after.league.players.filter((p) => p.teamId).map((p) => morale(after, p));
    const levels = new Set(all.map((m) => m.level));
    expect(levels.size).toBeGreaterThanOrEqual(3);
    // Every mood comes with reasons.
    expect(all.every((m) => m.reasons.length > 0)).toBe(true);
  });
});
