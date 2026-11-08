// Trades: how teams value players and picks, salary-matching rules, and
// executing a deal. Values depend on a team's situation: contenders pay for
// proven players now, rebuilding teams pay for youth, potential and picks.

import { capStatus, marketSalary, salaryIn, teamPayroll } from './contracts';
import { playerAge, playerOverall, rosterOf, teamSummaries } from './league';
import type { DraftPick, LeagueFile, Player } from './types';

export type Strategy = 'contend' | 'middle' | 'rebuild';

export interface TradeOffer {
  /** The team proposing (the AI side). */
  fromTeam: string;
  toTeam: string;
  /** What fromTeam sends. */
  give: { players: string[]; picks: string[] };
  /** What fromTeam receives. */
  get: { players: string[]; picks: string[] };
}

export function teamStrategy(league: LeagueFile, teamId: string): Strategy {
  const ranked = teamSummaries(league).sort((a, b) => b.rating - a.rating);
  const rank = ranked.findIndex((s) => s.team.id === teamId) + 1;
  if (rank <= 10) return 'contend';
  if (rank >= 21) return 'rebuild';
  return 'middle';
}

const WEIGHTS: Record<Strategy, { now: number; future: number; money: number }> = {
  contend: { now: 1.0, future: 0.35, money: 0.4 },
  middle: { now: 0.75, future: 0.65, money: 0.7 },
  rebuild: { now: 0.35, future: 1.0, money: 1.0 },
};

/** How much a team values a player, in rough "trade points". */
export function playerValue(league: LeagueFile, p: Player, strategy: Strategy): number {
  const season = league.meta.season;
  const ovr = playerOverall(p);
  const age = playerAge(p, season);
  const w = WEIGHTS[strategy];
  const now = Math.exp((ovr - 60) / 7);
  // Future value: projected peak for young players, decline for old ones.
  const growth = Math.max(0, p.potential - ovr) * (age <= 24 ? 1 : age <= 27 ? 0.5 : 0);
  const decline = age >= 31 ? (age - 30) * 1.6 : 0;
  const future = Math.exp((ovr + growth - decline - 60) / 7);
  // Contract: paying less than market value is an asset, overpaying a cost.
  const years = p.contract?.years.filter((y) => y.season >= season) ?? [];
  const surplus = years.reduce((s, y, i) => s + (marketSalary(league.settings, ovr - i * (age >= 30 ? 2 : 0), age + i, p.experience + i) - y.salary) / league.settings.salaryCap, 0);
  return Math.max(0, w.now * now + w.future * future + w.money * surplus * 6);
}

/** Value of a draft pick: better when the original team looks weak, less when far away. */
export function pickValue(league: LeagueFile, pick: DraftPick, strategy: Strategy): number {
  const ranked = teamSummaries(league).sort((a, b) => a.rating - b.rating);
  const fromRank = ranked.findIndex((s) => s.team.id === pick.originalTeamId); // 0 = weakest
  const projected = 1 + (fromRank / Math.max(1, ranked.length - 1)) * 29; // 1..30
  const yearsOut = Math.max(0, pick.season - league.meta.season - 1);
  const base = pick.round === 1 ? 2.2 * Math.exp(-(projected - 1) / 11) + 0.6 : 0.25;
  const uncertainty = Math.pow(0.9, yearsOut);
  // Far-off picks regress to an average pick.
  const avg = pick.round === 1 ? 1.3 : 0.25;
  const value = avg + (base - avg) * uncertainty;
  const protectedCut = pick.protection ? 0.75 : 1;
  return value * protectedCut * (strategy === 'rebuild' ? 1.35 : strategy === 'contend' ? 0.8 : 1);
}

export interface TradeCheck {
  valid: boolean;
  problems: string[];
  /** Value change for each side by its own strategy (positive = better off). */
  gain: Record<string, number>;
  salaryOut: Record<string, number>;
  salaryIn: Record<string, number>;
}

/**
 * Salary matching, close to the 2023 CBA: teams that end over the cap must
 * take back no more than allowed. Over the first apron the margin shrinks to
 * 110%, and second-apron teams cannot take back more than they send.
 */
export function maxIncoming(league: LeagueFile, payrollAfter: number, outgoing: number): number {
  const cba = league.settings;
  const status = capStatus(cba, payrollAfter);
  if (status === 'second-apron') return outgoing;
  if (status === 'first-apron') return outgoing * 1.1;
  if (outgoing <= 7_500_000) return outgoing * 2 + 250_000;
  if (outgoing <= 29_000_000) return outgoing + 7_500_000;
  return outgoing * 1.25 + 250_000;
}

