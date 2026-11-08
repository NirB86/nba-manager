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

/** Copy photos, logos and (same season only) ratings from the latest league into a career, by id. */
export function withLatestImages(save: SaveGame, latest: CachedLeague | undefined): SaveGame {
  if (!latest || save.league.meta.source !== 'real' || save.leagueVersion === latest.manifest.version) return save;
  const src: LeagueFile = latest.league;
  const photos = new Map(src.players.filter((p) => p.photo).map((p) => [p.id, p.photo]));
  // Re-rated players: only while the career is still in the file's season, so no development is lost.
  const sameSeason = save.league.meta.season === src.meta.season;
  const rated = new Map(src.players.map((p) => [p.id, p]));
  const teams = new Map(src.teams.map((t) => [t.id, t]));
  const staffById = new Map(src.staff.map((m) => [m.id, m]));
  return {
    ...save,
    leagueVersion: latest.manifest.version,
    league: {
      ...save.league,
      meta: { ...save.league.meta, logo: src.meta.logo ?? save.league.meta.logo, draftLogo: src.meta.draftLogo },
      players: save.league.players.map((p) => {
        const r = sameSeason ? rated.get(p.id) : undefined;
        const withRatings = r ? { ...p, attributes: r.attributes, potential: r.potential, college: r.college ?? p.college, jersey: r.teamId === p.teamId ? r.jersey : p.jersey } : p;
        return photos.get(p.id) ? { ...withRatings, photo: photos.get(p.id) } : withRatings;
      }),
      staff: save.league.staff.map((m) => {
        const s = staffById.get(m.id);
        return s && s.role === 'HC' && s.firstName === m.firstName && s.lastName === m.lastName ? { ...m, born: s.born, photo: s.photo ?? m.photo } : m;
      }),
      teams: save.league.teams.map((t) => {
        const s = teams.get(t.id);
        // A new logo replaces the old logo and wordmark together.
        return s ? { ...t, ...(s.logo ? { logo: s.logo, wordmark: s.wordmark } : {}), arenaPhoto: s.arenaPhoto ?? t.arenaPhoto } : t;
      }),
    },
  };
}
