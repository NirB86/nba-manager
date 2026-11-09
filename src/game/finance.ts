// Club finances and the owner's confidence: ticket prices and attendance,
// media and merchandise money, payroll and the luxury tax bill, the owner's
// payroll budget, and what happens when the owner runs out of patience.

import { displayRating, playerOverall, rosterOf, standings, teamPayroll, type CbaSettings, type DayReport, type Market } from '../engine';
import type { Difficulty, InboxMessage, SaveGame } from '../storage/saves';
import { ownerExpectation } from './career';
import { ownerMood } from './news';

export const ARENA_CAPACITY = 18_500;
const BASE_PRICE: Record<Market, number> = { small: 85, mid: 100, large: 130 };
const MARKET_MULT: Record<Market, number> = { small: 0.85, mid: 1, large: 1.3 };

export interface SeasonLedger {
  season: number;
  homeGames: number;
  attendance: number;
  tickets: number;
  media: number;
  merch: number;
  playoffs: number;
  payroll: number;
  tax: number;
  /** Arena operations, staff and travel. */
  ops?: number;
}

export interface FinanceState {
  /** Average ticket price in dollars. */
  ticketPrice: number;
  ledger: SeasonLedger;
  history: SeasonLedger[];
  /** Owner confidence in you, 0-100. */
  confidence: number;
  /** Confidence at the end of each season, oldest first. */
  confidenceHistory?: { season: number; value: number }[];
}

export interface JobOffer {
  teamId: string;
  reason: 'fired' | 'interest';
}

export const profit = (l: SeasonLedger) => l.tickets + l.media + l.merch + l.playoffs - l.payroll - l.tax - (l.ops ?? 0);
export const revenue = (l: SeasonLedger) => l.tickets + l.media + l.merch + l.playoffs;

const emptyLedger = (season: number): SeasonLedger => ({ season, homeGames: 0, attendance: 0, tickets: 0, media: 0, merch: 0, playoffs: 0, payroll: 0, tax: 0, ops: 0 });

export function finance(save: SaveGame): FinanceState {
  const team = save.league.teams.find((t) => t.id === save.career.teamId);
  save.finance ??= { ticketPrice: BASE_PRICE[team?.market ?? 'mid'], ledger: emptyLedger(save.league.meta.season), history: [], confidence: 60 };
  return save.finance;
}

/** Read-only view for screens (does not create state). */
export function financeView(save: SaveGame): FinanceState {
  const team = save.league.teams.find((t) => t.id === save.career.teamId);
  return save.finance ?? { ticketPrice: BASE_PRICE[team?.market ?? 'mid'], ledger: emptyLedger(save.league.meta.season), history: [], confidence: 60 };
}

/** Luxury tax owed on a payroll: progressive rates for each $5M (scaled to the cap) over the line. */
export function luxuryTaxBill(cba: CbaSettings, payroll: number): number {
  const over = payroll - cba.luxuryTax;
  if (over <= 0) return 0;
  const step = cba.salaryCap * 0.035; // about $5M at a $141M cap
  let bill = 0;
  let left = over;
  for (let i = 0; left > 0; i++) {
    const chunk = Math.min(step, left);
    bill += chunk * (i === 0 ? 1.5 : i === 1 ? 1.75 : i === 2 ? 2.5 : 3.25 + 0.5 * (i - 3));
    left -= chunk;
  }
  return Math.round(bill);
}

/** The payroll the owner will fund before complaining. */
export function ownerBudget(save: SaveGame): number {
  const team = save.league.teams.find((t) => t.id === save.career.teamId);
  const cba = save.league.settings;
  const exp = ownerExpectation(save.league, save.career.teamId);
  const market = team?.market === 'large' ? 1.12 : team?.market === 'small' ? 0.98 : 1.04;
  const ambition = exp.tier === 'title' ? 0.06 : exp.tier === 'contender' ? 0.03 : exp.tier === 'rebuild' ? -0.06 : 0;
  return Math.round(cba.luxuryTax * (market + ambition));
}

