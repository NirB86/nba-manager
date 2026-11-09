// Scouting next summer's draft class during the season. The class exists
// from the first time you look at it; each week your scouts learn more about
// the prospects in the group you assign them to, which narrows their
// potential estimate on draft night.

import { Rng, generateDraftClass, newSeed, playerOverall, type Player } from '../engine';
import type { SaveGame } from '../storage/saves';

export type ScoutFocus = 'top' | 'college' | 'international' | 'sleepers';

export const FOCUS_LABEL: Record<ScoutFocus, string> = {
  top: 'Top of the class',
  college: 'College',
  international: 'International',
  sleepers: 'Sleepers',
};

export interface DraftScouting {
  /** The draft these prospects are in. */
  year: number;
  focus: ScoutFocus;
  prospects: Player[];
  /** 0-100 per prospect id. */
  knowledge: Record<string, number>;
}

export const draftYearOf = (save: SaveGame) => save.league.meta.season + 1;

/** The coming draft's prospects, generated the first time they are needed. */
export function ensureDraftClass(save: SaveGame, rng: Rng = new Rng(newSeed())): DraftScouting {
  const year = draftYearOf(save);
  if (save.draftScouting?.year !== year) {
    save.draftScouting = {
      year,
      focus: 'top',
      prospects: generateDraftClass(save.league, rng, year),
      knowledge: {},
    };
  }
  return save.draftScouting;
}

/** Prospects in a focus group. */
export function inFocus(ds: DraftScouting, focus: ScoutFocus): Player[] {
  const byTalent = [...ds.prospects].sort((a, b) => playerOverall(b) + b.potential - (playerOverall(a) + a.potential));
  switch (focus) {
    case 'top':
      return byTalent.slice(0, 16);
    case 'sleepers':
      return byTalent.slice(24);
    case 'college':
      return ds.prospects.filter((p) => !!p.college);
    case 'international':
      return ds.prospects.filter((p) => !p.college || p.born.country !== 'USA');
  }
}

/** Weekly scouting work. Better scouts learn faster; a narrow group is covered faster. */
export function weeklyScouting(save: SaveGame) {
  if (save.offseason || save.season.phase === 'done') return;
  const ds = save.draftScouting;
  if (!ds || ds.year !== draftYearOf(save)) return;
  const scouts = save.league.staff.filter((s) => s.teamId === save.career.teamId && s.role === 'SCOUT');
  const best = Math.max(4, ...scouts.map((s) => (s.ratings.scouting + s.ratings.judgment) / 2));
  const group = inFocus(ds, ds.focus);
  if (!group.length) return;
  // About 60 knowledge points a week across the group at an average scout.
  const each = (best * 6) / Math.sqrt(group.length);
  for (const p of group) ds.knowledge[p.id] = Math.min(100, (ds.knowledge[p.id] ?? 0) + each);
  // Everyone gets a little from general coverage.
  for (const p of ds.prospects) ds.knowledge[p.id] = Math.min(100, (ds.knowledge[p.id] ?? 0) + 1);
}

export function setFocus(original: SaveGame, focus: ScoutFocus): SaveGame {
  const save = structuredClone(original);
  ensureDraftClass(save).focus = focus;
  return save;
}
