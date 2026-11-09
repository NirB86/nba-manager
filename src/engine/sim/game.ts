// Possession-by-possession game simulation. Pure and deterministic for a
// given Rng, so it runs the same in a worker, in tests, or on the main thread.
// Tuned so league-wide results land near real NBA averages (see game.test.ts).

import { Rng, clamp } from '../random';
import { overall } from '../ratings';
import type { Attributes, Player } from '../types';

export interface BoxLine {
  playerId: string;
  starter: boolean;
  sec: number;
  pts: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  orb: number;
  drb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  pf: number;
  pm: number;
}

export interface TeamResult {
  teamId: string;
  score: number;
  quarters: number[];
  lines: BoxLine[];
}

export interface GameResult {
  home: TeamResult;
  away: TeamResult;
  overtimes: number;
}

/** One possession of play-by-play, for watching a game in 2D. */
export interface PlayEvent {
  /** 1-4, 5+ = overtime. */
  q: number;
  /** Seconds left in the period when the play ends. */
  clock: number;
  off: 'home' | 'away';
  type: 'shot' | 'ft' | 'tov';
  /** Shooter, free-throw shooter, or the player who lost the ball. */
  player: string;
  kind?: 'rim' | 'mid' | 'three';
  made?: boolean;
  andOne?: boolean;
  /** Free throws taken and made. */
  fta?: number;
  ftm?: number;
  assist?: string;
  steal?: string;
  block?: string;
  rebound?: string;
  /** Offensive rebound: the same team keeps the ball. */
  orb?: boolean;
  /** Score after the play. */
  score: [number, number];
  homeCourt: string[];
  awayCourt: string[];
}

/** Recording slot for the current possession (no effect on results or randomness). */
let rec: Partial<PlayEvent> | null = null;

export interface SimTeam {
  teamId: string;
  /** Players available tonight, any order. */
  players: Player[];
  /** The coach's depth chart; without one the best players start and play most. */
  depth?: DepthChart;
}

/** Starters, bench order and target minutes set by the coach. */
export interface DepthChart {
  /** Five player ids. Missing or unavailable starters are replaced by the next in the order. */
  starters: string[];
  /** Everyone else, first off the bench first. Players not listed come last, by rating. */
  bench: string[];
  /** Target minutes per player id (0 = does not play unless needed). Scaled to 240 a game. */
  minutes?: Record<string, number>;
}

/**
 * Rotation order and target seconds for the available players under a
 * depth chart (or the default by rating). Exported for the depth chart screen.
 */
export function rotation(players: Player[], depth?: DepthChart): { player: Player; targetMin: number; starter: boolean }[] {
  const byOvr = [...players].sort((x, y) => overall(y.attributes, y.position) - overall(x.attributes, x.position));
  if (!depth) {
    const five = new Set(pickStartersBy(byOvr).map((p) => p.id));
    return byOvr.map((p, i) => ({ player: p, targetMin: ROTATION_MIN[i] ?? 0, starter: five.has(p.id) }));
  }
  const ids = new Map(players.map((p) => [p.id, p]));
  const listed = [...depth.starters, ...depth.bench].filter((id, i, a) => ids.has(id) && a.indexOf(id) === i);
  const order = [...listed.map((id) => ids.get(id)!), ...byOvr.filter((p) => !listed.includes(p.id))];
  const starters = new Set(depth.starters.filter((id) => ids.has(id)));
  for (const p of order) if (starters.size < 5 && !starters.has(p.id)) starters.add(p.id);
  // Starters first, then the bench in order.
  const sorted = [...order.filter((p) => starters.has(p.id)), ...order.filter((p) => !starters.has(p.id))];
  const raw = sorted.map((p, i) => depth.minutes?.[p.id] ?? ROTATION_MIN[i] ?? 0);
  const total = raw.reduce((s, m) => s + m, 0);
  // Scale to a full game, capped at 44 minutes for anyone.
  const scale = total > 0 ? 240 / total : 1;
  return sorted.map((p, i) => ({ player: p, targetMin: Math.min(44, Math.round(raw[i]! * scale)), starter: starters.has(p.id) }));
}

const QUARTER_SEC = 12 * 60;
const OT_SEC = 5 * 60;
const HOME_EDGE = 0.022; // make-probability bonus at home, about +3 points a game

/** Target minutes for the 1st..10th man; a coach's normal rotation. */
const ROTATION_MIN = [35, 34, 33, 31, 29, 25, 20, 15, 10, 8];

