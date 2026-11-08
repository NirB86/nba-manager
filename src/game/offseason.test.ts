import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { Rng, playerOverall, rosterOf, validateLeague } from '../engine';
import { advance } from './advance';
import { createCareer } from './career';
import { FA_DAYS, draftDone, draftPlayer, freeAgencyDay, simDraft, startFreeAgency, startNewSeason, startOffseason } from './offseason';

describe('offseason', () => {
  it('runs a full summer: draft, free agency, camp, next season', async () => {
    const league = generateLeague({ seed: 8 });
    let save = createCareer(league, { teamId: league.teams[3]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'T');
    save = await advance(save, 'season-end');
    expect(save.season.phase).toBe('done');
    const year = save.league.meta.season;
    const me = save.career.teamId;
    const rng = new Rng(5);

    save = startOffseason(save, rng);
    const o = save.offseason!;
    expect(o.order.length).toBe(60);
    expect(new Set(o.order.slice(0, 30).map((s) => s.originalTeamId)).size).toBe(30);
    // If we are on the clock, pick the top prospect.
    if (o.order[o.onClock]?.teamId === me) {
      const top = o.prospects[0]!;
      save = draftPlayer(save, top.id, rng);
      expect(save.league.players.find((p) => p.id === top.id)!.teamId).toBe(me);
    }
    save = simDraft(save, 'all', rng);
    expect(draftDone(save)).toBe(true);
    const rookies = save.league.players.filter((p) => p.draft?.season === year + 1);
    expect(rookies.length).toBe(60);
    expect(rookies.filter((p) => p.draft!.round === 1).every((p) => p.contract?.kind === 'rookie')).toBe(true);

    save = startFreeAgency(save, rng);
    expect(save.league.meta.season).toBe(year + 1);
    expect(save.offseason!.stage).toBe('free-agency');
    for (let d = 0; d < FA_DAYS; d++) save = freeAgencyDay(save, rng);
    save = startNewSeason(save, rng);
    expect(save.offseason).toBeUndefined();
    expect(save.season.phase).toBe('regular');
    expect(save.season.year).toBe(year + 1);
    expect(save.history?.[0]?.season).toBe(year);
    expect(validateLeague(save.league).ok).toBe(true);
    for (const t of save.league.teams) {
      const n = rosterOf(save.league, t.id).filter((p) => p.contract?.kind !== 'two-way').length;
      if (t.id !== me) expect(n).toBeGreaterThanOrEqual(save.league.settings.rosterMin);
      expect(n).toBeLessThanOrEqual(save.league.settings.rosterMax);
    }
    // Every rostered player has a contract for the new season.
    expect(save.league.players.filter((p) => p.teamId).every((p) => p.contract?.years.some((y) => y.season === year + 1))).toBe(true);
    // The new season plays.
    save = await advance(save, 'week');
    expect(save.season.games.some((g) => g.hs !== undefined)).toBe(true);
    expect(Math.max(...save.league.players.filter((p) => p.teamId).map(playerOverall))).toBeGreaterThan(70);
  }, 60_000);
});
