// League Wire ticker items and owner mood, derived from the save.

import { conferenceStandings, fullName, standings, teamRating, teamSummaries } from '../engine';
import type { SaveGame } from '../storage/saves';
import { ownerExpectation, type Expectation } from './career';

export function leagueWire(save: SaveGame): string[] {
  const { league, season } = save;
  const team = (id: string) => league.teams.find((t) => t.id === id);
  const player = (id: string) => league.players.find((p) => p.id === id);
  const items: string[] = [];

  if (season.phase === 'done' && season.champion) {
    items.push(`${team(season.champion)?.name ?? 'Champions'} win the title`);
  }

  for (const h of (season.highlights ?? []).slice(0, 4)) {
    const p = player(h.playerId);
    const opp = team(h.oppId);
    if (!p || !opp) continue;
    const name = fullName(p);
    if (h.pts >= 38) items.push(`${name} drops ${h.pts} on the ${opp.name}`);
    else if (h.pts >= 10 && h.reb >= 10 && h.ast >= 10) items.push(`Triple-double for ${name}: ${h.pts}/${h.reb}/${h.ast}`);
    else if (h.reb >= 20) items.push(`${name} grabs ${h.reb} boards vs ${opp.name}`);
    else items.push(`${name} dishes ${h.ast} assists vs ${opp.name}`);
  }

  const rows = standings(league, season.games);
  const hot = rows.filter((r) => /^W(\d+)/.test(r.streak) && Number(r.streak.slice(1)) >= 5).sort((a, b) => Number(b.streak.slice(1)) - Number(a.streak.slice(1)))[0];
  if (hot) items.push(`${team(hot.teamId)?.name} have won ${hot.streak.slice(1)} straight`);
  const cold = rows.filter((r) => /^L(\d+)/.test(r.streak) && Number(r.streak.slice(1)) >= 5).sort((a, b) => Number(b.streak.slice(1)) - Number(a.streak.slice(1)))[0];
  if (cold) items.push(`${team(cold.teamId)?.name} have lost ${cold.streak.slice(1)} in a row`);

  if (season.phase === 'regular' && season.games.some((g) => g.hs !== undefined)) {
    for (const conf of league.conferences) {
      const lead = conferenceStandings(league, season.games, conf.id)[0];
      if (lead) items.push(`${team(lead.teamId)?.name} lead the ${conf.name.replace(' Conference', '').replace(/^(East|West)ern$/, '$1')} at ${lead.w}-${lead.l}`);
    }
  }

  if (!items.length) {
    const favorites = teamSummaries(league).sort((a, b) => b.rating - a.rating).slice(0, 3).map((s) => s.team.name);
    items.push('Opening night is here', `Title favorites: ${favorites.join(', ')}`);
  }
  return items.slice(0, 6);
}

export type Mood = 'Thrilled' | 'Pleased' | 'Patient' | 'Concerned' | 'Furious';

const TARGET: Record<Expectation['tier'], number> = { title: 0.68, contender: 0.6, playoffs: 0.53, 'play-in': 0.46, rebuild: 0.35 };

/** How the owner feels about the season so far, against their goal. */
export function ownerMood(save: SaveGame): { mood: Mood; goal: string; tone: 'good' | 'neutral' | 'bad' } {
  const exp = ownerExpectation(save.league, save.career.teamId);
  const row = standings(save.league, save.season.games).find((r) => r.teamId === save.career.teamId);
  const gp = row ? row.w + row.l : 0;
  if (!row || gp < 5) return { mood: 'Patient', goal: exp.goal, tone: 'neutral' };
  const diff = row.pct - TARGET[exp.tier];
  const mood: Mood = diff > 0.1 ? 'Thrilled' : diff > 0.02 ? 'Pleased' : diff > -0.05 ? 'Patient' : diff > -0.13 ? 'Concerned' : 'Furious';
  return { mood, goal: exp.goal, tone: diff > 0.02 ? 'good' : diff > -0.05 ? 'neutral' : 'bad' };
}

/** Conference position as "3rd in the West". */
export function conferenceRank(save: SaveGame, teamId: string): string {
  const team = save.league.teams.find((t) => t.id === teamId);
  if (!team) return '';
  const conf = save.league.conferences.find((c) => c.id === team.conferenceId);
  const rows = conferenceStandings(save.league, save.season.games, team.conferenceId);
  const rank = rows.findIndex((r) => r.teamId === teamId) + 1;
  const n = rank % 10 === 1 && rank !== 11 ? 'st' : rank % 10 === 2 && rank !== 12 ? 'nd' : rank % 10 === 3 && rank !== 13 ? 'rd' : 'th';
  const short = (conf?.name ?? '').replace(' Conference', '').replace(/^(East|West)ern$/, '$1');
  return `${rank}${n} in the ${short}`;
}

export { teamRating };
