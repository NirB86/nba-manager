// Builds a real-NBA league file from cached Basketball-Reference pages.
// Ratings are our own: each 1-20 attribute is a percentile of real stats,
// and overall ratings are anchored to on-court impact (box plus-minus and
// minutes). For personal use only; never commit the output.
//
//   npx tsx tools/import-real/build.ts <cache-dir> <out.json> [season-end-year]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildContract, maxSalaryShare } from '../../src/engine/contracts';
import { STAFF_REGIONS } from '../../src/engine/data/names';
import { CONFERENCES } from '../../src/engine/data/teams';
import { Rng, clamp } from '../../src/engine/random';
import { ATTRIBUTE_KEYS, HEIGHT_CM, generateAttributes, overall, type AttributeKey } from '../../src/engine/ratings';
import {
  LEAGUE_FORMAT,
  LEAGUE_FORMAT_VERSION,
  type Attributes,
  type CbaSettings,
  type Contract,
  type DraftPick,
  type LeagueFile,
  type Player,
  type Position,
  type Staff,
  type Team,
} from '../../src/engine/types';
import { validateLeague } from '../../src/engine/validate';

type ImageFocus = NonNullable<NonNullable<Player['photo']>['focus']>;
import { cacheName, pagesFor } from './fetch';
import { infoAfter, loadPage, num, readTable, type Row } from './parse';
import { REAL_TEAMS } from './teams';
import { headshot, leagueLogo, teamLogo } from './official';

const [cacheDir, outFile, yearArg] = process.argv.slice(2);
if (!cacheDir || !outFile) throw new Error('usage: build.ts <cache-dir> <out.json> [season-end-year]');
const END_YEAR = Number(yearArg ?? 2027);
const SEASON = END_YEAR - 1; // league files name a season by the year it starts
const PREV = END_YEAR - 1; // Basketball-Reference names a season by the year it ends

const page = (path: string) => {
  const file = join(cacheDir, cacheName(path));
  if (!existsSync(file)) throw new Error(`Missing ${path}; run fetch.ts first.`);
  return loadPage(file);
};
const missing = pagesFor(END_YEAR).filter((p) => !existsSync(join(cacheDir, cacheName(p))));
if (missing.length) console.warn(`warning: ${missing.length} pages missing from cache`);

// ---------------------------------------------------------------- cap figures

/** Cap for the season from the cap history page; tax and aprons use the 2025-26 ratios. */
function readCba(): CbaSettings {
  let cap = 154_647_000;
  try {
    const rows = readTable(page('/contracts/salary-cap-history.html'), 'salary_cap_history');
    const label = `${SEASON}-${String(END_YEAR).slice(2)}`;
    const row = rows.find((r) => r.year_id?.text === label);
    const v = num(row?.cap);
    if (v) cap = v;
    else console.warn(`cap for ${label} not found; using ${cap}`);
  } catch (e) {
    console.warn(`cap history unreadable (${(e as Error).message}); using ${cap}`);
  }
  const f = cap / 154_647_000;
  return {
    salaryCap: cap,
    luxuryTax: Math.round(187_895_000 * f),
    firstApron: Math.round(195_945_000 * f),
    secondApron: Math.round(207_824_000 * f),
    minimumSalary: Math.round(1_272_870 * f),
    maximumSalaryPct: 0.35,
    rosterMax: 15,
    rosterMin: 13,
    twoWaySlots: 3,
    capGrowth: 0.07,
  };
}

// ---------------------------------------------------------------- stats

interface Season {
  mp: number;
  games: number;
  pg?: Row;
  adv?: Row;
  shoot?: Row;
}

/** First row per player id (Basketball-Reference lists the combined row first for traded players). */
function byPlayer(rows: Row[]): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows) {
    const id = r.name_display?.id;
    if (id && !m.has(id)) m.set(id, r);
  }
  return m;
}

