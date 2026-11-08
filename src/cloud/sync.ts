// Keeps the downloaded NBA league up to date on the device and passes new
// photos and logos on to existing careers.

import type { LeagueFile } from '../engine';
import { kvGet, kvSet, type SaveGame } from '../storage/saves';
import { cloudConfigured, currentUser, fetchLeague, fetchManifest, type CachedLeague } from './cloud';

const KEY = 'nba-league';

export async function cachedLeague(): Promise<CachedLeague | undefined> {
  try {
    return await kvGet<CachedLeague>(KEY);
  } catch {
    return undefined;
  }
}

export type SyncResult = { status: 'updated' | 'current'; league: CachedLeague } | { status: 'signed-out' | 'not-configured' } | { status: 'error'; message: string };

/** Download the league if the cloud has a newer version than this device. */
export async function syncLeague(): Promise<SyncResult> {
  if (!cloudConfigured()) return { status: 'not-configured' };
  try {
    if (!(await currentUser())) return { status: 'signed-out' };
    const manifest = await fetchManifest();
    const have = await cachedLeague();
    if (have && have.manifest.version === manifest.version) return { status: 'current', league: have };
    const league = await fetchLeague(manifest);
    const cached: CachedLeague = { manifest, league };
    await kvSet(KEY, cached);
    return { status: 'updated', league: cached };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Sync failed.' };
  }
}

/** Copy photos and logos from the latest league into a career, matching by id. */
export function withLatestImages(save: SaveGame, latest: CachedLeague | undefined): SaveGame {
  if (!latest || save.league.meta.source !== 'real' || save.leagueVersion === latest.manifest.version) return save;
  const src: LeagueFile = latest.league;
  const photos = new Map(src.players.filter((p) => p.photo).map((p) => [p.id, p.photo]));
  const teams = new Map(src.teams.map((t) => [t.id, t]));
  const staffById = new Map(src.staff.map((m) => [m.id, m]));
  return {
    ...save,
    leagueVersion: latest.manifest.version,
    league: {
      ...save.league,
      meta: { ...save.league.meta, logo: src.meta.logo ?? save.league.meta.logo, draftLogo: src.meta.draftLogo ?? save.league.meta.draftLogo },
      players: save.league.players.map((p) => (photos.get(p.id) ? { ...p, photo: photos.get(p.id) } : p)),
      staff: save.league.staff.map((m) => {
        const s = staffById.get(m.id);
        return s && s.role === 'HC' && s.firstName === m.firstName && s.lastName === m.lastName ? { ...m, born: s.born, photo: s.photo ?? m.photo } : m;
      }),
      teams: save.league.teams.map((t) => {
        const s = teams.get(t.id);
        // A new logo replaces the old logo and wordmark together.
        return s?.logo ? { ...t, logo: s.logo, wordmark: s.wordmark } : t;
      }),
    },
  };
}
