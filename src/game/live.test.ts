import { describe, expect, it } from 'vitest';
import { LiveGame, Rng, generateLeague } from '../engine';
import { advanceToGameDay, finishLiveGame, nextUserGame } from './advance';
import { createCareer } from './career';

describe('live games in a season', () => {
  it('plays up to game day, then records the coached result like any other game', async () => {
    const league = generateLeague({ seed: 17 });
    let save = createCareer(league, { teamId: league.teams[5]!.id, role: 'gm-coach', simMode: 'watch', scouting: 'full', difficulty: 'normal' }, 'T');
    save = await advanceToGameDay(save);
    const g = nextUserGame(save)!;
    expect(g.day).toBe(save.season.day);
    const roster = (id: string) => save.league.players.filter((p) => p.teamId === id);
    const live = new LiveGame(new Rng(3), { teamId: g.home, players: roster(g.home) }, { teamId: g.away, players: roster(g.away) });
    const mine = g.home === save.career.teamId ? 'home' : 'away';
    live.setTactics(mine, { pace: 'fast', focus: 'three' });
    live.timeout(mine);
    live.runToEnd();
    const result = live.result();
    const after = await finishLiveGame(save, g.id, result);
    const played = after.season.games.find((x) => x.id === g.id)!;
    expect(played.hs).toBe(result.home.score);
    expect(played.as).toBe(result.away.score);
    expect(after.season.boxScores[g.id]).toEqual(result);
    expect(after.season.day).toBe(save.season.day + 1);
    // Other games that day were played too.
    expect(after.season.games.filter((x) => x.day === g.day).every((x) => x.hs !== undefined)).toBe(true);
  });
});
