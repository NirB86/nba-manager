import { describe, expect, it } from 'vitest';
import { generateLeague } from './generator';
import { Rng } from './random';
import { availablePlayers, newSeason, simulateDay } from './season';

describe('injuries', () => {
  it('happen over a season, keep players out, and heal', () => {
    const league = generateLeague({ seed: 31 });
    const season = newSeason(league, new Rng(1));
    const rng = new Rng(2);
    let seen = 0;
    for (let d = 0; d < 60 && season.phase === 'regular'; d++) {
      const r = simulateDay(league, season, rng, () => true);
      seen += r.injured.length;
      // An injured player never plays while out.
      for (const p of r.played) {
        for (const side of [p.result.home, p.result.away]) {
          for (const l of side.lines) {
            const inj = season.injuries?.[l.playerId];
            if (inj && inj.day < season.day - 1) expect(l.sec).toBe(0);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(30);
    const team = league.teams[0]!.id;
    expect(availablePlayers(league, season, team).length).toBeGreaterThanOrEqual(8);
    // Healing: every injury that was short is eventually gone.
    const short = Object.entries(season.injuries ?? {}).filter(([, i]) => i.gamesLeft <= 3).map(([id, i]) => [id, i.day] as const);
    expect(short.length).toBeGreaterThan(0);
    for (let d = 0; d < 20 && season.phase === 'regular'; d++) simulateDay(league, season, rng, () => true);
    // Healed, or hurt again later (a newer injury).
    for (const [id, day] of short) {
      const now = season.injuries?.[id];
      if (now) expect(now.day).toBeGreaterThan(day);
    }
  });
});
