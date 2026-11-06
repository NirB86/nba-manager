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
  /** Deep team color used for glows and panels. */
  team: string;
  /** Bright highlight color: buttons, active tabs, key numbers. */
  accent: string;
  /** Text color on top of the accent. */
  accentInk: string;
}

export const DEFAULT_THEME: TeamTheme = { team: '#1e3a8a', accent: '#ff9f1c', accentInk: '#0b1226' };

export function teamTheme(team: Pick<Team, 'colors'> | undefined): TeamTheme {
  if (!team) return DEFAULT_THEME;
  const { primary, secondary } = team.colors;
  // The darker color becomes the glow, the brighter one the accent.
  const [deep, bright] = luminance(primary) <= luminance(secondary) ? [primary, secondary] : [secondary, primary];
  let accent = bright;
  // Make sure the accent reads on a dark arena background.
  for (let i = 0; i < 6 && luminance(accent) < 0.28; i++) accent = mix(accent, '#ffffff', 0.25);
  // A near-black team color would give no glow: lift it a little.
  let glow = deep;
  if (luminance(glow) < 0.012) glow = mix(glow, accent, 0.25);
  return { team: glow, accent, accentInk: luminance(accent) > 0.45 ? '#0b1226' : '#ffffff' };
}

export function themeStyle(t: TeamTheme): Record<string, string> {
  return { '--team': t.team, '--accent': t.accent, '--accent-ink': t.accentInk };
}
