// Minimal Basketball-Reference table reader. Many tables are shipped inside
// HTML comments, so comment markers are stripped before parsing.

import { readFileSync } from 'node:fs';
import { parse, type HTMLElement } from 'node-html-parser';

export interface Cell {
  text: string;
  csk?: string;
  /** Basketball-Reference id from data-append-csv or a /players/x/<id>.html link. */
  id?: string;
  className: string;
}
export type Row = Record<string, Cell>;

export function loadPage(file: string): HTMLElement {
  const html = readFileSync(file, 'utf8').replace(/<!--/g, '').replace(/-->/g, '');
  return parse(html);
}

export function readTable(page: HTMLElement, tableId: string): Row[] {
  const table = page.querySelector(`table#${tableId}`);
  if (!table) return [];
  const rows: Row[] = [];
  const body = table.querySelectorAll('tbody tr');
  for (const tr of body.length ? body : table.querySelectorAll('tr')) {
    const cls = tr.getAttribute('class') ?? '';
    if (/\b(thead|over_header)\b/.test(cls)) continue;
    const row: Row = {};
    for (const cell of tr.querySelectorAll('th, td')) {
      const stat = cell.getAttribute('data-stat');
      if (!stat) continue;
      const link = cell.querySelector('a')?.getAttribute('href') ?? '';
      const idFromLink = /\/players\/\w\/([a-z0-9]+)\.html/.exec(link)?.[1];
      row[stat] = {
        text: cell.text.trim(),
        csk: cell.getAttribute('csk') ?? undefined,
        id: cell.getAttribute('data-append-csv') ?? idFromLink,
        className: cell.getAttribute('class') ?? '',
      };
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

/** Numeric value of a cell: the displayed text when it is a number, else the sort key (e.g. height "6-1" -> 73). */
export const num = (c: Cell | undefined): number | null => {
  if (!c) return null;
  const text = c.text.replace(/[$,%]/g, '');
  if (text !== '' && Number.isFinite(Number(text))) return Number(text);
  if (c.csk !== undefined && c.csk !== '' && Number.isFinite(Number(c.csk))) return Number(c.csk);
  return null;
};

/** Text that follows a label such as "Coach:" in the team info box. */
export function infoAfter(page: HTMLElement, label: string): string | null {
  const info = page.querySelector('#info') ?? page;
  for (const p of info.querySelectorAll('p')) {
    const t = p.text.replace(/\s+/g, ' ').trim();
    if (t.startsWith(label)) return t.slice(label.length).trim();
  }
  return null;
}
