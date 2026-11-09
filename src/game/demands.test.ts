import { describe, expect, it } from 'vitest';
import { Rng, availablePlayers, rosterOf } from '../engine';
import { generateLeague } from '../engine/generator';
import { advance } from './advance';
import { createCareer } from './career';
import { promiseMinutes, weeklyDemands } from './demands';
import { ensureDraftClass, setFocus, weeklyScouting } from './draft-scouting';
import { morale } from './morale';
import { answerPress, maybePress } from './press';
import { potentialRange } from './scouting';

const career = (seed: number) => {
  const league = generateLeague({ seed });
  return createCareer(league, { teamId: league.teams[5]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'D');
};

describe('player demands', () => {
  it('an angry player asks out; a kept promise settles him, a broken one goes public', async () => {
    let save = await advance(career(51), 'week');
    const me = save.career.teamId;
    const p = rosterOf(save.league, me).at(-1)!;
    p.personality.ego = 20;
    // Force the request by making him angry: sit him and lose.
    for (let i = 0; i < 40 && !save.demands?.requests[p.id]; i++) {
      save.demands = { requests: {}, mods: [{ playerId: p.id, effect: -12, text: 'test', season: save.league.meta.season, until: 999 }] };
      weeklyDemands(save, new Rng(i));
    }
    expect(save.demands?.requests[p.id]).toBeDefined();
    expect(morale(save, p).reasons.some((r) => /trade/.test(r.text))).toBe(true);
    save = promiseMinutes(save, p.id);
    const req = save.demands!.requests[p.id]!;
    expect(req.promise?.minutes).toBeGreaterThanOrEqual(24);
    // Nothing changes in the depth chart: on the due day the promise is broken.
    save.season.day = req.promise!.due;
    weeklyDemands(save, new Rng(1));
    expect(save.demands!.requests[p.id]?.leaked).toBe(true);
    expect(save.demands!.mods.some((m) => m.playerId === p.id && m.effect < 0 && /broke/.test(m.text))).toBe(true);
    // And the press wants to talk about it.
    save.press = null;
    maybePress(save, new Rng(2));
    expect((save.press as { topic?: string } | null)?.topic).toBe('request');
    const after = answerPress(save, 0);
    expect(after.press).toBeNull();
    expect(after.demands!.mods.some((m) => m.playerId === p.id && m.effect > 0)).toBe(true);
  }, 30000);

  it('holdouts sit out until the count runs down', async () => {
    let save = career(52);
    const me = save.career.teamId;
    const p = rosterOf(save.league, me)[0]!;
    save.season.holdouts = { [p.id]: 2 };
    expect(availablePlayers(save.league, save.season, me).some((x) => x.id === p.id)).toBe(false);
    save = await advance(save, 'week');
    expect(save.season.holdouts?.[p.id]).toBeUndefined();
  }, 30000);
});

describe('draft scouting', () => {
  it('scouting a group narrows its potential estimates', () => {
    let save = career(53);
    ensureDraftClass(save, new Rng(4));
    save = setFocus(save, 'top');
    const ds = save.draftScouting!;
    const top = [...ds.prospects].sort((a, b) => b.potential - a.potential)[0]!;
    const width = () => {
      const [lo, hi] = potentialRange(save, top);
      return hi - lo;
    };
    const before = width();
    for (let w = 0; w < 12; w++) weeklyScouting(save);
    expect(save.draftScouting!.knowledge[top.id]).toBeGreaterThan(80);
    expect(width()).toBeLessThan(before);
  });
});
