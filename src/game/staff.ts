// Your staff and the locker room: hiring and firing staff (and what they
// cost), staff contracts running out, team morale's effect on games, and the
// owner's goal, fixed when each season starts.

import { fullName, rosterOf, type Staff, type StaffRole } from '../engine';
import { addMessage, type SaveGame } from '../storage/saves';
import { ownerExpectation, type Expectation } from './career';
import { finance } from './finance';
import { morale } from './morale';

/** How many of each role a team employs. */
export const STAFF_SLOTS: Record<StaffRole, number> = { HC: 1, AC: 2, SCOUT: 2, MED: 1, DEV: 1 };

/** The rating that matters most for each role. */
const KEY: Record<StaffRole, keyof Staff['ratings']> = { HC: 'tactics', AC: 'tactics', SCOUT: 'scouting', MED: 'medical', DEV: 'development' };
const BASE: Record<StaffRole, number> = { HC: 6_000_000, AC: 1_200_000, SCOUT: 700_000, MED: 700_000, DEV: 900_000 };

/** What a staff member wants a season: more for better ratings in his role. */
export function staffAsk(s: Staff): number {
  const r = s.ratings[KEY[s.role]];
  return Math.round((BASE[s.role] * (0.4 + (r / 20) * 1.3)) / 50_000) * 50_000;
}

export function staffPayroll(save: SaveGame): number {
  return save.league.staff.filter((s) => s.teamId === save.career.teamId).reduce((sum, s) => sum + (s.contract?.salary ?? 0), 0);
}

export type StaffMove = { ok: true; save: SaveGame; message: string } | { ok: false; message: string };

/** Hire a staff member without a team (3-year deal at his ask). The role needs an open spot. */
export function hireStaff(original: SaveGame, staffId: string): StaffMove {
  const s0 = original.league.staff.find((x) => x.id === staffId);
  if (!s0 || s0.teamId) return { ok: false, message: 'Only staff without a team can be hired.' };
  const me = original.career.teamId;
  const have = original.league.staff.filter((x) => x.teamId === me && x.role === s0.role).length;
  if (have >= STAFF_SLOTS[s0.role]) return { ok: false, message: `You already have ${have} in that role: let someone go first.` };
  const save = structuredClone(original);
  const s = save.league.staff.find((x) => x.id === staffId)!;
  s.teamId = me;
  s.contract = { salary: staffAsk(s), endSeason: save.league.meta.season + 2 };
  addMessage(save, { id: `hire-${s.id}-${save.league.meta.season}`, from: 'Assistant GM', subject: `${fullName(s)} joins the staff`, body: `Three seasons at $${(s.contract.salary / 1e6).toFixed(2)}M a year.`, date: save.offseason ? 'Offseason' : `Day ${save.season.day + 1}`, read: false });
  return { ok: true, save, message: `${fullName(s)} hired.` };
}

/** Let a staff member go. This season's remaining salary is paid as severance. */
export function fireStaff(original: SaveGame, staffId: string): StaffMove {
  const s0 = original.league.staff.find((x) => x.id === staffId);
  if (!s0 || s0.teamId !== original.career.teamId) return { ok: false, message: 'He is not on your staff.' };
  if (s0.role === 'HC' && original.career.role === 'gm-coach') return { ok: false, message: 'You are the head coach.' };
  const save = structuredClone(original);
  const s = save.league.staff.find((x) => x.id === staffId)!;
  const severance = s.contract?.salary ?? 0;
  finance(save).ledger.ops = (finance(save).ledger.ops ?? 0) + severance;
  s.teamId = null;
  s.contract = null;
  return { ok: true, save, message: `${fullName(s)} let go. $${(severance / 1e6).toFixed(2)}M severance is paid this season.` };
}

/** New league year: staff contracts that ran out are renewed for AI teams; yours leave unless you have a spot to keep them (they ask for a raise). */
export function renewStaff(save: SaveGame) {
  const year = save.league.meta.season;
  const me = save.career.teamId;
  const leaving: string[] = [];
  for (const s of save.league.staff) {
    if (!s.teamId || !s.contract || s.contract.endSeason >= year) continue;
    const ask = Math.max(staffAsk(s), s.contract.salary);
    if (s.teamId === me) leaving.push(`${fullName(s)} (${s.role}, $${(ask / 1e6).toFixed(2)}M)`);
    s.contract = { salary: ask, endSeason: year + 2 };
  }
  if (leaving.length)
    addMessage(save, { id: `staff-renew-${year}`, from: 'Assistant GM', subject: 'Staff contracts renewed', body: `These contracts ran out and were renewed for three seasons: ${leaving.join(', ')}. You can let staff go from the Staff screen.`, date: 'Offseason', read: false });
}

/** Team morale's effect on play this week: average morale, lifted by the head coach's motivation (+-1.2% shooting at most). */
export function updateMoraleEdge(save: SaveGame) {
  const me = save.career.teamId;
  const roster = rosterOf(save.league, me).filter((p) => p.contract?.kind !== 'two-way');
  if (!roster.length) return;
  const avg = roster.reduce((s, p) => s + morale(save, p).score, 0) / roster.length;
  const motivation = save.league.staff.find((s) => s.teamId === me && s.role === 'HC')?.ratings.motivation ?? 10;
  const edge = Math.max(-0.012, Math.min(0.012, (avg + (motivation - 10) * 0.15) * 0.0015));
  save.season.moraleEdge = { ...(save.season.moraleEdge ?? {}), [me]: Math.round(edge * 10000) / 10000 };
}

/** The owner's goal for this season: fixed when the season starts (trades during it do not move it). */
export function seasonGoal(save: SaveGame): Expectation & { rank: number } {
  const g = save.career.goal;
  if (g && g.season === save.league.meta.season && g.teamId === save.career.teamId) return { tier: g.tier, goal: g.goal, rank: g.rank };
  return ownerExpectation(save.league, save.career.teamId);
}

export function setSeasonGoal(save: SaveGame) {
  const e = ownerExpectation(save.league, save.career.teamId);
  save.career.goal = { season: save.league.meta.season, teamId: save.career.teamId, tier: e.tier, goal: e.goal, rank: e.rank };
}