interface OnCourt {
  p: Player;
  a: Attributes;
  ovr: number;
  line: BoxLine;
  targetSec: number;
  energy: number;
}

class Side {
  readonly roster: OnCourt[];
  court: OnCourt[];
  score = 0;
  /** Hot or cold night: a small shooting swing for the whole team. */
  form = 0;
  quarters: number[] = [];
  fouls = 0;
  tactics: Tactics = { ...DEFAULT_TACTICS };
  autoSubs = true;
  timeouts = TIMEOUTS;

  constructor(team: SimTeam) {
    if (team.depth) {
      const rot = rotation(team.players, team.depth);
      this.roster = rot.map((r) => ({ p: r.player, a: r.player.attributes, ovr: overall(r.player.attributes, r.player.position), line: emptyLine(r.player.id), targetSec: r.targetMin * 60, energy: 1 }));
      this.court = this.roster.filter((_, i) => rot[i]!.starter);
    } else {
      const sorted = [...team.players]
        .map((p) => ({ p, a: p.attributes, ovr: overall(p.attributes, p.position) }))
        .sort((x, y) => y.ovr - x.ovr);
      this.roster = sorted.map((x, i) => ({
        ...x,
        line: emptyLine(x.p.id),
        targetSec: (ROTATION_MIN[i] ?? 0) * 60,
        energy: 1,
      }));
      this.court = pickStarters(this.roster);
    }
    for (const c of this.court) c.line.starter = true;
  }

  avg(key: keyof Attributes): number {
    return this.court.reduce((s, c) => s + eff(c, key), 0) / this.court.length;
  }
}

function emptyLine(playerId: string): BoxLine {
  return { playerId, starter: false, sec: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, pm: 0 };
}

function pickStartersBy(players: Player[]): Player[] {
  const top = players.slice(0, 5);
  const isGuard = (p: Player) => p.position === 'PG' || p.position === 'SG';
  const isBig = (p: Player) => p.position === 'PF' || p.position === 'C';
  for (const need of [isGuard, isBig]) {
    if (!top.some(need)) {
      const swapIn = players.slice(5).find(need);
      if (swapIn) top[4] = swapIn;
    }
  }
  return top;
}

/** Best five, but always at least one guard and one big. */
function pickStarters(roster: OnCourt[]): OnCourt[] {
  const top = roster.slice(0, 5);
  const isGuard = (c: OnCourt) => c.p.position === 'PG' || c.p.position === 'SG';
  const isBig = (c: OnCourt) => c.p.position === 'PF' || c.p.position === 'C';
  for (const [need] of [[isGuard], [isBig]] as const) {
    if (!top.some(need)) {
      const swapIn = roster.slice(5).find(need);
      if (swapIn) top[4] = swapIn;
    }
  }
  return top;
}

/** Attribute adjusted for fatigue: a tired player loses up to 15%. */
function eff(c: OnCourt, key: keyof Attributes): number {
  return c.a[key] * (0.85 + 0.15 * c.energy);
}

function weightedPick(rng: Rng, items: OnCourt[], weight: (c: OnCourt) => number): OnCourt {
  const w = items.map((c) => Math.max(0.0001, weight(c)));
  const total = w.reduce((s, x) => s + x, 0);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i] as number;
    if (r <= 0) return items[i] as OnCourt;
  }
  return items[items.length - 1] as OnCourt;
}

/** Bring the rotation back toward each player's target share of minutes. */
function substitute(side: Side, elapsed: number, total: number) {
  const progress = elapsed / total;
  const need = (c: OnCourt) => c.targetSec * progress - c.line.sec + (c.energy - 0.6) * 240;
  const bench = side.roster.filter((c) => !side.court.includes(c) && c.line.pf < 6 && c.targetSec > 0);
  for (let i = 0; i < 2; i++) {
    const out = [...side.court].sort((x, y) => need(x) - need(y))[0];
    const inn = [...bench].sort((x, y) => need(y) - need(x))[0];
    if (!out || !inn || need(inn) - need(out) < 90) return;
    side.court = side.court.map((c) => (c === out ? inn : c));
    bench.splice(bench.indexOf(inn), 1);
    bench.push(out);
  }
}

