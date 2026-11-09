// Offseason mechanics: draft class and order, rookie contracts, contract
// expiry, player development and aging, retirements and the roll-over to a
// new league year. Pure functions over plain data (no UI).

import { buildContract, projectedCba, rookieScaleSalary } from './contracts';
import { PLAYER_REGIONS } from './data/names';
import { pickName } from './generator';
import { playerAge, playerOverall, rosterOf } from './league';
import { Rng, clamp } from './random';
import { HEIGHT_CM, generateAttributes, overall, ATTRIBUTE_KEYS } from './ratings';
import type { ScheduledGame } from './season';
import { standings } from './season';
import { POSITIONS, type Attributes, type LeagueFile, type Player } from './types';

const COLLEGES = [
  'Duke', 'Kentucky', 'Kansas', 'North Carolina', 'UCLA', 'Gonzaga', 'Arizona', 'Michigan State', 'Villanova', 'Baylor', 'Houston', 'Auburn',
  'Alabama', 'Texas', 'UConn', 'Tennessee', 'Purdue', 'Indiana', 'Arkansas', 'Florida', 'Iowa State', 'Creighton', 'Marquette', 'USC',
];

/** About 60 prospects for the draft that ends this league year. */
export function generateDraftClass(league: LeagueFile, rng: Rng, year: number, count = 64): Player[] {
  const used = new Set(league.players.map((p) => `${p.firstName} ${p.lastName}`));
  const out: Player[] = [];
  for (let i = 0; i < count; i++) {
    const position = rng.pick(POSITIONS);
    // A few franchise-level talents at the top, then a long tail.
    const tier = i / count;
    const now = clamp(Math.round(rng.normal(66 - tier * 18, 4)), 38, 76);
    const age = clamp(Math.round(rng.normal(20 + tier * 1.2, 1)), 19, 23);
    const growth = clamp(Math.round(rng.normal(age <= 20 ? 17 : age <= 21 ? 13 : 9, 4) - tier * 4), 2, 26);
    const name = pickName(rng, PLAYER_REGIONS, used);
    const [hMin, hMax] = HEIGHT_CM[position];
    const heightCm = rng.int(hMin, hMax);
    out.push({
      id: `r${year}-${String(i + 1).padStart(2, '0')}`,
      firstName: name.firstName,
      lastName: name.lastName,
      teamId: null,
      position,
      jersey: rng.int(0, 55),
      born: { year: year - age, country: name.country },
      heightCm,
      weightKg: Math.round(heightCm * 0.52 - 3 + rng.normal(0, 5)),
      attributes: generateAttributes(rng, position, now),
      personality: {
        workEthic: clamp(Math.round(rng.normal(11, 3.5)), 1, 20),
        consistency: clamp(Math.round(rng.normal(9, 3)), 1, 20),
        ego: clamp(Math.round(rng.normal(11, 3)), 1, 20),
        loyalty: clamp(Math.round(rng.normal(11, 3)), 1, 20),
        injuryProneness: clamp(Math.round(rng.normal(9, 3)), 1, 20),
      },
      potential: clamp(now + growth, now, 99),
      contract: null,
      draft: null,
      experience: 0,
      college: name.country === 'USA' || rng.chance(0.3) ? rng.pick(COLLEGES) : undefined,
    });
  }
  return out;
}

export interface DraftSlot {
  /** 1-based overall pick number. */
  overall: number;
  round: 1 | 2;
  pick: number;
  /** Team whose standing set the slot. */
  originalTeamId: string;
  /** Team that owns the pick now. */
  teamId: string;
  pickId: string | null;
  /** Moved up in the lottery. */
  jumped?: boolean;
}

/** Lottery odds for the 14 non-playoff teams, worst record first (percent for the top pick). */
const LOTTERY_ODDS = [14, 14, 14, 12.5, 10.5, 9, 7.5, 6, 4.5, 3, 2, 1.5, 1, 0.5];

/**
 * Draft order: a lottery among the 14 worst teams for the top four picks,
 * everyone else by record (worst first); second round by record. `playoffTeams`
 * are the teams that reached the first round.
 */
