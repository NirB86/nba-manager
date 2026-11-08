// Fictional league generator: 30 teams, full rosters with contracts, staff,
// and seven years of draft picks. Deterministic for a given seed.

import { CONFERENCES, TEAM_SEEDS } from './data/teams';
import { PLAYER_REGIONS, STAFF_REGIONS, type NameRegion } from './data/names';
import { DEFAULT_CBA, buildContract, marketSalary, maxSalaryShare, rookieScaleSalary } from './contracts';
import { HEIGHT_CM, generateAttributes, overall } from './ratings';
import { Rng, clamp, newSeed } from './random';
import {
  LEAGUE_FORMAT,
  LEAGUE_FORMAT_VERSION,
  POSITIONS,
  type CbaSettings,
  type DraftPick,
  type LeagueFile,
  type Personality,
  type Player,
  type Position,
  type Staff,
  type StaffRole,
  type Team,
} from './types';

export interface GenerateOptions {
  seed?: number;
  season?: number;
  name?: string;
  freeAgents?: number;
}

/** Typical NBA roster shape: overall ratings from the best player down to the 15th man. */
const ROSTER_TEMPLATE = [84, 78, 75, 72, 70, 68, 66, 64, 62, 60, 58, 56, 54, 52, 50];

const ROSTER_POSITIONS: Position[] = ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C', 'C'];

export function generateLeague(opts: GenerateOptions = {}): LeagueFile {
  const seed = opts.seed ?? newSeed();
  const season = opts.season ?? 2026;
  const rng = new Rng(seed);
  const cba: CbaSettings = { ...DEFAULT_CBA };

  const teams: Team[] = TEAM_SEEDS.map((t) => {
    const conference = CONFERENCES.find((c) => c.divisions.some((d) => d.id === t.division));
    if (!conference) throw new Error(`No conference for division ${t.division}`);
    return {
      id: `t-${t.abbrev.toLowerCase()}`,
      city: t.city,
      name: t.name,
      abbrev: t.abbrev,
      conferenceId: conference.id,
      divisionId: t.division,
      market: t.market,
      colors: { primary: t.primary, secondary: t.secondary },
      arena: t.arena,
    };
  });

  const ids = { player: 0, staff: 0 };
  const usedNames = new Set<string>();
  const players: Player[] = [];

  // Team strength varies: some contenders, some rebuilding teams.
  const strengths = rng.shuffle(teams.map((_, i) => (i - (teams.length - 1) / 2) * 0.45));

  teams.forEach((team, ti) => {
    const strength = strengths[ti] ?? 0;
    const positions = rng.shuffle([...ROSTER_POSITIONS, ...Array.from({ length: 5 }, () => rng.pick(POSITIONS))]);
    // A superstar on some teams.
    const star = rng.chance(0.3) ? rng.int(3, 8) : 0;
    const jerseys = new Set<number>();
    const teamSurnames = new Set<string>();
    ROSTER_TEMPLATE.forEach((base, slot) => {
      const target = clamp(Math.round(base + strength + rng.normal(0, 2.2) + (slot === 0 ? star : 0)), 40, 97);
      const position = positions[slot] ?? rng.pick(POSITIONS);
      const draftTeamId = rng.chance(0.5) ? team.id : rng.pick(teams).id;
      const player = makePlayer(rng, cba, season, ids, usedNames, { teamId: team.id, draftTeamId, teamSurnames, position, targetOvr: target, slot });
      player.jersey = pickJersey(rng, jerseys);
      players.push(player);
    });
    // Real payrolls cluster around the cap: contenders pay the tax, rebuilding
    // teams sit under the cap. Scale negotiated deals toward the team's target.
    const target = clamp(rng.normal(1.05 + strength * 0.03, 0.1), 0.78, 1.4) * cba.salaryCap;
    fitPayroll(players.filter((p) => p.teamId === team.id), target, cba, season);
  });

  const faCount = opts.freeAgents ?? 60;
  for (let i = 0; i < faCount; i++) {
    const target = clamp(Math.round(rng.normal(55, 5)), 42, 68);
    const player = makePlayer(rng, cba, season, ids, usedNames, { teamId: null, draftTeamId: rng.pick(teams).id, position: rng.pick(POSITIONS), targetOvr: target, slot: 14 });
    player.jersey = rng.int(0, 99);
    players.push(player);
  }

  const staff: Staff[] = [];
  const roles: StaffRole[] = ['HC', 'AC', 'AC', 'SCOUT', 'SCOUT', 'MED', 'DEV'];
  for (const team of teams) {
    for (const role of roles) staff.push(makeStaff(rng, season, ids, team.id, role));
  }
  for (let i = 0; i < 20; i++) {
    staff.push(makeStaff(rng, season, ids, null, rng.pick(roles)));
  }

  const draftPicks = makeDraftPicks(rng, teams, season);

  return {
    format: LEAGUE_FORMAT,
    version: LEAGUE_FORMAT_VERSION,
    meta: {
      name: opts.name ?? 'Fictional League',
      season,
      source: 'fictional',
      createdAt: new Date().toISOString(),
      seed,
    },
    settings: cba,
    conferences: structuredClone(CONFERENCES),
    teams,
    players,
    staff,
    draftPicks,
  };
}

