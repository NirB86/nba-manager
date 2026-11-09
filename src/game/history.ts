// Long-term memory of a save: each player's seasons, single-game records,
// and the Hall of Fame for retired greats.

import { displayRating, fullName, playerOverall, type DayReport, type ImageCredit, type LeagueFile, type PastSeason, type Player, type SeasonState } from '../engine';
import type { SaveGame } from '../storage/saves';
import { playerHonors } from './awards';

/** Add the season just finished to every player who played in it. */
export function recordPlayerSeasons(league: LeagueFile, season: SeasonState) {
  const year = league.meta.season;
  for (const p of league.players) {
    const t = season.stats.regular[p.id];
    if (!t?.g) continue;
    const g = t.g;
    const one = (v: number) => Math.round((v / g) * 10) / 10;
    const team = league.teams.find((x) => x.id === p.teamId)?.abbrev ?? 'FA';
    const row: PastSeason = {
      season: year,
      team,
      g,
      gs: t.gs,
      min: Math.round((t.sec / 60 / g) * 10) / 10,
      pts: one(t.pts),
      reb: one(t.orb + t.drb),
      ast: one(t.ast),
      stl: one(t.stl),
      blk: one(t.blk),
      fgPct: t.fga ? Math.round((t.fgm / t.fga) * 1000) / 1000 : undefined,
      tpPct: t.tpa ? Math.round((t.tpm / t.tpa) * 1000) / 1000 : undefined,
      ovr: displayRating(playerOverall(p)),
    };
    p.pastSeasons = [...(p.pastSeasons ?? []).filter((s) => s.season !== year), row];
  }
}

export interface CareerTotals {
  seasons: number;
  g: number;
  pts: number;
  reb: number;
  ast: number;
}

export function careerTotals(seasons: PastSeason[]): CareerTotals {
  return seasons.reduce(
    (a, s) => ({ seasons: a.seasons + 1, g: a.g + s.g, pts: a.pts + Math.round(s.pts * s.g), reb: a.reb + Math.round(s.reb * s.g), ast: a.ast + Math.round(s.ast * s.g) }),
    { seasons: 0, g: 0, pts: 0, reb: 0, ast: 0 },
  );
}

// ---------------------------------------------------------------- records

export type RecordStat = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tpm';
export const RECORD_LABEL: Record<RecordStat, string> = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', tpm: 'Threes made' };

export interface GameRecord {
  value: number;
  playerId: string;
  name: string;
  teamId: string;
  oppId: string;
  season: number;
  day: number;
}

export interface Records {
  game: Partial<Record<RecordStat, GameRecord>>;
}

/** Check today's games for new single-game records. Returns the records broken. */
export function updateRecords(save: SaveGame, report: DayReport): { stat: RecordStat; rec: GameRecord }[] {
  const records: Records = (save.records ??= { game: {} });
  const broken: { stat: RecordStat; rec: GameRecord }[] = [];
  for (const { result } of report.played) {
    for (const [side, opp] of [
      [result.home, result.away],
      [result.away, result.home],
    ] as const) {
      for (const l of side.lines) {
        const values: Record<RecordStat, number> = { pts: l.pts, reb: l.orb + l.drb, ast: l.ast, stl: l.stl, blk: l.blk, tpm: l.tpm };
        for (const stat of Object.keys(values) as RecordStat[]) {
          const v = values[stat];
          const cur = records.game[stat];
          if (v <= 0 || (cur && v <= cur.value)) continue;
          const p = save.league.players.find((x) => x.id === l.playerId);
          const rec = { value: v, playerId: l.playerId, name: p ? fullName(p) : l.playerId, teamId: side.teamId, oppId: opp.teamId, season: save.league.meta.season, day: save.season.day };
          records.game[stat] = rec;
          broken.push({ stat, rec });
        }
      }
    }
  }
  return broken;
}

/** Thresholds below which a new record is not news (the first days of a save set many). */
export const RECORD_NEWS: Record<RecordStat, number> = { pts: 55, reb: 25, ast: 20, stl: 8, blk: 9, tpm: 11 };

/** Best single seasons by per-game average (at least 50 games), among current players and the Hall of Fame. */
export function seasonRecords(save: SaveGame, stat: 'pts' | 'reb' | 'ast', n = 5) {
  const rows: { name: string; playerId: string; season: number; team: string; value: number }[] = [];
  const add = (id: string, name: string, seasons: PastSeason[] | undefined) => {
    for (const s of seasons ?? []) if (s.g >= 50) rows.push({ name, playerId: id, season: s.season, team: s.team, value: s[stat] });
  };
  for (const p of save.league.players) add(p.id, fullName(p), p.pastSeasons);
  for (const h of save.hallOfFame ?? []) add(h.id, h.name, h.pastSeasons);
  return rows.sort((a, b) => b.value - a.value).slice(0, n);
}

// ---------------------------------------------------------------- Hall of Fame

export interface HallOfFamer {
  id: string;
  name: string;
  position: Player['position'];
  inducted: number;
  /** League years played (approximate for imported players). */
  seasons: number;
  peakOvr: number;
  totals: CareerTotals;
  honors: string[];
  pastSeasons?: PastSeason[];
  photo?: ImageCredit;
  /** Last team, for the plaque. */
  teamId: string | null;
}

const HONOR_POINTS: Record<string, number> = { MVP: 10, 'Finals MVP': 6, 'All-NBA 1st': 4, 'All-NBA 2nd': 3, 'All-NBA 3rd': 2, 'All-Star': 2, 'Defensive POY': 3, 'All-Star MVP': 1, 'Rookie of the Year': 1, 'Sixth Man': 1 };

/** A retiring player's Hall of Fame case: honors, production and (for players imported mid-career) longevity at a high level. */
export function hallOfFameScore(save: SaveGame, p: Player): number {
  const honors = playerHonors(save, p.id);
  const honorScore = honors.reduce((s, h) => s + (HONOR_POINTS[h.label] ?? 0), 0);
  const totals = careerTotals(p.pastSeasons ?? []);
  const peak = Math.max(displayRating(playerOverall(p)), ...(p.pastSeasons ?? []).map((s) => s.ovr ?? 0));
  const peakScore = peak >= 92 ? 10 : peak >= 88 ? 6 : peak >= 85 ? 3 : 0;
  const longevity = peak >= 82 ? p.experience * 0.6 : 0;
  return honorScore + totals.pts / 1000 * 1.5 + peakScore + longevity;
}

export const HOF_THRESHOLD = 20;

/** Called each summer with the players who just retired. Returns the new inductees. */
export function induct(save: SaveGame, retired: Player[]): HallOfFamer[] {
  const year = save.league.meta.season;
  const out: HallOfFamer[] = [];
  for (const p of retired) {
    if (hallOfFameScore(save, p) < HOF_THRESHOLD) continue;
    const honors = playerHonors(save, p.id);
    const counts = new Map<string, number>();
    for (const h of honors) counts.set(h.label, (counts.get(h.label) ?? 0) + 1);
    out.push({
      id: p.id,
      name: fullName(p),
      position: p.position,
      inducted: year,
      seasons: p.experience + 1,
      peakOvr: Math.max(displayRating(playerOverall(p)), ...(p.pastSeasons ?? []).map((s) => s.ovr ?? 0)),
      totals: careerTotals(p.pastSeasons ?? []),
      honors: [...counts.entries()].map(([l, n]) => (n > 1 ? `${n}× ${l}` : l)),
      pastSeasons: p.pastSeasons,
      photo: p.photo,
      teamId: p.teamId,
    });
  }
  save.hallOfFame = [...(save.hallOfFame ?? []), ...out];
  return out;
}
