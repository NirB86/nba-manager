// Contract offers from the user's team: extensions for its own players and
// signings of free agents. Each player has an asking price; an offer has a
// chance of a yes, and a refusal comes with the player's counter offer.

import { Rng, buildContract, capStatus, fullName, marketSalary, maxSalaryShare, playerAge, playerOverall, projectedCba, rosterOf, teamPayroll, teamStrategy, type Contract, type Player } from '../engine';
import type { SaveGame } from '../storage/saves';
import { morale } from './morale';
import { potentialRange } from './scouting';

/** Non-taxpayer mid-level exception, as a share of the cap (about 14.1M on a 154.6M cap). */
export const MLE_SHARE = 0.0912;
/** Annual raise in offers we build. */
const RAISE = 0.05;
/** Extensions open when this many seasons (this one included) or fewer are left. */
export const EXTENSION_WINDOW = 2;

export type ContractKind = 'extension' | 'free-agent';

export interface Offer {
  /** First-year salary in dollars. */
  salary: number;
  years: number;
  option: 'none' | 'player' | 'team';
}

export interface Negotiation {
  kind: ContractKind;
  /** First season the new deal covers. */
  firstSeason: number;
  /** What the player wants, as a full offer. */
  ask: Offer;
  minSalary: number;
  maxSalary: number;
  /** Free agents: the most this team can pay, and why. */
  budget?: { limit: number; how: string };
  /** Turned down an offer today: wait for the next game day. */
  waitUntilNextDay: boolean;
}

export type Eligibility = { ok: true; negotiation: Negotiation } | { ok: false; reason: string };

const yearsLeft = (p: Player, season: number) => (p.contract?.years ?? []).filter((y) => y.season >= season).length;

/** How many seasons a player wants, by age. */
function wantedYears(age: number): number {
  if (age <= 24) return 4;
  if (age <= 29) return 4;
  if (age <= 32) return 3;
  if (age <= 34) return 2;
  return 1;
}

/** Asking first-year salary for a deal starting in `firstSeason`. */
function askingSalary(save: SaveGame, p: Player, firstSeason: number): number {
  const { league } = save;
  const season = league.meta.season;
  const ahead = Math.max(0, firstSeason - season);
  const cba = projectedCba(league.settings, ahead);
  const ovr = playerOverall(p);
  const age = playerAge(p, season) + ahead;
  // Young players price in the growth their agents expect.
  const [, potHi] = potentialRange(save, p);
  const expected = age <= 24 ? ovr + Math.max(0, potHi - ovr) * 0.4 : ovr;
  let ask = marketSalary(cba, expected, age, p.experience + ahead);
  // Ego and loyalty move the price a little.
  const pers = p.personality;
  ask *= 1 + (pers.ego - 10) * 0.012 - (p.teamId === save.career.teamId ? (pers.loyalty - 10) * 0.01 : 0);
  const max = maxSalaryShare(p.experience + ahead) * cba.salaryCap;
  return Math.round(Math.max(cba.minimumSalary, Math.min(max, ask)) / 10_000) * 10_000;
}

/** The "day" contract talks are counted by: game days, or free-agency days in the summer. */
const talkDay = (save: SaveGame) => (save.offseason ? 10_000 + save.offseason.faDay : save.season.day);

