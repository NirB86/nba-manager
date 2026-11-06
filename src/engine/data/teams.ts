// Fictional franchises for the default league. Real city names, invented
// nicknames and colors: none of these are NBA (or WNBA) team identities.

import type { Conference, Market } from '../types';

export interface TeamSeed {
  city: string;
  name: string;
  abbrev: string;
  division: string;
  market: Market;
  primary: string;
  secondary: string;
  arena: string;
}

export const CONFERENCES: Conference[] = [
  {
    id: 'east',
    name: 'Eastern Conference',
    divisions: [
      { id: 'atlantic', name: 'Atlantic' },
      { id: 'central', name: 'Central' },
      { id: 'southeast', name: 'Southeast' },
    ],
  },
  {
    id: 'west',
    name: 'Western Conference',
    divisions: [
      { id: 'northwest', name: 'Northwest' },
      { id: 'pacific', name: 'Pacific' },
      { id: 'southwest', name: 'Southwest' },
    ],
  },
];

export const TEAM_SEEDS: TeamSeed[] = [
  // Atlantic
  { city: 'Boston', name: 'Harriers', abbrev: 'BOS', division: 'atlantic', market: 'large', primary: '#0f5132', secondary: '#d4a017', arena: 'Harborview Center' },
  { city: 'New York', name: 'Monarchs', abbrev: 'NYM', division: 'atlantic', market: 'large', primary: '#3b1f8f', secondary: '#f59e0b', arena: 'Midtown Arena' },
  { city: 'Philadelphia', name: 'Founders', abbrev: 'PHI', division: 'atlantic', market: 'large', primary: '#1e3a8a', secondary: '#dc2626', arena: 'Liberty Pavilion' },
  { city: 'Toronto', name: 'Glaciers', abbrev: 'TOR', division: 'atlantic', market: 'large', primary: '#0e7490', secondary: '#e2e8f0', arena: 'Lakeshore Dome' },
  { city: 'Baltimore', name: 'Ironclads', abbrev: 'BAL', division: 'atlantic', market: 'mid', primary: '#374151', secondary: '#f97316', arena: 'Inner Harbor Arena' },
  // Central
  { city: 'Chicago', name: 'Gales', abbrev: 'CHI', division: 'central', market: 'large', primary: '#1d4ed8', secondary: '#93c5fd', arena: 'Windy Point Center' },
  { city: 'Detroit', name: 'Engines', abbrev: 'DET', division: 'central', market: 'mid', primary: '#7f1d1d', secondary: '#9ca3af', arena: 'Assembly Hall' },
  { city: 'Cleveland', name: 'Forge', abbrev: 'CLE', division: 'central', market: 'mid', primary: '#9a3412', secondary: '#fbbf24', arena: 'Furnace Fieldhouse' },
  { city: 'Indianapolis', name: 'Stallions', abbrev: 'IND', division: 'central', market: 'small', primary: '#14532d', secondary: '#facc15', arena: 'Crossroads Arena' },
  { city: 'Columbus', name: 'Comets', abbrev: 'COL', division: 'central', market: 'small', primary: '#4c1d95', secondary: '#38bdf8', arena: 'Scioto Center' },
  // Southeast
  { city: 'Miami', name: 'Riptide', abbrev: 'MIA', division: 'southeast', market: 'large', primary: '#0891b2', secondary: '#f472b6', arena: 'Bayfront Arena' },
  { city: 'Atlanta', name: 'Firebirds', abbrev: 'ATL', division: 'southeast', market: 'large', primary: '#b91c1c', secondary: '#fde047', arena: 'Peachtree Pavilion' },
  { city: 'Charlotte', name: 'Copperheads', abbrev: 'CHA', division: 'southeast', market: 'mid', primary: '#92400e', secondary: '#0d9488', arena: 'Queen City Center' },
  { city: 'Orlando', name: 'Orbit', abbrev: 'ORL', division: 'southeast', market: 'mid', primary: '#1e293b', secondary: '#a855f7', arena: 'Launchpad Arena' },
  { city: 'Washington', name: 'Sentinels', abbrev: 'WAS', division: 'southeast', market: 'large', primary: '#1e40af', secondary: '#e11d48', arena: 'Capitol Fieldhouse' },
  // Northwest
  { city: 'Seattle', name: 'Squall', abbrev: 'SEA', division: 'northwest', market: 'large', primary: '#065f46', secondary: '#a3e635', arena: 'Sound Arena' },
  { city: 'Portland', name: 'Pioneers', abbrev: 'POR', division: 'northwest', market: 'mid', primary: '#3f3f46', secondary: '#ef4444', arena: 'Timberline Center' },
  { city: 'Denver', name: 'Summit', abbrev: 'DEN', division: 'northwest', market: 'mid', primary: '#0c4a6e', secondary: '#fcd34d', arena: 'Mile High Pavilion' },
  { city: 'Salt Lake', name: 'Peaks', abbrev: 'SLC', division: 'northwest', market: 'small', primary: '#312e81', secondary: '#f8fafc', arena: 'Wasatch Arena' },
  { city: 'Vancouver', name: 'Orcas', abbrev: 'VAN', division: 'northwest', market: 'mid', primary: '#0f172a', secondary: '#22d3ee', arena: 'Pacific Gate Center' },
  // Pacific
  { city: 'Los Angeles', name: 'Dreamers', abbrev: 'LAD', division: 'pacific', market: 'large', primary: '#6d28d9', secondary: '#fbbf24', arena: 'Sunset Arena' },
  { city: 'San Francisco', name: 'Fog', abbrev: 'SFO', division: 'pacific', market: 'large', primary: '#475569', secondary: '#f97316', arena: 'Bayside Center' },
  { city: 'San Diego', name: 'Surf', abbrev: 'SDG', division: 'pacific', market: 'mid', primary: '#0369a1', secondary: '#fde68a', arena: 'Coronado Pavilion' },
  { city: 'Las Vegas', name: 'Neon', abbrev: 'LVN', division: 'pacific', market: 'mid', primary: '#111827', secondary: '#ec4899', arena: 'Strip Arena' },
  { city: 'Phoenix', name: 'Scorpions', abbrev: 'PHX', division: 'pacific', market: 'mid', primary: '#c2410c', secondary: '#1f2937', arena: 'Desert Sky Center' },
  // Southwest
  { city: 'Dallas', name: 'Outlaws', abbrev: 'DAL', division: 'southwest', market: 'large', primary: '#1e3a8a', secondary: '#cbd5e1', arena: 'Trinity Arena' },
  { city: 'Houston', name: 'Launch', abbrev: 'HOU', division: 'southwest', market: 'large', primary: '#991b1b', secondary: '#e5e7eb', arena: 'Mission Control Center' },
  { city: 'San Antonio', name: 'Vaqueros', abbrev: 'SAN', division: 'southwest', market: 'mid', primary: '#18181b', secondary: '#14b8a6', arena: 'Riverwalk Arena' },
  { city: 'Austin', name: 'Armadillos', abbrev: 'AUS', division: 'southwest', market: 'mid', primary: '#b45309', secondary: '#334155', arena: 'Capital City Pavilion' },
  { city: 'Oklahoma City', name: 'Wranglers', abbrev: 'OKC', division: 'southwest', market: 'small', primary: '#7c2d12', secondary: '#60a5fa', arena: 'Prairie Center' },
];
