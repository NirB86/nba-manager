// What players ask of you: trade requests from unhappy players (and the
// promises you make to calm them down), contract holdouts at the start of a
// season, and short-lived morale effects from promises and press conferences.

import { fullName, marketSalary, playerAge, playerOverall, rosterOf, salaryIn, standings, type Player, type Rng } from '../engine';
import type { InboxMessage, SaveGame } from '../storage/saves';
import { morale } from './morale';

export interface TradeRequest {
  day: number;
  /** You promised more minutes: checked on `due`. */
  promise?: { due: number; secAt: number; gamesAt: number; minutes: number };
  /** The request is public. */
  leaked?: boolean;
}

/** A temporary morale effect on one player (or the whole team when playerId is null). */
export interface MoraleMod {
  playerId: string | null;
  effect: number;
  text: string;
  /** Season and game day it wears off. */
  season: number;
  until: number;
}

export interface Demands {
  requests: Record<string, TradeRequest>;
  mods: MoraleMod[];
}

export function demands(save: SaveGame): Demands {
  save.demands ??= { requests: {}, mods: [] };
  return save.demands;
}

/** Morale effects active for a player right now (for the morale screen). */
export function activeMods(save: SaveGame, playerId: string): { text: string; effect: number }[] {
  const d = save.demands;
  if (!d) return [];
  const year = save.league.meta.season;
  const out = d.mods
    .filter((m) => m.season === year && m.until >= save.season.day && (m.playerId === playerId || m.playerId === null))
    .map((m) => ({ text: m.text, effect: m.effect }));
  if (d.requests[playerId])
    out.push({
      text: d.requests[playerId]!.promise ? 'Waiting to see if you keep your promise.' : 'Has asked to be traded.',
      effect: d.requests[playerId]!.promise ? -0.5 : -2,
    });
  return out;
}

export function addMod(save: SaveGame, playerId: string | null, effect: number, text: string, days: number) {
  demands(save).mods.push({
    playerId,
    effect,
    text,
    season: save.league.meta.season,
    until: save.season.day + days,
  });
}

const note = (save: SaveGame, id: string, from: string, subject: string, body: string): InboxMessage => ({
  id: `${id}-${save.season.year}-${save.season.day}`,
  from,
  subject,
  body,
  date: save.season.phase === 'regular' ? `Regular season, day ${save.season.day + 1}` : save.season.phase === 'playoffs' ? 'Playoffs' : 'Offseason',
  read: false,
});

function teamGames(save: SaveGame) {
  const row = standings(save.league, save.season.games).find((r) => r.teamId === save.career.teamId);
  return row ? row.w + row.l : 0;
}

/** Once a week: unhappy players may ask out; promises come due; old requests leak. */
export function weeklyDemands(save: SaveGame, rng: Rng) {
  const d = demands(save);
  const me = save.career.teamId;
  const year = save.league.meta.season;
  d.mods = d.mods.filter((m) => m.season === year && m.until >= save.season.day);
  const day = save.season.day;

  for (const [id, req] of Object.entries(d.requests)) {
    const p = save.league.players.find((x) => x.id === id);
    // Traded or released: the request is over.
    if (!p || p.teamId !== me) {
      delete d.requests[id];
      continue;
    }
    if (req.promise && day >= req.promise.due) {
      const t = save.season.stats.regular[id];
      const games = teamGames(save) - req.promise.gamesAt;
      const mpg = games > 0 ? ((t?.sec ?? 0) - req.promise.secAt) / 60 / games : 0;
      if (mpg >= req.promise.minutes - 1) {
        delete d.requests[id];
        addMod(save, id, 2, 'You kept your promise about his minutes.', 40);
        save.inbox.unshift(
          note(
            save,
            `promise-kept-${id}`,
            `${p.lastName}'s agent`,
            `${fullName(p)} withdraws his trade request`,
            `He is playing ${mpg.toFixed(0)} minutes a game, as promised. He is happy to stay.`,
          ),
        );
      } else {
        const promised = req.promise.minutes;
        req.promise = undefined;
        req.leaked = true;
        addMod(save, id, -3, 'You broke your promise about his minutes.', 45);
        addMod(save, null, -0.5, `Locker room tension: ${p.lastName} feels lied to.`, 21);
        save.season.rumors = [`${fullName(p)} goes public with his trade request`, ...(save.season.rumors ?? [])].slice(0, 6);
        save.inbox.unshift(
          note(
            save,
            `promise-broken-${id}`,
            `${p.lastName}'s agent`,
            `${fullName(p)} feels misled`,
            `You promised about ${promised} minutes a game; he got ${Math.round(mpg)}. His trade request is now public.`,
          ),
        );
      }
      continue;
    }
    if (!req.promise && !req.leaked && day - req.day >= 28) {
      req.leaked = true;
      addMod(save, null, -0.5, `Distraction: ${p.lastName} wants out.`, 21);
      save.season.rumors = [`Sources: ${fullName(p)} has asked for a trade`, ...(save.season.rumors ?? [])].slice(0, 6);
    }
    // Happier now: he drops it.
    const m = morale(save, p);
    if (!req.promise && (m.level === 'happy' || m.level === 'thrilled')) delete d.requests[id];
  }

  for (const p of rosterOf(save.league, me)) {
    if (d.requests[p.id] || p.contract?.kind === 'two-way') continue;
    const m = morale(save, p);
    const ego = p.personality.ego;
    const chance = m.level === 'angry' ? (ego >= 11 ? 0.35 : 0.12) : m.level === 'unhappy' && ego >= 16 ? 0.1 : 0;
    if (!chance || !rng.chance(chance)) continue;
    d.requests[p.id] = { day };
    const why = m.reasons.find((r) => r.effect < 0)?.text ?? 'He is not happy here.';
    save.inbox.unshift(
      note(
        save,
        `trade-request-${p.id}`,
        `${p.lastName}'s agent`,
        `${fullName(p)} requests a trade`,
        `${why} He wants to be moved. Open his page to promise him more minutes, or look for a trade before this goes public.`,
      ),
    );
  }
}

