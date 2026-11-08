// Trades between the user's team and one to three AI teams: deadline, each
// team's chance of saying yes, counter offers, and applying a done deal.

import { checkMultiTrade, executeMultiTrade, fullName, teamName, teamStrategy, type MultiTrade, type TradeCheck, type TradeMove } from '../engine';
import type { SaveGame } from '../storage/saves';

/** Trade deadline: about 60% of the way through the regular season. */
export function tradeDeadlineDay(save: SaveGame): number {
  const last = Math.max(0, ...save.season.games.map((g) => g.day));
  return Math.floor(last * 0.6);
}

export function tradesOpen(save: SaveGame): { open: boolean; reason?: string; daysLeft?: number } {
  const s = save.season;
  if (s.phase === 'playoffs') return { open: false, reason: 'Trades are closed during the playoffs.' };
  if (s.phase === 'done') return { open: false, reason: 'Trades reopen in the offseason, coming in a future update.' };
  const deadline = tradeDeadlineDay(save);
  if (s.day > deadline) return { open: false, reason: 'The trade deadline has passed. Trades reopen after the season.' };
  return { open: true, daysLeft: deadline - s.day };
}

/** How much a deal must improve an AI team for an even chance of a yes, by difficulty. */
const MARGIN = { easy: -0.15, normal: 0.15, hard: 0.5 } as const;

/**
 * How sure a team is about a deal, on a logistic scale: 0 is a coin flip.
 * Bigger deals get a wider scale, so trading a star is never a sure thing.
 */
function yesScore(save: SaveGame, check: TradeCheck, teamId: string): number {
  const gain = check.gain[teamId] ?? 0;
  const scale = 1 + (check.given?.[teamId] ?? 0) / 4;
  return (gain - MARGIN[save.career.difficulty] * scale) / (0.6 * scale);
}
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export interface TeamAnswer {
  teamId: string;
  /** Chance this team says yes, 0..1. */
  chance: number;
  message: string;
}

export interface DealVerdict {
  check: TradeCheck;
  answers: TeamAnswer[];
  /** Chance every other team agrees. */
  chance: number;
  /** Declined earlier today: wait for the next game day. */
  blocked: boolean;
  message: string;
}

/** Same deal, same teams: a stable key to remember a refusal. */
export function dealKey(deal: MultiTrade): string {
  return deal.moves
    .map((m) => `${m.kind}:${m.id}>${m.to}`)
    .sort()
    .join('|');
}

export function evaluateDeal(save: SaveGame, deal: MultiTrade): DealVerdict {
  const check = checkMultiTrade(save.league, deal);
  const me = save.career.teamId;
  const blocked = (save.season.declinedDeals ?? []).some((d) => d.key === dealKey(deal) && d.day === save.season.day);
  if (!deal.moves.length) return { check, answers: [], chance: 0, blocked, message: 'Add players or picks to build a deal.' };
  if (!check.valid) return { check, answers: [], chance: 0, blocked, message: check.problems[0] ?? 'This trade breaks the rules.' };
  const answers = deal.teams
    .filter((t) => t !== me)
    .map((teamId): TeamAnswer => {
      const chance = Math.max(0.02, Math.min(0.98, sigmoid(yesScore(save, check, teamId))));
      const strategy = teamStrategy(save.league, teamId);
      const wants = strategy === 'rebuild' ? 'young players or draft picks' : strategy === 'contend' ? 'players who help this season' : 'more value';
      const message = chance >= 0.85 ? 'Easy yes.' : chance >= 0.6 ? 'Leaning yes.' : chance >= 0.35 ? `On the fence: ${wants} would help.` : chance >= 0.12 ? `Unlikely: we want ${wants}.` : `No chance at that price: we want ${wants}.`;
      return { teamId, chance, message };
    });
  const chance = answers.reduce((p, a) => p * a.chance, 1);
  const message = blocked ? 'They turned this exact offer down today. Change it, or try again after the next game.' : answers.length === 2 ? 'Both other teams must agree.' : answers.length > 2 ? `All ${answers.length} other teams must agree.` : (answers[0]?.message ?? '');
  return { check, answers, chance, blocked, message };
}

export interface Counter {
  /** The team that answered with a counter offer. */
  by: string;
  deal: MultiTrade;
  /** What changed from your offer, in plain words. */
  changes: string[];
}

export type ProposeResult = { accepted: true; save: SaveGame } | { accepted: false; save: SaveGame; refusedBy: string; counter: Counter | null };

/** Chance each team needs before it will put its name on a counter offer. */
const COUNTER_TARGET = 0.7;

/**
 * The other teams' counter offer: ask for more of your assets or keep some of
 * their own until every team would likely say yes. Returns null when no small
 * change gets there.
 */