function loadSeason(year: number, withShooting: boolean): Map<string, Season> {
  const pg = byPlayer(readTable(page(`/leagues/NBA_${year}_per_game.html`), 'per_game_stats'));
  const adv = byPlayer(readTable(page(`/leagues/NBA_${year}_advanced.html`), 'advanced'));
  const shoot = withShooting ? byPlayer(readTable(page(`/leagues/NBA_${year}_shooting.html`), 'shooting')) : new Map<string, Row>();
  const out = new Map<string, Season>();
  for (const [id, a] of adv) {
    out.set(id, { mp: num(a.mp) ?? 0, games: num(a.games) ?? 0, pg: pg.get(id), adv: a, shoot: shoot.get(id) });
  }
  return out;
}

const prevStats = loadSeason(PREV, true);
const curStats = loadSeason(END_YEAR, false);
const olderStats = (() => {
  try {
    return loadSeason(PREV - 1, false);
  } catch {
    console.warn('season before last not cached: injured players will rate lower');
    return new Map<string, Season>();
  }
})();

/** Below this many recent minutes, the season before last fills in (injuries). */
const FULL_SAMPLE = 1800;
/** How much of the older season counts, given a player's recent minutes. */
function olderWeight(id: string): number {
  const recent = (prevStats.get(id)?.mp ?? 0) + (curStats.get(id)?.mp ?? 0);
  return recent >= FULL_SAMPLE ? 0 : 0.8 * (1 - recent / FULL_SAMPLE);
}

/** Minutes-weighted blend of a stat across recent seasons. */
function blend(id: string, get: (s: Season) => number | null): { value: number | null; weight: number } {
  let sum = 0;
  let w = 0;
  const older = olderWeight(id);
  for (const [s, k] of [[olderStats.get(id), older], [prevStats.get(id), 1], [curStats.get(id), 1]] as const) {
    if (!s || s.mp <= 0 || k <= 0) continue;
    const v = get(s);
    if (v === null || !Number.isFinite(v)) continue;
    sum += v * s.mp * k;
    w += s.mp * k;
  }
  return { value: w ? sum / w : null, weight: w };
}

/** Shrink a noisy rate toward a prior based on the sample behind it. */
const shrink = (value: number | null, sample: number, prior: number, k: number) =>
  value === null ? prior : (value * sample + prior * k) / (sample + k);

// ---------------------------------------------------------------- people

