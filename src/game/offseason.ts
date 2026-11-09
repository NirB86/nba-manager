// The offseason, step by step: draft, then the new league year with free
// agency, then training camp (development, retirements) and the next season.
// Each step returns a new save; the original is left untouched.

import {
  Rng,
  developPlayers,
  displayRating,
  draftOrder,
  expiringPlayers,
  fullName,
  generateDraftClass,
  marketSalary,
  newSeason,
  newSeed,
  playerAge,
  playerOverall,
  playerValue,
  retirements,
  rollOverLeagueYear,
  rosterOf,
  signDraftedPlayer,
  teamName,
  teamPayroll,
  teamStrategy,
  trimRoster,
  type DraftSlot,
  type Player,
} from '../engine';
import type { InboxMessage, SaveGame } from '../storage/saves';
import { MLE_SHARE } from './contracts';
import { induct, recordPlayerSeasons } from './history';
import { rollFinances } from './finance';

export type OffseasonStage = 'draft' | 'free-agency' | 'camp';

export interface OffseasonState {
  stage: OffseasonStage;
  /** Year of the draft (the league year that starts after it). */
  draftYear: number;
  order: DraftSlot[];
  /** Index into `order` of the pick on the clock. */
  onClock: number;
  /** Prospects not yet drafted. */
  prospects: Player[];
  made: { overall: number; playerId: string; teamId: string }[];
  /** Free agency day (0..FA_DAYS). */
  faDay: number;
  /** Your own free agents: you can go over the cap to keep them. */
  birdRights: Record<string, string>;
  /** Teams that used the mid-level exception this summer. */
  mleUsed: string[];
}

export const FA_DAYS = 5;

const msg = (save: SaveGame, id: string, from: string, subject: string, body: string): InboxMessage => ({
  id: `${id}-${save.league.meta.season}`,
  from,
  subject,
  body,
  date: 'Offseason',
  read: false,
});

/** After the Finals: build the draft order and class. */
export function startOffseason(original: SaveGame, rng = new Rng(newSeed())): SaveGame {
  if (original.season.phase !== 'done' || original.offseason || original.career.fired) return original;
  const save = structuredClone(original);
  const { league, season } = save;
  // The season just played goes into every player's career record, with the team he finished on.
  recordPlayerSeasons(league, season);
  const draftYear = league.meta.season + 1;
  const playoffTeams = new Set(season.series.filter((s) => s.round === 1).flatMap((s) => [s.top.teamId, s.bottom.teamId]));
  const order = draftOrder(league, season.games, playoffTeams, draftYear, rng);
  const prospects = generateDraftClass(league, rng, draftYear);
  save.offseason = { stage: 'draft', draftYear, order, onClock: 0, prospects, made: [], faDay: 0, birdRights: {}, mleUsed: [] };
  const me = save.career.teamId;
  const mine = order.filter((s) => s.teamId === me);
  const jumped = order.filter((s) => s.jumped).map((s) => league.teams.find((t) => t.id === s.originalTeamId)?.name);
  save.inbox.unshift(
    msg(save, 'draft-order', 'League office', `The ${draftYear} draft order is set`, `${jumped.length ? `Lottery winners: the ${jumped.join(', the ')} moved up. ` : ''}${mine.length ? `We pick at ${mine.map((s) => `#${s.overall}`).join(' and ')}.` : 'We have no picks this year.'} Your scouts have a report on every prospect.`),
  );
  // AI teams pick until it is our turn.
  return simDraft(save, 'until-user', rng);
}

/** Best available for an AI team: mostly talent and upside, a little noise. */
function aiChoice(save: SaveGame, teamId: string, rng: Rng): Player {
  const o = save.offseason!;
  const strategy = teamStrategy(save.league, teamId);
  const upside = strategy === 'rebuild' ? 0.65 : 0.5;
  return [...o.prospects].sort((a, b) => {
    const score = (p: Player) => (1 - upside) * playerOverall(p) + upside * p.potential + rng.normal(0, 2.5);
    return score(b) - score(a);
  })[0]!;
}