/** Can the user's team talk contracts with this player now? */
export function negotiation(save: SaveGame, p: Player): Eligibility {
  const { league, season: s } = save;
  const me = save.career.teamId;
  const season = league.meta.season;
  if (s.phase === 'playoffs') return { ok: false, reason: 'Contract talks wait until the playoffs are over.' };
  if (save.offseason?.stage === 'draft') return { ok: false, reason: 'Contract talks open with free agency, right after the draft.' };
  const waitUntilNextDay = (s.contractTalks ?? []).some((t) => t.playerId === p.id && t.day === talkDay(save));
  const age = playerAge(p, season);

  if (p.teamId === me) {
    if (p.contract?.kind === 'two-way') return { ok: false, reason: 'Two-way deals are converted, not extended: coming with free agency.' };
    const left = yearsLeft(p, season);
    if (left > EXTENSION_WINDOW) return { ok: false, reason: `He has ${left} seasons left. Extensions open with ${EXTENSION_WINDOW} or fewer to go.` };
    const firstSeason = (p.contract?.years.at(-1)?.season ?? season) + 1;
    const cba = projectedCba(league.settings, firstSeason - season);
    const salary = askingSalary(save, p, firstSeason);
    return {
      ok: true,
      negotiation: {
        kind: 'extension',
        firstSeason,
        ask: { salary, years: wantedYears(age), option: salary > cba.salaryCap * 0.2 ? 'player' : 'none' },
        minSalary: cba.minimumSalary,
        maxSalary: Math.round(maxSalaryShare(p.experience + (firstSeason - season)) * cba.salaryCap),
        waitUntilNextDay,
      },
    };
  }

  if (p.teamId === null) {
    const roster = rosterOf(league, me).filter((x) => x.contract?.kind !== 'two-way').length;
    if (roster >= league.settings.rosterMax) return { ok: false, reason: `Your roster is full (${roster} of ${league.settings.rosterMax}). Trade or release a player first.` };
    // Your own free agents: Bird rights let you go over the cap to keep them.
    const bird = save.offseason?.birdRights[p.id] === me;
    const budget = bird ? { limit: Math.round(maxSalaryShare(p.experience) * league.settings.salaryCap), how: 'Bird rights' } : signingBudget(save);
    const salary = askingSalary(save, p, season);
    return {
      ok: true,
      negotiation: {
        kind: 'free-agent',
        firstSeason: season,
        ask: { salary, years: Math.min(wantedYears(age), 4), option: 'none' },
        minSalary: league.settings.minimumSalary,
        maxSalary: Math.round(maxSalaryShare(p.experience) * league.settings.salaryCap),
        budget,
        waitUntilNextDay,
      },
    };
  }
  return { ok: false, reason: 'He is under contract with another team: trade for him instead.' };
}

/** The most the user's team can pay a free agent this season, and under which rule. */
export function signingBudget(save: SaveGame): { limit: number; how: string } {
  const { league } = save;
  const cba = league.settings;
  const payroll = teamPayroll(league, save.career.teamId, league.meta.season);
  const room = cba.salaryCap - payroll;
  const mle = Math.round(MLE_SHARE * cba.salaryCap);
  if (room > mle) return { limit: room, how: 'cap space' };
  const status = capStatus(cba, payroll + mle);
  if (!save.season.mleUsed && status !== 'first-apron' && status !== 'second-apron') return { limit: mle, how: 'mid-level exception' };
  return { limit: cba.minimumSalary, how: 'minimum contract only' };
}

/** Total value of an offer over its years. */
const total = (o: Offer) => Array.from({ length: o.years }, (_, i) => o.salary * (1 + RAISE) ** i).reduce((a, b) => a + b, 0);

export interface OfferVerdict {
  valid: boolean;
  problem?: string;
  /** Chance he signs, 0..1. */
  chance: number;
  message: string;
}

export function evaluateOffer(save: SaveGame, p: Player, n: Negotiation, offer: Offer): OfferVerdict {
  if (offer.salary < n.minSalary) return { valid: false, problem: 'Below the league minimum.', chance: 0, message: '' };
  if (offer.salary > n.maxSalary) return { valid: false, problem: 'Above his maximum salary.', chance: 0, message: '' };
  if (offer.years < 1 || offer.years > 5) return { valid: false, problem: 'Deals run 1 to 5 seasons.', chance: 0, message: '' };
  if (n.budget && offer.salary > n.budget.limit) {
    return { valid: false, problem: `You can offer at most ${(n.budget.limit / 1e6).toFixed(1)}M (${n.budget.how}).`, chance: 0, message: '' };
  }
  // Money first: total value against what he asks for over the years he wants.
  const askYears = n.ask.years;
  const byYear = total(offer) / offer.years / (total(n.ask) / askYears);
  // Years: older players want security, young stars want to keep options open.
  const yearGap = offer.years - askYears;
  const age = playerAge(p, save.league.meta.season);
  const yearsFit = age >= 30 ? Math.min(0, yearGap) * 0.05 : -Math.abs(yearGap) * 0.025;
  const optionFit = offer.option === 'player' ? 0.04 : offer.option === 'team' ? -0.05 : 0;
  // Winning teams and loyal players make it easier; free agents shop around.
  const strategy = teamStrategy(save.league, save.career.teamId);
  const situation = (strategy === 'contend' ? 0.03 : strategy === 'rebuild' ? -0.03 : 0) + (n.kind === 'extension' ? (p.personality.loyalty - 10) * 0.006 : -0.01);
  const difficulty = { easy: 0.04, normal: 0, hard: -0.05 }[save.career.difficulty];
  // Happy players re-sign more easily; unhappy ones want out.
  const mood = n.kind === 'extension' ? morale(save, p).score * 0.005 : 0;
  // Paying his ask on a neutral team is a little better than a coin flip.
  const score = 0.02 + byYear - 1 + yearsFit + optionFit + situation + difficulty + mood;
  const chance = Math.max(0.02, Math.min(0.98, 1 / (1 + Math.exp(-score / 0.045))));
  const message =
    chance >= 0.85 ? 'His agent is ready to sign.' : chance >= 0.6 ? 'Close: he is leaning yes.' : chance >= 0.35 ? 'On the fence.' : chance >= 0.12 ? 'Well short of what he wants.' : 'His agent laughs at that offer.';
  return { valid: true, chance, message };
}

