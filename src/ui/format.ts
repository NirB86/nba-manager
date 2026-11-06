export function money(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 100_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${abs}`;
}

export function height(cm: number): string {
  const totalIn = Math.round(cm / 2.54);
  return `${Math.floor(totalIn / 12)}'${totalIn % 12}"`;
}

export function seasonLabel(season: number): string {
  return `${season}-${String((season + 1) % 100).padStart(2, '0')}`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0] ?? 'th');
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Colour class for a 1-20 attribute. */
export function attrTone(v: number): string {
  if (v >= 16) return 'tone-elite';
  if (v >= 13) return 'tone-good';
  if (v >= 9) return 'tone-avg';
  if (v >= 6) return 'tone-weak';
  return 'tone-poor';
}

/** Colour class for an overall rating. */
export function ovrTone(v: number): string {
  if (v >= 85) return 'tone-elite';
  if (v >= 75) return 'tone-good';
  if (v >= 62) return 'tone-avg';
  if (v >= 52) return 'tone-weak';
  return 'tone-poor';
}
