// Real birth year, nationality and a free-licensed photo for each head coach,
// from Wikidata and Wikimedia Commons. Cached in <cache-dir>/coaches.json.
//
//   npm run import:coaches -- <cache-dir> <league.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImageCredit, LeagueFile } from '../../src/engine/types';

const UA = 'nba-manager-import/0.1 (https://github.com/NirB86/nba-manager; personal non-commercial project)';
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 100)}`);
  return res.json();
}

export interface CoachInfo {
  birthYear?: number;
  country?: string;
  photo?: ImageCredit;
}

async function main() {
  const [cacheDir, leagueFile] = process.argv.slice(2);
  if (!cacheDir || !leagueFile) throw new Error('usage: coaches.ts <cache-dir> <league.json>');
  const league = JSON.parse(readFileSync(leagueFile, 'utf8')) as LeagueFile;
  const names = league.staff.filter((s) => s.role === 'HC' && s.teamId).map((s) => `${s.firstName} ${s.lastName}`);
  // Spellings differ between sites ("J.B." vs "J. B.", accents, second surnames): try variants.
  const variants = new Map<string, string>();
  for (const n of names) {
    const forms = new Set([n, n.replace(/\./g, '. ').replace(/\s+/g, ' ').trim(), n.replace(/\s+\S+$/, ''), n.normalize('NFD').replace(/[\u0300-\u036f]/g, '')]);
    if (/c$/.test(n)) forms.add(n.replace(/c$/, 'ć'));
    for (const f of forms) if (f.split(' ').length >= 2) variants.set(f, n);
  }
  const values = [...variants.keys()].map((n) => `"${n.replace(/"/g, '')}"@en`).join(' ');
  // People with that English name who are (or were) basketball coaches or players.
  const query = `SELECT ?name ?birth ?countryLabel ?image WHERE {
    VALUES ?name { ${values} }
    ?p rdfs:label|skos:altLabel ?name ; wdt:P31 wd:Q5 ; wdt:P106 ?job .
    VALUES ?job { wd:Q5137571 }
    OPTIONAL { ?p wdt:P569 ?birth }
    OPTIONAL { ?p wdt:P27 ?country }
    OPTIONAL { ?p wdt:P18 ?image }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  }`;
  const data = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  const out: Record<string, CoachInfo> = {};
  for (const r of data.results.bindings) {
    const name = variants.get(r.name.value as string) ?? (r.name.value as string);
    const info = (out[name] ??= {});
    if (r.birth && !info.birthYear) info.birthYear = Number(String(r.birth.value).slice(0, 4));
    if (r.countryLabel && !info.country) info.country = r.countryLabel.value === 'United States' ? 'USA' : r.countryLabel.value;
    if (r.image && !info.photo) info.photo = { url: r.image.value, credit: '', license: '', source: 'Wikimedia Commons', sourceUrl: '' };
  }

  // License, author and a thumbnail for each photo.
  const files = Object.values(out).filter((i) => i.photo).map((i) => decodeURIComponent(i.photo!.url.split('/').pop()!));
  if (files.length) {
    const meta = await getJson(
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=400&titles=' +
        encodeURIComponent(files.map((f) => `File:${f}`).join('|')),
    );
    const byFile = new Map<string, ImageCredit>();
    const norm = new Map<string, string>((meta.query?.normalized ?? []).map((n: any) => [n.to, n.from]));
    for (const page of Object.values<any>(meta.query?.pages ?? {})) {
      const ii = page.imageinfo?.[0];
      if (!ii) continue;
      const m = ii.extmetadata ?? {};
      const license = stripHtml(m.LicenseShortName?.value ?? '');
      if (!license || /non-free|fair use/i.test(license)) continue;
      const title = (norm.get(page.title) ?? page.title).replace(/^File:/, '');
      byFile.set(title, { url: ii.thumburl ?? ii.url, credit: stripHtml(m.Artist?.value ?? 'Unknown author').slice(0, 120), license, source: 'Wikimedia Commons', sourceUrl: ii.descriptionurl });
    }
    for (const info of Object.values(out)) {
      if (!info.photo) continue;
      const credit = byFile.get(decodeURIComponent(info.photo.url.split('/').pop()!).replace(/_/g, ' ')) ?? byFile.get(decodeURIComponent(info.photo.url.split('/').pop()!));
      if (credit) info.photo = credit;
      else delete info.photo;
    }
  }

  writeFileSync(join(cacheDir, 'coaches.json'), JSON.stringify(out, null, 1));
  const found = Object.keys(out).length;
  console.log(`Coaches: ${found}/${names.length} found, ${Object.values(out).filter((i) => i.birthYear).length} with birth year, ${Object.values(out).filter((i) => i.photo).length} with photo`);
  const missing = names.filter((n) => !out[n]);
  if (missing.length) console.log(`Not found: ${missing.join(', ')}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