function tick(side: Side, sec: number) {
  for (const c of side.roster) {
    if (side.court.includes(c)) {
      c.line.sec += sec;
      c.energy = Math.max(0.2, c.energy - (sec / 60) * (0.028 - c.a.stamina * 0.0009));
    } else {
      c.energy = Math.min(1, c.energy + (sec / 60) * 0.05);
    }
  }
}

type ShotKind = 'rim' | 'mid' | 'three';

/** Run one possession. Returns true if the offense keeps the ball (offensive rebound). */
function possession(rng: Rng, off: Side, def: Side, home: boolean): boolean {
  const edge = home ? HOME_EDGE : 0;

  // Turnover.
  const tovP = clamp(0.128 + (def.tactics.defense === 'zone' ? 0.006 : def.tactics.defense === 'switch' ? 0.004 : 0) + (off.tactics.pace === 'fast' ? 0.008 : off.tactics.pace === 'slow' ? -0.006 : 0) + 0.006 * (def.avg('steals') - 10) + 0.004 * (def.avg('perimeterD') - 10) - 0.006 * (off.avg('ballHandling') - 10) - 0.004 * (off.avg('iq') - 10), 0.06, 0.22);
  if (rng.chance(tovP)) {
    const loser = weightedPick(rng, off.court, (c) => eff(c, 'ballHandling') + 6);
    loser.line.tov++;
    if (rec) Object.assign(rec, { type: 'tov', player: loser.p.id });
    if (rng.chance(0.55)) {
      const thief = weightedPick(rng, def.court, (c) => eff(c, 'steals') ** 2);
      thief.line.stl++;
      if (rec) rec.steal = thief.p.id;
    }
    return false;
  }

  // Non-shooting foul in the bonus: two free throws.
  if (rng.chance(0.035)) {
    weightedPick(rng, def.court, () => 1).line.pf++;
    const shooter = weightedPick(rng, off.court, (c) => usage(c));
    const ftm = freeThrows(rng, off, shooter, 2);
    if (rec) Object.assign(rec, { type: 'ft', player: shooter.p.id, fta: 2, ftm });
    return false;
  }

  const star = off.tactics.focus === 'star' ? [...off.court].sort((a, b) => b.ovr - a.ovr)[0] : undefined;
  const shooter = weightedPick(rng, off.court, (c) => usage(c) * (c === star ? 1.9 : 1));
  const s = shooter.a;
  const wRim = 0.34 * ((eff(shooter, 'inside') + eff(shooter, 'finishing')) / 20) ** 1.6;
  const wMid = 0.22 * (eff(shooter, 'midRange') / 10) ** 1.3;
  const w3 = 0.33 * (eff(shooter, 'three') / 10) ** 2.2;
  const focus = off.tactics.focus;
  const kind: ShotKind = rng.weighted([
    ['rim', wRim * (focus === 'inside' ? 1.4 : focus === 'three' ? 0.82 : 1)],
    ['mid', wMid * (focus === 'inside' || focus === 'three' ? 0.75 : 1)],
    ['three', w3 * (focus === 'three' ? 1.45 : focus === 'inside' ? 0.72 : 1)],
  ] as const);
  if (rec) Object.assign(rec, { type: 'shot', player: shooter.p.id, kind });

  const defender = weightedPick(rng, def.court, () => 1);
  let makeP: number;
  let foulP: number;
  if (kind === 'rim') {
    makeP = 0.58 + 0.011 * ((eff(shooter, 'inside') + eff(shooter, 'finishing')) / 2 - 10) - 0.009 * (def.avg('interiorD') - 10) + 0.003 * (s.strength - 10);
    foulP = 0.15 + 0.006 * (s.finishing - 10);
  } else if (kind === 'mid') {
    makeP = 0.37 + 0.012 * (eff(shooter, 'midRange') - 10) - 0.006 * (eff(defender, 'perimeterD') - 10);
    foulP = 0.045;
  } else {
    makeP = 0.303 + 0.0115 * (eff(shooter, 'three') - 10) - 0.005 * (eff(defender, 'perimeterD') - 10);
    foulP = 0.015;
  }
  // Defensive scheme: a zone packs the paint but gives up threes; switching everything stops jumpers but leaves mismatches inside.
  const scheme = def.tactics.defense;
  if (scheme === 'zone') makeP += kind === 'rim' ? -0.035 : kind === 'three' ? 0.025 : 0.01;
  else if (scheme === 'switch') makeP += kind === 'rim' ? 0.02 : -0.012;
  makeP = clamp(makeP + edge + off.form + 0.003 * (shooter.a.iq - 10), 0.15, 0.85);

  const points = kind === 'three' ? 3 : 2;
  if (rng.chance(foulP)) {
    weightedPick(rng, def.court, (c) => (c === defender ? 3 : 1)).line.pf++;
    // Fouled on the shot: an and-one sometimes, otherwise free throws.
    if (rng.chance(makeP * 0.45)) {
      // And-one: the basket counts as a field-goal attempt.
      shooter.line.fga++;
      if (kind === 'three') shooter.line.tpa++;
      made(rng, off, def, shooter, kind, points);
      const ftm = freeThrows(rng, off, shooter, 1);
      if (rec) Object.assign(rec, { made: true, andOne: true, fta: 1, ftm });
    } else {
      const ftm = freeThrows(rng, off, shooter, points);
      if (rec) Object.assign(rec, { type: 'ft', fta: points, ftm });
    }
    return false;
  }

  shooter.line.fga++;
  if (kind === 'three') shooter.line.tpa++;
  if (rng.chance(makeP)) {
    made(rng, off, def, shooter, kind, points);
    if (rec) rec.made = true;
    return false;
  }
  if (rec) rec.made = false;

  // Missed: blocked sometimes, then a rebound.
  if (kind !== 'three' && rng.chance(kind === 'rim' ? 0.36 + 0.02 * (def.avg('blocks') - 10) : 0.09)) {
    const blocker = weightedPick(rng, def.court, (c) => eff(c, 'blocks') ** 6);
    blocker.line.blk++;
    if (rec) rec.block = blocker.p.id;
  }
  const orbP = clamp(0.245 + 0.012 * (off.avg('rebounding') - def.avg('rebounding')), 0.12, 0.4);
  if (rng.chance(orbP)) {
    const r = weightedPick(rng, off.court, (c) => eff(c, 'rebounding') ** 2);
    r.line.orb++;
    if (rec) Object.assign(rec, { rebound: r.p.id, orb: true });
    return true;
  }
  const r = weightedPick(rng, def.court, (c) => eff(c, 'rebounding') ** 2);
  r.line.drb++;
  if (rec) rec.rebound = r.p.id;
  return false;
}

