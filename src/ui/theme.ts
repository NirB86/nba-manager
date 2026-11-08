// Team-colored theme: the whole game takes on the user's team colors.

import type { Team } from '../engine';

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) || 0) as [number, number, number];
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(hex: string, with_: string, amount: number): string {
  const a = rgb(hex);
  const b = rgb(with_);
  return `#${a.map((c, i) => Math.round(c + ((b[i] as number) - c) * amount).toString(16).padStart(2, '0')).join('')}`;
}

export interface TeamTheme {
  /** Team primary color: banners, number boxes, split boards. */
  team: string;
  /** Team secondary color: text on the primary, trims. */
  team2: string;
  /** Text color that reads on the primary. */
  teamInk: string;
}

export const DEFAULT_THEME: TeamTheme = { team: '#1d428a', team2: '#ffc72c', teamInk: '#ffffff' };

export function teamTheme(team: Pick<Team, 'colors'> | undefined): TeamTheme {
  if (!team) return DEFAULT_THEME;
  const { primary, secondary } = team.colors;
  // A secondary too close to the primary is unreadable on it: fall back to white or black.
  const contrast = Math.abs(luminance(primary) - luminance(secondary));
  const team2 = contrast > 0.25 ? secondary : luminance(primary) > 0.4 ? '#0a0a0a' : '#ffffff';
  return { team: primary, team2, teamInk: luminance(primary) > 0.45 ? '#0a0a0a' : '#ffffff' };
}

export function themeStyle(t: TeamTheme): Record<string, string> {
  return { '--team': t.team, '--team2': t.team2, '--team-ink': t.teamInk };
}

export { mix };
