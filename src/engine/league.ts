// Read-only helpers over a LeagueFile used by screens and (later) the sim.

import { overall } from './ratings';
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
export function teamRating(league: LeagueFile, teamId: string): number {
  const weights = [36, 34, 32, 30, 28, 24, 20, 16, 12, 8];
  const ovrs = rosterOf(league, teamId).map(playerOverall);
  let sum = 0;
  let total = 0;
  weights.forEach((w, i) => {
    const o = ovrs[i];
    if (o !== undefined) {
      sum += o * w;
      total += w;
    }
  });
  return total ? Math.round(sum / total) : 0;
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

