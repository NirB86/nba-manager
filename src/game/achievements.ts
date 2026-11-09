// Achievements for a career: milestones checked after every simulated day
// and every summer. Unlocks are stored in the save, newest last.

import { displayRating, playerOverall, standings, type DayReport } from '../engine';
import type { SaveGame } from '../storage/saves';
import { profit } from './finance';

export interface Achievement {
  id: string;
  title: string;
  text: string;
  icon: string;
}

export interface Unlocked {
  id: string;
  season: number;
  at: string;
  /** Shown to the user already (toast dismissed). */
  seen?: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', title: 'Off the mark', text: 'Win your first game.', icon: '🏀' },
  { id: 'streak-10', title: 'Heat check', text: 'Win 10 games in a row.', icon: '🔥' },
  { id: 'sixty', title: 'Sixty', text: 'Win 60 games in a regular season.', icon: '📈' },
  { id: 'playoffs', title: 'Postseason', text: 'Make the playoffs.', icon: '🎟️' },
  { id: 'series', title: 'Advance', text: 'Win a playoff series.', icon: '✅' },
  { id: 'upset', title: 'Giant killer', text: 'Win a playoff series as the lower seed.', icon: '🗡️' },
  { id: 'finals', title: 'On the big stage', text: 'Reach the Finals.', icon: '🌟' },
  { id: 'title', title: 'Champions', text: 'Win the championship.', icon: '🏆' },
  { id: 'dynasty', title: 'Dynasty', text: 'Win three championships.', icon: '👑' },
  { id: 'mvp', title: 'Most valuable', text: 'One of your players wins MVP.', icon: '🥇' },
  { id: 'roy', title: 'Future is now', text: 'One of your players wins Rookie of the Year.', icon: '🌱' },
  { id: 'all-star', title: 'Midseason classic', text: 'Have an All-Star.', icon: '✨' },
  { id: 'fifty', title: 'Fifty bomb', text: 'One of your players scores 50 in a game.', icon: '💥' },
  { id: 'triple-double', title: 'Triple-double', text: 'One of your players posts a triple-double.', icon: '3️⃣' },
  { id: 'trade', title: 'Deal maker', text: 'Complete a trade.', icon: '🤝' },
  { id: 'star-trade', title: 'Blockbuster', text: 'Trade for a player rated 90 or higher.', icon: '💼' },
  { id: 'top-pick', title: 'Lottery luck', text: 'Draft a top-three pick.', icon: '🎲' },
  { id: 'profit', title: 'In the black', text: 'Make $50M profit in a season.', icon: '💰' },
  { id: 'grade-a', title: 'Owner’s favorite', text: 'Get an A+ season review.', icon: '📝' },
  { id: 'comeback', title: 'Second chance', text: 'Get hired again after being fired.', icon: '🔄' },
  { id: 'hof', title: 'Enshrined', text: 'A player who played for you enters the Hall of Fame.', icon: '🏛️' },
];

export const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Milestones reached but not yet unlocked. Pure: the save is not changed. */
export function newAchievements(save: SaveGame, report?: DayReport): Unlocked[] {
  const have = new Set((save.achievements ?? []).map((a) => a.id));
  const got: Unlocked[] = [];
  const unlock = (id: string) => {
    if (have.has(id) || !achievementById.has(id)) return;
    have.add(id);
    got.push({ id, season: save.league.meta.season, at: new Date().toISOString() });
  };
  const { league, season } = save;
  const me = save.career.teamId;
  const mine = (id: string | null | undefined) => !!id && league.players.find((p) => p.id === id)?.teamId === me;

  const row = standings(league, season.games).find((r) => r.teamId === me);
  if (row && row.w >= 1) unlock('first-win');
  if (row && /^W(\d+)$/.test(row.streak) && Number(row.streak.slice(1)) >= 10) unlock('streak-10');
  if (row && row.w >= 60) unlock('sixty');
  const myRounds = season.series.filter((s) => s.round >= 1 && (s.top.teamId === me || s.bottom.teamId === me));
  if (myRounds.length) unlock('playoffs');
  for (const s of myRounds) {
    if (s.winner !== me) continue;
    unlock('series');
    if (s.bottom.teamId === me) unlock('upset');
  }
  if (myRounds.some((s) => s.round === 4)) unlock('finals');
  const titles = (save.leagueHistory ?? []).filter((r) => r.champion === me).length + (season.champion === me && !(save.leagueHistory ?? []).some((r) => r.season === league.meta.season) ? 1 : 0);
  if (titles >= 1) unlock('title');
  if (titles >= 3) unlock('dynasty');
  if (mine(season.awards?.mvp)) unlock('mvp');
  if (mine(season.awards?.roy)) unlock('roy');
  if (season.allStar && Object.values(season.allStar.rosters).flat().some(mine)) unlock('all-star');

  for (const { result } of report?.played ?? []) {
    const side = result.home.teamId === me ? result.home : result.away.teamId === me ? result.away : null;
    if (!side) continue;
    for (const l of side.lines) {
      if (l.pts >= 50) unlock('fifty');
      const cats = [l.pts, l.orb + l.drb, l.ast, l.stl, l.blk].filter((v) => v >= 10).length;
      if (cats >= 3) unlock('triple-double');
    }
  }

  const trades = (season.trades ?? []).filter((t) => t.teams.includes(me));
  if (trades.length) unlock('trade');
  // A 90+ player now on the team who came in a trade this season.
  for (const t of trades) {
    for (const name of t.got) {
      const p = league.players.find((x) => `${x.firstName} ${x.lastName}` === name && x.teamId === me);
      if (p && displayRating(playerOverall(p)) >= 90) unlock('star-trade');
    }
  }
  if (save.offseason?.made.some((m) => m.teamId === me && m.overall <= 3)) unlock('top-pick');
  const f = save.finance;
  if (f && [f.ledger, ...f.history].some((l) => profit(l) >= 50_000_000)) unlock('profit');
  if (save.career.reviews?.some((r) => r.grade === 'A+')) unlock('grade-a');
  if ((save.career.jobs ?? []).some((j) => j.fired)) unlock('comeback');
  if ((save.hallOfFame ?? []).some((h) => h.teamId === me)) unlock('hof');
  return got;
}

/** Unlock what has been reached (in place). */
export function checkAchievements(save: SaveGame, report?: DayReport): Unlocked[] {
  const got = newAchievements(save, report);
  if (got.length) save.achievements = [...(save.achievements ?? []), ...got];
  return got;
}

export function markAchievementsSeen(original: SaveGame): SaveGame {
  if (!original.achievements?.some((a) => !a.seen)) return original;
  return { ...original, achievements: original.achievements.map((a) => ({ ...a, seen: true })) };
}