/** Scale standard contracts so the team's current payroll lands near the target. */
function fitPayroll(roster: Player[], target: number, cba: CbaSettings, season: number) {
  const current = (p: Player) => p.contract?.years.find((y) => y.season === season)?.salary ?? 0;
  const adjustable = roster.filter((p) => p.contract?.kind === 'standard' || p.contract?.kind === 'max');
  const fixed = roster.filter((p) => !adjustable.includes(p)).reduce((s, p) => s + current(p), 0);
  const variable = adjustable.reduce((s, p) => s + current(p), 0);
  if (variable <= 0) return;
  const factor = clamp((target - fixed) / variable, 0.5, 2.5);
  for (const p of adjustable) {
    const c = p.contract;
    if (!c) continue;
    const first = current(p);
    const max = maxSalaryShare(p.experience) * cba.salaryCap;
    const scaled = clamp(first * factor, cba.minimumSalary, max);
    const ratio = first > 0 ? scaled / first : 1;
    c.years = c.years.map((y) => ({ ...y, salary: Math.round(y.salary * ratio) }));
    c.kind = scaled >= max * 0.97 ? 'max' : 'standard';
  }
}

export function pickName(rng: Rng, regions: readonly (readonly [NameRegion, number])[], used: Set<string>, avoidLast?: Set<string>) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const region = rng.weighted(regions);
    const firstName = rng.pick(region.first);
    const lastName = rng.pick(region.last);
    const key = `${firstName} ${lastName}`;
    if ((!used.has(key) && !avoidLast?.has(lastName)) || attempt === 49) {
      avoidLast?.add(lastName);
      used.add(key);
      return { firstName, lastName, country: rng.weighted(region.countries) };
    }
  }
  throw new Error('unreachable');
}

function pickJersey(rng: Rng, used: Set<number>): number {
  const common = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 41, 42, 44, 55, 77];
  for (let i = 0; i < 100; i++) {
    const n = i < 60 ? rng.pick(common) : rng.int(0, 99);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return 99;
}

function personality(rng: Rng): Personality {
  const trait = () => clamp(Math.round(rng.normal(11, 3.5)), 1, 20);
  return { workEthic: trait(), consistency: trait(), ego: trait(), loyalty: trait(), injuryProneness: trait() };
}

interface PlayerSpec {
  teamId: string | null;
  /** Surnames already on this team, to avoid two players sharing one. */
  teamSurnames?: Set<string>;
  /** Team that drafted the player, if drafted. */
  draftTeamId: string;
  position: Position;
  targetOvr: number;
  slot: number;
}

