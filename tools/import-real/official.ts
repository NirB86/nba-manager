// Official NBA.com headshots and team logos for the private, personal-use
// league file. Nothing is downloaded or re-hosted: the league file only links
// to the images on the NBA's CDN, and the browser of the signed-in owner loads
// them. Player IDs come from Wikidata (NBA.com player ID, P3647), matched by
// Basketball-Reference ID (P2685). Results go to <cache-dir>/official.json,
// which build.ts prefers over the free-licensed images.
//
// The output is private: never commit official.json or a league file that
// uses it (see CLAUDE.md).
//
//   npm run import:official -- <cache-dir>

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit } from '../../src/engine/types';

const UA = 'nba-manager-import/0.1 (https://github.com/NirB86/nba-manager; personal non-commercial project)';

/** NBA team IDs (public, used in every NBA.com URL), by our abbreviation. */
export const NBA_TEAM_IDS: Record<string, number> = {
  ATL: 1610612737, BOS: 1610612738, CLE: 1610612739, NOP: 1610612740, CHI: 1610612741, DAL: 1610612742,
  DEN: 1610612743, GSW: 1610612744, HOU: 1610612745, LAC: 1610612746, LAL: 1610612747, MIA: 1610612748,
  MIL: 1610612749, MIN: 1610612750, BKN: 1610612751, NYK: 1610612752, ORL: 1610612753, IND: 1610612754,
  PHI: 1610612755, PHX: 1610612756, POR: 1610612757, SAC: 1610612758, SAS: 1610612759, OKC: 1610612760,
  TOR: 1610612761, UTA: 1610612762, MEM: 1610612763, WAS: 1610612764, DET: 1610612765, CHA: 1610612766,
};

const credit = (url: string, sourceUrl: string): ImageCredit => ({
  url,
  credit: 'NBA.com',
  license: '© NBA Properties, Inc. Linked for private personal use only.',
  source: 'NBA.com',
  sourceUrl,
});

/** The league logo on NBA.com and the latest draft logo (from Wikipedia: NBA.com has no stable link). */
export const leagueLogo = credit('https://cdn.nba.com/logos/leagues/logo-nba.svg', 'https://www.nba.com/');
export const draftLogo: ImageCredit = {
  url: 'https://upload.wikimedia.org/wikipedia/en/e/e0/2025_NBA_draft_logo.png',
  credit: 'NBA',
  license: '© NBA Properties, Inc. Linked for private personal use only.',
  source: 'Wikipedia',
  sourceUrl: 'https://en.wikipedia.org/wiki/File:2025_NBA_draft_logo.png',
};

export const headshot = (nbaId: string) => credit(`https://cdn.nba.com/headshots/nba/latest/1040x760/${nbaId}.png`, `https://www.nba.com/player/${nbaId}`);
export const teamLogo = (teamId: number) => credit(`https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`, `https://www.nba.com/team/${teamId}`);

async function main() {
  const [cacheDir] = process.argv.slice(2);
  if (!cacheDir) throw new Error('usage: official.ts <cache-dir>');
  const query = 'SELECT ?bref ?nba WHERE { ?item wdt:P2685 ?bref ; wdt:P3647 ?nba . }';
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`);
  const rows = (await res.json()).results.bindings as Record<string, { value: string }>[];
  // P2685 values look like "v/vanbrbu01": the player page path without ".html".
  const players: Record<string, string> = {};
  for (const r of rows) if (r.bref && r.nba) players[r.bref.value.split('/').pop()!] = r.nba.value;
  writeFileSync(join(cacheDir, 'official.json'), JSON.stringify({ players, teams: NBA_TEAM_IDS }, null, 1));
  console.log(`Official: ${Object.keys(players).length} NBA.com player IDs, ${Object.keys(NBA_TEAM_IDS).length} teams`);
}

if (process.argv[1]?.endsWith('official.ts')) main();
