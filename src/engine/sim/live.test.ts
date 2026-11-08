import { describe, expect, it } from 'vitest';
import { generateLeague } from '../generator';
import { Rng } from '../random';
import { LiveGame, simulateGame } from './game';

const league = generateLeague({ seed: 6 });
const [a, b] = league.teams;
const team = (id: string) => ({ teamId: id, players: league.players.filter((p) => p.teamId === id) });

describe('live game', () => {
  it('plays exactly like simulateGame when nobody coaches', () => {
    const plain = simulateGame(new Rng(5), team(a!.id), team(b!.id));
    const live = new LiveGame(new Rng(5), team(a!.id), team(b!.id));
    while (!live.done) live.step();
    expect(live.result()).toEqual(plain);
  });

  it('tactics change how a team plays', () => {
    let threes = 0;
    let attempts = 0;
    let base3 = 0;
    let baseAtt = 0;
    for (let seed = 0; seed < 30; seed++) {
      const g = new LiveGame(new Rng(seed), team(a!.id), team(b!.id));
      g.setTactics('home', { focus: 'three' });
      g.runToEnd();
      const r = g.result();
      threes += r.home.lines.reduce((s, l) => s + l.tpa, 0);
      attempts += r.home.lines.reduce((s, l) => s + l.fga, 0);
      const p = simulateGame(new Rng(seed), team(a!.id), team(b!.id));
      base3 += p.home.lines.reduce((s, l) => s + l.tpa, 0);
      baseAtt += p.home.lines.reduce((s, l) => s + l.fga, 0);
    }
    expect(threes / attempts).toBeGreaterThan(base3 / baseAtt + 0.04);
  });

  it('timeouts rest the players on the floor and substitutions swap them', () => {
    const g = new LiveGame(new Rng(2), team(a!.id), team(b!.id));
    g.setAutoSubs('home', false);
    for (let i = 0; i < 40; i++) g.step();
    const before = g.state().home.players.filter((p) => p.onCourt).map((p) => p.energy);
    expect(g.timeout('home')).toBe(true);
    const after = g.state().home.players.filter((p) => p.onCourt).map((p) => p.energy);
    expect(after.reduce((s, x) => s + x, 0)).toBeGreaterThan(before.reduce((s, x) => s + x, 0));
    expect(g.state().home.timeouts).toBe(6);
    const s = g.state().home.players;
    const out = s.find((p) => p.onCourt)!;
    const inn = s.find((p) => !p.onCourt)!;
    expect(g.substitute('home', out.id, inn.id)).toBe(true);
    const now = g.state().home.players;
    expect(now.find((p) => p.id === inn.id)!.onCourt).toBe(true);
    expect(now.find((p) => p.id === out.id)!.onCourt).toBe(false);
    // With auto subs off, the lineup stays as set.
    for (let i = 0; i < 30; i++) g.step();
    expect(g.state().home.players.find((p) => p.id === inn.id)!.onCourt).toBe(true);
  });
});
