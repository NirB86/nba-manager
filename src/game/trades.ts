// Trades between the user's team and an AI team: deadline, AI decision,
// and applying an accepted deal to the career.

import { checkTrade, executeTrade, fullName, teamName, teamStrategy, type TradeCheck, type TradeOffer } from '../engine';
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

/** How much a deal must improve the AI team before it says yes, by difficulty. */
const MARGIN = { easy: -0.15, normal: 0.15, hard: 0.5 } as const;

export interface TradeVerdict {
  check: TradeCheck;
  accept: boolean;
  /** A short line from the other team's front office. */
  message: string;
  /** -1 (far off) .. 1 (easy yes): how close the AI is to accepting. */
  warmth: number;
}

export function evaluateOffer(save: SaveGame, offer: TradeOffer): TradeVerdict {
  const check = checkTrade(save.league, offer);
  const ai = offer.fromTeam === save.career.teamId ? offer.toTeam : offer.fromTeam;
  const empty = !offer.give.players.length && !offer.give.picks.length && !offer.get.players.length && !offer.get.picks.length;
  if (empty) return { check, accept: false, message: 'Add players or picks to build a deal.', warmth: 0 };
  if (!check.valid) return { check, accept: false, message: check.problems[0] ?? 'This trade breaks the rules.', warmth: -1 };
  const need = MARGIN[save.career.difficulty];
  const gain = check.gain[ai] ?? 0;
  const warmth = Math.max(-1, Math.min(1, (gain - need) / 1.5));
  const strategy = teamStrategy(save.league, ai);
  if (gain >= need) {
    return { check, accept: true, message: gain - need > 1 ? 'We have a deal. Easy decision for us.' : 'That works for us. Send it over.', warmth };
  }
  const hint =
    strategy === 'rebuild'
      ? 'We are building for the future: young players or draft picks would help.'
      : strategy === 'contend'
        ? 'We are trying to win now: we need players who help this season.'
        : 'We need more value coming back.';
  return { check, accept: false, message: gain - need > -0.6 ? `Close, but not quite. ${hint}` : `Not interested at that price. ${hint}`, warmth };
}

/** Apply an accepted trade to a copy of the save and write the news. */
export function completeTrade(original: SaveGame, offer: TradeOffer): SaveGame {
  const save = structuredClone(original);
  const { league } = save;
  const me = save.career.teamId;
  const other = offer.fromTeam === me ? offer.toTeam : offer.fromTeam;
  const mineOut = offer.fromTeam === me ? offer.give : offer.get;
  const mineIn = offer.fromTeam === me ? offer.get : offer.give;
  const names = (ids: string[]) => ids.map((id) => league.players.find((p) => p.id === id)).filter(Boolean).map((p) => fullName(p!));
  const picks = (ids: string[]) =>
    ids
      .map((id) => league.draftPicks.find((k) => k.id === id))
      .filter(Boolean)
      .map((k) => `${k!.season} ${k!.round === 1 ? '1st' : '2nd'}-round pick${k!.originalTeamId !== k!.ownerTeamId ? ` (via ${league.teams.find((t) => t.id === k!.originalTeamId)?.abbrev})` : ''}`);
  const sent = [...names(mineOut.players), ...picks(mineOut.picks)];
  const got = [...names(mineIn.players), ...picks(mineIn.picks)];
  executeTrade(league, offer);
  const otherTeam = league.teams.find((t) => t.id === other);
  save.inbox.unshift({
    id: `trade-${Date.now()}`,
    from: 'Assistant GM',
    subject: `Trade completed with the ${otherTeam ? teamName(otherTeam) : 'other team'}`,
    body: `We sent ${sent.join(', ') || 'nothing'} and received ${got.join(', ') || 'nothing'}. The new players are on the roster now.`,
    date: `Day ${save.season.day + 1}`,
    read: false,
  });
  save.season.trades = [...(save.season.trades ?? []), { day: save.season.day, teams: [me, other], sent, got }];
  return save;
}
