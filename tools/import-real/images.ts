// Finds free-licensed player photos and team logos for the real-league import.
//
// 1. Wikidata links each player's Basketball-Reference ID (P2685) to a
//    Wikimedia Commons photo (P18), and each team to its logo (P154).
// 2. Wikimedia Commons supplies the license, author and a thumbnail URL.
// 3. Openverse (Creative Commons search) fills in players Commons lacks; a
//    result counts only if its title names the player.
//
// Results are cached in <cache-dir>/images.json; build.ts attaches them.
//
//   npm run import:images -- <cache-dir> <league.json>

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit, LeagueFile } from '../../src/engine/types';

const UA = 'nba-manager-import/0.1 (https://github.com/NirB86/nba-manager; personal non-commercial project)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ImageCache {
  players: Record<string, ImageCredit | null>;
  teams: Record<string, { logo?: ImageCredit; wordmark?: ImageCredit }>;
}

async function getJson(url: string, init?: RequestInit): Promise<any> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'user-agent': UA, accept: 'application/json', ...(init?.headers ?? {}) } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) || 15 * (attempt + 1);
      console.warn(`  waiting ${wait}s (HTTP ${res.status})`);
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(`${res.status} ${url.slice(0, 120)}`);
  }
  throw new Error(`rate limited: ${url.slice(0, 120)}`);
}

async function sparql(query: string) {
  const data = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  return data.results.bindings as Record<string, { value: string }>[];
}

const fileName = (commonsUrl: string) => decodeURIComponent(commonsUrl.split('/').pop() ?? '');
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** License, author and a thumbnail for Commons files, 50 per request. */
async function commonsInfo(files: string[], width: number): Promise<Map<string, ImageCredit>> {
  const out = new Map<string, ImageCredit>();
  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i, i + 20);
    const url =
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata' +
      `&iiurlwidth=${width}&titles=${encodeURIComponent(batch.map((f) => `File:${f}`).join('|'))}`;
    const data = await getJson(url);
    const norm = new Map<string, string>((data.query?.normalized ?? []).map((n: any) => [n.to, n.from]));
    for (const page of Object.values<any>(data.query?.pages ?? {})) {
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata ?? {};
      const license = stripHtml(meta.LicenseShortName?.value ?? '');
      // Commons only hosts free content, but skip anything marked non-free just in case.
      if (!license || /non-free|fair use/i.test(license)) continue;
      const title: string = norm.get(page.title) ?? page.title;
      out.set(title.replace(/^File:/, ''), {
        url: info.thumburl ?? info.url,
        credit: stripHtml(meta.Artist?.value ?? 'Unknown author').slice(0, 120),
        license,
        source: 'Wikimedia Commons',
        sourceUrl: info.descriptionurl,
      });
    }
    await sleep(2000);
    if (i % 100 === 0) console.log(`  Commons: ${Math.min(files.length, i + 20)}/${files.length}`);
  }
  return out;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Openverse fallback: a CC photo whose title names the player. */
async function openversePhoto(first: string, last: string): Promise<ImageCredit | null> {
  const name = `${first} ${last}`;
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(`"${name}" basketball`)}&license=by,by-sa,cc0,pdm&page_size=20&mature=false`;
  const data = await getJson(url);
  const want = fold(name);
  for (const r of data.results ?? []) {
    const title = fold(r.title ?? '');
    if (!title.includes(want)) continue;
    // Skip group shots and the like: the title should not name a second "vs" player.
    if (/\b(vs|versus|and|with)\b/.test(title)) continue;
    const license = `${String(r.license).toUpperCase()}${r.license_version ? ` ${r.license_version}` : ''}`.replace('CC0 1.0', 'CC0').replace('PDM 1.0', 'Public domain');
    return {
      url: r.thumbnail ?? r.url,
      credit: (r.creator ?? 'Unknown author').slice(0, 120),
      license: /^(BY|BY-SA)/.test(license) ? `CC ${license}` : license,
      source: r.source === 'flickr' ? 'Flickr via Openverse' : 'Openverse',
      sourceUrl: r.foreign_landing_url ?? r.url,
    };
  }
  return null;
}

async function main() {
  const [cacheDir, leagueFile] = process.argv.slice(2);
  if (!cacheDir || !leagueFile) throw new Error('usage: images.ts <cache-dir> <league.json>');
  const league = JSON.parse(readFileSync(leagueFile, 'utf8')) as LeagueFile;
  const cachePath = join(cacheDir, 'images.json');
  const cache: ImageCache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { players: {}, teams: {} };

  // Players via Wikidata + Commons.
  const rows = await sparql('SELECT ?bref ?image WHERE { ?item wdt:P2685 ?bref ; wdt:P18 ?image . }');
  const imageFor = new Map<string, string>();
  for (const r of rows) {
    const id = r.bref!.value.split('/').pop()!;
    if (!imageFor.has(id)) imageFor.set(id, fileName(r.image!.value));
  }
  const todo = league.players.filter((p) => !(p.id in cache.players));
  const files = [...new Set(todo.map((p) => imageFor.get(p.id)).filter((f): f is string => !!f))];
  console.log(`Wikidata: ${imageFor.size} players with photos; looking up ${files.length} files on Commons`);
  const info = await commonsInfo(files, 400);
  for (const p of todo) {
    const f = imageFor.get(p.id);
    const credit = f ? info.get(f) : undefined;
    if (credit) cache.players[p.id] = credit;
  }

  // Openverse for the rest, politely.
  const missing = league.players.filter((p) => !cache.players[p.id] && !(p.id in cache.players));
  console.log(`Openverse: searching ${missing.length} players`);
  let found = 0;
  for (const p of missing) {
    try {
      const photo = await openversePhoto(p.firstName, p.lastName);
      cache.players[p.id] = photo;
      if (photo) found++;
    } catch (e) {
      console.warn(`openverse ${p.firstName} ${p.lastName}: ${(e as Error).message}`);
      break; // likely rate-limited: keep what we have, re-run later
    }
    writeFileSync(cachePath, JSON.stringify(cache));
    await sleep(3500);
  }
  console.log(`Openverse: found ${found}`);

  // Team logos and wordmarks.
  const teamRows = await sparql(
    'SELECT ?label ?logo WHERE { ?team wdt:P118 wd:Q155223 ; wdt:P31/wdt:P279* wd:Q13393265 ; wdt:P154 ?logo ; rdfs:label ?label . FILTER(LANG(?label) = "en") FILTER NOT EXISTS { ?team wdt:P576 ?end } }',
  );
  const teamFiles = teamRows.map((r) => ({ label: r.label!.value, file: fileName(r.logo!.value) }));
  const teamInfo = await commonsInfo([...new Set(teamFiles.map((t) => t.file))], 300);
  for (const t of league.teams) {
    const mine = teamFiles.filter((r) => r.label === `${t.city} ${t.name}`);
    const entry: ImageCache['teams'][string] = {};
    for (const r of mine) {
      const credit = teamInfo.get(r.file);
      if (!credit) continue;
      if (/wordmark|script/i.test(r.file)) entry.wordmark ??= credit;
      else entry.logo ??= credit;
    }
    cache.teams[t.id] = entry;
  }

  writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  const withPhoto = league.players.filter((p) => cache.players[p.id]).length;
  console.log(`Photos: ${withPhoto}/${league.players.length} players. Logos: ${Object.values(cache.teams).filter((t) => t.logo).length} teams, wordmarks: ${Object.values(cache.teams).filter((t) => t.wordmark).length}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
