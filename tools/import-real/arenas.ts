// Arena photos for the page covers: free-licensed Wikimedia Commons images,
// found on Wikidata by the arena name in the league file (fallback: the
// team's home venue). Results go to <cache-dir>/arenas.json; build.ts adds
// them to each team as \`arenaPhoto\`.
//
//   npm run import:arenas -- <cache-dir> <league.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit, LeagueFile } from '../../src/engine/types';
import { commonsInfo, fileName, sparql } from './images';

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  const [cacheDir, leagueFile] = process.argv.slice(2);
  if (!cacheDir || !leagueFile) throw new Error('usage: arenas.ts <cache-dir> <league.json>');
  const league = JSON.parse(readFileSync(leagueFile, 'utf8')) as LeagueFile;
  const names = league.teams.map((t) => fold(t.arena ?? '')).filter(Boolean);

  // 1. Venues whose English label is one of our arena names.
  const values = league.teams.map((t) => `"${(t.arena ?? '').replace(/ \(.*\)$/, '')}"@en`).join(' ');
  const byName = await sparql(`SELECT ?label ?img WHERE { VALUES ?label { ${values} } ?venue rdfs:label ?label ; wdt:P18 ?img . }`);
  // 2. Fallback: each NBA team's home venue.
  const byTeam = await sparql(
    'SELECT ?teamLabel ?img WHERE { ?team wdt:P118 wd:Q155223 ; wdt:P115 ?venue . ?venue wdt:P18 ?img . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }',
  );

  const pick = new Map<string, string>();
  for (const t of league.teams) {
    const arena = fold(t.arena ?? '');
    const hit = byName.find((r) => fold(r.label!.value) === arena) ?? byTeam.find((r) => fold(r.teamLabel!.value) === fold(`${t.city} ${t.name}`));
    if (hit) pick.set(t.id, fileName(hit.img!.value));
  }
  const info = await commonsInfo([...new Set(pick.values())], 1600);
  const out: Record<string, ImageCredit> = {};
  for (const [teamId, file] of pick) {
    const credit = info.get(file);
    if (credit) out[teamId] = credit;
  }
  writeFileSync(join(cacheDir, 'arenas.json'), JSON.stringify(out, null, 1));
  console.log(`Arenas: ${Object.keys(out).length} of ${league.teams.length} teams (${names.length} arena names)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
