// Uploads a built league file and its manifest to the private Supabase
// storage bucket, where signed-in players' games download it automatically.
//
//   npm run import:publish -- <league.json> <https://<ref>.supabase.co>
//
// The project's secret key must reach Supabase in the `apikey` header. In a
// Claude Code cloud session it is injected by the network proxy; elsewhere set
// SUPABASE_SECRET_KEY.

import { readFileSync } from 'node:fs';
import type { LeagueFile } from '../../src/engine/types';
import { validateLeague } from '../../src/engine/validate';

const [leagueFile, projectUrl] = process.argv.slice(2);
if (!leagueFile || !projectUrl) throw new Error('usage: publish.ts <league.json> <https://<ref>.supabase.co>');
const key = process.env.SUPABASE_SECRET_KEY ?? 'injected-by-proxy';
const bucket = 'leagues';

async function upload(path: string, body: string, cacheSeconds: number) {
  const res = await fetch(`${projectUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json', 'x-upsert': 'true', 'cache-control': `max-age=${cacheSeconds}` },
    body,
  });
  if (!res.ok) throw new Error(`upload ${path}: HTTP ${res.status} ${await res.text()}`);
}

async function main() {
  const text = readFileSync(leagueFile!, 'utf8');
  const league = JSON.parse(text) as LeagueFile;
  const check = validateLeague(league);
  if (!check.ok) throw new Error(`invalid league: ${check.errors[0]}`);
  const version = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  const file = `league-${version}.json`;
  await upload(file, text, 31536000);
  const manifest = {
    version,
    file,
    name: league.meta.name.replace(' (imported)', ''),
    season: league.meta.season,
    updatedAt: new Date().toISOString(),
    players: league.players.length,
    photos: league.players.filter((p) => p.photo).length,
  };
  // The manifest changes on every publish, so it is cached only briefly.
  await upload('manifest.json', JSON.stringify(manifest), 60);
  console.log(`Published ${file}: ${manifest.players} players, ${manifest.photos} photos`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