export function draftOrder(league: LeagueFile, games: ScheduledGame[], playoffTeams: Set<string>, year: number, rng: Rng): DraftSlot[] {
  const byRecord = standings(league, games).sort((a, b) => a.pct - b.pct || a.w - b.w);
  const lottery = byRecord.filter((r) => !playoffTeams.has(r.teamId)).slice(0, 14).map((r) => r.teamId);
  const rest = byRecord.map((r) => r.teamId).filter((t) => !lottery.includes(t));
  // Draw four winners, then everyone else keeps record order.
  const pool = lottery.map((t, i) => ({ t, w: LOTTERY_ODDS[i] ?? 0.5 }));
  const winners: string[] = [];
  for (let k = 0; k < 4 && pool.length; k++) {
    const t = rng.weighted(pool.map((x) => [x.t, x.w] as const));
    winners.push(t);
    pool.splice(pool.findIndex((x) => x.t === t), 1);
  }
  const first = [...winners, ...lottery.filter((t) => !winners.includes(t)), ...rest];
  const second = byRecord.map((r) => r.teamId);
  const slots: DraftSlot[] = [];
  const add = (order: string[], round: 1 | 2) =>
    order.forEach((teamId, i) => {
      const pick = league.draftPicks.find((k) => k.season === year && k.round === round && k.originalTeamId === teamId);
      slots.push({
        overall: slots.length + 1,
        round,
        pick: i + 1,
        originalTeamId: teamId,
        teamId: pick?.ownerTeamId ?? teamId,
        pickId: pick?.id ?? null,
        jumped: round === 1 && i < 4 && lottery.indexOf(teamId) > i,
      });
    });
  add(first, 1);
  add(second, 2);
  return slots;
}

/** Sign a drafted player: rookie scale for first-rounders, a two-year minimum deal for second-rounders. */
export function signDraftedPlayer(league: LeagueFile, p: Player, slot: DraftSlot, year: number, rng: Rng) {
  const cba = league.settings;
  p.teamId = slot.teamId;
  p.draft = { season: year, round: slot.round, pick: slot.pick, teamId: slot.teamId };
  p.contract =
    slot.round === 1
      ? buildContract(rng, cba, { firstSeason: year, signedSeason: year, firstYearSalary: rookieScaleSalary(cba, slot.pick), years: 4, kind: 'rookie' })
      : buildContract(rng, cba, { firstSeason: year, signedSeason: year, firstYearSalary: cba.minimumSalary, years: 2, kind: 'minimum' });
  const taken = new Set(league.players.filter((x) => x.teamId === slot.teamId && x.id !== p.id).map((x) => x.jersey));
  while (taken.has(p.jersey)) p.jersey = (p.jersey + 1) % 100;
}

export interface DevelopmentChange {
  playerId: string;
  before: number;
  after: number;
}

/**
 * A summer of development: young players grow toward their potential
 * (faster with a good work ethic and development coach), players in their
 * prime hold, veterans decline. `devCoach` is each team's development
 * rating (1-20). Ages are taken in the new league year.
 */
export function developPlayers(league: LeagueFile, rng: Rng, devCoach: (teamId: string | null) => number): DevelopmentChange[] {
  const year = league.meta.season;
  const changes: DevelopmentChange[] = [];
  for (const p of league.players) {
    const before = playerOverall(p);
    const age = playerAge(p, year);
    const room = Math.max(0, p.potential - before);
    const work = (p.personality.workEthic - 10) * 0.08;
    const coach = (devCoach(p.teamId) - 10) * 0.05;
    let delta: number;
    if (age <= 22) delta = room * clamp(rng.normal(0.32 + work * 0.3 + coach * 0.3, 0.12), 0, 0.7);
    else if (age <= 25) delta = room * clamp(rng.normal(0.25 + work * 0.25 + coach * 0.2, 0.1), 0, 0.6);
    else if (age <= 29) delta = rng.normal(0.3 + work, 1.2);
    else if (age <= 32) delta = rng.normal(-1.2 + work * 0.5, 1.2);
    else if (age <= 35) delta = rng.normal(-2.6 + work * 0.5, 1.4);
    else delta = rng.normal(-4, 1.6);
    const target = Math.round(before + delta);
    if (target === before) continue;
    p.attributes = shiftAttributes(p, target, age, rng);
    const after = playerOverall(p);
    // Players who outgrow their potential raise it; the ceiling never sits below the current level.
    p.potential = Math.max(p.potential, after);
    if (age >= 28) p.potential = Math.min(p.potential, Math.max(after, p.potential - 1));
    if (after !== before) changes.push({ playerId: p.id, before, after });
  }
  return changes;
}

