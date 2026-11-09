import type { CbaSettings, Contract, LeagueFile, Player } from './types';
import { Rng, clamp } from './random';

/**
 * Default cap figures. Approximately the 2025-26 NBA numbers; every league
 * file carries its own settings, so these are only a starting point.
 */
export const DEFAULT_CBA: CbaSettings = {
  salaryCap: 154_647_000,
  luxuryTax: 187_895_000,
  firstApron: 195_945_000,
  secondApron: 207_824_000,
  minimumSalary: 1_272_870,
  maximumSalaryPct: 0.35,
  rosterMax: 15,
  rosterMin: 13,
  twoWaySlots: 3,
  capGrowth: 0.07,
};

/** Max salary share of the cap by years of experience (25% / 30% / 35% tiers). */
export function maxSalaryShare(experience: number): number {
  if (experience >= 10) return 0.35;
  if (experience >= 7) return 0.3;
  return 0.25;
}

/** What a player would earn on the open market this season, in dollars. */
export function marketSalary(cba: CbaSettings, ovr: number, age: number, experience: number): number {
  let share = 0.02 * Math.exp(0.1 * (ovr - 60));
  // Veterans are often paid for past production.
  if (age >= 31) share *= 1.15;
  if (age >= 34) share *= 0.8;
  const max = maxSalaryShare(experience) * cba.salaryCap;
  return clamp(Math.round(share * cba.salaryCap), cba.minimumSalary, max);
}

/** Rookie-scale first-year salary by pick (1-30), as a share of the cap. */
export function rookieScaleSalary(cba: CbaSettings, pick: number): number {
  const share = 0.07 * Math.pow(0.952, pick - 1);
  return Math.max(cba.minimumSalary, Math.round(share * cba.salaryCap));
}

const RAISE = 0.05;

export function buildContract(
  rng: Rng,
  cba: CbaSettings,
  opts: { firstSeason: number; signedSeason: number; firstYearSalary: number; years: number; kind: Contract['kind'] },
): Contract {
  const years: Contract['years'] = [];
  let salary = opts.firstYearSalary;
  for (let i = 0; i < opts.years; i++) {
    years.push({ season: opts.firstSeason + i, salary: Math.round(salary) });
    if (opts.kind !== 'minimum') salary *= 1 + RAISE;
  }
  let option: Contract['option'] = null;
  const last = years[years.length - 1];
  if (last && opts.years >= 2 && opts.kind !== 'rookie' && opts.kind !== 'minimum' && rng.chance(0.25)) {
    // Stars get player options; role players more often team options.
    const type = opts.firstYearSalary > cba.salaryCap * 0.15 ? 'player' : rng.chance(0.5) ? 'player' : 'team';
    option = { season: last.season, type };
  }
  if (opts.kind === 'rookie' && last && opts.years >= 3) {
    option = { season: last.season, type: 'team' };
  }
  return {
    years,
    option,
    kind: opts.kind,
    noTrade: opts.kind === 'max' && rng.chance(0.15),
    signedSeason: opts.signedSeason,
  };
}

export function salaryIn(player: Player, season: number): number {
  return player.contract?.years.find((y) => y.season === season)?.salary ?? 0;
}

export function teamPayroll(league: LeagueFile, teamId: string, season: number): number {
  const players = league.players.filter((p) => p.teamId === teamId && p.contract?.kind !== 'two-way').reduce((sum, p) => sum + salaryIn(p, season), 0);
  return players + deadMoneyIn(league, teamId, season);
}

/** Salary still owed to waived players, for one season. */
export function deadMoneyIn(league: LeagueFile, teamId: string, season: number): number {
  return (league.deadMoney ?? []).filter((d) => d.teamId === teamId).reduce((sum, d) => sum + (d.years.find((y) => y.season === season)?.salary ?? 0), 0);
}

/** Cap figures projected forward using the league's growth rate. */
export function projectedCba(cba: CbaSettings, yearsAhead: number): CbaSettings {
  const f = Math.pow(1 + cba.capGrowth, yearsAhead);
  return {
    ...cba,
    salaryCap: Math.round(cba.salaryCap * f),
    luxuryTax: Math.round(cba.luxuryTax * f),
    firstApron: Math.round(cba.firstApron * f),
    secondApron: Math.round(cba.secondApron * f),
    minimumSalary: Math.round(cba.minimumSalary * f),
  };
}

export type CapStatus = 'under-cap' | 'over-cap' | 'taxpayer' | 'first-apron' | 'second-apron';

export function capStatus(cba: CbaSettings, payroll: number): CapStatus {
  if (payroll >= cba.secondApron) return 'second-apron';
  if (payroll >= cba.firstApron) return 'first-apron';
  if (payroll >= cba.luxuryTax) return 'taxpayer';
  if (payroll >= cba.salaryCap) return 'over-cap';
  return 'under-cap';
}

export const CAP_STATUS_LABEL: Record<CapStatus, string> = {
  'under-cap': 'Under the cap',
  'over-cap': 'Over the cap',
  taxpayer: 'Luxury tax',
  'first-apron': 'Above 1st apron',
  'second-apron': 'Above 2nd apron',
};
