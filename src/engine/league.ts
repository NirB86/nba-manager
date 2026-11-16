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

/** Give a player who just joined a team a number no teammate wears (he keeps his own if it is free). */
export function assignJersey(league: LeagueFile, p: Player) {
  if (!p.teamId) return;
  const taken = new Set(league.players.filter((x) => x.teamId === p.teamId && x.id !== p.id).map((x) => x.jersey));
  for (let i = 0; i < 100 && taken.has(p.jersey); i++) p.jersey = (p.jersey + 1) % 100;
}

/** Make numbers unique on these teams (all by default): longest-serving players keep theirs. */
export function fixJerseys(league: LeagueFile, teamIds?: string[]) {
  for (const t of teamIds ?? league.teams.map((x) => x.id)) {
    const taken = new Set<number>();
    const roster = league.players.filter((x) => x.teamId === t).sort((a, b) => (a.contract?.signedSeason ?? 0) - (b.contract?.signedSeason ?? 0));
    for (const p of roster) {
      for (let i = 0; i < 100 && taken.has(p.jersey); i++) p.jersey = (p.jersey + 1) % 100;
      taken.add(p.jersey);
    }
  }
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

