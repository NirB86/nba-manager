// Roster moves: waiving players (their remaining salary stays on the cap as
// dead money unless another team claims them off waivers), two-way
// contracts, and converting a two-way player to a standard deal.

import { fullName, playerAge, playerOverall, playerValue, rosterOf, salaryIn, teamPayroll, teamStrategy, type Player } from '../engine';
import type { InboxMessage, SaveGame } from '../storage/saves';

const note = (save: SaveGame, id: string, subject: string, body: string): InboxMessage => ({ id: `${id}-${Date.now()}`, from: 'Assistant GM', subject, body, date: save.offseason ? 'Offseason' : `Day ${save.season.day + 1}`, read: false });
const standard = (save: SaveGame, teamId: string) => rosterOf(save.league, teamId).filter((p) => p.contract?.kind !== 'two-way');
const twoWays = (save: SaveGame, teamId: string) => rosterOf(save.league, teamId).filter((p) => p.contract?.kind === 'two-way');

/** What waiving a player would cost: salary owed this season and later. */
export function waiveCost(save: SaveGame, p: Player): { now: number; later: number } {
  const year = save.league.meta.season;
  const years = (p.contract?.years ?? []).filter((y) => y.season >= year);
  return { now: years.find((y) => y.season === year)?.salary ?? 0, later: years.filter((y) => y.season > year).reduce((s, y) => s + y.salary, 0) };
}

/** The team that would claim a waived player, if any: worst teams first, with a roster spot and a reason to want him at that price. */
function claimer(save: SaveGame, p: Player): string | null {
  const { league } = save;
  const year = league.meta.season;
  const salary = salaryIn(p, year);
  const wins = (id: string) => save.season.games.filter((g) => g.hs !== undefined && g.as !== undefined && ((g.home === id && g.hs > g.as) || (g.away === id && g.as > g.hs))).length;
  const candidates = league.teams
    .filter((t) => t.id !== save.career.teamId && standard(save, t.id).length < league.settings.rosterMax)
    .sort((a, b) => wins(a.id) - wins(b.id));
  for (const t of candidates) {
    const worth = playerValue(league, p, teamStrategy(league, t.id)) * league.settings.salaryCap * 0.012;
    const fits = teamPayroll(league, t.id, year) + salary < league.settings.firstApron;
    if (fits && worth >= salary) return t.id;
  }
  return null;
}

export type MoveResult = { ok: true; save: SaveGame; message: string } | { ok: false; message: string };

/** Waive one of your players. */
export function waivePlayer(original: SaveGame, playerId: string): MoveResult {
  const p0 = original.league.players.find((x) => x.id === playerId);
  if (!p0 || p0.teamId !== original.career.teamId) return { ok: false, message: 'He is not on your roster.' };
  const save = structuredClone(original);
  const { league } = save;
  const p = league.players.find((x) => x.id === playerId)!;
  const year = league.meta.season;
  const name = fullName(p);
  const by = p.contract?.kind === 'two-way' ? null : claimer(save, p);
  if (by) {
    p.teamId = by;
    const team = league.teams.find((t) => t.id === by);
    save.inbox.unshift(note(save, `waive-${p.id}`, `${name} claimed off waivers`, `The ${team?.name} claimed ${name} and take over his contract, so none of his salary stays on our cap.`));
    return { ok: true, save, message: `${name} was claimed by the ${team?.name}: no dead money.` };
  }
  const owed = (p.contract?.years ?? []).filter((y) => y.season >= year);
  if (owed.length && p.contract?.kind !== 'two-way') {
    league.deadMoney = [...(league.deadMoney ?? []), { teamId: save.career.teamId, playerId: p.id, name, years: owed }];
  }
  p.teamId = null;
  p.contract = null;
  if (save.season.injuries) delete save.season.injuries[p.id];
  const total = owed.reduce((s, y) => s + y.salary, 0);
  const millions = (total / 1e6).toFixed(1);
  save.inbox.unshift(
    note(save, `waive-${p.id}`, `${name} waived`, total ? `Nobody claimed him. We still owe $${millions}M over ${owed.length} season${owed.length > 1 ? 's' : ''}, which stays on our cap as dead money.` : `${name} is a free agent now.`),
  );
  return { ok: true, save, message: total ? `${name} waived. $${millions}M stays on your cap as dead money.` : `${name} waived.` };
}

