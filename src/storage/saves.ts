// Save slots stored on the device in IndexedDB. Each save holds the career
// settings plus the full league state. Cloud sync (Phase 3) will upload the
// same SaveGame objects, so this format is the contract for both.

import type { OffseasonState } from '../game/offseason';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { Rng, newSeason, newSeed, validateLeague, teamName, type LeagueFile, type SeasonState } from '../engine';

export const SAVE_FORMAT = 'nbam-save';
export const SAVE_VERSION = 2;

export type Role = 'gm' | 'gm-coach';
export type SimMode = 'watch' | 'quick' | 'ask';
export type ScoutingDepth = 'light' | 'full';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface CareerSettings {
  teamId: string;
  role: Role;
  simMode: SimMode;
  scouting: ScoutingDepth;
  difficulty: Difficulty;
  /** With "Watch": how to follow games in 2D. */
  watchMode?: 'full' | 'key' | 'crunch';
}

export interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  body: string;
  date: string;
  read: boolean;
  /** A trade offer this message is about (season.offers). */
  offerId?: string;
}

export interface SaveGame {
  format: typeof SAVE_FORMAT;
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  career: CareerSettings;
  inbox: InboxMessage[];
  league: LeagueFile;
  season: SeasonState;
  /** Version of the downloaded NBA league whose photos and logos this save has. */
  leagueVersion?: string;
  /** Between the Finals and the next season: draft, free agency, camp. */
  offseason?: OffseasonState;
  /** Your team's past seasons, oldest first. */
  history?: { season: number; wins: number; losses: number; champion: string | null }[];
}

export interface SaveSummary {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  abbrev: string;
  colors: { primary: string; secondary: string };
  season: number;
  leagueSource: LeagueFile['meta']['source'];
  updatedAt: string;
}

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  saves: { key: string; value: SaveGame };
  summaries: { key: string; value: SaveSummary; indexes: { updatedAt: string } };
}

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  dbPromise ??= openDB<Schema>('nba-manager', 2, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('saves', { keyPath: 'id' });
        const summaries = database.createObjectStore('summaries', { keyPath: 'id' });
        summaries.createIndex('updatedAt', 'updatedAt');
      }
      if (oldVersion < 2) database.createObjectStore('kv');
    },
  });
  return dbPromise;
}

function summarize(save: SaveGame): SaveSummary {
  const team = save.league.teams.find((t) => t.id === save.career.teamId);
  return {
    id: save.id,
    name: save.name,
    teamId: save.career.teamId,
    teamName: team ? teamName(team) : 'Unknown team',
    abbrev: team?.abbrev ?? '???',
    colors: team?.colors ?? { primary: '#64748b', secondary: '#e2e8f0' },
    season: save.league.meta.season,
    leagueSource: save.league.meta.source,
    updatedAt: save.updatedAt,
  };
}

export function newSaveId(): string {
  return `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Small key-value store on the device (the downloaded league lives here). */
export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await db()).put('kv', value, key);
}

export async function listSaves(): Promise<SaveSummary[]> {
  const all = await (await db()).getAll('summaries');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Bring older saves up to the current format. */
export function migrate(save: SaveGame): SaveGame {
  let s = save;
  if (!s.season) s = { ...s, season: newSeason(s.league, new Rng(newSeed())), version: SAVE_VERSION };
  return s;
}

export async function loadSave(id: string): Promise<SaveGame | undefined> {
  const save = await (await db()).get('saves', id);
  return save ? migrate(save) : undefined;
}

export async function putSave(save: SaveGame): Promise<SaveGame> {
  const stamped = { ...save, updatedAt: new Date().toISOString() };
  const database = await db();
  const tx = database.transaction(['saves', 'summaries'], 'readwrite');
  await Promise.all([tx.objectStore('saves').put(stamped), tx.objectStore('summaries').put(summarize(stamped)), tx.done]);
  return stamped;
}

/** Store a save exactly as it is (keeps its timestamp): used for copies coming from the cloud. */
export async function storeSave(save: SaveGame): Promise<void> {
  const database = await db();
  const tx = database.transaction(['saves', 'summaries'], 'readwrite');
  await Promise.all([tx.objectStore('saves').put(save), tx.objectStore('summaries').put(summarize(save)), tx.done]);
}

export async function deleteSave(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['saves', 'summaries'], 'readwrite');
  await Promise.all([tx.objectStore('saves').delete(id), tx.objectStore('summaries').delete(id), tx.done]);
}

/** Ask the browser not to evict our data under storage pressure (best effort). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSave(save: SaveGame) {
  const slug = save.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'career';
  downloadJson(`${slug}-${save.league.meta.season}.nbam-save.json`, save);
}

/** Read a save file chosen by the user and store it as a new slot. */
export async function importSaveFile(file: File): Promise<SaveGame> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const save = data as Partial<SaveGame>;
  if (save.format !== SAVE_FORMAT || !save.career || !save.league) {
    throw new Error('That file is not an NBA Manager save.');
  }
  const check = validateLeague(save.league);
  if (!check.ok) throw new Error(`The save's league data is invalid: ${check.errors[0]}`);
  const imported: SaveGame = migrate({
    ...(save as SaveGame),
    id: newSaveId(),
    inbox: save.inbox ?? [],
    name: `${save.name ?? 'Imported career'}`,
  });
  return putSave(imported);
}
