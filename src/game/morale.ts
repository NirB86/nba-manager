// Player morale, worked out from the player's situation each time it is
// shown: playing time against his role, winning, pay against his market
// value, and personality. Nothing is stored in the save.

import { marketSalary, playerAge, playerOverall, rosterOf, salaryIn, standings, type Player } from '../engine';
import type { SaveGame } from '../storage/saves';

export type MoraleLevel = 'thrilled' | 'happy' | 'content' | 'unhappy' | 'angry';

export const MORALE_LABEL: Record<MoraleLevel, string> = {
  thrilled: 'Thrilled',
  happy: 'Happy',
  content: 'Content',
  unhappy: 'Unhappy',
  angry: 'Angry',
};

export interface Morale {
  level: MoraleLevel;
  /** -10 (angry) .. +10 (thrilled). */
  score: number;
  /** What drives it, most important first; positive and negative. */
  reasons: { text: string; effect: number }[];
}

/** Minutes a player expects from his place in the rotation (best = 0). */
function expectedMinutes(rank: number): number {
  if (rank === 0) return 34;
  if (rank <= 2) return 31;
  if (rank <= 4) return 27;
  if (rank <= 7) return 20;
  if (rank <= 9) return 12;
  return 6;
}

export function morale(save: SaveGame, p: Player): Morale {
  const { league, season } = save;
  const reasons: Morale['reasons'] = [];
  if (!p.teamId) return { level: 'content', score: 0, reasons: [{ text: 'Waiting for an offer.', effect: 0 }] };
  const year = league.meta.season;
  const ego = p.personality.ego;

  // Playing time over the team's games (a benched player who never plays counts too).
  const roster = rosterOf(league, p.teamId).filter((x) => x.contract?.kind !== 'two-way');
  const rank = roster.findIndex((x) => x.id === p.id);
  const totals = season.stats.regular[p.id];
  const row = standings(league, season.games).find((r) => r.teamId === p.teamId);
  const games = row ? row.w + row.l : 0;
  if (rank >= 0 && games >= 3) {
    const mpg = (totals?.sec ?? 0) / 60 / games;
    const want = expectedMinutes(rank) * (1 + (ego - 10) * 0.02);
    const gap = mpg - want;
    const effect = Math.max(-4, Math.min(3, gap / 3));
    if (gap <= -4) reasons.push({ text: `Wants more minutes (${mpg.toFixed(0)} a game, expects about ${want.toFixed(0)}).`, effect });
    else if (gap >= 3) reasons.push({ text: `Enjoying a bigger role than expected (${mpg.toFixed(0)} minutes a game).`, effect });
    else reasons.push({ text: 'Happy with his minutes.', effect: Math.max(0.5, effect) });
  } else if (rank >= 0 && rank <= 4 && p.contract?.kind !== 'two-way') {
    reasons.push({ text: 'Expects a starting role.', effect: 0.5 });
  }

  // Winning: record against the 0.500 line, once the season is going.
  if (row && row.w + row.l >= 5) {
    const pct = row.w / (row.w + row.l);
    const veteran = playerAge(p, year) >= 30 ? 1.4 : 1;
    const effect = Math.max(-3, Math.min(3, (pct - 0.5) * 10 * veteran));
    if (pct >= 0.6) reasons.push({ text: `Loves winning (${row.w}-${row.l}).`, effect });
    else if (pct <= 0.4) reasons.push({ text: `Frustrated by losing (${row.w}-${row.l}).`, effect });
  }

  // Pay against his market value.
  const salary = salaryIn(p, year);
  if (p.contract && p.contract.kind !== 'two-way' && p.contract.kind !== 'rookie' && salary > 0) {
    const market = marketSalary(league.settings, playerOverall(p), playerAge(p, year), p.experience);
    const ratio = salary / market;
    const greed = 1 + (10 - p.personality.loyalty) * 0.05;
    if (ratio < 0.7) reasons.push({ text: 'Feels underpaid for what he gives the team.', effect: -Math.min(3, (0.7 - ratio) * 8 * greed) });
    else if (ratio > 1.5) reasons.push({ text: 'Well paid and grateful for it.', effect: Math.min(1, (ratio - 1.5) * 1.5) });
    const left = p.contract.years.filter((y) => y.season >= year).length;
    if (left <= 1 && ratio < 1) reasons.push({ text: 'Wants a new contract before his deal runs out.', effect: -1 });
  }

  // Personality: loyal players stay steadier, big egos swing harder.
  if (p.personality.loyalty >= 15) reasons.push({ text: 'Loyal to the franchise.', effect: 1 });
  if (ego >= 16) reasons.push({ text: 'Big ego: needs to feel like the star.', effect: rank > 1 ? -1 : 0.5 });

  if (!reasons.length) reasons.push({ text: 'Settled in: no complaints.', effect: 0 });
  const score = Math.max(-10, Math.min(10, 1 + reasons.reduce((s, r) => s + r.effect, 0)));
  const level: MoraleLevel = score >= 5 ? 'thrilled' : score >= 2 ? 'happy' : score >= -1 ? 'content' : score >= -4 ? 'unhappy' : 'angry';
  reasons.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  return { level, score, reasons };
}