/** How full the arena is tonight at a ticket price (0-1). */
export function demand(save: SaveGame, price: number, playoff = false): number {
  const me = save.career.teamId;
  const team = save.league.teams.find((t) => t.id === me);
  const market = team?.market ?? 'mid';
  const row = standings(save.league, save.season.games).find((r) => r.teamId === me);
  const pct = row && row.w + row.l >= 5 ? row.pct : 0.5;
  const top = Math.max(0, ...rosterOf(save.league, me).map((p) => displayRating(playerOverall(p))));
  const star = top >= 93 ? 0.08 : top >= 89 ? 0.05 : top >= 85 ? 0.02 : 0;
  const base = 0.8 + (pct - 0.5) * 0.6 + star + (market === 'large' ? 0.04 : market === 'small' ? -0.03 : 0) + (playoff ? 0.2 : 0);
  // Price elasticity around the market's usual price.
  const ref = BASE_PRICE[market] * (playoff ? 1.6 : 1);
  return Math.max(0.35, Math.min(1, base * Math.pow(ref / price, 1.1)));
}

const msg = (save: SaveGame, id: string, from: string, subject: string, body: string): InboxMessage => ({
  id: `${id}-${save.season.year}`,
  from,
  subject,
  body,
  date: save.season.phase === 'regular' ? `Regular season, day ${save.season.day + 1}` : save.season.phase === 'playoffs' ? 'Playoffs' : 'Offseason',
  read: false,
});

/** Money in and out for the user's games today, and the owner's weekly mood. */
export function financeDay(save: SaveGame, report: DayReport, dayBefore: number) {
  const me = save.career.teamId;
  const f = finance(save);
  const { league } = save;
  if (f.ledger.season !== league.meta.season) f.ledger = emptyLedger(league.meta.season);
  const team = league.teams.find((t) => t.id === me);
  const mult = MARKET_MULT[team?.market ?? 'mid'];
  const regularGames = Math.max(1, save.season.games.filter((g) => g.home === me || g.away === me).length);
  for (const { game } of report.played) {
    if (game.home !== me && game.away !== me) continue;
    const playoff = !save.season.games.includes(game);
    if (!playoff) {
      // National media money and payroll are paid out per game.
      f.ledger.media += Math.round((league.settings.salaryCap * 0.95) / regularGames);
      f.ledger.payroll += Math.round(teamPayroll(league, me, league.meta.season) / regularGames);
      // Staff, travel and the front office: about 15% of the cap a season.
      f.ledger.ops = (f.ledger.ops ?? 0) + Math.round((league.settings.salaryCap * 0.15) / regularGames);
    }
    if (game.home !== me) continue;
    const price = playoff ? Math.round(f.ticketPrice * 1.6) : f.ticketPrice;
    const fans = Math.round(ARENA_CAPACITY * demand(save, price, playoff));
    const gate = fans * price;
    f.ledger.homeGames++;
    f.ledger.attendance += fans;
    if (playoff) f.ledger.playoffs += gate;
    else f.ledger.tickets += gate;
    f.ledger.merch += Math.round(fans * 14 * mult);
    f.ledger.ops = (f.ledger.ops ?? 0) + 600_000; // opening the arena for a game
  }
  // Each week the owner's mood nudges their confidence in you.
  if (save.season.phase === 'regular' && save.season.day !== dayBefore && save.season.day % 7 === 0) {
    const mood = ownerMood(save).mood;
    const d = mood === 'Thrilled' ? 1 : mood === 'Pleased' ? 0.5 : mood === 'Concerned' ? -1 : mood === 'Furious' ? -2 : 0;
    f.confidence = clamp100(f.confidence + d);
  }
}

