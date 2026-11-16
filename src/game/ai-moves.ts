// AI teams manage their rosters during the season: they sign a free agent
// when injuries leave them short-handed, and after the trade deadline losing
// teams buy out veterans, who then sign with contenders for the minimum.

import { assignJersey, availablePlayers, displayRating, fullName, marketSalary, playerAge, playerOverall, rosterOf, standings, type Rng } from '../engine';
import type { SaveGame } from '../storage/saves';
import { tradeDeadlineDay } from './trades';

const wire = (save: SaveGame, line: string) => {
  save.season.rumors = [line, ...(save.season.rumors ?? [])].slice(0, 6);
};

/** Called once a week during the regular season. */
export function weeklyAiMoves(save: SaveGame, rng: Rng) {
  const { league, season } = save;
  const me = save.career.teamId;
  const year = league.meta.season;
  const cba = league.settings;
  const pct = new Map(standings(league, season.games).map((r) => [r.teamId, r.w + r.l >= 10 ? r.w / (r.w + r.l) : 0.5]));
  const standard = (teamId: string) => rosterOf(league, teamId).filter((p) => p.contract?.kind !== 'two-way').length;
  const sign = (p: (typeof league.players)[number], teamId: string) => {
    p.teamId = teamId;
    p.contract = { years: [{ season: year, salary: cba.minimumSalary }], option: null, kind: 'minimum', noTrade: false, signedSeason: year };
    assignJersey(league, p);
  };
  const bestFree = (filter: (p: (typeof league.players)[number]) => boolean) =>
    league.players.filter((p) => !p.teamId && filter(p)).sort((a, b) => playerOverall(b) - playerOverall(a))[0];
  const bought = new Set(season.boughtOut ?? []);

  for (const t of league.teams) {
    if (t.id === me) continue;
    const healthy = availablePlayers(league, season, t.id).filter((p) => !season.injuries?.[p.id] && !season.holdouts?.[p.id]).length;
    // Short-handed: sign the best free agent willing to take the minimum.
    if (healthy < 10 && standard(t.id) < cba.rosterMax) {
      const fa = bestFree((p) => bought.has(p.id) || marketSalary(cba, playerOverall(p), playerAge(p, year), p.experience) <= cba.minimumSalary * 2.5);
      if (fa) {
        sign(fa, t.id);
        if (displayRating(playerOverall(fa)) >= 74) wire(save, `${t.name} sign ${fullName(fa)} for injury cover`);
      }
    }
  }

  // After the deadline: buyouts once, then contenders pick the veterans up.
  if (season.day > tradeDeadlineDay(save) && !season.buyoutsDone) {
    season.buyoutsDone = true;
    for (const t of league.teams) {
      if (t.id === me || (pct.get(t.id) ?? 0.5) > 0.4) continue;
      const vet = rosterOf(league, t.id).find(
        (p) => playerAge(p, year) >= 30 && p.contract?.kind !== 'two-way' && (p.contract?.years.filter((y) => y.season >= year).length ?? 0) === 1 && displayRating(playerOverall(p)) >= 74,
      );
      if (!vet || standard(t.id) <= cba.rosterMin || !rng.chance(0.6)) continue;
      vet.teamId = null;
      vet.contract = null;
      bought.add(vet.id);
      wire(save, `Buyout: ${fullName(vet)} and the ${t.name} part ways`);
    }
    season.boughtOut = [...bought];
  }
  for (const id of bought) {
    const p = league.players.find((x) => x.id === id);
    if (!p || p.teamId) continue;
    const contenders = league.teams.filter((t) => t.id !== me && (pct.get(t.id) ?? 0.5) >= 0.55 && standard(t.id) < cba.rosterMax);
    if (!contenders.length || !rng.chance(0.5)) continue;
    const t = rng.pick(contenders);
    sign(p, t.id);
    wire(save, `${fullName(p)} joins the ${t.name} after his buyout`);
  }
}
