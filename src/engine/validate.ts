import { ATTRIBUTE_KEYS } from './ratings';
import { LEAGUE_FORMAT, LEAGUE_FORMAT_VERSION, POSITIONS, type LeagueFile } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Check that unknown JSON is a usable league file. Returns every problem
 * found (up to a limit) so a league author can fix them in one go.
 */
export function validateLeague(data: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => {
    if (errors.length < 50) errors.push(m);
  };

  if (!isObj(data)) return { ok: false, errors: ['File is not a JSON object.'], warnings };
  if (data.format !== LEAGUE_FORMAT) err(`"format" must be "${LEAGUE_FORMAT}".`);
  if (typeof data.version !== 'number' || data.version > LEAGUE_FORMAT_VERSION) {
    err(`Unsupported "version" (this game reads up to version ${LEAGUE_FORMAT_VERSION}).`);
  }
  if (!isObj(data.meta) || typeof data.meta.season !== 'number') err('"meta.season" is required.');
  for (const t of Array.isArray(data.teams) ? data.teams : []) {
    for (const key of ['arenaPhoto', 'cityPhoto'] as const) {
      const img = isObj(t) ? t[key] : undefined;
      if (img !== undefined && !(isObj(img) && typeof img.url === 'string' && img.url.startsWith('https://'))) err(`Team "${isObj(t) ? t.id : '?'}": ${key} must be an image with an https:// url.`);
    }
  }
  for (const key of ['logo', 'draftLogo'] as const) {
    const img = isObj(data.meta) ? data.meta[key] : undefined;
    if (img !== undefined && !(isObj(img) && typeof img.url === 'string' && img.url.startsWith('https://'))) err(`"meta.${key}" must be an image with an https:// url.`);
  }
  if (!isObj(data.settings) || typeof data.settings.salaryCap !== 'number') err('"settings.salaryCap" is required.');

  for (const key of ['conferences', 'teams', 'players', 'staff', 'draftPicks'] as const) {
    if (!Array.isArray(data[key])) err(`"${key}" must be a list.`);
  }
  if (errors.length) return { ok: false, errors, warnings };

  const league = data as unknown as LeagueFile;
  const divisionIds = new Set(league.conferences.flatMap((c) => c.divisions.map((d) => d.id)));
  const teamIds = new Set<string>();
  for (const t of league.teams) {
    if (!t.id || teamIds.has(t.id)) err(`Team id "${t.id}" is missing or duplicated.`);
    teamIds.add(t.id);
    if (!divisionIds.has(t.divisionId)) err(`Team ${t.id}: unknown division "${t.divisionId}".`);
  }
  if (league.teams.length < 2) err('A league needs at least 2 teams.');

  const playerIds = new Set<string>();
  const rosterSize = new Map<string, number>();
  for (const p of league.players) {
    const label = `Player ${p.id ?? '?'}`;
    if (!p.id || playerIds.has(p.id)) err(`${label}: id missing or duplicated.`);
    playerIds.add(p.id);
    if (p.teamId !== null && !teamIds.has(p.teamId)) err(`${label}: unknown team "${p.teamId}".`);
    if (!POSITIONS.includes(p.position)) err(`${label}: position must be one of ${POSITIONS.join(', ')}.`);
    if (!isObj(p.attributes)) {
      err(`${label}: attributes missing.`);
    } else {
      for (const k of ATTRIBUTE_KEYS) {
        const v = (p.attributes as unknown as Record<string, unknown>)[k];
        if (typeof v !== 'number' || v < 1 || v > 20) err(`${label}: attribute "${k}" must be 1-20.`);
      }
    }
    if (p.teamId && !p.contract) warnings.push(`${label} is on a team without a contract.`);
    if (p.photo && !/^https:\/\//.test(p.photo.url ?? '')) err(`${label}: photo url must start with https://.`);
    if (p.college !== undefined && typeof p.college !== 'string') err(`${label}: college must be text.`);
    if (p.teamId) rosterSize.set(p.teamId, (rosterSize.get(p.teamId) ?? 0) + 1);
  }

  const max = league.settings.rosterMax;
  for (const [teamId, n] of rosterSize) {
    if (n > max + league.settings.twoWaySlots) warnings.push(`${teamId} has ${n} players (max ${max}).`);
  }
  for (const pk of league.draftPicks) {
    if (!teamIds.has(pk.originalTeamId) || !teamIds.has(pk.ownerTeamId)) err(`Draft pick ${pk.id}: unknown team.`);
  }

  return { ok: errors.length === 0, errors, warnings };
}