export function checkTrade(league: LeagueFile, offer: TradeOffer): TradeCheck {
  const season = league.meta.season;
  const problems: string[] = [];
  const byId = new Map(league.players.map((p) => [p.id, p]));
  const pickById = new Map(league.draftPicks.map((k) => [k.id, k]));
  const sides = [
    { team: offer.fromTeam, sends: offer.give, receives: offer.get },
    { team: offer.toTeam, sends: offer.get, receives: offer.give },
  ];
  const gain: Record<string, number> = {};
  const salaryOutMap: Record<string, number> = {};
  const salaryInMap: Record<string, number> = {};

  for (const side of sides) {
    for (const id of side.sends.players) {
      const p = byId.get(id);
      if (!p || p.teamId !== side.team) problems.push('A player in this deal is no longer on that team.');
      else if (p.contract?.noTrade) problems.push(`${p.firstName} ${p.lastName} has a no-trade clause.`);
    }
    for (const id of side.sends.picks) {
      const k = pickById.get(id);
      if (!k || k.ownerTeamId !== side.team) problems.push('A draft pick in this deal is no longer owned by that team.');
    }
  }

  for (const side of sides) {
    const strategy = teamStrategy(league, side.team);
    const out = side.sends.players.map((id) => byId.get(id)).filter((p): p is Player => !!p);
    const inn = side.receives.players.map((id) => byId.get(id)).filter((p): p is Player => !!p);
    const outPicks = side.sends.picks.map((id) => pickById.get(id)).filter((k): k is DraftPick => !!k);
    const inPicks = side.receives.picks.map((id) => pickById.get(id)).filter((k): k is DraftPick => !!k);
    const value = (ps: Player[], ks: DraftPick[]) => ps.reduce((s, p) => s + playerValue(league, p, strategy), 0) + ks.reduce((s, k) => s + pickValue(league, k, strategy), 0);
    gain[side.team] = value(inn, inPicks) - value(out, outPicks);

    const salaryOut = out.reduce((s, p) => s + salaryIn(p, season), 0);
    const salaryInSum = inn.reduce((s, p) => s + salaryIn(p, season), 0);
    salaryOutMap[side.team] = salaryOut;
    salaryInMap[side.team] = salaryInSum;
    const payrollAfter = teamPayroll(league, side.team, season) - salaryOut + salaryInSum;
    if (payrollAfter > league.settings.salaryCap && salaryInSum > maxIncoming(league, payrollAfter, salaryOut)) {
      problems.push(`Salaries don't match: the ${teamLabel(league, side.team)} can take back at most ${Math.round(maxIncoming(league, payrollAfter, salaryOut) / 100_000) / 10}M.`);
    }
    const standard = rosterOf(league, side.team).filter((p) => p.contract?.kind !== 'two-way').length - out.filter((p) => p.contract?.kind !== 'two-way').length + inn.filter((p) => p.contract?.kind !== 'two-way').length;
    if (standard > league.settings.rosterMax) problems.push(`The ${teamLabel(league, side.team)} would have ${standard} players, over the ${league.settings.rosterMax}-man limit.`);
  }

  return { valid: problems.length === 0, problems: [...new Set(problems)], gain, salaryOut: salaryOutMap, salaryIn: salaryInMap };
}

function teamLabel(league: LeagueFile, id: string) {
  return league.teams.find((t) => t.id === id)?.name ?? id;
}

/** Apply a trade to the league in place. Call checkTrade first. */
export function executeTrade(league: LeagueFile, offer: TradeOffer) {
  const move = (ids: string[], to: string) => {
    for (const p of league.players) if (ids.includes(p.id)) p.teamId = to;
  };
  const movePicks = (ids: string[], to: string) => {
    for (const k of league.draftPicks) if (ids.includes(k.id)) k.ownerTeamId = to;
  };
  move(offer.give.players, offer.toTeam);
  move(offer.get.players, offer.fromTeam);
  movePicks(offer.give.picks, offer.toTeam);
  movePicks(offer.get.picks, offer.fromTeam);
  // A traded player keeps his number unless a teammate already wears it.
  for (const team of [offer.fromTeam, offer.toTeam]) {
    const taken = new Set<number>();
    for (const p of league.players.filter((x) => x.teamId === team)) {
      while (taken.has(p.jersey)) p.jersey = (p.jersey + 1) % 100;
      taken.add(p.jersey);
    }
  }
}