interface Bio {
  id: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  pos: Position;
  jersey: number;
  heightIn: number;
  weightLb: number;
  birth: { year: number; month: number; day: number } | null;
  country: string;
  experience: number;
  college?: string;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const countryName = (code: string) => {
  const c = code.toUpperCase();
  if (c === 'US') return 'USA';
  try {
    return regionNames.of(c) ?? c;
  } catch {
    return c;
  }
};

function toPos(raw: string | undefined): Position {
  const p = (raw ?? '').split(/[-,]/)[0]?.trim().toUpperCase() ?? '';
  if (p === 'PG' || p === 'SG' || p === 'SF' || p === 'PF' || p === 'C') return p;
  if (p === 'G') return 'SG';
  if (p === 'F') return 'SF';
  return 'SF';
}

function splitName(full: string) {
  const parts = full.replace(/\s*\(TW\)\s*$/i, '').trim().split(/\s+/);
  const firstName = parts.shift() ?? full;
  return { firstName, lastName: parts.join(' ') || firstName };
}

const teams: Team[] = [];
const bios = new Map<string, Bio>();
const coaches = new Map<string, string>();

for (const rt of REAL_TEAMS) {
  const p = page(`/teams/${rt.bref}/${END_YEAR}.html`);
  const conference = CONFERENCES.find((c) => c.divisions.some((d) => d.id === rt.division));
  const arena = (infoAfter(p, 'Arena:') ?? '').split(' Attendance')[0]?.trim() || `${rt.city} Arena`;
  const teamId = `t-${rt.abbrev.toLowerCase()}`;
  teams.push({
    id: teamId,
    city: rt.city,
    name: rt.name,
    abbrev: rt.abbrev,
    conferenceId: conference?.id ?? 'east',
    divisionId: rt.division,
    market: rt.market,
    colors: { primary: rt.primary, secondary: rt.secondary },
    arena,
  });
  const coach = infoAfter(p, 'Coach:');
  if (coach) coaches.set(teamId, coach.replace(/\s*\(.*$/, '').trim());

  for (const r of readTable(p, 'roster')) {
    const id = r.player?.id;
    if (!id) continue;
    const birth = r.birth_date?.csk;
    const flag = (r.flag?.text ?? '').split(/\s+/)[0] ?? 'us';
    bios.set(id, {
      id,
      ...splitName(r.player?.text ?? id),
      teamId,
      pos: toPos(r.pos?.text),
      // -1: no number listed yet; a free one is assigned below.
      jersey: /^\d+$/.test(r.number?.text ?? '') ? Number(r.number!.text) : -1,
      heightIn: num(r.height) ?? 79,
      weightLb: num(r.weight) ?? 215,
      birth: birth ? { year: Number(birth.slice(0, 4)), month: Number(birth.slice(4, 6)), day: Number(birth.slice(6, 8)) } : null,
      country: countryName(flag),
      experience: r.years_experience?.text === 'R' ? 0 : Number(r.years_experience?.text) || 0,
      college: r.college?.text?.trim() || undefined,
    });
  }
}

// Players without a listed number get the lowest free one on their team.
for (const t of REAL_TEAMS) {
  const teamId = `t-${t.abbrev.toLowerCase()}`;
  const list = [...bios.values()].filter((b) => b.teamId === teamId);
  const taken = new Set(list.map((b) => b.jersey).filter((n) => n >= 0));
  for (const b of list.filter((x) => x.jersey < 0)) {
    let n = 1;
    while (taken.has(n)) n++;
    b.jersey = n;
    taken.add(n);
  }
}

// Free agents: played recently, not on any roster now.
for (const stats of [curStats, prevStats]) {
  for (const [id, s] of stats) {
    if (bios.has(id) || s.mp < 250) continue;
    const row = s.pg ?? s.adv;
    const age = num(row?.age) ?? 28;
    if (age > 36) continue;
    const pos = toPos(row?.pos?.text);
    const [hMin, hMax] = HEIGHT_CM[pos];
    bios.set(id, {
      id,
      ...splitName(row?.name_display?.text ?? id),
      teamId: null,
      pos,
      jersey: 0,
      heightIn: Math.round((hMin + hMax) / 2 / 2.54),
      weightLb: 215,
      birth: { year: SEASON - age, month: 1, day: 1 },
      country: 'USA',
      experience: Math.max(1, age - 21),
    });
  }
}

// Draft history.
const drafts = new Map<string, { season: number; round: number; pick: number; teamId: string }>();
const brefToTeam = new Map(REAL_TEAMS.map((t) => [t.bref, `t-${t.abbrev.toLowerCase()}`]));
// Older franchise codes on draft pages.
for (const [old, cur] of [['NJN', 'BRK'], ['CHA', 'CHO'], ['NOH', 'NOP'], ['SEA', 'OKC'], ['VAN', 'MEM'], ['NOK', 'NOP'], ['CHH', 'CHO']] as const) {
  const t = brefToTeam.get(cur);
  if (t) brefToTeam.set(old, t);
}
for (let y = PREV - 23; y <= PREV; y++) {
  const file = join(cacheDir, cacheName(`/draft/NBA_${y}.html`));
  if (!existsSync(file)) continue;
  for (const r of readTable(loadPage(file), 'stats')) {
    const id = r.player?.id;
    const pick = num(r.pick_overall);
    if (!id || !pick) continue;
    drafts.set(id, {
      season: y,
      round: pick > 30 ? 2 : 1,
      pick: pick > 30 ? pick - 30 : pick,
      teamId: brefToTeam.get(r.team_id?.text ?? '') ?? teams[0]!.id,
    });
  }
}

// ---------------------------------------------------------------- ratings

interface Metrics {
  minutes: number;
  mpg: number;
  gamesShare: number;
  [k: string]: number;
}

function metricsFor(b: Bio): Metrics {
  const id = b.id;
  const pg = (k: string) => blend(id, (s) => num(s.pg?.[k]));
  const adv = (k: string) => blend(id, (s) => num(s.adv?.[k]));
  const sh = (k: string) => blend(id, (s) => num(s.shoot?.[k]));
  const mpg = pg('mp_per_g').value ?? 0;
  const per36 = (k: string) => {
    const v = pg(k).value;
    return v !== null && mpg > 0 ? (v / mpg) * 36 : null;
  };
  const minutes = (prevStats.get(id)?.mp ?? 0) + (curStats.get(id)?.mp ?? 0) + (olderStats.get(id)?.mp ?? 0) * olderWeight(id);
  const fga36 = per36('fga_per_g') ?? 0;
  const fg3a36 = per36('fg3a_per_g') ?? 0;
  const fta36 = per36('fta_per_g') ?? 0;
  const rimShare = sh('pct_fga_00_03').value ?? 0.25;
  const midShare = (sh('pct_fga_10_16').value ?? 0.08) + (sh('pct_fga_16_xx').value ?? 0.06);
  const midFgRaw = (() => {
    const a = sh('pct_fga_10_16').value ?? 0;
    const c = sh('pct_fga_16_xx').value ?? 0;
    if (a + c <= 0) return null;
    return ((sh('fg_pct_10_16').value ?? 0.4) * a + (sh('fg_pct_16_xx').value ?? 0.4) * c) / (a + c);
  })();
  const attemptsSeason = (fga36 * minutes) / 36;
  const ast = adv('ast_pct').value ?? 8;
  const tov = adv('tov_pct').value ?? 14;
  const prev = prevStats.get(id);
  const ageNow = b.birth ? SEASON - b.birth.year : 27;

  return {
    minutes,
    mpg,
    gamesShare: prev ? clamp(prev.games / 82, 0, 1) : minutes > 0 ? 0.6 : 0.5,
    rimFg: shrink(sh('fg_pct_00_03').value, attemptsSeason * rimShare, 0.6, 60),
    rimVol: fga36 * rimShare,
    fg2: shrink(pg('fg2_pct').value, attemptsSeason * 0.6, 0.5, 80),
    shortFg: shrink(sh('fg_pct_03_10').value, attemptsSeason * 0.15, 0.4, 40),
    midFg: shrink(midFgRaw, attemptsSeason * midShare, 0.38, 60),
    midVol: fga36 * midShare,
    three: shrink(pg('fg3_pct').value, (fg3a36 * minutes) / 36, 0.33, 150),
    threeVol: fg3a36,
    ft: shrink(pg('ft_pct').value, (fta36 * minutes) / 36, 0.72, 60),
    ftr: shrink(adv('fta_per_fga_pct').value, attemptsSeason, 0.22, 150),
    dunk: sh('pct_fga_dunk').value ?? 0.03,
    ast: shrink(ast, minutes, 8, 400),
    astTov: shrink(ast / Math.max(tov, 4), minutes, 0.6, 400),
    tov: shrink(tov, minutes, 14, 400),
    usg: shrink(adv('usg_pct').value, minutes, 16, 400),
    stl: shrink(adv('stl_pct').value, minutes, 1.2, 500),
    blk: shrink(adv('blk_pct').value, minutes, 1.0, 500),
    orb: shrink(adv('orb_pct').value, minutes, 4, 400),
    drb: shrink(adv('drb_pct').value, minutes, 12, 400),
    trb: shrink(adv('trb_pct').value, minutes, 8, 400),
    obpm: shrink(adv('obpm').value, minutes, -2.5, 700),
    dbpm: shrink(adv('dbpm').value, minutes, -0.8, 700),
    bpm: shrink(adv('bpm').value, minutes, -3, 700),
    ppg: shrink(pg('pts_per_g').value, minutes, 8, 700),
    ts: shrink(adv('ts_pct').value, attemptsSeason, 0.53, 200),
    height: b.heightIn,
    weight: b.weightLb,
    youth: -ageNow,
  };
}

/** Each attribute is a weighted mix of metrics; negative weight = lower is better. */
const RECIPES: Record<AttributeKey, [string, number][]> = {
  inside: [['rimFg', 0.4], ['rimVol', 0.35], ['fg2', 0.25]],
  finishing: [['rimFg', 0.4], ['dunk', 0.2], ['ftr', 0.25], ['shortFg', 0.15]],
  midRange: [['midFg', 0.6], ['midVol', 0.4]],
  three: [['three', 0.6], ['threeVol', 0.4]],
  freeThrow: [['ft', 1]],
  passing: [['ast', 0.7], ['astTov', 0.3]],
  ballHandling: [['usg', 0.35], ['ast', 0.35], ['tov', -0.3]],
  vision: [['ast', 0.6], ['astTov', 0.25], ['obpm', 0.15]],
  iq: [['bpm', 0.5], ['ts', 0.2], ['tov', -0.15], ['astTov', 0.15]],
  perimeterD: [['stl', 0.4], ['dbpm', 0.4], ['height', -0.2]],
  interiorD: [['blk', 0.45], ['drb', 0.25], ['dbpm', 0.3]],
  rebounding: [['trb', 0.7], ['orb', 0.15], ['drb', 0.15]],
  steals: [['stl', 1]],
  blocks: [['blk', 1]],
  speed: [['height', -0.5], ['weight', -0.2], ['youth', 0.15], ['stl', 0.15]],
  strength: [['weight', 0.6], ['orb', 0.15], ['ftr', 0.15], ['height', 0.1]],
  vertical: [['blk', 0.3], ['dunk', 0.4], ['youth', 0.15], ['orb', 0.15]],
  stamina: [['mpg', 0.8], ['gamesShare', 0.2]],
  durability: [['gamesShare', 0.7], ['youth', 0.3]],
};

/** Percentile of v within a sorted list, 0..1. */
function percentile(sorted: number[], v: number): number {
  if (!sorted.length) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((sorted[mid] as number) < v) lo = mid + 1;
    else hi = mid;
  }
  let eq = lo;
  while (eq < sorted.length && sorted[eq] === v) eq++;
  return ((lo + eq) / 2) / sorted.length;
}

const people = [...bios.values()];
const metrics = new Map(people.map((b) => [b.id, metricsFor(b)]));
// Reference pool: real rotation players.
const pool = people.filter((b) => (metrics.get(b.id)?.minutes ?? 0) >= 400);
const sortedOf = (key: string, list = pool) => list.map((b) => metrics.get(b.id)?.[key] ?? 0).sort((a, z) => a - z);
const metricKeys = [...new Set(Object.values(RECIPES).flatMap((r) => r.map(([k]) => k))), 'impact'];
// Impact: box plus-minus and minutes, plus scoring load, which 2K-style
// ratings reward heavily (a 26-point scorer is a star even with a modest BPM).
for (const m of metrics.values()) m.impact = 0.5 * m.bpm + 0.12 * (m.mpg - 20) + 0.38 * (m.ppg - 12);
const sorted = new Map(metricKeys.map((k) => [k, sortedOf(k)]));

function composite(m: Metrics, key: AttributeKey): number {
  return RECIPES[key].reduce((s, [k, w]) => {
    const p = percentile(sorted.get(k) ?? [], m[k] ?? 0);
    return s + (w >= 0 ? w * p : -w * (1 - p));
  }, 0);
}
const compositeSorted = new Map(
  ATTRIBUTE_KEYS.map((key) => [key, pool.map((b) => composite(metrics.get(b.id)!, key)).sort((a, z) => a - z)]),
);

/** Map an impact percentile onto the game's overall scale. */
function targetOverall(p: number): number {
  const knots: [number, number][] = [[0, 44], [0.1, 51], [0.3, 58], [0.5, 64], [0.7, 70], [0.85, 77], [0.95, 85], [0.99, 92], [1, 97]];
  for (let i = 1; i < knots.length; i++) {
    const [p1, o1] = knots[i] as [number, number];
    const [p0, o0] = knots[i - 1] as [number, number];
    if (p <= p1) return o0 + ((p - p0) / (p1 - p0)) * (o1 - o0);
  }
  return 95;
}

const DRAFT_TARGET = (d: { round: number; pick: number } | undefined) =>
  !d ? 47 : d.round === 1 ? 68 - (d.pick - 1) * 0.45 : 51;

function ratePlayer(b: Bio, rng: Rng): { attributes: Attributes; potential: number } {
  const m = metrics.get(b.id)!;
  const draft = drafts.get(b.id);
  const age = b.birth ? SEASON - b.birth.year : 27;

  let attrs = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const p = percentile(compositeSorted.get(key) ?? [], composite(m, key));
    attrs[key] = clamp(Math.round(1.5 + 17 * p), 1, 20);
  }
  if (process.env.DEBUG_PLAYER === b.id) {
    console.log('metrics', JSON.stringify(m));
    console.log('pct', JSON.stringify(Object.fromEntries(['trb', 'blk', 'stl', 'impact'].map((k) => [k, percentile(sorted.get(k) ?? [], m[k] ?? 0)]))));
    console.log('raw attrs', JSON.stringify(attrs));
  }
  let target = targetOverall(percentile(sorted.get('impact') ?? [], m.impact));
  // Little NBA evidence (rookies, injured players): lean on draft position.
  if (m.minutes < 300) {
    const w = m.minutes / 300;
    const fallback = generateAttributes(rng, b.pos, Math.round(DRAFT_TARGET(draft)));
    for (const key of ATTRIBUTE_KEYS) attrs[key] = clamp(Math.round(attrs[key] * w + fallback[key] * (1 - w)), 1, 20);
    target = target * w + DRAFT_TARGET(draft) * (1 - w);
  }
  // Keep the stat profile's shape, but anchor the level to real impact.
  const goal = Math.round(0.2 * overall(attrs, b.pos) + 0.8 * target);
  for (let i = 0; i < 4; i++) {
    const diff = goal - overall(attrs, b.pos);
    if (diff === 0) break;
    const shift = diff / 3.7;
    const next = {} as Attributes;
    for (const key of ATTRIBUTE_KEYS) next[key] = clamp(Math.round(attrs[key] + shift), 1, 20);
    attrs = next;
  }
  const ovr = overall(attrs, b.pos);
  const growth = age <= 21 ? rng.int(8, 15) : age <= 23 ? rng.int(4, 10) : age <= 25 ? rng.int(1, 5) : age <= 27 ? rng.int(0, 2) : 0;
  return { attributes: attrs, potential: clamp(ovr + growth, ovr, 99) };
}

