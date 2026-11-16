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
  assignJersey,
  fixJerseys,
  rebalanceRatings,
  talentLevel,
  standings,
  signDraftedPlayer,
  teamName,
  teamPayroll,
  teamStrategy,
  trimRoster,
  type DraftSlot,
  type LeagueFile,
  type Player,
  salaryFloor,
} from '../engine';
import { addMessage, type InboxMessage, type SaveGame } from '../storage/saves';
import { MLE_SHARE } from './contracts';
import { induct, recordPlayerSeasons } from './history';
import { rollFinances } from './finance';
import { holdouts } from './demands';
import { renewStaff, setSeasonGoal } from './staff';

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
  /** Your decisions on team options for next season (undecided: your assistant decides). */
  optionChoices?: Record<string, 'exercise' | 'decline'>;
  /** Restricted free agents (former first-round picks): player id to the team that can match offers. */
  rfa?: Record<string, string>;
  /** Offer sheets other teams gave your restricted free agents: match them or let him go. */
  offerSheets?: OfferSheet[];
}

export interface OfferSheet {
  playerId: string;
  teamId: string;
  salary: number;
  years: number;
  /** Free agency day it arrived: unanswered by the next day, he signs it. */
  day: number;
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
  // The class your scouts have been watching all season, if you looked at it.
  const prospects = save.draftScouting?.year === draftYear ? [...save.draftScouting.prospects] : generateDraftClass(league, rng, draftYear);
  save.offseason = { stage: 'draft', draftYear, order, onClock: 0, prospects, made: [], faDay: 0, birdRights: {}, mleUsed: [] };
  const me = save.career.teamId;
  const mine = order.filter((s) => s.teamId === me);
  const jumped = order.filter((s) => s.jumped).map((s) => league.teams.find((t) => t.id === s.originalTeamId)?.name);
  addMessage(save, 
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
    addMessage(save, msg(save, `drafted-${p!.id}`, 'Assistant GM', `We drafted ${fullName(p!)} at #${slot.overall}`, `${p!.position}, ${o.draftYear - p!.born.year}, ${p!.college ?? p!.born.country}. ${slot.round === 1 ? 'He signs a four-year rookie-scale deal.' : 'He signs a two-year minimum deal.'}`));
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

  const optionNews = applyOptions(save);
  const expiring = expiringPlayers(league);
  const mineLeft: string[] = [];
  const resigned: string[] = [];
  const rfa: Record<string, string> = (save.offseason!.rfa = {});
  save.offseason!.offerSheets = [];
  for (const p of expiring) {
    const teamId = p.teamId!;
    // Former first-round picks coming off their rookie deal are restricted: their team can match any offer.
    const restricted = p.contract?.kind === 'rookie' && p.draft?.round === 1 && playerAge(p, year) <= 26;
    if (teamId === me) {
      save.offseason!.birdRights[p.id] = me;
      if (restricted) rfa[p.id] = me;
      mineLeft.push(`${fullName(p)}${restricted ? ' (restricted)' : ''}`);
    } else if (restricted && playerValue(league, p, teamStrategy(league, teamId)) >= 3) {
      rfa[p.id] = teamId;
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
  addMessage(save, 
    msg(save, 'fa-open', 'Assistant GM', 'Free agency is open', `${optionNews}${mineLeft.length ? `Our free agents: ${mineLeft.join(', ')}. We hold their Bird rights, so we can go over the cap to keep them. Restricted free agents can sign offer sheets elsewhere, and we get to match. ` : ''}${resigned.length ? `Around the league, teams kept ${resigned.slice(0, 5).join(', ')}${resigned.length > 5 ? ' and others' : ''}. ` : ''}Make offers from a player's page or the free-agent list. Other teams sign players each day.`),
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

/** What a free agent asks today: his market value, coming down the longer he waits (to 60% on the last day). */
export function askToday(save: SaveGame, p: Player): number {
  const { league } = save;
  const year = league.meta.season;
  const market = marketSalary(league.settings, playerOverall(p), playerAge(p, year), p.experience);
  const day = save.offseason?.faDay ?? FA_DAYS;
  const drop = Math.min(0.4, day * 0.1);
  return Math.max(league.settings.minimumSalary, Math.round(market * (1 - drop)));
}

/**
 * One day of free agency. Each free agent (best first) hears offers from the
 * teams that need players and can pay what he asks, within their real budget
 * (cap room, the mid-level exception, or the minimum for minimum-level players).
 * He takes the best offer: money first, a winning team breaks a close call.
 */
export function freeAgencyDay(original: SaveGame, rng = new Rng(newSeed())): SaveGame {
  const o = original.offseason;
  if (!o || o.stage !== 'free-agency') return original;
  const save = structuredClone(original);
  const { league } = save;
  const year = league.meta.season;
  const me = save.career.teamId;
  const cba = league.settings;
  const signed: string[] = [];
  const lastDay = save.offseason!.faDay >= FA_DAYS - 1;
  const winPct = new Map(standings(league, save.season.games).map((r) => [r.teamId, r.w + r.l ? r.w / (r.w + r.l) : 0.5]));
  const signedToday = new Map<string, number>();
  const size = (teamId: string) => rosterOf(league, teamId).filter((p) => p.contract?.kind !== 'two-way').length;
  const o2 = save.offseason!;
  // Offer sheets you did not answer by today: he signs with that team.
  for (const sheet of (o2.offerSheets ?? []).filter((x) => x.day < o2.faDay)) {
    const p = league.players.find((x) => x.id === sheet.playerId);
    if (p && !p.teamId) signWith(save, p, sheet.teamId, sheet.salary, sheet.years);
    if (p) delete o2.rfa?.[p.id];
  }
  o2.offerSheets = (o2.offerSheets ?? []).filter((x) => x.day >= o2.faDay);
  const pending = new Set(o2.offerSheets.map((x) => x.playerId));
  const floor = salaryFloor(cba);
  const pool = league.players
    .filter((p) => !p.teamId && !pending.has(p.id) && (o2.birdRights[p.id] !== me || o2.rfa?.[p.id] === me))
    .sort((a, b) => playerOverall(b) - playerOverall(a))
    .slice(0, 120);
  for (const p of pool) {
    const ask = askToday(save, p);
    const minLevel = ask <= cba.minimumSalary * 1.1;
    const offers: { teamId: string; salary: number; mle: boolean; score: number }[] = [];
    for (const t of league.teams) {
      if (t.id === me) continue;
      const n = size(t.id);
      const today = signedToday.get(t.id) ?? 0;
      if (n >= cba.rosterMax || today >= (n < 12 ? 2 : 1)) continue;
      // A full-ish roster only adds players who would make its rotation.
      if (n >= 13) {
        const tenth = rosterOf(league, t.id)[9];
        if (tenth && playerOverall(p) <= playerOverall(tenth)) continue;
      }
      const budget = aiBudget(save, t.id);
      if (budget.limit === cba.minimumSalary && !minLevel) continue;
      // Teams pay up to the ask (a little more for players they value), never past their budget.
      // Teams under the salary floor have money they must spend anyway: they bid higher.
      const underFloor = teamPayroll(league, t.id, year) < floor;
      const want = Math.round(ask * (1 + rng.normal(underFloor ? 0.1 : 0.03, 0.04)));
      const salary = Math.min(want, budget.limit);
      if (salary < ask * (lastDay ? 0.75 : 0.95)) continue;
      offers.push({ teamId: t.id, salary, mle: budget.mle, score: salary * (1 + 0.15 * (winPct.get(t.id) ?? 0.5)) * (1 + rng.normal(0, 0.03)) });
    }
    const holder = o2.rfa?.[p.id];
    const best = offers.filter((x) => x.teamId !== holder).sort((x, y) => y.score - x.score)[0];
    if (!best) continue;
    const years = playerAge(p, year) <= 28 ? rng.int(2, 4) : rng.int(1, 2);
    if (holder === me) {
      // Your restricted free agent signed an offer sheet: you decide whether to match.
      o2.offerSheets!.push({ playerId: p.id, teamId: best.teamId, salary: best.salary, years, day: o2.faDay });
      const t = league.teams.find((x) => x.id === best.teamId);
      addMessage(save, msg(save, `sheet-${p.id}`, 'Assistant GM', `Offer sheet for ${fullName(p)}`, `The ${t?.name} offered ${fullName(p)} ${years} years at $${(best.salary / 1e6).toFixed(1)}M a season. He is a restricted free agent, so we can match it (Offseason screen). If we do not answer by tomorrow, he joins them.`));
      continue;
    }
    // Another AI team holds his rights: it matches when he is worth the price.
    const matcher = holder && playerValue(league, p, teamStrategy(league, holder)) * cba.salaryCap * 0.012 >= best.salary * 0.9 ? holder : null;
    const signedBy = matcher ?? best.teamId;
    signWith(save, p, signedBy, best.salary, years);
    if (holder) delete o2.rfa![p.id];
    if (matcher) {
      if (displayRating(playerOverall(p)) >= 76) signed.push(`${fullName(p)} stays with the ${league.teams.find((t) => t.id === matcher)?.name} (matched an offer sheet)`);
      continue;
    }
    signedToday.set(best.teamId, (signedToday.get(best.teamId) ?? 0) + 1);
    if (best.mle) save.offseason!.mleUsed.push(best.teamId);
    if (displayRating(playerOverall(p)) >= 78) signed.push(`${fullName(p)} to the ${league.teams.find((t) => t.id === best.teamId)?.name} (${offers.length > 1 ? `${offers.length} offers, ` : ''}$${(best.salary / 1e6).toFixed(1)}M)`);
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
  if (signed.length) addMessage(save, msg(save, `fa-day-${save.offseason!.faDay}`, 'Assistant GM', `Free agency, day ${save.offseason!.faDay}`, `Signings around the league: ${signed.join('; ')}.`));
  return save;
}

/**
 * Training camp and the new season: player development, retirements, teams
 * trimmed to the roster limit and filled to the minimum, a new schedule.
 */
export function startNewSeason(original: SaveGame, rng = new Rng(newSeed())): SaveGame {
  const o = original.offseason;
  if (!o || o.stage === 'draft') return original;
  // Skipping ahead: the other teams still finish free agency.
  let rest = original;
  while (rest.offseason && rest.offseason.faDay < FA_DAYS) rest = freeAgencyDay(rest, rng);
  // Offer sheets still open are not matched: the players join the teams that offered.
  for (const sheet of rest.offseason?.offerSheets ?? []) rest = declineOfferSheet(rest, sheet.playerId);
  const save = structuredClone(rest);
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

  // Every team, yours included, is cut to the limit and filled to the minimum with minimum-level free agents.
  const cutMine = trimRoster(league, me);
  for (const t of league.teams) if (t.id !== me) trimRoster(league, t.id);
  for (const t of league.teams) fillRoster(league, t.id);
  const filledMine = fillRoster(league, me);
  fixJerseys(league);
  // Ratings stay on the same scale year after year (the level the career started at).
  save.ratingTarget ??= talentLevel(league);
  rebalanceRatings(league, save.ratingTarget, rng);
  // Unsigned players drift out of the league (overseas, retirement): keep the best 90 or so, young talent first.
  const keep = new Set(
    league.players
      .filter((p) => !p.teamId)
      .sort((a, b) => playerOverall(b) + (playerAge(b, year) <= 23 ? (b.potential - playerOverall(b)) * 0.6 : 0) - (playerOverall(a) + (playerAge(a, year) <= 23 ? (a.potential - playerOverall(a)) * 0.6 : 0)))
      .slice(0, 90)
      .filter((p) => playerAge(p, year) <= 34)
      .map((p) => p.id),
  );
  league.players = league.players.filter((p) => p.teamId || keep.has(p.id));

  const champion = save.season.champion ? league.teams.find((t) => t.id === save.season.champion) : undefined;
  const myRow = save.season.games.filter((g) => g.hs !== undefined && (g.home === me || g.away === me));
  const wins = myRow.filter((g) => (g.home === me ? g.hs! > g.as! : g.as! > g.hs!)).length;
  save.history = [...(save.history ?? []), { season: year - 1, wins, losses: myRow.length - wins, champion: champion ? teamName(champion) : null }];
  save.season = newSeason(league, rng);
  save.offseason = undefined;
  rollFinances(save);
  save.demands = { requests: {}, mods: [] };
  save.press = null;
  renewStaff(save);
  setSeasonGoal(save);
  holdouts(save, rng);

  const mine = rosterOf(league, me);
  const risers = mine
    .map((p) => ({ p, d: displayRating(playerOverall(p)) - (myBefore.get(p.id) ?? displayRating(playerOverall(p))) }))
    .filter((x) => x.d !== 0)
    .sort((a, b) => b.d - a.d);
  const up = risers.filter((x) => x.d > 0).slice(0, 4).map((x) => `${fullName(x.p)} +${x.d}`);
  const down = risers.filter((x) => x.d < 0).slice(-3).map((x) => `${fullName(x.p)} ${x.d}`);
  const myRetired = retired.filter((p) => myBefore.has(p.id)).map(fullName);
  addMessage(save, 
    msg(save, 'camp', 'Head coach', 'Training camp report', `${up.length ? `Improved over the summer: ${up.join(', ')}. ` : ''}${down.length ? `Lost a step: ${down.join(', ')}. ` : ''}${myRetired.length ? `Retired: ${myRetired.join(', ')}. ` : ''}${cutMine.length ? `To get down to ${league.settings.rosterMax}, we waived ${cutMine.map(fullName).join(', ')}. ` : ''}${filledMine.length ? `To reach the ${league.settings.rosterMin}-man minimum, we signed ${filledMine.map(fullName).join(', ')} to one-year minimum deals. ` : ''}${retired.length} players retired around the league.`.trim()),
  );
  if (inducted.length) {
    addMessage(save, 
      msg(save, 'hof', 'League office', `Hall of Fame: ${inducted.map((h) => h.name).join(', ')}`, `Inducted after retiring this summer: ${inducted.map((h) => `${h.name} (${h.honors.slice(0, 3).join(', ') || `${h.totals.pts.toLocaleString()} points`})`).join('; ')}.`),
    );
  }
  return save;
}

/** A free agent signs with a team: salary rising 5% a year. */
function signWith(save: SaveGame, p: Player, teamId: string, salary: number, years: number) {
  const { league } = save;
  const year = league.meta.season;
  p.teamId = teamId;
  p.contract = {
    years: Array.from({ length: years }, (_, i) => ({ season: year + i, salary: Math.round(salary * 1.05 ** i) })),
    option: null,
    kind: salary <= league.settings.minimumSalary ? 'minimum' : 'standard',
    noTrade: false,
    signedSeason: year,
  };
  assignJersey(league, p);
}

/** Match an offer sheet for your restricted free agent: he stays, on the same terms. */
export function matchOfferSheet(original: SaveGame, playerId: string): SaveGame {
  const sheet = original.offseason?.offerSheets?.find((x) => x.playerId === playerId);
  if (!sheet) return original;
  const save = structuredClone(original);
  const o = save.offseason!;
  const p = save.league.players.find((x) => x.id === playerId)!;
  signWith(save, p, save.career.teamId, sheet.salary, sheet.years);
  o.offerSheets = o.offerSheets!.filter((x) => x.playerId !== playerId);
  delete o.rfa?.[playerId];
  delete o.birdRights[playerId];
  addMessage(save, msg(save, `match-${playerId}`, 'Assistant GM', `We matched the offer for ${fullName(p)}`, `He stays: ${sheet.years} years at $${(sheet.salary / 1e6).toFixed(1)}M a season.`));
  return save;
}

/** Let your restricted free agent go to the team that gave him the offer sheet. */
export function declineOfferSheet(original: SaveGame, playerId: string): SaveGame {
  const sheet = original.offseason?.offerSheets?.find((x) => x.playerId === playerId);
  if (!sheet) return original;
  const save = structuredClone(original);
  const o = save.offseason!;
  const p = save.league.players.find((x) => x.id === playerId)!;
  signWith(save, p, sheet.teamId, sheet.salary, sheet.years);
  o.offerSheets = o.offerSheets!.filter((x) => x.playerId !== playerId);
  delete o.rfa?.[playerId];
  delete o.birdRights[playerId];
  return save;
}

/** Your players with an option year next season: [player, option type, salary]. */
export function pendingOptions(save: SaveGame): { player: Player; type: 'player' | 'team'; salary: number }[] {
  const year = (save.offseason?.draftYear ?? save.league.meta.season + 1);
  return save.league.players
    .filter((p) => p.teamId === save.career.teamId && p.contract?.option?.season === year)
    .map((p) => ({ player: p, type: p.contract!.option!.type, salary: p.contract!.years.find((y) => y.season === year)?.salary ?? 0 }));
}

export function setOptionChoice(original: SaveGame, playerId: string, choice: 'exercise' | 'decline'): SaveGame {
  if (!original.offseason) return original;
  const save = structuredClone(original);
  save.offseason!.optionChoices = { ...(save.offseason!.optionChoices ?? {}), [playerId]: choice };
  return save;
}

/**
 * Options for the new league year are decided: players opt out when they can
 * earn clearly more on the market; teams keep options worth the money (your
 * choices, or your assistant's). A declined option ends the contract now.
 * Returns a sentence for your inbox.
 */
function applyOptions(save: SaveGame): string {
  const { league } = save;
  const year = league.meta.season;
  const me = save.career.teamId;
  const lines: string[] = [];
  for (const p of league.players) {
    const opt = p.contract?.option;
    if (!p.teamId || !opt || opt.season !== year) continue;
    const salary = p.contract!.years.find((y) => y.season === year)?.salary ?? 0;
    const worth = marketSalary(league.settings, playerOverall(p), playerAge(p, year), p.experience);
    let keep: boolean;
    if (opt.type === 'player') keep = !(worth > salary * 1.1 && playerAge(p, year) <= 32);
    else if (p.teamId === me) keep = (save.offseason?.optionChoices?.[p.id] ?? (worth >= salary * 0.85 ? 'exercise' : 'decline')) === 'exercise';
    else keep = worth >= salary * 0.85;
    if (keep) p.contract!.option = null;
    else {
      p.contract!.years = p.contract!.years.filter((y) => y.season < year);
      p.contract!.option = null;
    }
    if (p.teamId === me) {
      lines.push(
        opt.type === 'player'
          ? `${fullName(p)} ${keep ? 'opted in' : 'opted out'} of his player option`
          : `we ${keep ? 'exercised' : 'declined'} the team option on ${fullName(p)}`,
      );
    }
  }
  return lines.length ? `Options: ${lines.join('; ')}. ` : '';
}

/** Sign minimum-level free agents (one year, the minimum) until the team has the minimum roster. Returns who signed. */
export function fillRoster(league: LeagueFile, teamId: string): Player[] {
  const year = league.meta.season;
  const cba = league.settings;
  const out: Player[] = [];
  let size = rosterOf(league, teamId).filter((p) => p.contract?.kind !== 'two-way').length;
  while (size < cba.rosterMin) {
    // Players who would sign for about the minimum; the best of them.
    const fa = league.players
      .filter((p) => !p.teamId && marketSalary(cba, playerOverall(p), playerAge(p, year), p.experience) <= cba.minimumSalary * 1.6)
      .sort((a, b) => playerOverall(b) - playerOverall(a))[0];
    if (!fa) break;
    fa.teamId = teamId;
    fa.contract = { years: [{ season: year, salary: cba.minimumSalary }], option: null, kind: 'minimum', noTrade: false, signedSeason: year };
    assignJersey(league, fa);
    out.push(fa);
    size++;
  }
  return out;
}
