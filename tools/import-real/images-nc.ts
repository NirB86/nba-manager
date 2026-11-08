// Third image pass: players still without a photo get a Creative Commons
// NonCommercial photo (CC BY-NC / BY-NC-SA) from Openverse, mostly Flickr.
// Allowed only while the game stays non-commercial (no ads, paid features or
// donation asks); each is flagged nonCommercial so they can be removed together.
// NoDerivatives licenses are excluded, since framing a photo may count as an
// adaptation. A result counts only if its title names the player.
//
//   npm run import:images-nc -- <cache-dir> <league.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit, LeagueFile } from '../../src/engine/types';

const UA = 'nba-manager-import/0.1 (https://github.com/NirB86/nba-manager; personal non-commercial project)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

async function search(first: string, last: string): Promise<ImageCredit | null> {
  const name = `${first} ${last}`;
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(`"${name}"`)}&license=by-nc,by-nc-sa&page_size=20&mature=false`;
  let res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  for (let i = 1; res.status === 429 && i <= 4; i++) {
    await sleep(20_000 * i);
    res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { results?: any[] };
  const want = fold(name);
  for (const r of data.results ?? []) {
    const title = fold(r.title ?? '');
    if (!title.includes(want) || /\b(vs|versus|and|with|team|fans)\b/.test(title)) continue;
    const lic = String(r.license).toUpperCase();
    if (!/^BY-NC(-SA)?$/.test(lic)) continue;
    return {
      url: r.thumbnail ?? r.url,
      credit: (r.creator ?? 'Unknown author').slice(0, 120),
      license: `CC ${lic}${r.license_version ? ` ${r.license_version}` : ''}`,
      source: r.source === 'flickr' ? 'Flickr via Openverse' : 'Openverse',
      sourceUrl: r.foreign_landing_url ?? r.url,
      nonCommercial: true,
    };
  }
  return null;
}

async function main() {
  const [cacheDir, leagueFile] = process.argv.slice(2);
  if (!cacheDir || !leagueFile) throw new Error('usage: images-nc.ts <cache-dir> <league.json>');
  const league = JSON.parse(readFileSync(leagueFile, 'utf8')) as LeagueFile;
  const cachePath = join(cacheDir, 'images.json');
  const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as { players: Record<string, ImageCredit | null>; ncTried?: string[] };
  const tried = new Set(cache.ncTried ?? []);
  // Rostered players first; free agents matter less.
  const missing = league.players.filter((p) => !cache.players[p.id] && !tried.has(p.id)).sort((a, b) => Number(!a.teamId) - Number(!b.teamId));
  console.log(`Non-commercial pass: searching ${missing.length} players`);
  let found = 0;
  for (const p of missing) {
    try {
      const photo = await search(p.firstName, p.lastName);
      if (photo) {
        cache.players[p.id] = photo;
        found++;
        console.log(`  + ${p.firstName} ${p.lastName}: ${photo.license}`);
      }
      tried.add(p.id);
      cache.ncTried = [...tried];
      writeFileSync(cachePath, JSON.stringify(cache));
    } catch (e) {
      console.warn(`  stopped at ${p.firstName} ${p.lastName}: ${(e as Error).message} (re-run later to continue)`);
      break;
    }
    await sleep(4000);
  }
  console.log(`Non-commercial pass: found ${found}; photos now ${league.players.filter((p) => cache.players[p.id]).length}/${league.players.length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