function usage(c: OnCourt): number {
  const scoring = (eff(c, 'inside') + eff(c, 'midRange') + eff(c, 'three') + eff(c, 'finishing')) / 4;
  // A star takes roughly a third of his team's shots while on the floor, as in the NBA.
  return Math.exp(0.013 * (c.ovr - 60)) * (scoring / 10) ** 0.7 * (0.75 + c.a.ballHandling / 40);
}

function made(rng: Rng, off: Side, def: Side, shooter: OnCourt, kind: ShotKind, points: number) {
  shooter.line.fgm++;
  if (kind === 'three') shooter.line.tpm++;
  addPoints(off, def, shooter, points);
  const assistedP = kind === 'three' ? 0.8 : kind === 'mid' ? 0.45 : 0.55;
  if (rng.chance(assistedP)) {
    const mates = off.court.filter((c) => c !== shooter);
    const passer = weightedPick(rng, mates, (c) => eff(c, 'passing') ** 3.5);
    passer.line.ast++;
    if (rec) rec.assist = passer.p.id;
  }
}

function freeThrows(rng: Rng, off: Side, shooter: OnCourt, n: number): number {
  const p = clamp(0.73 + 0.016 * (shooter.a.freeThrow - 10), 0.4, 0.95);
  let made = 0;
  for (let i = 0; i < n; i++) {
    shooter.line.fta++;
    if (rng.chance(p)) {
      shooter.line.ftm++;
      made++;
      addPoints(off, null, shooter, 1);
    }
  }
  return made;
}

function addPoints(off: Side, _def: Side | null, shooter: OnCourt, points: number) {
  shooter.line.pts += points;
  off.score += points;
}

function trackPlusMinus(a: Side, b: Side, before: [number, number]) {
  const da = a.score - before[0];
  const db = b.score - before[1];
  if (da === 0 && db === 0) return;
  for (const c of a.court) c.line.pm += da - db;
  for (const c of b.court) c.line.pm += db - da;
}

