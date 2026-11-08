// City photos for choosing a team: a skyline or landmark per franchise,
// free-licensed from Wikimedia Commons, large enough to fill a screen.
// Uses the city's main image on Wikidata (P18) unless it is a collage,
// then its Wikivoyage banner (P948). Some picks are set by hand (a
// skyline search where the main image is a collage, a speedway or a
// single street; the two Los Angeles teams get different views). Results go to <cache-dir>/cities.json;
// build.ts adds them to each team as `cityPhoto`.
//
//   npm run import:cities -- <cache-dir>

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit } from '../../src/engine/types';
import { commonsInfo, getJson, sparql } from './images';

/** Wikidata items for each team's city. */
const CITY: Record<string, string> = {
  't-bos': 'Q100', 't-bkn': 'Q18419', 't-nyk': 'Q60', 't-phi': 'Q1345', 't-tor': 'Q172', 't-chi': 'Q1297', 't-cle': 'Q37320', 't-det': 'Q12439',
  't-ind': 'Q6346', 't-mil': 'Q37836', 't-atl': 'Q23556', 't-cha': 'Q16565', 't-mia': 'Q8652', 't-orl': 'Q49233', 't-was': 'Q61', 't-den': 'Q16554',
  't-min': 'Q36091', 't-okc': 'Q34863', 't-por': 'Q6106', 't-uta': 'Q23337', 't-gsw': 'Q62', 't-lac': 'Q65', 't-lal': 'Q65', 't-phx': 'Q16556',
  't-sac': 'Q18013', 't-dal': 'Q16557', 't-hou': 'Q16555', 't-mem': 'Q16563', 't-nop': 'Q34404', 't-sas': 'Q975',
};

/** Hand-picked: use the city's main image, or search Commons, instead of the banner. */
const OVERRIDE: Record<string, { use: 'banner' } | { search: string }> = {
  't-lal': { search: 'Los Angeles downtown skyline night' },
  't-cha': { search: 'Charlotte North Carolina skyline' },
  't-det': { search: 'Detroit skyline Renaissance Center river' },
  't-hou': { search: 'Houston skyline' },
  't-por': { search: 'Portland Oregon skyline Mount Hood' },
  't-sas': { search: 'San Antonio skyline' },
  't-bkn': { search: 'Brooklyn Bridge Manhattan skyline' },
};

const isCollage = (f: string) => /montage|collage/i.test(f);

async function searchCommons(q: string): Promise<string | null> {
  const url =
    'https://commons.wikimedia.org/w/api.php?format=json&action=query&generator=search&gsrnamespace=6&gsrlimit=15&prop=imageinfo&iiprop=size' +
    `&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}`;
  const data = await getJson(url);
  const pages = Object.values<any>(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const wide = pages.find((p) => p.imageinfo?.[0]?.width >= 1920 && p.imageinfo[0].width > 1.3 * p.imageinfo[0].height && !isCollage(String(p.title)));
  return wide ? String(wide.title).replace(/^File:/, '') : null;
}

async function main() {
  const [cacheDir] = process.argv.slice(2);
  if (!cacheDir) throw new Error('usage: cities.ts <cache-dir>');
  const values = [...new Set(Object.values(CITY))].map((q) => `wd:${q}`).join(' ');
  const rows = await sparql(`SELECT ?c ?banner ?img WHERE { VALUES ?c { ${values} } OPTIONAL { ?c wdt:P948 ?banner } OPTIONAL { ?c wdt:P18 ?img } }`);
  const file = (u: string) => decodeURIComponent(u.split('/').pop() ?? '');
  const byCity = new Map<string, { banner?: string; img?: string }>();
  for (const r of rows) {
    const q = r.c!.value.split('/').pop()!;
    const d = byCity.get(q) ?? {};
    if (r.banner && !d.banner) d.banner = file(r.banner.value);
    if (r.img && !d.img) d.img = file(r.img.value);
    byCity.set(q, d);
  }
  const pick = new Map<string, string>();
  for (const [teamId, q] of Object.entries(CITY)) {
    const d = byCity.get(q) ?? {};
    const o = OVERRIDE[teamId];
    let f: string | null | undefined = d.img && !isCollage(d.img) ? d.img : (d.banner ?? d.img);
    if (o && 'use' in o) f = d.banner ?? f;
    if (o && 'search' in o) f = (await searchCommons(o.search)) ?? f;
    if (f) pick.set(teamId, f);
  }
  const info = await commonsInfo([...new Set(pick.values())], 1920);
  const out: Record<string, ImageCredit> = {};
  for (const [teamId, f] of pick) {
    const credit = info.get(f);
    if (credit) out[teamId] = credit;
    else console.warn(`no free license info for ${teamId}: ${f}`);
  }
  writeFileSync(join(cacheDir, 'cities.json'), JSON.stringify(out, null, 1));
  console.log(`Cities: ${Object.keys(out).length} of ${Object.keys(CITY).length} teams`);
  for (const [t, c] of Object.entries(out)) console.log(`  ${t}: ${c.sourceUrl.split('File:').pop()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
