import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generator';
import { Rng } from '../random';
import { rotation, simulateGame } from './game';

describe('depth chart', () => {
  const league = generateLeague({ seed: 5 });
  const [a, b] = league.teams;
  const roster = (id: string) => league.players.filter((p) => p.teamId === id && p.contract?.kind !== 'two-way');

  it('starts the chosen five and follows target minutes', () => {
    const players = roster(a!.id);
    const def = rotation(players);
    // Start the five worst players; bench the best one entirely.
    const worst = def.slice(-5).map((r) => r.player.id);
    const best = def[0]!.player.id;
    const bench = def.map((r) => r.player.id).filter((id) => !worst.includes(id));
    const minutes = Object.fromEntries(players.map((p) => [p.id, p.id === best ? 0 : 24]));
    let bestSec = 0;
    for (let i = 0; i < 5; i++) {
      const r = simulateGame(new Rng(10 + i), { teamId: a!.id, players, depth: { starters: worst, bench, minutes } }, { teamId: b!.id, players: roster(b!.id) });
      const starters = r.home.lines.filter((l) => l.starter).map((l) => l.playerId);
      expect(new Set(starters)).toEqual(new Set(worst));
      bestSec += r.home.lines.find((l) => l.playerId === best)?.sec ?? 0;
    }
    expect(bestSec / 5).toBeLessThan(8 * 60);
  });

  it('fills in for missing starters from the bench order', () => {
    const players = roster(a!.id);
    const ids = players.map((p) => p.id);
    const rot = rotation(players.slice(1), { starters: ids.slice(0, 5), bench: ids.slice(5) });
    expect(rot.filter((r) => r.starter)).toHaveLength(5);
    expect(rot.filter((r) => r.starter).map((r) => r.player.id)).toContain(ids[5]);
    expect(rot.reduce((s, r) => s + r.targetMin, 0)).toBeGreaterThan(220);
  });
});