// ---------------------------------------------------------------- contracts

const cba = readCba();
const contracts = new Map<string, Contract>();
for (const rt of REAL_TEAMS) {
  for (const r of readTable(page(`/contracts/${rt.bref}.html`), 'contracts')) {
    const id = r.player?.id;
    if (!id) continue;
    const years: Contract['years'] = [];
    let option: Contract['option'] = null;
    for (let i = 1; i <= 6; i++) {
      const c = r[`y${i}`];
      const v = num(c);
      if (!c || !v) continue;
      const season = SEASON + i - 1;
      years.push({ season, salary: v });
      if (/salary-pl/.test(c.className)) option = { season, type: 'player' };
      else if (/salary-tm/.test(c.className) && !option) option = { season, type: 'team' };
    }
    if (years.length && years[0]?.season === SEASON) {
      contracts.set(id, { years, option, kind: 'standard', noTrade: false, signedSeason: SEASON });
    }
  }
}

// ---------------------------------------------------------------- assemble

const rng = new Rng(END_YEAR * 7919);
const players: Player[] = [];
let twoWay = 0;
for (const b of people) {
  const { attributes, potential } = ratePlayer(b, new Rng([...b.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17)));
  const draft = drafts.get(b.id) ?? null;
  let contract: Contract | null = null;
  if (b.teamId) {
    const c = contracts.get(b.id);
    if (c) {
      const first = c.years[0]?.salary ?? 0;
      const kind: Contract['kind'] =
        draft?.round === 1 && b.experience <= 3
          ? 'rookie'
          : first >= maxSalaryShare(b.experience) * cba.salaryCap * 0.97
            ? 'max'
            : first <= cba.minimumSalary * 1.05
              ? 'minimum'
              : 'standard';
      contract = { ...c, kind };
    } else {
      twoWay++;
      contract = buildContract(rng, cba, { firstSeason: SEASON, signedSeason: SEASON, firstYearSalary: Math.round(cba.minimumSalary * 0.5), years: 1, kind: 'two-way' });
    }
  }
  const pRng = new Rng([...b.id].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5));
  const trait = () => clamp(Math.round(pRng.normal(11, 3)), 1, 20);
  players.push({
    id: b.id,
    firstName: b.firstName,
    lastName: b.lastName,
    teamId: b.teamId,
    position: b.pos,
    jersey: b.jersey,
    born: { year: b.birth?.year ?? SEASON - 27, country: b.country },
    heightCm: Math.round(b.heightIn * 2.54),
    weightKg: Math.round(b.weightLb * 0.4536),
    attributes,
    personality: { workEthic: trait(), consistency: trait(), ego: trait(), loyalty: trait(), injuryProneness: trait() },
    potential,
    contract,
    draft,
    experience: b.experience,
    ...(b.college ? { college: b.college } : {}),
  });
}

