// Real NBA franchises for the personal-use import. Keyed by
// Basketball-Reference team code. Colors are approximate primary/secondary.

export interface RealTeam {
  bref: string;
  abbrev: string;
  city: string;
  name: string;
  division: 'atlantic' | 'central' | 'southeast' | 'northwest' | 'pacific' | 'southwest';
  market: 'small' | 'mid' | 'large';
  primary: string;
  secondary: string;
}

export const REAL_TEAMS: RealTeam[] = [
  { bref: 'BOS', abbrev: 'BOS', city: 'Boston', name: 'Celtics', division: 'atlantic', market: 'large', primary: '#007a33', secondary: '#ba9653' },
  { bref: 'BRK', abbrev: 'BKN', city: 'Brooklyn', name: 'Nets', division: 'atlantic', market: 'large', primary: '#000000', secondary: '#9ca3af' },
  { bref: 'NYK', abbrev: 'NYK', city: 'New York', name: 'Knicks', division: 'atlantic', market: 'large', primary: '#006bb6', secondary: '#f58426' },
  { bref: 'PHI', abbrev: 'PHI', city: 'Philadelphia', name: '76ers', division: 'atlantic', market: 'large', primary: '#006bb6', secondary: '#ed174c' },
  { bref: 'TOR', abbrev: 'TOR', city: 'Toronto', name: 'Raptors', division: 'atlantic', market: 'large', primary: '#ce1141', secondary: '#a1a1a4' },
  { bref: 'CHI', abbrev: 'CHI', city: 'Chicago', name: 'Bulls', division: 'central', market: 'large', primary: '#ce1141', secondary: '#000000' },
  { bref: 'CLE', abbrev: 'CLE', city: 'Cleveland', name: 'Cavaliers', division: 'central', market: 'mid', primary: '#860038', secondary: '#fdbb30' },
  { bref: 'DET', abbrev: 'DET', city: 'Detroit', name: 'Pistons', division: 'central', market: 'mid', primary: '#c8102e', secondary: '#1d42ba' },
  { bref: 'IND', abbrev: 'IND', city: 'Indiana', name: 'Pacers', division: 'central', market: 'small', primary: '#002d62', secondary: '#fdbb30' },
  { bref: 'MIL', abbrev: 'MIL', city: 'Milwaukee', name: 'Bucks', division: 'central', market: 'small', primary: '#00471b', secondary: '#eee1c6' },
  { bref: 'ATL', abbrev: 'ATL', city: 'Atlanta', name: 'Hawks', division: 'southeast', market: 'large', primary: '#e03a3e', secondary: '#c1d32f' },
  { bref: 'CHO', abbrev: 'CHA', city: 'Charlotte', name: 'Hornets', division: 'southeast', market: 'mid', primary: '#1d1160', secondary: '#00788c' },
  { bref: 'MIA', abbrev: 'MIA', city: 'Miami', name: 'Heat', division: 'southeast', market: 'large', primary: '#98002e', secondary: '#f9a01b' },
  { bref: 'ORL', abbrev: 'ORL', city: 'Orlando', name: 'Magic', division: 'southeast', market: 'mid', primary: '#0077c0', secondary: '#c4ced4' },
  { bref: 'WAS', abbrev: 'WAS', city: 'Washington', name: 'Wizards', division: 'southeast', market: 'large', primary: '#002b5c', secondary: '#e31837' },
  { bref: 'DEN', abbrev: 'DEN', city: 'Denver', name: 'Nuggets', division: 'northwest', market: 'mid', primary: '#0e2240', secondary: '#fec524' },
  { bref: 'MIN', abbrev: 'MIN', city: 'Minnesota', name: 'Timberwolves', division: 'northwest', market: 'mid', primary: '#0c2340', secondary: '#78be20' },
  { bref: 'OKC', abbrev: 'OKC', city: 'Oklahoma City', name: 'Thunder', division: 'northwest', market: 'small', primary: '#007ac1', secondary: '#ef3b24' },
  { bref: 'POR', abbrev: 'POR', city: 'Portland', name: 'Trail Blazers', division: 'northwest', market: 'mid', primary: '#e03a3e', secondary: '#000000' },
  { bref: 'UTA', abbrev: 'UTA', city: 'Utah', name: 'Jazz', division: 'northwest', market: 'small', primary: '#002b5c', secondary: '#f9a01b' },
  { bref: 'GSW', abbrev: 'GSW', city: 'Golden State', name: 'Warriors', division: 'pacific', market: 'large', primary: '#1d428a', secondary: '#ffc72c' },
  { bref: 'LAC', abbrev: 'LAC', city: 'Los Angeles', name: 'Clippers', division: 'pacific', market: 'large', primary: '#c8102e', secondary: '#1d428a' },
  { bref: 'LAL', abbrev: 'LAL', city: 'Los Angeles', name: 'Lakers', division: 'pacific', market: 'large', primary: '#552583', secondary: '#fdb927' },
  { bref: 'PHO', abbrev: 'PHX', city: 'Phoenix', name: 'Suns', division: 'pacific', market: 'mid', primary: '#1d1160', secondary: '#e56020' },
  { bref: 'SAC', abbrev: 'SAC', city: 'Sacramento', name: 'Kings', division: 'pacific', market: 'mid', primary: '#5a2d81', secondary: '#63727a' },
  { bref: 'DAL', abbrev: 'DAL', city: 'Dallas', name: 'Mavericks', division: 'southwest', market: 'large', primary: '#00538c', secondary: '#b8c4ca' },
  { bref: 'HOU', abbrev: 'HOU', city: 'Houston', name: 'Rockets', division: 'southwest', market: 'large', primary: '#ce1141', secondary: '#c4ced4' },
  { bref: 'MEM', abbrev: 'MEM', city: 'Memphis', name: 'Grizzlies', division: 'southwest', market: 'small', primary: '#5d76a9', secondary: '#12173f' },
  { bref: 'NOP', abbrev: 'NOP', city: 'New Orleans', name: 'Pelicans', division: 'southwest', market: 'small', primary: '#0c2340', secondary: '#c8102e' },
  { bref: 'SAS', abbrev: 'SAS', city: 'San Antonio', name: 'Spurs', division: 'southwest', market: 'mid', primary: '#000000', secondary: '#c4ced4' },
];
