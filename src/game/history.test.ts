import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { playerOverall } from '../engine';
import { advance } from './advance';
import { createCareer } from './career';
import { induct } from './history';
import { FA_DAYS, draftDone, freeAgencyDay, simDraft, startFreeAgency, startNewSeason, startOffseason } from './offseason';

describe('history', () => {
  it('keeps career rows, game records and the Hall of Fame across a summer', async () => {
    const league = generateLeague({ seed: 21 });
    let save = createCareer(league, { teamId: league.teams[1]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'H');
    save = await advance(save, 'season-end');
    const year = save.league.meta.season;
    expect(save.records?.game.pts?.value).toBeGreaterThan(30);
    save = startOffseason(save);
    // A healthy regular: the best player who played most of the season.
    const star = [...save.league.players].filter((p) => (p.pastSeasons?.at(-1)?.g ?? 0) > 60).sort((a, b) => playerOverall(b) - playerOverall(a))[0]!;
    expect(star.pastSeasons!.at(-1)!.season).toBe(year);
    expect(star.pastSeasons!.at(-1)!.g).toBeGreaterThan(40);
    save = simDraft(save, 'all');
    expect(draftDone(save)).toBe(true);
    save = startFreeAgency(save);
    for (let d = 0; d < FA_DAYS; d++) save = freeAgencyDay(save);
    save = startNewSeason(save);
    expect(save.league.meta.season).toBe(year + 1);
    // The best player from that season keeps his row after the summer.
    const again = save.league.players.find((p) => p.id === star.id);
    if (again) expect(again.pastSeasons?.some((s) => s.season === year)).toBe(true);
    // A decorated veteran retiring goes in.
    const vet = structuredClone(star);
    vet.experience = 15;
    save.leagueHistory = [{ season: year, champion: null, runnerUp: null, awards: { mvp: vet.id, roy: null, sixth: null, dpoy: null, allNba: [[vet.id]], finalsMvp: vet.id }, allStars: [vet.id] }];
    const inducted = induct(save, [vet]);
    expect(inducted.map((h) => h.id)).toContain(vet.id);
    expect(save.hallOfFame?.[0]?.honors.join(' ')).toMatch(/MVP/);
  }, 90000);
});