function makePick(save: SaveGame, playerId: string, rng: Rng) {
  const o = save.offseason!;
  const slot = o.order[o.onClock]!;
  const i = o.prospects.findIndex((p) => p.id === playerId);
  if (i < 0) throw new Error('That prospect is gone.');
  const [p] = o.prospects.splice(i, 1);
  signDraftedPlayer(save.league, p!, slot, o.draftYear, rng);
  save.league.players.push(p!);
  o.made.push({ overall: slot.overall, playerId: p!.id, teamId: slot.teamId });
  o.onClock++;
  if (slot.teamId === save.career.teamId) {
    save.inbox.unshift(msg(save, `drafted-${p!.id}`, 'Assistant GM', `We drafted ${fullName(p!)} at #${slot.overall}`, `${p!.position}, ${o.draftYear - p!.born.year}, ${p!.college ?? p!.born.country}. ${slot.round === 1 ? 'He signs a four-year rookie-scale deal.' : 'He signs a two-year minimum deal.'}`));
  }
}

/** Your pick when you are on the clock. */
export function draftPlayer(original: SaveGame, playerId: string, rng = new Rng(newSeed())): SaveGame {
  const o = original.offseason;
  if (!o || o.stage !== 'draft' || o.order[o.onClock]?.teamId !== original.career.teamId) return original;
  const save = structuredClone(original);
  makePick(save, playerId, rng);
  return simDraft(save, 'until-user', rng);
}

/** AI picks: until your next pick, or to the end (your picks go to your scouts' top choice). */
export function simDraft(original: SaveGame, mode: 'until-user' | 'all', rng = new Rng(newSeed())): SaveGame {
  const save = structuredClone(original);
  const o = save.offseason!;
  while (o.onClock < o.order.length && o.prospects.length) {
    const slot = o.order[o.onClock]!;
    if (slot.teamId === save.career.teamId && mode === 'until-user') break;
    makePick(save, aiChoice(save, slot.teamId, rng).id, rng);
  }
  return save;
}

export function draftDone(save: SaveGame): boolean {
  const o = save.offseason;
  return !!o && (o.onClock >= o.order.length || !o.prospects.length);
}

/**
 * New league year: cap growth, contracts run out. AI teams keep the expiring
 * players they value; yours become free agents you can re-sign over the cap.
 */
export function startFreeAgency(original: SaveGame, rng = new Rng(newSeed())): SaveGame {
  const o = original.offseason;
  if (!o || o.stage !== 'draft') return original;
  let save = draftDone(original) ? structuredClone(original) : simDraft(original, 'all', rng);
  save = structuredClone(save);
  const { league } = save;
  const me = save.career.teamId;
  // Undrafted prospects join the free-agent pool.
  for (const p of save.offseason!.prospects) league.players.push({ ...p, experience: 0 });
  save.offseason!.prospects = [];
  rollOverLeagueYear(league);
  const year = league.meta.season;

  const expiring = expiringPlayers(league);
  const mineLeft: string[] = [];
  const resigned: string[] = [];
  for (const p of expiring) {
    const teamId = p.teamId!;
    if (teamId === me) {
      save.offseason!.birdRights[p.id] = me;
      mineLeft.push(fullName(p));
    } else if (wouldKeep(save, p, teamId, rng)) {
      const salary = marketSalary(league.settings, playerOverall(p), playerAge(p, year), p.experience);
      const years = playerAge(p, year) <= 28 ? rng.int(2, 4) : rng.int(1, 2);
      p.contract = { years: Array.from({ length: years }, (_, i) => ({ season: year + i, salary: Math.round(salary * 1.05 ** i) })), option: null, kind: 'standard', noTrade: false, signedSeason: year };
      resigned.push(`${fullName(p)} (${league.teams.find((t) => t.id === teamId)?.abbrev})`);
      continue;
    }
    p.teamId = null;
    p.contract = null;
  }
  save.offseason!.stage = 'free-agency';
  save.offseason!.faDay = 0;
  save.season = { ...save.season, mleUsed: false, contractTalks: [], offers: [], declinedDeals: [] };
  save.inbox.unshift(
    msg(save, 'fa-open', 'Assistant GM', 'Free agency is open', `${mineLeft.length ? `Our free agents: ${mineLeft.join(', ')}. We hold their Bird rights, so we can go over the cap to keep them. ` : ''}${resigned.length ? `Around the league, teams kept ${resigned.slice(0, 5).join(', ')}${resigned.length > 5 ? ' and others' : ''}. ` : ''}Make offers from a player's page or the free-agent list. Other teams sign players each day.`),
  );
  return save;
}

