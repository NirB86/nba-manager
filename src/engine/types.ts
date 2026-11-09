// League file format, version 2 (version 1 = the same without images).
// The engine never hard-codes league content: everything a career starts from
// lives in a LeagueFile (generated, imported from real data, or hand-edited).
// See docs/league-format.md for the human-readable spec.

export const LEAGUE_FORMAT = 'nbam-league';
export const LEAGUE_FORMAT_VERSION = 7;

export type Id = string;
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export const POSITIONS: readonly Position[] = ['PG', 'SG', 'SF', 'PF', 'C'];

export type Market = 'small' | 'mid' | 'large';

export interface LeagueFile {
  format: typeof LEAGUE_FORMAT;
  version: number;
  meta: LeagueMeta;
  settings: CbaSettings;
  conferences: Conference[];
  teams: Team[];
  players: Player[];
  staff: Staff[];
  draftPicks: DraftPick[];
  /** Optional (format v7): salary still owed to waived players, counted on the cap. */
  deadMoney?: DeadMoney[];
}

export interface DeadMoney {
  teamId: Id;
  playerId: Id;
  name: string;
  years: { season: number; salary: number }[];
}

export interface LeagueMeta {
  name: string;
  /** Season the league starts in, as the year it begins (2026 = the 2026-27 season). */
  season: number;
  source: 'fictional' | 'real' | 'custom';
  createdAt: string;
  /** Seed used by the fictional generator, so a league can be recreated. */
  seed?: number;
  /** League logo, shown on the home screen (version 3). */
  logo?: ImageCredit;
  /** Draft logo, shown with draft picks and on draft day (version 3). */
  draftLogo?: ImageCredit;
}

/** Salary-cap figures in US dollars. Per-season values so leagues can grow the cap. */
export interface CbaSettings {
  salaryCap: number;
  luxuryTax: number;
  firstApron: number;
  secondApron: number;
  minimumSalary: number;
  maximumSalaryPct: number; // share of the cap for a top max contract
  rosterMax: number;
  rosterMin: number;
  twoWaySlots: number;
  /** Yearly cap growth applied when projecting future seasons. */
  capGrowth: number;
}

export interface Conference {
  id: Id;
  name: string;
  divisions: Division[];
}

export interface Division {
  id: Id;
  name: string;
}

/** A free-licensed image with the credit its license requires. */
export interface ImageCredit {
  url: string;
  credit: string;
  license: string;
  source: string;
  sourceUrl: string;
  /** Where the face is (fractions of width/height), so displays can frame a headshot. */
  focus?: { x: number; y: number; w: number; aspect: number };
  /** Licensed for non-commercial use only (CC BY-NC / BY-NC-SA). */
  nonCommercial?: boolean;
}

export interface Team {
  id: Id;
  city: string;
  name: string;
  abbrev: string;
  conferenceId: Id;
  divisionId: Id;
  market: Market;
  colors: { primary: string; secondary: string };
  arena: string;
  /** Optional (format v2): team logo and wordmark images. */
  logo?: ImageCredit;
  wordmark?: ImageCredit;
  /** Optional (format v4): photo of the home arena, used on page covers. */
  arenaPhoto?: ImageCredit;
  /** Optional (format v6): the team's city (skyline or landmark), shown when choosing a team. */
  cityPhoto?: ImageCredit;
}

/** Attribute scale is 1-20, like Football Manager. */
export interface Attributes {
  // Scoring
  inside: number;
  midRange: number;
  three: number;
  freeThrow: number;
  finishing: number;
  // Playmaking
  passing: number;
  ballHandling: number;
  vision: number;
  // Defense
  perimeterD: number;
  interiorD: number;
  rebounding: number;
  steals: number;
  blocks: number;
  // Physical
  speed: number;
  strength: number;
  vertical: number;
  stamina: number;
  durability: number;
  // Mental
  iq: number;
}

/** Hidden traits: never shown as exact numbers in the UI. */
export interface Personality {
  workEthic: number;
  consistency: number;
  ego: number;
  loyalty: number;
  injuryProneness: number;
}

export interface Contract {
  /** Salary per season, first entry = current season. */
  years: { season: number; salary: number }[];
  option: { season: number; type: 'player' | 'team' } | null;
  kind: 'standard' | 'rookie' | 'two-way' | 'minimum' | 'max';
  noTrade: boolean;
  signedSeason: number;
}

export interface Player {
  id: Id;
  firstName: string;
  lastName: string;
  /** null = free agent */
  teamId: Id | null;
  position: Position;
  jersey: number;
  born: { year: number; country: string };
  heightCm: number;
  weightKg: number;
  attributes: Attributes;
  personality: Personality;
  /** Ceiling on the 1-100 overall scale. */
  potential: number;
  contract: Contract | null;
  draft: { season: number; round: number; pick: number; teamId: Id } | null;
  /** Years in the league before the current season. */
  experience: number;
  /** Optional (format v2): a free-licensed photo. */
  photo?: ImageCredit;
  /** Optional (format v5): college(s) attended, e.g. "Duke". */
  college?: string;
}

export type StaffRole = 'HC' | 'AC' | 'SCOUT' | 'MED' | 'DEV';

export interface Staff {
  id: Id;
  firstName: string;
  lastName: string;
  teamId: Id | null;
  role: StaffRole;
  born: { year: number; country: string };
  ratings: {
    tactics: number;
    development: number;
    motivation: number;
    judgment: number;
    medical: number;
    scouting: number;
  };
  contract: { salary: number; endSeason: number } | null;
  /** Optional (format v2): a free-licensed photo. */
  photo?: ImageCredit;
}

export interface DraftPick {
  id: Id;
  season: number;
  round: 1 | 2;
  originalTeamId: Id;
  ownerTeamId: Id;
  protection: string | null;
}
