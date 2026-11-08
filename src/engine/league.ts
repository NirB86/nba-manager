// Read-only helpers over a LeagueFile used by screens and (later) the sim.

import { displayRating, overall } from './ratings';
import { clamp } from './random';
import { teamPayroll } from './contracts';
import type { LeagueFile, Player, Team } from './types';

export function playerOverall(p: Player): number {
  return overall(p.attributes, p.position);
}

export function playerAge(p: Player, season: number): number {
  return season - p.born.year;
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

export function teamName(t: Team): string {
  return `${t.city} ${t.name}`;
}

export function rosterOf(league: LeagueFile, teamId: string): Player[] {
  return league.players
    .filter((p) => p.teamId === teamId)
    .sort((a, b) => playerOverall(b) - playerOverall(a));
}

/**
 * Team strength on the overall scale: minutes-weighted average of the top
 * ten players, roughly how a coach would distribute playing time.
 */
/** Team overall on the 2K-style scale shown on screen (not the internal player scale). */
export function teamRating(league: LeagueFile, teamId: string): number {
  // Stars matter most, as in real basketball and in 2K's team ratings: the top
  // eight players count, the best one about five times as much as the eighth.
  // Two-way players are left out. Uses on-screen player ratings, then spreads
  // teams over a 2K-like range (contenders ~90, rebuilding teams ~76).
  const weights = [0.24, 0.19, 0.15, 0.12, 0.1, 0.08, 0.07, 0.05];
  const ovrs = rosterOf(league, teamId)
    .filter((p) => p.contract?.kind !== 'two-way')
    .map((p) => displayRating(playerOverall(p)));
  if (!ovrs.length) return 0;
  const raw = weights.reduce((s, w, i) => s + w * (ovrs[i] ?? 60), 0);
  return clamp(Math.round(84 + (raw - 84) * 1.6), 40, 99);
}

export interface TeamSummary {
  team: Team;
  rating: number;
  payroll: number;
  rosterSize: number;
}

export function teamSummaries(league: LeagueFile): TeamSummary[] {
  const season = league.meta.season;
  return league.teams.map((team) => ({
    team,
    rating: teamRating(league, team.id),
    payroll: teamPayroll(league, team.id, season),
    rosterSize: league.players.filter((p) => p.teamId === team.id).length,
  }));
}