// Staff: real head coaches; the rest of each staff is generated.
const staff: Staff[] = [];
let staffId = 0;
const makeStaff = (teamId: string | null, role: Staff['role'], name?: string): Staff => {
  const region = rng.weighted(STAFF_REGIONS);
  const parts = name ? splitName(name) : { firstName: rng.pick(region.first), lastName: rng.pick(region.last) };
  const r = (boost = 0) => clamp(Math.round(rng.normal(10 + boost, 3)), 1, 20);
  staffId++;
  return {
    id: `s${String(staffId).padStart(4, '0')}`,
    ...parts,
    teamId,
    role,
    born: { year: SEASON - rng.int(role === 'HC' ? 38 : 28, 64), country: name ? 'USA' : rng.weighted(region.countries) },
    ratings: {
      tactics: r(role === 'HC' ? 3 : role === 'AC' ? 1 : -3),
      development: r(role === 'DEV' ? 4 : 0),
      motivation: r(role === 'HC' ? 2 : 0),
      judgment: r(role === 'SCOUT' ? 3 : 0),
      medical: r(role === 'MED' ? 5 : -5),
      scouting: r(role === 'SCOUT' ? 4 : -2),
    },
    contract: teamId ? { salary: role === 'HC' ? rng.int(40, 120) * 100_000 : rng.int(3, 20) * 100_000, endSeason: SEASON + rng.int(0, 4) } : null,
  };
};
for (const t of teams) {
  staff.push(makeStaff(t.id, 'HC', coaches.get(t.id)));
  for (const role of ['AC', 'AC', 'SCOUT', 'SCOUT', 'MED', 'DEV'] as const) staff.push(makeStaff(t.id, role));
}
for (let i = 0; i < 15; i++) staff.push(makeStaff(null, rng.pick(['AC', 'SCOUT', 'DEV', 'MED'] as const)));