export type Pace = 'slow' | 'normal' | 'fast';
export type DefenseScheme = 'man' | 'switch' | 'zone';
export type OffenseFocus = 'balanced' | 'inside' | 'three' | 'star';
export interface Tactics {
  pace: Pace;
  defense: DefenseScheme;
  focus: OffenseFocus;
}
export const DEFAULT_TACTICS: Tactics = { pace: 'normal', defense: 'man', focus: 'balanced' };

export interface LivePlayer {
  id: string;
  onCourt: boolean;
  energy: number;
  fouls: number;
  pts: number;
  reb: number;
  ast: number;
  sec: number;
  fgm: number;
  fga: number;
  tpm: number;
  tpa: number;
  ftm: number;
  fta: number;
  stl: number;
  blk: number;
  tov: number;
  pm: number;
}

export interface LiveState {
  q: number;
  clock: number;
  score: [number, number];
  done: boolean;
  home: { players: LivePlayer[]; timeouts: number; tactics: Tactics; autoSubs: boolean };
  away: { players: LivePlayer[]; timeouts: number; tactics: Tactics; autoSubs: boolean };
}

const TIMEOUTS = 7;

/** A decision made by a computer coach during a live game, for the broadcast. */
export interface CoachMove {
  side: 'home' | 'away';
  kind: 'timeout' | 'zone' | 'man' | 'switch' | 'push' | 'slow' | 'foul-sub';
  /** Points in the run that prompted a timeout. */
  run?: number;
  /** The player taken out, for foul trouble. */
  playerId?: string;
  fouls?: number;
  q: number;
  clock: number;
}

/**
 * A game played one possession at a time, so a coach can call timeouts,
 * make substitutions and change tactics between possessions. With the
 * default tactics and automatic rotations it plays exactly like
 * simulateGame (which runs one of these to the end).
 */
export class LiveGame {
  private readonly home: Side;
  private readonly away: Side;
  private offense: Side;
  private overtimes = 0;
  private period = 0;
  private clock = QUARTER_SEC;
  private length = QUARTER_SEC;
  private startScores: [number, number] = [0, 0];
  private sinceSub = 0;
  private regulationElapsed = 0;
  done = false;
  /** Sides run by a computer coach (live games only; never in simulateGame). */
  private ai = new Set<'home' | 'away'>();
  private moves: CoachMove[] = [];
  /** Current unanswered run: which side and how many points. */
  private run: { side: 'home' | 'away'; pts: number } = { side: 'home', pts: 0 };
  /** Points allowed this period by shot type, per defending side. */
  private allowed = { home: { rim: 0, mid: 0, three: 0 }, away: { rim: 0, mid: 0, three: 0 } };
  private adjusted = { home: -1, away: -1 };

  constructor(
    private readonly rng: Rng,
    private readonly homeTeam: SimTeam,
    private readonly awayTeam: SimTeam,
  ) {
    this.home = new Side(homeTeam);
    this.away = new Side(awayTeam);
    this.home.form = rng.normal(0, 0.018);
    this.away.form = rng.normal(0, 0.018);
    this.offense = rng.chance(0.5) ? this.home : this.away;
  }

  private side(which: 'home' | 'away') {
    return which === 'home' ? this.home : this.away;
  }

  /** Play one possession. Returns its play-by-play. */
  step(): PlayEvent | null {
    if (this.done) return null;
    const { rng, home, away } = this;
    const offense = this.offense;
    const defense = offense === home ? away : home;
    // Pace: about 100 possessions per team per 48 minutes, plus offensive-rebound trips.
    const mean = offense.tactics.pace === 'fast' ? 11.2 : offense.tactics.pace === 'slow' ? 16 : 13.4;
    const sec = Math.min(this.clock, clamp(Math.round(rng.normal(mean, 4.5)), 4, 24));
    const before: [number, number] = [home.score, away.score];
    rec = {};
    const homeCourt = home.court.map((c) => c.p.id);
    const awayCourt = away.court.map((c) => c.p.id);
    const keep = possession(rng, offense, defense, offense === home);
    const event: PlayEvent | null = rec?.type
      ? { ...(rec as PlayEvent), q: this.period + 1, clock: Math.max(0, this.clock - sec), off: offense === home ? 'home' : 'away', score: [home.score, away.score], homeCourt, awayCourt }
      : null;
    rec = null;
    trackPlusMinus(home, away, before);
    tick(home, sec);
    tick(away, sec);
    this.clock -= sec;
    this.sinceSub += sec;
    if (!keep) this.offense = defense;
    // A player with six fouls must leave.
    for (const side of [home, away]) foulOut(side);
    if (this.sinceSub >= 150 && this.clock > 0) {
      this.sinceSub = 0;
      const total = 4 * QUARTER_SEC + this.overtimes * OT_SEC;
      const elapsed = Math.min(total, this.regulationElapsed + (this.length - this.clock));
      if (home.autoSubs) substitute(home, elapsed, total);
      if (away.autoSubs) substitute(away, elapsed, total);
    }
    if (event) this.trackForCoach(event, before);
    for (const which of this.ai) if (!this.done && this.clock > 0) this.coach(which);
    if (this.clock <= 0) this.endPeriod();
    return event;
  }