/** Move attributes so overall lands near `target`. Older players lose athleticism first. */
function shiftAttributes(p: Player, target: number, age: number, rng: Rng): Attributes {
  let attrs = { ...p.attributes };
  for (let i = 0; i < 5; i++) {
    const diff = target - overall(attrs, p.position);
    if (Math.abs(diff) < 0.5) break;
    const next = { ...attrs };
    for (const k of ATTRIBUTE_KEYS) {
      const physical = k === 'speed' || k === 'vertical' || k === 'stamina' || k === 'durability';
      const weight = diff < 0 && age >= 30 ? (physical ? 1.6 : 0.7) : diff > 0 && age <= 23 && physical ? 1.2 : 1;
      next[k] = clamp(Math.round(attrs[k] + (diff / 3.7) * weight + rng.normal(0, 0.35)), 1, 20);
    }
    attrs = next;
  }
  return attrs;
}

/** Players who retire this summer. Returns them; the caller removes them. */
export function retirements(league: LeagueFile, rng: Rng): Player[] {
  const year = league.meta.season;
  return league.players.filter((p) => {
    const age = playerAge(p, year);
    const ovr = playerOverall(p);
    if (age >= 40) return true;
    if (age >= 37) return rng.chance(ovr < 60 ? 0.85 : 0.45);
    if (age >= 35) return !p.teamId ? rng.chance(0.6) : rng.chance(ovr < 52 ? 0.5 : 0.12);
    if (age >= 32 && !p.teamId) return rng.chance(ovr < 50 ? 0.4 : 0.08);
    return false;
  });
}

/**
 * Start the next league year: season number, cap growth, used draft picks
 * out and a new year of picks in, experience for everyone who played.
 */
export function rollOverLeagueYear(league: LeagueFile) {
  const year = league.meta.season;
  league.meta.season = year + 1;
  league.settings = projectedCba(league.settings, 1);
  // Picks for the draft just held are used up; add the year seven ahead.
  league.draftPicks = league.draftPicks.filter((k) => k.season > year + 1);
  const newYear = year + 8;
  for (const t of league.teams) {
    for (const round of [1, 2] as const) {
      league.draftPicks.push({ id: `pk-${newYear}-${round}-${t.abbrev.toLowerCase()}`, season: newYear, round, originalTeamId: t.id, ownerTeamId: t.id, protection: null });
    }
  }
  // Everyone who was in the league gains a season; this summer's draft picks start at zero.
  for (const p of league.players) if ((p.teamId || p.contract) && p.draft?.season !== year + 1) p.experience += 1;
  // Dead money for seasons that are over drops off.
  league.deadMoney = (league.deadMoney ?? []).map((d) => ({ ...d, years: d.years.filter((y) => y.season >= year + 1) })).filter((d) => d.years.length);
}

/** Players whose contract has no season left in the current league year. Their teams lose them. */
export function expiringPlayers(league: LeagueFile): Player[] {
  const year = league.meta.season;
  return league.players.filter((p) => p.teamId && p.contract && !p.contract.years.some((y) => y.season >= year));
}

/** Teams over the roster limit cut their lowest-rated players on the smallest deals. */
export function trimRoster(league: LeagueFile, teamId: string): Player[] {
  const max = league.settings.rosterMax;
  const roster = rosterOf(league, teamId).filter((p) => p.contract?.kind !== 'two-way');
  if (roster.length <= max) return [];
  const cut = [...roster]
    .sort((a, b) => playerOverall(a) - playerOverall(b) || (a.contract?.years[0]?.salary ?? 0) - (b.contract?.years[0]?.salary ?? 0))
    .slice(0, roster.length - max);
  for (const p of cut) {
    p.teamId = null;
    p.contract = null;
  }
  return cut;
}
