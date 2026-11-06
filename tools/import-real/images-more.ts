// Second pass for images: fills players and teams that images.ts left empty.
//
// Players: the player's Wikimedia Commons category (Wikidata P373), then a
//   Commons file search by full name. Only single-person photos whose file
//   name contains the player's name are accepted.
// Teams: a Commons file search for the team's logo; only public-domain files
//   (logos too simple for copyright) are used, and old logos are skipped.
//
//   npm run import:images-more -- <cache-dir> <league.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit, LeagueFile } from '../../src/engine/types';

const UA = 'nba-manager-import/0.1 (https://github.com/NirB86/nba-manager; personal non-commercial project)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after')) || 15 * (attempt + 1);
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(`${res.status} ${url.slice(0, 100)}`);
  }
  throw new Error(`gave up: ${url.slice(0, 100)}`);
}

const api = (params: Record<string, string>) => getJson(`https://commons.wikimedia.org/w/api.php?format=json&${new URLSearchParams(params)}`);

async function fileInfo(title: string, width: number): Promise<ImageCredit | null> {
  const data = await api({ action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: String(width), titles: title });
  const page = Object.values<any>(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const license = stripHtml(meta.LicenseShortName?.value ?? '');
  if (!license || /non-free|fair use/i.test(license)) return null;
  return {
    url: info.thumburl ?? info.url,
    credit: stripHtml(meta.Artist?.value ?? 'Unknown author').slice(0, 120) || 'Unknown author',
    license,
    source: 'Wikimedia Commons',
    sourceUrl: info.descriptionurl,
  };
}

const PHOTO = /\.(jpe?g|png|webp)$/i;
const GROUP = /\b(and|vs|versus|with|team|teammates|celebrat|huddle|bench|fans|signing|autograph)\b/;

function goodPhotoTitle(title: string, first: string, last: string): boolean {
  if (!PHOTO.test(title)) return false;
  const t = fold(title.replace(/^File:/, ''));
  const lastF = fold(last);
  if (!t.includes(lastF)) return false;
  // Full name, or "F. Last", must appear; avoids relatives and namesakes.
  if (!t.includes(fold(`${first} ${last}`)) && !t.includes(`${fold(first).charAt(0)} ${lastF}`)) return false;
  return !GROUP.test(t);
}

async function fromCategory(category: string, first: string, last: string): Promise<ImageCredit | null> {
  const data = await api({ action: 'query', list: 'categorymembers', cmtitle: `Category:${category}`, cmtype: 'file', cmlimit: '50' });
  const titles: string[] = (data.query?.categorymembers ?? []).map((m: any) => m.title);
  const pick = titles.find((t) => goodPhotoTitle(t, first, last)) ?? titles.find((t) => PHOTO.test(t) && !GROUP.test(fold(t)));
  return pick ? fileInfo(pick, 400) : null;
}

async function fromSearch(first: string, last: string): Promise<ImageCredit | null> {
  const data = await api({ action: 'query', list: 'search', srnamespace: '6', srsearch: `"${first} ${last}" basketball`, srlimit: '20' });
  const titles: string[] = (data.query?.search ?? []).map((m: any) => m.title);
  const pick = titles.find((t) => goodPhotoTitle(t, first, last));
  return pick ? fileInfo(pick, 400) : null;
}

/** Latest year named in a logo's file name, e.g. "Raptors logo 2015–present" -> 9999. */
function logoEra(title: string): number {
  if (/present|current/i.test(title)) return 9999;
  const years = [...title.matchAll(/(19|20)\d{2}/g)].map((m) => Number(m[0]));
  return years.length ? Math.max(...years) : 5000;
}

async function teamLogo(city: string, name: string): Promise<{ logo?: ImageCredit; wordmark?: ImageCredit }> {
  const data = await api({ action: 'query', list: 'search', srnamespace: '6', srsearch: `"${name}" logo ${city}`, srlimit: '40' });
  const titles: string[] = (data.query?.search ?? []).map((m: any) => m.title);
  const nameF = fold(name);
  const candidates = titles
    .filter((t) => /\.(svg|png)$/i.test(t) && fold(t).includes(nameF) && /logo|wordmark/i.test(t))
    .filter((t) => !/\b(g league|summer|all star|jersey|uniform|court|arena|mascot|alternate|secondary)\b/i.test(t))
    .filter((t) => logoEra(t) >= 2018)
    .sort((a, b) => logoEra(b) - logoEra(a) || Number(/\.svg$/i.test(b)) - Number(/\.svg$/i.test(a)));
  const out: { logo?: ImageCredit; wordmark?: ImageCredit } = {};
  for (const t of candidates.slice(0, 8)) {
    const kind = /wordmark|script|text/i.test(t) ? 'wordmark' : 'logo';
    if (out[kind]) continue;
    const info = await fileInfo(t, 300);
    await sleep(300);
    // Only logos with no copyright (public domain) are used.
    if (info && /public domain|^pd|cc0/i.test(info.license)) out[kind] = info;
    if (out.logo && out.wordmark) break;
  }
  return out;
}

async function main() {
  const [cacheDir, leagueFile] = process.argv.slice(2);
  if (!cacheDir || !leagueFile) throw new Error('usage: images-more.ts <cache-dir> <league.json>');
  const league = JSON.parse(readFileSync(leagueFile, 'utf8')) as LeagueFile;
  const cachePath = join(cacheDir, 'images.json');
  const cache = JSON.parse(readFileSync(cachePath, 'utf8')) as {
    players: Record<string, ImageCredit | null>;
    teams: Record<string, { logo?: ImageCredit; wordmark?: ImageCredit }>;
  };

  const sparql = await getJson(
    `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent('SELECT ?bref ?cat WHERE { ?item wdt:P2685 ?bref ; wdt:P373 ?cat . }')}`,
  );
  const categoryOf = new Map<string, string>();
  for (const r of sparql.results.bindings) categoryOf.set(r.bref.value.split('/').pop(), r.cat.value);

  const missing = league.players.filter((p) => !cache.players[p.id]);
  console.log(`Players without a photo: ${missing.length}`);
  let viaCat = 0;
  let viaSearch = 0;
  for (const p of missing) {
    try {
      const cat = categoryOf.get(p.id);
      let photo = cat ? await fromCategory(cat, p.firstName, p.lastName) : null;
      if (photo) viaCat++;
      else {
        photo = await fromSearch(p.firstName, p.lastName);
        if (photo) viaSearch++;
      }
      if (photo) cache.players[p.id] = photo;
    } catch (e) {
      console.warn(`${p.firstName} ${p.lastName}: ${(e as Error).message}`);
    }
    await sleep(1200);
  }
  console.log(`Found ${viaCat} via Commons categories, ${viaSearch} via Commons search`);

  for (const t of league.teams) {
    const have = cache.teams[t.id] ?? {};
    if (have.logo && have.wordmark) continue;
    try {
      const found = await teamLogo(t.city, t.name);
      cache.teams[t.id] = { logo: have.logo ?? found.logo, wordmark: have.wordmark ?? found.wordmark };
      if (!have.logo && found.logo) console.log(`logo  ${t.city} ${t.name}: ${found.logo.sourceUrl.split('File:').pop()}`);
      if (!have.wordmark && found.wordmark) console.log(`words ${t.city} ${t.name}: ${found.wordmark.sourceUrl.split('File:').pop()}`);
    } catch (e) {
      console.warn(`${t.name}: ${(e as Error).message}`);
    }
  }

  writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  const total = league.players.filter((p) => cache.players[p.id]).length;
  console.log(`Photos now: ${total}/${league.players.length}. Logos: ${Object.values(cache.teams).filter((t) => t.logo).length}, wordmarks: ${Object.values(cache.teams).filter((t) => t.wordmark).length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