  /** Let the computer coach one side: timeouts, defense, foul trouble, late-game pace. */
  enableAiCoach(which: 'home' | 'away') {
    this.ai.add(which);
    this.side(which).autoSubs = true;
  }

  /** Coaching moves since the last call (oldest first). */
  takeCoachMoves(): CoachMove[] {
    const out = this.moves;
    this.moves = [];
    return out;
  }

  private trackForCoach(e: PlayEvent, before: [number, number]) {
    const gained: [number, number] = [this.home.score - before[0], this.away.score - before[1]];
    for (const [i, which] of [[0, 'home'], [1, 'away']] as const) {
      const pts = gained[i];
      if (!pts) continue;
      this.run = this.run.side === which ? { side: which, pts: this.run.pts + pts } : { side: which, pts };
      const def = which === 'home' ? 'away' : 'home';
      if (e.type === 'shot' && e.made && e.kind) this.allowed[def][e.kind] += e.kind === 'three' ? 3 : 2;
    }
  }

  private coach(which: 'home' | 'away') {
    const me = this.side(which);
    const q = this.period + 1;
    const clock = this.clock;
    const add = (m: Omit<CoachMove, 'side' | 'q' | 'clock'>) => this.moves.push({ side: which, q, clock, ...m });
    const myScore = which === 'home' ? this.home.score : this.away.score;
    const theirScore = which === 'home' ? this.away.score : this.home.score;
    const margin = myScore - theirScore;
    const late = q >= 4 && clock <= 240;

    // Stop the bleeding: a timeout on an 8-0 run (10-0 early in the game, more timeouts saved for the end).
    const need = q <= 2 ? 10 : 8;
    const reserve = late ? 0 : 2;
    if (this.run.side !== which && this.run.pts >= need && me.timeouts > reserve) {
      add({ kind: 'timeout', run: this.run.pts });
      this.timeout(which);
      this.run = { side: which, pts: 0 };
      return;
    }

    // Foul trouble: sit a player who is one foul from being in real trouble.
    for (const c of me.court) {
      const trouble = q <= 3 ? c.line.pf >= q + 1 : c.line.pf >= 5 && clock > 300;
      if (!trouble) continue;
      const bench = me.roster.filter((b) => !me.court.includes(b) && b.line.pf < 4 && b.targetSec > 0);
      const inn = bench.find((b) => b.p.position === c.p.position) ?? bench.sort((a, b) => b.ovr - a.ovr)[0];
      if (inn && this.substitute(which, c.p.id, inn.p.id)) {
        add({ kind: 'foul-sub', playerId: c.p.id, fouls: c.line.pf });
        return;
      }
    }

    // Once a period, from the middle on: adjust the defense to what is hurting us.
    if (this.adjusted[which] !== this.period && clock <= this.length / 2) {
      this.adjusted[which] = this.period;
      const a = this.allowed[which];
      const total = a.rim + a.mid + a.three;
      if (total >= 12) {
        if (a.rim / total > 0.5 && me.tactics.defense !== 'zone') {
          me.tactics = { ...me.tactics, defense: 'zone' };
          add({ kind: 'zone' });
        } else if (a.three / total > 0.45 && me.tactics.defense === 'zone') {
          me.tactics = { ...me.tactics, defense: 'man' };
          add({ kind: 'man' });
        } else if (a.mid / total > 0.4 && me.tactics.defense === 'man') {
          me.tactics = { ...me.tactics, defense: 'switch' };
          add({ kind: 'switch' });
        }
      }
      this.allowed[which] = { rim: 0, mid: 0, three: 0 };
    }

    // Late in the game: chase the score or milk the clock.
    if (late) {
      if (margin <= -6 && me.tactics.pace !== 'fast') {
        me.tactics = { ...me.tactics, pace: 'fast', focus: 'three' };
        add({ kind: 'push' });
      } else if (margin >= 6 && me.tactics.pace !== 'slow') {
        me.tactics = { ...me.tactics, pace: 'slow' };
        add({ kind: 'slow' });
      }
    }
  }

