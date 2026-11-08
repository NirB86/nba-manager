import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generator';
import { Rng } from '../random';
import { simulateGame, type PlayEvent } from './game';

describe('play-by-play', () => {
  it('matches the box score and leaves the result unchanged', () => {
    const league = generateLeague({ seed: 4 });
    const [a, b] = league.teams;
    const team = (id: string) => ({ teamId: id, players: league.players.filter((p) => p.teamId === id) });
    const plain = simulateGame(new Rng(99), team(a!.id), team(b!.id));
    const log: PlayEvent[] = [];
    const logged = simulateGame(new Rng(99), team(a!.id), team(b!.id), log);
    expect(logged.home.score).toBe(plain.home.score);
    expect(logged.away.score).toBe(plain.away.score);
    expect(log.length).toBeGreaterThan(150);
    const last = log.at(-1)!;
    expect(last.score).toEqual([logged.home.score, logged.away.score]);
    for (const e of log) {
      expect(e.homeCourt).toHaveLength(5);
      expect(e.awayCourt).toHaveLength(5);
      expect(e.clock).toBeGreaterThanOrEqual(0);
    }
    // Points in the log add up to the final score.
    const pts = (side: 'home' | 'away') =>
      log.filter((e) => e.off === side).reduce((s, e) => s + (e.type === 'shot' && e.made ? (e.kind === 'three' ? 3 : 2) : 0) + (e.ftm ?? 0), 0);
    expect(pts('home')).toBe(logged.home.score);
    expect(pts('away')).toBe(logged.away.score);
    // Threes in the log match the box score.
    const threes = log.filter((e) => e.off === 'home' && e.type === 'shot' && e.kind === 'three' && e.made).length;
    expect(threes).toBe(logged.home.lines.reduce((s, l) => s + l.tpm, 0));
  });
});