/** AI teams keep good-value players they can afford. */
function wouldKeep(save: SaveGame, p: Player, teamId: string, rng: Rng): boolean {
  const { league } = save;
  const year = league.meta.season;
  const age = playerAge(p, year);
  const value = playerValue(league, p, teamStrategy(league, teamId));
  const payroll = teamPayroll(league, teamId, year);
  if (payroll > league.settings.secondApron) return false;
  if (age >= 34) return rng.chance(0.25);
  return rng.chance(Math.min(0.85, 0.25 + value / 12));
}

/** Budget for an AI team: cap room, the mid-level exception once, else the minimum. */
function aiBudget(save: SaveGame, teamId: string): { limit: number; mle: boolean } {
  const { league } = save;
  const cba = league.settings;
  const payroll = teamPayroll(league, teamId, league.meta.season);
  const room = cba.salaryCap - payroll;
  const mle = Math.round(MLE_SHARE * cba.salaryCap);
  if (room > mle) return { limit: room, mle: false };
  if (!save.offseason!.mleUsed.includes(teamId) && payroll + mle < cba.firstApron) return { limit: mle, mle: true };
  return { limit: cba.minimumSalary, mle: false };
}

/** One day of free agency: AI teams sign the best players they can afford. */
export function freeAgencyDay(original: SaveGame, rng = new Rng(newSeed())): SaveGame {
  const o = original.offseason;
  if (!o || o.stage !== 'free-agency') return original;
  const save = structuredClone(original);
  const { league } = save;
  const year = league.meta.season;
  const me = save.career.teamId;
  const signed: string[] = [];
  const teams = rng.shuffle(league.teams.map((t) => t.id).filter((t) => t !== me));
  for (const teamId of teams) {
    const size = rosterOf(league, teamId).filter((p) => p.contract?.kind !== 'two-way').length;
    if (size >= league.settings.rosterMax || (size >= 14 && rng.chance(0.6))) continue;
    // Each team signs up to one player a day (two when short-handed).
    for (let n = 0; n < (size < 12 ? 2 : 1); n++) {
      const budget = aiBudget(save, teamId);
      const pool = league.players
        .filter((p) => !p.teamId && save.offseason!.birdRights[p.id] !== me)
        .map((p) => ({ p, ask: marketSalary(league.settings, playerOverall(p), playerAge(p, year), p.experience) }))
        .filter((x) => x.ask <= budget.limit * 1.05 || budget.limit === league.settings.minimumSalary)
        .sort((a, b) => playerValue(league, b.p, teamStrategy(league, teamId)) - playerValue(league, a.p, teamStrategy(league, teamId)));
      const pick = pool[0];
      if (!pick) break;
      const salary = Math.min(pick.ask, budget.limit);
      const years = playerAge(pick.p, year) <= 28 ? rng.int(1, 4) : rng.int(1, 2);
      pick.p.teamId = teamId;
      pick.p.contract = { years: Array.from({ length: years }, (_, i) => ({ season: year + i, salary: Math.round(salary * 1.05 ** i) })), option: null, kind: salary <= league.settings.minimumSalary ? 'minimum' : 'standard', noTrade: false, signedSeason: year };
      if (budget.mle) save.offseason!.mleUsed.push(teamId);
      if (displayRating(playerOverall(pick.p)) >= 78) signed.push(`${fullName(pick.p)} to the ${league.teams.find((t) => t.id === teamId)?.name}`);
    }
  }
  save.offseason!.faDay++;
  // Your own free agents shop around after a few days if you have not re-signed them.
  if (save.offseason!.faDay >= 3) {
    for (const [id] of Object.entries(save.offseason!.birdRights)) {
      const p = league.players.find((x) => x.id === id);
      if (p && !p.teamId && rng.chance(0.35)) delete save.offseason!.birdRights[id];
    }
  }
  save.season.rumors = [...signed.slice(0, 4).map((s) => `Signed: ${s}`), ...(save.season.rumors ?? [])].slice(0, 6);
  if (signed.length) save.inbox.unshift(msg(save, `fa-day-${save.offseason!.faDay}`, 'Assistant GM', `Free agency, day ${save.offseason!.faDay}`, `Signings around the league: ${signed.join('; ')}.`));
  return save;
}