/** Free agents who qualify for a two-way deal (three seasons of experience or fewer). */
export function twoWayEligible(save: SaveGame, p: Player): { ok: boolean; reason?: string } {
  if (p.teamId) return { ok: false, reason: 'Only free agents can sign two-way deals.' };
  if (p.experience > 3) return { ok: false, reason: 'Two-way deals are for players with three seasons or fewer.' };
  if (twoWays(save, save.career.teamId).length >= save.league.settings.twoWaySlots) return { ok: false, reason: `All ${save.league.settings.twoWaySlots} two-way spots are taken.` };
  return { ok: true };
}

/** Sign a free agent to a two-way contract: half the minimum, does not use a roster spot. */
export function signTwoWay(original: SaveGame, playerId: string): MoveResult {
  const p0 = original.league.players.find((x) => x.id === playerId);
  if (!p0) return { ok: false, message: 'Player not found.' };
  const elig = twoWayEligible(original, p0);
  if (!elig.ok) return { ok: false, message: elig.reason ?? 'Not eligible.' };
  const save = structuredClone(original);
  const { league } = save;
  const p = league.players.find((x) => x.id === playerId)!;
  const year = league.meta.season;
  const years = playerAge(p, year) <= 22 ? 2 : 1;
  p.teamId = save.career.teamId;
  p.contract = {
    years: Array.from({ length: years }, (_, i) => ({ season: year + i, salary: Math.round(league.settings.minimumSalary * 0.5) })),
    option: null,
    kind: 'two-way',
    noTrade: false,
    signedSeason: year,
  };
  const taken = new Set(rosterOf(league, save.career.teamId).filter((x) => x.id !== p.id).map((x) => x.jersey));
  while (taken.has(p.jersey)) p.jersey = (p.jersey + 1) % 100;
  save.inbox.unshift(note(save, `twoway-${p.id}`, `${fullName(p)} signs a two-way deal`, `${years} season${years > 1 ? 's' : ''} at half the minimum. He splits time with the G League and does not take one of the 15 roster spots.`));
  return { ok: true, save, message: `${fullName(p)} signed a two-way contract.` };
}

/** Promote a two-way player to a standard minimum deal (needs a free roster spot). */
export function convertTwoWay(original: SaveGame, playerId: string): MoveResult {
  const p0 = original.league.players.find((x) => x.id === playerId);
  if (!p0 || p0.teamId !== original.career.teamId || p0.contract?.kind !== 'two-way') return { ok: false, message: 'He is not on a two-way deal with you.' };
  if (standard(original, original.career.teamId).length >= original.league.settings.rosterMax) return { ok: false, message: 'Your 15 roster spots are full: waive or trade someone first.' };
  const save = structuredClone(original);
  const { league } = save;
  const p = league.players.find((x) => x.id === playerId)!;
  const year = league.meta.season;
  const salary = Math.max(league.settings.minimumSalary, Math.round(league.settings.minimumSalary * (1 + Math.max(0, playerOverall(p) - 50) * 0.02)));
  p.contract = { years: [{ season: year, salary }, { season: year + 1, salary: Math.round(salary * 1.05) }], option: { season: year + 1, type: 'team' }, kind: 'minimum', noTrade: false, signedSeason: year };
  save.inbox.unshift(note(save, `convert-${p.id}`, `${fullName(p)} gets a standard contract`, 'Converted from his two-way deal: two seasons, the second a team option. He now takes a roster spot.'));
  return { ok: true, save, message: `${fullName(p)} converted to a standard contract.` };
}