  private endPeriod() {
    const { home, away } = this;
    home.quarters.push(home.score - this.startScores[0]);
    away.quarters.push(away.score - this.startScores[1]);
    this.regulationElapsed += this.length;
    this.period++;
    if (this.period < 4) this.startPeriod(QUARTER_SEC);
    else if (home.score === away.score) {
      this.overtimes++;
      this.startPeriod(OT_SEC);
    } else this.done = true;
  }

  private startPeriod(length: number) {
    this.length = length;
    this.clock = length;
    this.startScores = [this.home.score, this.away.score];
    this.sinceSub = 0;
  }

  /** Play to the end, optionally recording play-by-play. */
  runToEnd(log?: PlayEvent[]) {
    while (!this.done) {
      const e = this.step();
      if (e && log) log.push(e);
    }
  }

  setTactics(which: 'home' | 'away', tactics: Partial<Tactics>) {
    const s = this.side(which);
    s.tactics = { ...s.tactics, ...tactics };
  }

  setAutoSubs(which: 'home' | 'away', on: boolean) {
    this.side(which).autoSubs = on;
  }

  /** Swap a player on the floor for one on the bench. */
  substitute(which: 'home' | 'away', outId: string, inId: string): boolean {
    const s = this.side(which);
    const out = s.court.find((c) => c.p.id === outId);
    const inn = s.roster.find((c) => c.p.id === inId && !s.court.includes(c) && c.line.pf < 6);
    if (!out || !inn) return false;
    s.court = s.court.map((c) => (c === out ? inn : c));
    return true;
  }

  /** A timeout: the players on the floor catch their breath. */
  timeout(which: 'home' | 'away'): boolean {
    const s = this.side(which);
    if (s.timeouts <= 0 || this.done) return false;
    s.timeouts--;
    for (const c of s.roster) c.energy = Math.min(1, c.energy + (s.court.includes(c) ? 0.12 : 0.04));
    return true;
  }

  state(): LiveState {
    const view = (s: Side) => ({
      players: s.roster.map((c) => ({
        id: c.p.id,
        onCourt: s.court.includes(c),
        energy: c.energy,
        fouls: c.line.pf,
        pts: c.line.pts,
        reb: c.line.orb + c.line.drb,
        ast: c.line.ast,
        sec: c.line.sec,
        fgm: c.line.fgm,
        fga: c.line.fga,
        tpm: c.line.tpm,
        tpa: c.line.tpa,
        ftm: c.line.ftm,
        fta: c.line.fta,
        stl: c.line.stl,
        blk: c.line.blk,
        tov: c.line.tov,
        pm: c.line.pm,
      })),
      timeouts: s.timeouts,
      tactics: s.tactics,
      autoSubs: s.autoSubs,
    });
    return { q: this.period + 1, clock: Math.max(0, this.clock), score: [this.home.score, this.away.score], done: this.done, home: view(this.home), away: view(this.away) };
  }

  result(): GameResult {
    const result = (s: Side, team: SimTeam): TeamResult => ({
      teamId: team.teamId,
      score: s.score,
      quarters: s.quarters,
      lines: s.roster.map((c) => c.line).filter((l) => l.sec > 0 || l.starter),
    });
    return { home: result(this.home, this.homeTeam), away: result(this.away, this.awayTeam), overtimes: this.overtimes };
  }
}

/** Fouled-out players leave for the freshest eligible bench player. */
function foulOut(side: Side) {
  for (const c of side.court) {
    if (c.line.pf < 6) continue;
    const inn = side.roster.filter((x) => !side.court.includes(x) && x.line.pf < 6).sort((a, b) => b.energy - a.energy)[0];
    if (inn) side.court = side.court.map((x) => (x === c ? inn : x));
  }
}

/** Simulate a game. With `log`, every possession is also written to it as play-by-play. */
export function simulateGame(rng: Rng, homeTeam: SimTeam, awayTeam: SimTeam, log?: PlayEvent[]): GameResult {
  const game = new LiveGame(rng, homeTeam, awayTeam);
  game.runToEnd(log);
  return game.result();
}