export function counterOffer(save: SaveGame, deal: MultiTrade, by?: string): Counter | null {
  const { league } = save;
  const me = save.career.teamId;
  // Score a team needs to reach the target chance (inverse of the yes curve).
  const enough = Math.log(COUNTER_TARGET / (1 - COUNTER_TARGET));
  const others = deal.teams.filter((t) => t !== me);
  const evaluate = (d: MultiTrade) => {
    const v = evaluateDeal(save, d);
    if (!v.check.valid || !d.moves.length) return null;
    // How far the least happy team is from yes: raw value, so it is never stuck at the 2% floor.
    return { verdict: v, low: Math.min(...others.map((t) => yesScore(save, v.check, t) - enough)) };
  };
  let current = deal;
  let state = evaluate(current);
  if (!state) return null;
  for (let step = 0; step < 5 && state.low < 0; step++) {
    const check = state.verdict.check;
    const unhappy = others.filter((t) => yesScore(save, check, t) < enough);
    const moving = new Set(current.moves.map((m) => m.id));
    const options: MultiTrade[] = [];
    for (const team of unhappy) {
      // Keep one of their own players or picks.
      for (const m of current.moves.filter((x) => x.from === team)) options.push({ ...current, moves: current.moves.filter((x) => x !== m) });
      // Ask for one more of yours.
      for (const p of league.players.filter((x) => x.teamId === me && !moving.has(x.id) && !x.contract?.noTrade && x.contract?.kind !== 'two-way')) {
        options.push({ ...current, moves: [...current.moves, { kind: 'player', id: p.id, from: me, to: team }] });
      }
      for (const k of league.draftPicks.filter((x) => x.ownerTeamId === me && !moving.has(x.id))) {
        options.push({ ...current, moves: [...current.moves, { kind: 'pick', id: k.id, from: me, to: team }] });
      }
    }
    let best: { deal: MultiTrade; state: NonNullable<typeof state>; score: number } | null = null;
    for (const option of options) {
      const next = evaluate(option);
      if (!next) continue;
      // Prefer counters that satisfy everyone while costing you the least.
      const score = next.low >= 0 ? 100 + (next.verdict.check.gain[me] ?? 0) : next.low;
      if (!best || score > best.score) best = { deal: option, state: next, score };
    }
    if (!best || best.state.low <= state.low) return null;
    current = best.deal;
    state = best.state;
  }
  const verdict = state.verdict;
  if (verdict.answers.some((a) => a.chance < COUNTER_TARGET) || dealKey(current) === dealKey(deal)) return null;
  const lead = by ?? verdict.answers.slice().sort((a, b) => a.chance - b.chance)[0]?.teamId ?? '';
  return { by: lead, deal: current, changes: describeChanges(save, deal, current) };
}

/** "They also want X", "The Y keep Z": the difference between two versions of a deal. */
export function describeChanges(save: SaveGame, from: MultiTrade, to: MultiTrade): string[] {
  const { league } = save;
  const name = (id: string) => league.teams.find((t) => t.id === id)?.name ?? 'other team';
  const out: string[] = [];
  const before = new Map(from.moves.map((m) => [m.id, m]));
  const after = new Map(to.moves.map((m) => [m.id, m]));
  for (const m of to.moves) {
    const old = before.get(m.id);
    if (!old) out.push(`The ${name(m.to)} also want ${assetLabel(save, m)}.`);
    else if (old.to !== m.to) out.push(`${capital(assetLabel(save, m))} goes to the ${name(m.to)} instead.`);
  }
  for (const m of from.moves) if (!after.has(m.id)) out.push(`The ${name(m.from)} keep ${assetLabel(save, m)}.`);
  return out;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function assetLabel(save: SaveGame, m: TradeMove): string {
  const { league } = save;
  if (m.kind === 'player') {
    const p = league.players.find((x) => x.id === m.id);
    return p ? fullName(p) : 'a player';
  }
  const k = league.draftPicks.find((x) => x.id === m.id);
  if (!k) return 'a draft pick';
  const via = k.originalTeamId !== k.ownerTeamId ? ` (via ${league.teams.find((t) => t.id === k.originalTeamId)?.abbrev})` : '';
  return `the ${k.season} ${k.round === 1 ? '1st' : '2nd'}-round pick${via}`;
}

/** Take the other teams' counter offer: they already agreed to it. */
export function acceptCounter(save: SaveGame, counter: Counter): SaveGame | null {
  const v = evaluateDeal(save, counter.deal);
  if (!v.check.valid) return null;
  return completeDeal(save, counter.deal);
}

/** Ask the other teams. Each says yes with its chance; a refusal is remembered for today. */
export function proposeDeal(original: SaveGame, deal: MultiTrade, roll: () => number = Math.random): ProposeResult {
  const verdict = evaluateDeal(original, deal);
  if (!verdict.check.valid || verdict.blocked || !deal.moves.length) return { accepted: false, save: original, refusedBy: '', counter: null };
  for (const a of verdict.answers) {
    if (roll() > a.chance) {
      const save = structuredClone(original);
      save.season.declinedDeals = [...(save.season.declinedDeals ?? []).filter((d) => d.day === save.season.day), { key: dealKey(deal), day: save.season.day }];
      return { accepted: false, save, refusedBy: a.teamId, counter: counterOffer(original, deal, a.teamId) };
    }
  }
  return { accepted: true, save: completeDeal(original, deal) };
}

/** Apply an accepted deal to a copy of the save and write the news. */
export function completeDeal(original: SaveGame, deal: MultiTrade): SaveGame {
  const save = structuredClone(original);
  const { league } = save;
  const me = save.career.teamId;
  const describe = (m: TradeMove) => assetLabel(save, m);
  const sent = deal.moves.filter((m) => m.from === me).map(describe);
  const got = deal.moves.filter((m) => m.to === me).map(describe);
  executeMultiTrade(league, deal);
  const partners = deal.teams.filter((t) => t !== me).map((id) => league.teams.find((t) => t.id === id)).filter(Boolean).map((t) => teamName(t!));
  save.inbox.unshift({
    id: `trade-${Date.now()}`,
    from: 'Assistant GM',
    subject: `Trade completed with the ${partners.join(' and the ')}`,
    body: `We sent ${sent.join(', ') || 'nothing'} and received ${got.join(', ') || 'nothing'}. The new players are on the roster now.`,
    date: `Day ${save.season.day + 1}`,
    read: false,
  });
  save.season.trades = [...(save.season.trades ?? []), { day: save.season.day, teams: deal.teams, sent, got }];
  return save;
}