/** Promise a player more minutes to settle a trade request: checked in about three weeks. */
export function promiseMinutes(original: SaveGame, playerId: string): SaveGame {
  const req = original.demands?.requests[playerId];
  if (!req || req.promise) return original;
  const save = structuredClone(original);
  const d = demands(save);
  const games = teamGames(save);
  const t = save.season.stats.regular[playerId];
  const now = games ? (t?.sec ?? 0) / 60 / games : 0;
  const minutes = Math.min(34, Math.max(24, Math.round(now + 6)));
  d.requests[playerId] = {
    ...req,
    promise: {
      due: save.season.day + 21,
      secAt: t?.sec ?? 0,
      gamesAt: games,
      minutes,
    },
  };
  const p = save.league.players.find((x) => x.id === playerId)!;
  save.inbox.unshift(
    note(
      save,
      `promise-${playerId}`,
      'Assistant GM',
      `You promised ${p.lastName} more minutes`,
      `About ${minutes} a game over the next three weeks. Set it in the depth chart (Roster > Depth chart). If he does not get them, he will go public.`,
    ),
  );
  return save;
}

export const HOLDOUT_FROM = 'Contract holdout';

/** At the start of a season: underpaid players in a contract year may hold out. */
export function holdouts(save: SaveGame, rng: Rng): Player[] {
  const me = save.career.teamId;
  const year = save.league.meta.season;
  const out: Player[] = [];
  for (const p of rosterOf(save.league, me)) {
    const c = p.contract;
    if (!c || c.kind === 'two-way' || c.kind === 'rookie') continue;
    const left = c.years.filter((y) => y.season >= year).length;
    if (left !== 1) continue;
    const ratio = salaryIn(p, year) / marketSalary(save.league.settings, playerOverall(p), playerAge(p, year), p.experience);
    if (ratio >= 0.7 || p.personality.ego < 13 || p.personality.loyalty > 11 || !rng.chance(0.55)) continue;
    const games = rng.int(3, 10);
    (save.season.holdouts ??= {})[p.id] = games;
    out.push(p);
    save.inbox.unshift(
      note(
        save,
        `holdout-${p.id}`,
        `${p.lastName}'s agent`,
        `${fullName(p)} is holding out`,
        `He will not report until he gets a new contract. He misses games until you sign him to an extension, or about ${games} games until he gives in.`,
      ),
    );
  }
  return out;
}

/** A new deal ends a holdout and settles the player. */
export function endHoldout(save: SaveGame, playerId: string) {
  if (save.season.holdouts?.[playerId]) {
    delete save.season.holdouts[playerId];
    addMod(save, playerId, 1.5, 'Got the contract he wanted.', 30);
  }
}