function makePlayer(
  rng: Rng,
  cba: CbaSettings,
  season: number,
  ids: { player: number },
  usedNames: Set<string>,
  spec: PlayerSpec,
): Player {
  const name = pickName(rng, PLAYER_REGIONS, usedNames, spec.teamSurnames);

  // Age: stars cluster in their prime, the end of the bench is young or old.
  const age = clamp(
    Math.round(spec.slot < 3 ? rng.normal(27, 3) : rng.chance(0.55) ? rng.normal(23, 2) : rng.normal(30, 3)),
    19,
    39,
  );
  const experience = clamp(age - rng.int(19, 22), 0, 20);

  // Potential: young players have room to grow.
  const growth = age <= 22 ? rng.int(6, 16) : age <= 25 ? rng.int(2, 9) : age <= 28 ? rng.int(0, 3) : 0;
  const potential = clamp(spec.targetOvr + growth, spec.targetOvr, 99);

  const [hMin, hMax] = HEIGHT_CM[spec.position];
  const heightCm = rng.int(hMin, hMax);
  const weightKg = Math.round(heightCm * 0.52 - 3 + rng.normal(0, 5));

  const attributes = generateAttributes(rng, spec.position, spec.targetOvr);
  const ovr = overall(attributes, spec.position);

  // Draft history.
  let draft: Player['draft'] = null;
  if (spec.teamId !== null || rng.chance(0.4)) {
    const undrafted = rng.chance(0.15);
    if (!undrafted) {
      const round = ovr >= 70 || rng.chance(0.6) ? 1 : 2;
      const pick = round === 1 ? clamp(Math.round(30 - (ovr - 50) * 0.7 + rng.normal(0, 5)), 1, 30) : rng.int(1, 30);
      draft = { season: season - experience, round, pick, teamId: spec.draftTeamId };
    }
  }

  let contract: Player['contract'] = null;
  if (spec.teamId !== null) {
    const onRookieDeal = draft !== null && draft.round === 1 && experience < 4;
    if (onRookieDeal && draft) {
      const first = rookieScaleSalary(cba, draft.pick) * Math.pow(1.05, experience);
      contract = buildContract(rng, cba, {
        firstSeason: season,
        signedSeason: season - experience,
        firstYearSalary: first,
        years: 4 - experience,
        kind: 'rookie',
      });
    } else {
      const salary = marketSalary(cba, ovr, age, experience) * Math.exp(rng.normal(0, 0.22));
      const isMax = salary >= maxSalaryShare(experience) * cba.salaryCap * 0.97;
      const firstYear = clamp(salary, cba.minimumSalary, maxSalaryShare(experience) * cba.salaryCap);
      const isMin = firstYear <= cba.minimumSalary * 1.1;
      const maxYears = age < 25 ? 5 : age < 30 ? 4 : age < 33 ? 3 : 2;
      contract = buildContract(rng, cba, {
        firstSeason: season,
        signedSeason: season - rng.int(0, 2),
        firstYearSalary: isMin ? cba.minimumSalary : firstYear,
        years: isMin ? rng.int(1, 2) : rng.int(1, maxYears),
        kind: isMax ? 'max' : isMin ? 'minimum' : 'standard',
      });
    }
  }

  ids.player += 1;
  return {
    id: `p${String(ids.player).padStart(4, '0')}`,
    firstName: name.firstName,
    lastName: name.lastName,
    teamId: spec.teamId,
    position: spec.position,
    jersey: 0,
    born: { year: season - age, country: name.country },
    heightCm,
    weightKg,
    attributes,
    personality: personality(rng),
    potential: Math.max(potential, ovr),
    contract,
    draft,
    experience,
  };
}

function makeStaff(rng: Rng, season: number, ids: { staff: number }, teamId: string | null, role: StaffRole): Staff {
  const name = pickName(rng, STAFF_REGIONS, new Set());
  const age = role === 'HC' ? rng.int(38, 68) : rng.int(28, 65);
  const r = (boost = 0) => clamp(Math.round(rng.normal(10 + boost, 3)), 1, 20);
  const ratings = {
    tactics: r(role === 'HC' ? 3 : role === 'AC' ? 1 : -3),
    development: r(role === 'DEV' ? 4 : role === 'AC' ? 1 : -1),
    motivation: r(role === 'HC' ? 2 : 0),
    judgment: r(role === 'SCOUT' ? 3 : 0),
    medical: r(role === 'MED' ? 5 : -5),
    scouting: r(role === 'SCOUT' ? 4 : -2),
  };
  const salary =
    role === 'HC' ? rng.int(30, 120) * 100_000 : role === 'AC' ? rng.int(5, 25) * 100_000 : rng.int(2, 12) * 100_000;
  ids.staff += 1;
  return {
    id: `s${String(ids.staff).padStart(4, '0')}`,
    firstName: name.firstName,
    lastName: name.lastName,
    teamId,
    role,
    born: { year: season - age, country: name.country },
    ratings,
    contract: teamId ? { salary, endSeason: season + rng.int(0, 4) } : null,
  };
}

const PROTECTIONS = ['Top-4 protected', 'Top-8 protected', 'Top-10 protected', 'Top-14 protected', 'Lottery protected'];

function makeDraftPicks(rng: Rng, teams: Team[], season: number): DraftPick[] {
  const picks: DraftPick[] = [];
  for (let s = season + 1; s <= season + 7; s++) {
    for (const team of teams) {
      for (const round of [1, 2] as const) {
        // Some picks already changed hands in past trades.
        const traded = rng.chance(round === 1 ? 0.1 : 0.2);
        const owner = traded ? rng.pick(teams.filter((t) => t.id !== team.id)) : team;
        picks.push({
          id: `pk-${s}-${round}-${team.abbrev.toLowerCase()}`,
          season: s,
          round,
          originalTeamId: team.id,
          ownerTeamId: owner.id,
          protection: traded && round === 1 && rng.chance(0.6) ? rng.pick(PROTECTIONS) : null,
        });
      }
    }
  }
  return picks;
}