/** The tax bill, assessed on the payroll at the end of the regular season. */
export function assessTax(save: SaveGame) {
  const f = finance(save);
  const payroll = teamPayroll(save.league, save.career.teamId, save.league.meta.season);
  f.ledger.tax = luxuryTaxBill(save.league.settings, payroll);
  if (f.ledger.tax > 0) {
    save.inbox.unshift(
      msg(save, 'tax', 'Owner', `Luxury tax bill: $${(f.ledger.tax / 1e6).toFixed(1)}M`, `Our payroll finished $${((payroll - save.league.settings.luxuryTax) / 1e6).toFixed(1)}M over the tax line, so we pay $${(f.ledger.tax / 1e6).toFixed(1)}M in luxury tax on top of salaries.`),
    );
  }
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
const FIRE_AT: Record<Difficulty, number> = { easy: 8, normal: 18, hard: 28 };
const GRADE_DELTA: Record<string, number> = { 'A+': 25, A: 15, B: 6, C: -6, D: -16, F: -26 };

/**
 * After the Finals: the owner's confidence moves with your grade, the books
 * and the budget. Too low and you are fired (with job offers from other
 * teams); a great season can bring interest from elsewhere.
 */
export function ownerVerdict(save: SaveGame, grade: string) {
  const f = finance(save);
  const year = save.league.meta.season;
  const p = profit(f.ledger);
  const budget = ownerBudget(save);
  const payroll = teamPayroll(save.league, save.career.teamId, year);
  let d = GRADE_DELTA[grade] ?? 0;
  d += p >= 0 ? 4 : -Math.min(14, (-p / 1e7) * 2.5);
  if (payroll > budget * 1.02) d -= 8;
  // Owners give a new hire some rope in year one.
  if (!f.confidenceHistory?.length) d = Math.max(d, -12);
  f.confidence = clamp100(f.confidence + d);
  f.confidenceHistory = [...(f.confidenceHistory ?? []).filter((c) => c.season !== year), { season: year, value: f.confidence }];

  const me = save.career.teamId;
  const others = save.league.teams.filter((t) => t.id !== me);
  if (f.confidence < FIRE_AT[save.career.difficulty]) {
    // Three struggling teams want a fresh start.
    const weak = [...others].sort((a, b) => teamStrength(save, a.id) - teamStrength(save, b.id)).slice(0, 8);
    const pick = weak.sort((a, b) => hashStr(a.id + year) - hashStr(b.id + year)).slice(0, 3);
    save.career.fired = true;
    save.jobOffers = pick.map((t) => ({ teamId: t.id, reason: 'fired' as const }));
    save.inbox.unshift(
      msg(save, 'fired', 'Owner', 'You are relieved of your duties', `I have decided to make a change. Thank you for your work. Your agent has already heard from ${pick.map((t) => `the ${t.city} ${t.name}`).join(', ')}.`),
    );
  } else if ((grade === 'A+' || grade === 'A') && f.confidence >= 80) {
    const big = others.filter((t) => t.market === 'large').sort((a, b) => hashStr(a.id + year) - hashStr(b.id + year))[0];
    if (big) {
      save.jobOffers = [{ teamId: big.id, reason: 'interest' }];
      save.inbox.unshift(msg(save, 'interest', 'Your agent', `The ${big.name} want to talk`, `After a season like that, the ${big.city} ${big.name} have asked about hiring you. You can take the job from Home before the draft, or stay where you are.`));
    }
  } else {
    save.jobOffers = [];
  }
}

function teamStrength(save: SaveGame, teamId: string) {
  return standings(save.league, save.season.games).find((r) => r.teamId === teamId)?.pct ?? 0.5;
}
function hashStr(s: string) {
  return [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
}

/** Take a job offer: you now run that team. Finances start fresh. */
export function acceptJob(original: SaveGame, teamId: string): SaveGame {
  if (!original.jobOffers?.some((o) => o.teamId === teamId)) return original;
  const save = structuredClone(original);
  const team = save.league.teams.find((t) => t.id === teamId)!;
  const old = save.league.teams.find((t) => t.id === save.career.teamId);
  save.career.teamId = teamId;
  save.career.fired = false;
  save.career.jobs = [...(save.career.jobs ?? []), { teamId: old?.id ?? '', until: save.league.meta.season }];
  save.jobOffers = [];
  save.finance = { ticketPrice: BASE_PRICE[team.market], ledger: emptyLedger(save.league.meta.season), history: [], confidence: 55 };
  save.inbox.unshift(msg(save, 'new-job', 'Owner', `Welcome to the ${team.name}`, `${ownerExpectation(save.league, teamId).goal}: that is what I expect. The draft and free agency are coming up.`));
  return save;
}

export function declineOffers(original: SaveGame): SaveGame {
  if (original.career.fired) return original;
  return { ...original, jobOffers: [] };
}

/** Close the books at the start of a new season. */
export function rollFinances(save: SaveGame) {
  if (!save.finance) return;
  const f = save.finance;
  if (f.ledger.homeGames || f.ledger.media) f.history = [...f.history, f.ledger].slice(-10);
  f.ledger = emptyLedger(save.league.meta.season);
}
