// Fit report: how well a player who is not on the user's team would suit
// it. Role in the rotation, positional need, the skills the team lacks, age
// against the team's plan, contract value and character. Read by the
// scouting hub and the player page.

import { displayRating, marketSalary, playerAge, playerOverall, rosterOf, salaryIn, teamStrategy, type AttributeKey, type Player, type Position } from '../engine';
import type { SaveGame } from '../storage/saves';
import { potentialRange } from './scouting';

export type FitGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D';

export interface FitPoint {
  label: string;
  text: string;
  /** -2 (bad) .. +2 (great). */
  effect: number;
}

export interface FitReport {
  grade: FitGrade;
  /** 0..100. */
  score: number;
  /** Where he would slot in: starter, rotation, bench. */
  role: 'Starter' | 'Rotation' | 'Bench';
  points: FitPoint[];
  summary: string;
}

/** Skill areas a team can be short of, from its rotation's attributes. */
const SKILLS: { name: string; keys: AttributeKey[]; need: string; has: string }[] = [
  { name: 'shooting', keys: ['three', 'midRange', 'freeThrow'], need: 'Short of shooting', has: 'a shooter' },
  { name: 'playmaking', keys: ['passing', 'ballHandling', 'vision'], need: 'Short of playmaking', has: 'a playmaker' },
  { name: 'perimeter defense', keys: ['perimeterD', 'steals', 'speed'], need: 'Short of perimeter defense', has: 'a perimeter stopper' },
  { name: 'rim protection', keys: ['interiorD', 'blocks', 'rebounding'], need: 'Short of size and rim protection', has: 'a rim protector' },
  { name: 'scoring inside', keys: ['inside', 'finishing', 'strength'], need: 'Short of inside scoring', has: 'an inside scorer' },
];

const GROUP: Record<Position, 'guard' | 'wing' | 'big'> = { PG: 'guard', SG: 'guard', SF: 'wing', PF: 'big', C: 'big' };
const avg = (p: Player, keys: AttributeKey[]) => keys.reduce((s, k) => s + p.attributes[k], 0) / keys.length;