/**
 * Training camp and the new season: player development, retirements, teams
 * trimmed to the roster limit and filled to the minimum, a new schedule.
 */
export function startNewSeason(original: SaveGame, rng = new Rng(newSeed())): SaveGame {
  const o = original.offseason;
  if (!o || o.stage === 'draft') return original;
  const save = structuredClone(original);
  const { league } = save;
  const me = save.career.teamId;
  const year = league.meta.season;
  const devCoach = (teamId: string | null) => league.staff.find((s) => s.teamId === teamId && s.role === 'DEV')?.ratings.development ?? 10;
  const myBefore = new Map(rosterOf(league, me).map((p) => [p.id, displayRating(playerOverall(p))]));
  developPlayers(league, rng, devCoach);
  const retired = retirements(league, rng);
  const inducted = induct(save, retired);
  const retiredIds = new Set(retired.map((p) => p.id));
  league.players = league.players.filter((p) => !retiredIds.has(p.id));

  // AI teams: cut to the limit, then fill to the minimum with the best free agents on minimum deals.
  const cutMine = trimRoster(league, me);
  for (const t of league.teams) {
    if (t.id === me) continue;
    trimRoster(league, t.id);
    let size = rosterOf(league, t.id).filter((p) => p.contract?.kind !== 'two-way').length;
    while (size < league.settings.rosterMin) {
      const fa = league.players.filter((p) => !p.teamId).sort((a, b) => playerOverall(b) - playerOverall(a))[0];
      if (!fa) break;
      fa.teamId = t.id;
      fa.contract = { years: [{ season: year, salary: league.settings.minimumSalary }], option: null, kind: 'minimum', noTrade: false, signedSeason: year };
      size++;
    }
  }
  // Free agents nobody wanted for two years drift out of the league.
  league.players = league.players.filter((p) => p.teamId || playerAge(p, year) <= 33 || rng.chance(0.5));

  const champion = save.season.champion ? league.teams.find((t) => t.id === save.season.champion) : undefined;
  const myRow = save.season.games.filter((g) => g.hs !== undefined && (g.home === me || g.away === me));
  const wins = myRow.filter((g) => (g.home === me ? g.hs! > g.as! : g.as! > g.hs!)).length;
  save.history = [...(save.history ?? []), { season: year - 1, wins, losses: myRow.length - wins, champion: champion ? teamName(champion) : null }];
  save.season = newSeason(league, rng);
  save.offseason = undefined;
  rollFinances(save);

  const mine = rosterOf(league, me);
  const risers = mine
    .map((p) => ({ p, d: displayRating(playerOverall(p)) - (myBefore.get(p.id) ?? displayRating(playerOverall(p))) }))
    .filter((x) => x.d !== 0)
    .sort((a, b) => b.d - a.d);
  const up = risers.filter((x) => x.d > 0).slice(0, 4).map((x) => `${fullName(x.p)} +${x.d}`);
  const down = risers.filter((x) => x.d < 0).slice(-3).map((x) => `${fullName(x.p)} ${x.d}`);
  const myRetired = retired.filter((p) => myBefore.has(p.id)).map(fullName);
  save.inbox.unshift(
    msg(save, 'camp', 'Head coach', 'Training camp report', `${up.length ? `Improved over the summer: ${up.join(', ')}. ` : ''}${down.length ? `Lost a step: ${down.join(', ')}. ` : ''}${myRetired.length ? `Retired: ${myRetired.join(', ')}. ` : ''}${cutMine.length ? `To get down to ${league.settings.rosterMax}, we waived ${cutMine.map(fullName).join(', ')}. ` : ''}${retired.length} players retired around the league.`.trim()),
  );
  if (inducted.length) {
    save.inbox.unshift(
      msg(save, 'hof', 'League office', `Hall of Fame: ${inducted.map((h) => h.name).join(', ')}`, `Inducted after retiring this summer: ${inducted.map((h) => `${h.name} (${h.honors.slice(0, 3).join(', ') || `${h.totals.pts.toLocaleString()} points`})`).join('; ')}.`),
    );
  }
  return save;
}