// Real birth year, nationality and photo for head coaches, if coaches.ts has run.
const coachesFile = join(cacheDir, 'coaches.json');
if (existsSync(coachesFile)) {
  const coaches = JSON.parse(readFileSync(coachesFile, 'utf8')) as Record<string, { birthYear?: number; country?: string; photo?: Staff['photo'] }>;
  for (const s of staff) {
    if (s.role !== 'HC') continue;
    const info = coaches[`${s.firstName} ${s.lastName}`];
    if (!info) continue;
    if (info.birthYear) s.born.year = info.birthYear;
    if (info.country) s.born.country = info.country;
    if (info.photo) s.photo = info.photo;
  }
  console.log(`Coaches: ${staff.filter((s) => s.role === 'HC' && s.photo).length} head coach photos`);
}

// Face positions for photo framing, if faces.ts has run.
function applyFaces() {
const facesFile = join(cacheDir, 'faces.json');
if (existsSync(facesFile)) {
  const faces = JSON.parse(readFileSync(facesFile, 'utf8')) as Record<string, ImageFocus | null>;
  let n = 0;
  for (const person of [...players, ...staff]) {
    const f = person.photo ? faces[person.photo.url] : undefined;
    if (person.photo && f) {
      person.photo.focus = f;
      n++;
    }
  }
  console.log(`Faces: ${n} photos framed`);
}
}