export function fitReport(save: SaveGame, p: Player): FitReport {
  const { league } = save;
  const me = save.career.teamId;
  const season = league.meta.season;
  const roster = rosterOf(league, me).filter((x) => x.contract?.kind !== 'two-way' && x.id !== p.id);
  const rotation = roster.slice(0, 9);
  const ovr = playerOverall(p);
  const points: FitPoint[] = [];

  // Role: where he would rank on our roster.
  const rank = roster.filter((x) => playerOverall(x) > ovr).length;
  const role = rank < 5 ? 'Starter' : rank < 9 ? 'Rotation' : 'Bench';
  points.push({
    label: 'Role',
    text: role === 'Starter' ? `Would start for us (${ordinalRank(rank)} best on the roster).` : role === 'Rotation' ? `A rotation player for us (${ordinalRank(rank)} best).` : 'Would sit at the end of our bench.',
    effect: role === 'Starter' ? (rank < 2 ? 2 : 1.4) : role === 'Rotation' ? 0.5 : -1,
  });

  // Positional need: how many rotation players share his position group.
  const group = GROUP[p.position];
  const same = rotation.filter((x) => GROUP[x.position] === group);
  const bestSame = same[0];
  if (same.length <= 2) points.push({ label: 'Position', text: `We are thin at ${group === 'big' ? 'big man' : group} (${same.length} in the rotation).`, effect: 1.2 });
  else if (bestSame && ovr > playerOverall(bestSame)) points.push({ label: 'Position', text: `Better than our best ${group} (${bestSame.lastName}).`, effect: 1 });
  else if (same.length >= 4) points.push({ label: 'Position', text: `We are already deep at ${group === 'big' ? 'big man' : group} (${same.length} in the rotation).`, effect: -0.8 });

  // Skills: does he cover the area our rotation is weakest in?
  const teamLevel = SKILLS.map((s) => ({ s, v: rotation.reduce((t, x) => t + avg(x, s.keys), 0) / Math.max(1, rotation.length) }));
  const weakest = [...teamLevel].sort((a, b) => a.v - b.v)[0]!;
  const his = SKILLS.map((s) => ({ s, v: avg(p, s.keys) })).sort((a, b) => b.v - a.v);
  const best = his[0]!;
  const fills = his.find((h) => h.s.name === weakest.s.name)!;
  if (fills.v >= weakest.v + 3) points.push({ label: 'Skills', text: `${weakest.s.need}: he is ${weakest.s.has} (${fills.v.toFixed(0)}/20).`, effect: 1.5 });
  else if (best.v >= 15) points.push({ label: 'Skills', text: `Strength: ${best.s.name} (${best.v.toFixed(0)}/20).`, effect: 0.5 });
  else points.push({ label: 'Skills', text: `No standout skill; our biggest need is ${weakest.s.name}.`, effect: -0.3 });

  // Age against our plan.
  const age = playerAge(p, season);
  const strategy = teamStrategy(league, me);
  const [, potHi] = potentialRange(save, p);
  const growth = displayRating(potHi) - displayRating(ovr);
  if (strategy === 'rebuild') {
    if (age <= 24) points.push({ label: 'Age', text: `Young (${age}) with room to grow (+${growth}): fits our rebuild.`, effect: growth >= 4 ? 1.5 : 1 });
    else if (age >= 30) points.push({ label: 'Age', text: `At ${age} he does not fit a rebuild.`, effect: -1.5 });
  } else if (strategy === 'contend') {
    if (age >= 26 && age <= 32) points.push({ label: 'Age', text: `In his prime (${age}): helps us win now.`, effect: 1 });
    else if (age <= 22) points.push({ label: 'Age', text: `Young (${age}): may take time to help a contender.`, effect: -0.5 });
    else if (age >= 34) points.push({ label: 'Age', text: `At ${age}, decline is close.`, effect: -0.8 });
  } else if (age <= 25 && growth >= 4) points.push({ label: 'Age', text: `Young (${age}) and still improving (+${growth}).`, effect: 1 });

  // Contract value.
  const salary = p.teamId ? salaryIn(p, season) : 0;
  if (p.contract && salary > 0) {
    const value = marketSalary(league.settings, ovr, age, p.experience);
    const ratio = salary / value;
    const years = p.contract.years.filter((y) => y.season >= season).length;
    if (ratio <= 0.7) points.push({ label: 'Contract', text: `A bargain: paid well below his value, ${years} season${years > 1 ? 's' : ''} left.`, effect: 1.2 });
    else if (ratio >= 1.4) points.push({ label: 'Contract', text: `Overpaid for his level (${years} season${years > 1 ? 's' : ''} left).`, effect: years >= 3 ? -1.5 : -0.8 });
    if (p.contract.noTrade) points.push({ label: 'Contract', text: 'Has a no-trade clause.', effect: -2 });
  } else if (!p.teamId) {
    points.push({ label: 'Contract', text: 'Free agent: no trade needed, sign him from his page.', effect: 0.6 });
  }

  // Character.
  const t = p.personality;
  if (t.workEthic >= 15) points.push({ label: 'Character', text: 'Hard worker: good for player development.', effect: 0.6 });
  if (t.ego >= 16 && role !== 'Starter') points.push({ label: 'Character', text: 'Big ego: will not enjoy a bench role.', effect: -0.8 });
  if (t.injuryProneness >= 15) points.push({ label: 'Health', text: 'Injury prone.', effect: -0.8 });

  const raw = points.reduce((s, x) => s + x.effect, 0);
  const score = Math.max(0, Math.min(100, Math.round(50 + raw * 9)));
  const grade: FitGrade = score >= 88 ? 'A+' : score >= 78 ? 'A' : score >= 68 ? 'B+' : score >= 58 ? 'B' : score >= 48 ? 'C+' : score >= 38 ? 'C' : 'D';
  points.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const top = points.find((x) => x.effect > 0);
  const worst = points.find((x) => x.effect < 0);
  const summary = grade.startsWith('A') ? `Strong fit. ${top?.text ?? ''}` : grade.startsWith('B') ? `Good fit. ${top?.text ?? ''}` : grade.startsWith('C') ? `Mixed fit. ${worst?.text ?? top?.text ?? ''}` : `Poor fit. ${worst?.text ?? ''}`;
  return { grade, score, role, points, summary: summary.trim() };
}

const ordinalRank = (rank: number) => ['1st', '2nd', '3rd'][rank] ?? `${rank + 1}th`;
