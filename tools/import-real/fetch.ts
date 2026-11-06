// Downloads the Basketball-Reference pages the import needs into a local
// cache folder. Polite: one request every 3.5 s (their limit is 20/minute),
// and pages already in the cache are skipped.
//
//   npx tsx tools/import-real/fetch.ts <cache-dir> [season-end-year]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REAL_TEAMS } from './teams';

const BASE = 'https://www.basketball-reference.com';
const DELAY_MS = 3500;

export function pagesFor(endYear: number): string[] {
  const prev = endYear - 1;
  const pages = [
    `/leagues/NBA_${prev}_per_game.html`,
    `/leagues/NBA_${prev}_advanced.html`,
    `/leagues/NBA_${prev}_shooting.html`,
    `/leagues/NBA_${endYear}_per_game.html`,
    `/leagues/NBA_${endYear}_advanced.html`,
    `/contracts/salary-cap-history.html`,
  ];
  for (const t of REAL_TEAMS) {
    pages.push(`/teams/${t.bref}/${endYear}.html`, `/contracts/${t.bref}.html`);
  }
  for (let y = prev - 10; y <= prev; y++) pages.push(`/draft/NBA_${y}.html`);
  return pages;
}

export const cacheName = (path: string) => path.replace(/^\//, '').replace(/\//g, '_');

async function main() {
  const [dir, yearArg] = process.argv.slice(2);
  if (!dir) throw new Error('usage: fetch.ts <cache-dir> [season-end-year]');
  const endYear = Number(yearArg ?? 2027);
  mkdirSync(dir, { recursive: true });
  const pages = pagesFor(endYear);
  let fetched = 0;
  for (const [i, path] of pages.entries()) {
    const file = join(dir, cacheName(path));
    if (existsSync(file)) continue;
    if (fetched > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
    const res = await fetch(BASE + path, { headers: { 'user-agent': 'nba-manager-import/0.1 (personal, non-commercial)' } });
    fetched++;
    if (res.status === 429) throw new Error(`Rate limited at ${path}; wait an hour and re-run (cached pages are kept).`);
    if (!res.ok) {
      console.warn(`skip ${path}: HTTP ${res.status}`);
      continue;
    }
    writeFileSync(file, await res.text());
    console.log(`[${i + 1}/${pages.length}] ${path}`);
  }
  console.log(`done: ${fetched} downloaded, ${pages.length - fetched} from cache`);
}

if (process.argv[1]?.endsWith('fetch.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