// Future picks: who owns traded picks isn't on these pages, so every team starts with its own.
const draftPicks: DraftPick[] = [];
for (let s = END_YEAR; s < END_YEAR + 7; s++) {
  for (const t of teams) {
    for (const round of [1, 2] as const) {
      draftPicks.push({ id: `pk-${s}-${round}-${t.abbrev.toLowerCase()}`, season: s, round, originalTeamId: t.id, ownerTeamId: t.id, protection: null });
    }
  }
}

// Free-licensed photos and logos, if images.ts has run.
const imagesFile = join(cacheDir, 'images.json');
if (existsSync(imagesFile)) {
  const images = JSON.parse(readFileSync(imagesFile, 'utf8')) as { players: Record<string, Player['photo'] | null>; teams: Record<string, Pick<Team, 'logo' | 'wordmark'>> };
  for (const p of players) {
    const photo = images.players[p.id];
    if (photo) p.photo = photo;
  }
  for (const t of teams) Object.assign(t, images.teams[t.id] ?? {});
  console.log(`Images: ${players.filter((p) => p.photo).length} player photos, ${teams.filter((t) => t.logo).length} logos, ${teams.filter((t) => t.wordmark).length} wordmarks`);
}

// Official NBA.com headshots and logos, if official.ts has run (private use only).
const officialFile = join(cacheDir, 'official.json');
if (existsSync(officialFile)) {
  const official = JSON.parse(readFileSync(officialFile, 'utf8')) as { players: Record<string, string>; teams: Record<string, number> };
  let n = 0;
  for (const p of players) {
    const id = official.players[p.id];
    if (id) {
      p.photo = headshot(id);
      n++;
    }
  }
  for (const t of teams) {
    const id = official.teams[t.abbrev];
    if (id) {
      t.logo = teamLogo(id);
      delete t.wordmark;
    }
  }
  console.log(`Official: ${n} NBA.com headshots, ${teams.filter((t) => t.logo?.source === 'NBA.com').length} logos`);
}
applyFaces();