export type OfferResult = { signed: true; save: SaveGame } | { signed: false; save: SaveGame; counter: Offer };

/** Make the offer. A refusal blocks new offers until the next game day and comes with his counter. */
export function makeOffer(original: SaveGame, playerId: string, offer: Offer, roll: () => number = Math.random): OfferResult {
  const p = original.league.players.find((x) => x.id === playerId);
  const elig = p ? negotiation(original, p) : null;
  if (!p || !elig?.ok || elig.negotiation.waitUntilNextDay) throw new Error('No contract talks with this player right now.');
  const n = elig.negotiation;
  const v = evaluateOffer(original, p, n, offer);
  if (!v.valid) throw new Error(v.problem);
  if (roll() <= v.chance) return { signed: true, save: sign(original, playerId, n, offer) };
  const save = structuredClone(original);
  const day = talkDay(save);
  save.season.contractTalks = [...(save.season.contractTalks ?? []).filter((t) => t.day === day), { playerId, day }];
  return { signed: false, save, counter: counterFor(n, offer) };
}

/** His answer to a refused offer: meet in the middle, nudged toward his ask, within your budget. */
export function counterFor(n: Negotiation, offer: Offer): Offer {
  const years = n.ask.years;
  let salary = Math.round(Math.max(offer.salary, n.ask.salary * 0.97) / 10_000) * 10_000;
  if (n.budget) salary = Math.min(salary, n.budget.limit);
  salary = Math.min(salary, n.maxSalary);
  return { salary, years, option: n.ask.option };
}

/** Accept the player's own counter offer: he already agreed to it. */
export function acceptCounter(save: SaveGame, playerId: string, counter: Offer): SaveGame {
  const p = save.league.players.find((x) => x.id === playerId);
  if (!p) return save;
  const elig = negotiation({ ...save, season: { ...save.season, contractTalks: [] } }, p);
  if (!elig.ok) throw new Error(elig.reason);
  return sign(save, playerId, elig.negotiation, counter);
}

function sign(original: SaveGame, playerId: string, n: Negotiation, offer: Offer): SaveGame {
  const save = structuredClone(original);
  const { league } = save;
  const me = save.career.teamId;
  const season = league.meta.season;
  const p = league.players.find((x) => x.id === playerId)!;
  const built = buildContract(new Rng(1), league.settings, { firstSeason: n.firstSeason, signedSeason: season, firstYearSalary: offer.salary, years: offer.years, kind: 'standard' });
  const option: Contract['option'] = offer.option === 'none' ? null : { season: built.years.at(-1)!.season, type: offer.option };
  if (n.kind === 'extension' && p.contract) {
    const kept = p.contract.years.filter((y) => y.season < n.firstSeason);
    p.contract = { ...p.contract, years: [...kept, ...built.years], option, kind: 'standard', signedSeason: season };
  } else {
    p.contract = { ...built, option, noTrade: false };
    p.teamId = me;
    const taken = new Set(league.players.filter((x) => x.teamId === me && x.id !== p.id).map((x) => x.jersey));
    while (taken.has(p.jersey)) p.jersey = (p.jersey + 1) % 100;
    if (n.budget?.how === 'mid-level exception') save.season.mleUsed = true;
  }
  const money = (v: number) => `$${(v / 1e6).toFixed(1)}M`;
  const totalValue = p.contract.years.filter((y) => y.season >= n.firstSeason).reduce((s, y) => s + y.salary, 0);
  save.inbox.unshift({
    id: `contract-${p.id}-${Date.now()}`,
    from: 'Assistant GM',
    subject: n.kind === 'extension' ? `${fullName(p)} signs an extension` : `${fullName(p)} signs with us`,
    body: `${offer.years} year${offer.years > 1 ? 's' : ''}, ${money(totalValue)} in total (${money(offer.salary)} in the first season)${option ? `, ${option.type} option in the last year` : ''}. ${n.kind === 'free-agent' ? `Signed with ${n.budget?.how ?? 'cap space'}.` : ''}`.trim(),
    date: `Day ${save.season.day + 1}`,
    read: false,
  });
  return save;
}

