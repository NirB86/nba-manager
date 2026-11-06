import { playerOverall, type Player } from '../engine';
import type { SaveGame } from '../storage/saves';

/**
 * Potential is never shown exactly. Your scouts estimate it, and better
 * scouts give a narrower range. Players on your own team are known better.
 */
export function potentialRange(save: SaveGame, player: Player): [number, number] {
  const scouts = save.league.staff.filter((s) => s.teamId === save.career.teamId && s.role === 'SCOUT');
  const best = Math.max(1, ...scouts.map((s) => Math.round((s.ratings.judgment + s.ratings.scouting) / 2)));
  let spread = Math.max(1, Math.round((21 - best) / 3));
  if (player.teamId === save.career.teamId) spread = Math.max(1, Math.round(spread / 2));
  const ovr = playerOverall(player);
  // No growth left: scouts agree the player is at his peak.
  if (player.potential <= ovr) return [ovr, ovr];
  // Offset is stable per player so the range doesn't jump around between visits.
  const hash = [...player.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const offset = (hash % (2 * spread + 1)) - spread;
  const center = player.potential + Math.round(offset / 2);
  const lo = Math.max(ovr, center - spread);
  const hi = Math.min(99, Math.max(lo, center + spread));
  return [lo, hi];
}

export function personalityTraits(p: Player): string[] {
  const t = p.personality;
  const out: string[] = [];
  if (t.workEthic >= 15) out.push('Hard worker');
  if (t.workEthic <= 6) out.push('Lacks work ethic');
  if (t.consistency >= 15) out.push('Consistent');
  if (t.consistency <= 6) out.push('Streaky');
  if (t.ego >= 15) out.push('Big ego');
  if (t.ego <= 6) out.push('Team-first');
  if (t.loyalty >= 15) out.push('Loyal');
  if (t.loyalty <= 6) out.push('Chases the money');
  if (t.injuryProneness >= 15) out.push('Injury prone');
  if (t.injuryProneness <= 5) out.push('Rarely injured');
  return out.length ? out : ['Balanced professional'];
}