// Arena photos for page covers, if arenas.ts has run (free-licensed, Commons).
const arenasFile = join(cacheDir, 'arenas.json');
if (existsSync(arenasFile)) {
  const arenas = JSON.parse(readFileSync(arenasFile, 'utf8')) as Record<string, Team['arenaPhoto']>;
  for (const t of teams) if (arenas[t.id]) t.arenaPhoto = arenas[t.id];
  console.log(`Arenas: ${teams.filter((t) => t.arenaPhoto).length} arena photos`);
}

const league: LeagueFile = {
  format: LEAGUE_FORMAT,
  version: LEAGUE_FORMAT_VERSION,
  meta: { name: `NBA ${SEASON}-${String(END_YEAR).slice(2)} (imported)`, season: SEASON, source: 'real', createdAt: new Date().toISOString(), ...(existsSync(officialFile) ? { logo: leagueLogo } : {}) },
  settings: cba,
  conferences: structuredClone(CONFERENCES),
  teams,
  players,
  staff,
  draftPicks,
};

const check = validateLeague(JSON.parse(JSON.stringify(league)));
if (!check.ok) {
  console.error('League failed validation:\n' + check.errors.join('\n'));
  process.exit(1);
}
writeFileSync(outFile, JSON.stringify(league));
const rostered = players.filter((p) => p.teamId);
console.log(`Wrote ${outFile}: ${teams.length} teams, ${rostered.length} rostered (${twoWay} two-way), ${players.length - rostered.length} free agents, ${drafts.size} draft records`);
if (check.warnings.length) console.log(`${check.warnings.length} warnings, e.g. ${check.warnings.slice(0, 3).join(' | ')}`);
