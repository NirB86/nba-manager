import type { Attributes, Position } from './types';
import { Rng, clamp } from './random';

export type AttributeKey = keyof Attributes;

export const ATTRIBUTE_GROUPS: { name: string; keys: { key: AttributeKey; label: string }[] }[] = [
  {
    name: 'Scoring',
    keys: [
      { key: 'inside', label: 'Inside scoring' },
      { key: 'midRange', label: 'Mid-range' },
      { key: 'three', label: 'Three-point' },
      { key: 'freeThrow', label: 'Free throw' },
      { key: 'finishing', label: 'Finishing' },
    ],
  },
  {
    name: 'Playmaking',
    keys: [
      { key: 'passing', label: 'Passing' },
      { key: 'ballHandling', label: 'Ball handling' },
      { key: 'vision', label: 'Vision' },
      { key: 'iq', label: 'Basketball IQ' },
    ],
  },
  {
    name: 'Defense',
    keys: [
      { key: 'perimeterD', label: 'Perimeter D' },
      { key: 'interiorD', label: 'Interior D' },
      { key: 'rebounding', label: 'Rebounding' },
      { key: 'steals', label: 'Steals' },
      { key: 'blocks', label: 'Blocks' },
    ],
  },
  {
    name: 'Physical',
    keys: [
      { key: 'speed', label: 'Speed' },
      { key: 'strength', label: 'Strength' },
      { key: 'vertical', label: 'Vertical' },
      { key: 'stamina', label: 'Stamina' },
      { key: 'durability', label: 'Durability' },
    ],
  },
];

export const ATTRIBUTE_KEYS: AttributeKey[] = ATTRIBUTE_GROUPS.flatMap((g) => g.keys.map((k) => k.key));

/** How each position deviates from a player's base level (attribute points, 1-20 scale). */
const PROFILES: Record<Position, Partial<Attributes>> = {
  PG: { passing: 3, ballHandling: 3, vision: 3, three: 1, speed: 2, steals: 1, iq: 1, interiorD: -3, rebounding: -3, blocks: -4, strength: -2, inside: -2 },
  SG: { three: 2, midRange: 2, ballHandling: 1, perimeterD: 1, speed: 1, freeThrow: 1, blocks: -3, interiorD: -2, rebounding: -2 },
  SF: { perimeterD: 1, finishing: 1, vertical: 1, midRange: 1 },
  PF: { inside: 2, rebounding: 2, interiorD: 2, strength: 2, passing: -1, ballHandling: -2, speed: -1, three: -1 },
  C: { inside: 3, rebounding: 4, interiorD: 3, blocks: 4, strength: 3, three: -4, ballHandling: -4, passing: -2, speed: -3, freeThrow: -2, perimeterD: -2 },
};

/** Weight of each attribute in a position's overall rating. */
function weightsFor(pos: Position): Record<AttributeKey, number> {
  const profile = PROFILES[pos];
  const w = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    const offset = profile[key] ?? 0;
    w[key] = 1 + Math.max(0, offset) / 2;
  }
  w.durability = 0.3;
  w.stamina = 0.5;
  w.iq = 1.5;
  return w;
}

const WEIGHTS: Record<Position, Record<AttributeKey, number>> = {
  PG: weightsFor('PG'),
  SG: weightsFor('SG'),
  SF: weightsFor('SF'),
  PF: weightsFor('PF'),
  C: weightsFor('C'),
};

/** Overall rating on a 1-100 scale (about 40 for a fringe player, 90+ for an MVP candidate). */
export function overall(attrs: Attributes, pos: Position): number {
  const w = WEIGHTS[pos];
  let sum = 0;
  let total = 0;
  for (const key of ATTRIBUTE_KEYS) {
    sum += attrs[key] * w[key];
    total += w[key];
  }
  const avg = sum / total;
  return clamp(Math.round(25 + avg * 3.7), 1, 99);
}

/** Inverse of the overall scale: base attribute level for a target overall. */
export function baseForOverall(ovr: number): number {
  return (ovr - 25) / 3.7;
}

/** Generate attributes for a position that land close to a target overall. */
export function generateAttributes(rng: Rng, pos: Position, targetOvr: number): Attributes {
  const profile = PROFILES[pos];
  // Each player gets a couple of signature strengths and a weakness, so two
  // players with the same overall still play differently.
  const strengths = new Set([rng.pick(ATTRIBUTE_KEYS), rng.pick(ATTRIBUTE_KEYS)]);
  const weakness = rng.pick(ATTRIBUTE_KEYS);

  const raw = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    let v = (profile[key] ?? 0) + rng.normal(0, 1.4);
    if (strengths.has(key)) v += rng.int(2, 4);
    if (key === weakness && !strengths.has(key)) v -= rng.int(2, 4);
    raw[key] = v;
  }

  let base = baseForOverall(targetOvr);
  let attrs = materialize(raw, base);
  // Two correction passes pull the overall onto the target despite clamping.
  for (let i = 0; i < 3; i++) {
    const diff = targetOvr - overall(attrs, pos);
    if (diff === 0) break;
    base += diff / 3.7;
    attrs = materialize(raw, base);
  }
  return attrs;
}

function materialize(raw: Record<AttributeKey, number>, base: number): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    out[key] = clamp(Math.round(base + raw[key]), 1, 20);
  }
  return out;
}

/** Height range in centimetres by position. */
export const HEIGHT_CM: Record<Position, [number, number]> = {
  PG: [183, 194],
  SG: [190, 199],
  SF: [197, 206],
  PF: [202, 211],
  C: [207, 222],
};

/**
 * Rating as shown to the player, on the familiar 2K-style scale: a typical
 * rotation player about 72-80, starters 80-86, stars 88-97. The simulation
 * keeps using the internal value, so only the numbers on screen change.
 */
export function displayRating(internal: number): number {
  return clamp(Math.round(internal * 0.81 + 19.75), 40, 99);
}

/** Star rating (0.5-5) for UI display, FM style. */
export function stars(ovr: number): number {
  return clamp(Math.round(((ovr - 40) / 55) * 10) / 2, 0.5, 5);
}
