// The trade market between game days: AI teams send the user offers, trade
// with each other, and the league wire carries rumors. Runs once a week
// during the regular season, before the trade deadline.

import { Rng, checkMultiTrade, executeMultiTrade, fullName, pickValue, playerAge, playerOverall, playerValue, rosterOf, salaryIn, teamStrategy, type LeagueFile, type MultiTrade, type Player, type TradeMove } from '../engine';
import type { SaveGame } from '../storage/saves';
import { assetLabel, completeDeal, tradeDeadlineDay } from './trades';

export interface TradeOffer {
  id: string;
  fromTeam: string;
  deal: MultiTrade;
  day: number;
  /** Last game day the offer stands. */
  expiresDay: number;
  status: 'open' | 'accepted' | 'declined' | 'expired';
}

const OFFER_DAYS = 6;

/**
 * A two-team deal where `buyer` gets `targets` from `seller`, paying with
 * its own players and picks until the seller gains and salaries work.
 * Returns null when no small package does it.
 */
/**
 * \`sellerMin\` / \`buyerMin\`: the least each side may gain, as a share of the
 * target's value (negative = may overpay a little because it wants the player).
 */
export function buildPackage(league: LeagueFile, buyer: string, seller: string, targets: Player[], rng: Rng, opts: { protect?: number; sellerMin?: number; buyerMin?: number } = {}): MultiTrade | null {
  const season = league.meta.season;
  const sellerStrategy = teamStrategy(league, seller);
  const want = targets.reduce((s, p) => s + playerValue(league, p, sellerStrategy), 0);
  const targetSalary = targets.reduce((s, p) => s + salaryIn(p, season), 0);
  const base: TradeMove[] = targets.map((p) => ({ kind: 'player', id: p.id, from: seller, to: buyer }));
  // The buyer keeps its best players; the rest and its picks are on the table.
  const roster = rosterOf(league, buyer).filter((p) => !p.contract?.noTrade && p.contract?.kind !== 'two-way');
  const keep = new Set(roster.slice(0, opts.protect ?? 2).map((p) => p.id));
  const players = roster.filter((p) => !keep.has(p.id)).map((p) => ({ p, value: playerValue(league, p, sellerStrategy), salary: salaryIn(p, season) }));
  const picks = league.draftPicks
    .filter((k) => k.ownerTeamId === buyer)
    .map((k) => ({ k, value: pickValue(league, k, sellerStrategy) }))
    .sort((a, b) => a.value - b.value);

  // One or two players whose salaries roughly match what comes back.
  const combos: (typeof players)[] = [];
  for (let i = 0; i < players.length; i++) {
    combos.push([players[i]!]);
    for (let j = i + 1; j < players.length; j++) combos.push([players[i]!, players[j]!]);
  }
  const candidates: { moves: TradeMove[]; over: number }[] = [];
  for (const c of combos) {
    const salary = c.reduce((s, x) => s + x.salary, 0);
    if (Math.abs(salary - targetSalary) > Math.max(4_000_000, targetSalary * 0.3)) continue;
    const value = c.reduce((s, x) => s + x.value, 0);
    if (value > want * 1.7) continue;
    // Top up with the smallest picks that close the value gap (at most two).
    const gap = want * 1.05 - value;
    let extra: typeof picks = [];
    if (gap > 0) {
      const one = picks.find((k) => k.value >= gap);
      if (one) extra = [one];
      else {
        const two = picks.slice(-2);
        if (two.length < 2 || two[0]!.value + two[1]!.value < gap) continue;
        extra = two;
      }
    }
    const total = value + extra.reduce((s, k) => s + k.value, 0);
    candidates.push({
      moves: [...base, ...c.map((x) => ({ kind: 'player' as const, id: x.p.id, from: buyer, to: seller })), ...extra.map((x) => ({ kind: 'pick' as const, id: x.k.id, from: buyer, to: seller }))],
      // Fairest first, with a little randomness so offers vary.
      over: total - want + rng.next() * want * 0.08,
    });
  }
  candidates.sort((a, b) => a.over - b.over);
  for (const c of candidates.slice(0, 30)) {
    const deal = { teams: [buyer, seller], moves: c.moves };
    const check = checkMultiTrade(league, deal);
    if (check.valid && (check.gain[seller] ?? 0) >= (opts.sellerMin ?? 0) * want && (check.gain[buyer] ?? 0) >= (opts.buyerMin ?? -0.2) * want) return deal;
  }
  return null;
}

/** Players an AI team would want from the user: good value for its plan, not the untouchable star. */
function targetsFor(league: LeagueFile, buyer: string, me: string): Player[] {
  const strategy = teamStrategy(league, buyer);
  return rosterOf(league, me)
    .filter((p) => !p.contract?.noTrade && p.contract?.kind !== 'two-way')
    .filter((p) => (strategy === 'rebuild' ? playerAge(p, league.meta.season) <= 25 : playerOverall(p) >= 60))
    .sort((a, b) => playerValue(league, b, strategy) - playerValue(league, a, strategy))
    .slice(0, 6);
}

/** One week of market activity. Mutates the save in place (called on a working copy). */
export function weeklyMarket(save: SaveGame, rng: Rng) {
  const { league, season } = save;
  if (season.phase !== 'regular' || season.day > tradeDeadlineDay(save)) return;
  const me = save.career.teamId;
  const others = league.teams.map((t) => t.id).filter((t) => t !== me);
  const name = (id: string) => league.teams.find((t) => t.id === id)?.name ?? id;

  // Expire old offers.
  for (const o of season.offers ?? []) if (o.status === 'open' && o.expiresDay < season.day) o.status = 'expired';
  const open = (season.offers ?? []).filter((o) => o.status === 'open').length;

  // An offer for one of your players (about every other week, at most two open).
  if (open < 2 && rng.chance(0.55)) {
    for (const buyer of rng.shuffle([...others]).slice(0, 12)) {
      const targets = targetsFor(league, buyer, me);
      if (!targets.length) continue;
      const target = targets[rng.int(0, Math.min(3, targets.length - 1))]!;
      const deal = buildPackage(league, buyer, me, [target], rng, { sellerMin: -0.05, buyerMin: -0.2 });
      if (!deal) continue;
      const offer: TradeOffer = { id: `offer-${season.day}-${buyer}`, fromTeam: buyer, deal, day: season.day, expiresDay: season.day + OFFER_DAYS, status: 'open' };
      season.offers = [...(season.offers ?? []), offer];
      const get = deal.moves.filter((m) => m.to === me).map((m) => assetLabel(save, m));
      save.inbox.unshift({
        id: offer.id,
        from: 'Assistant GM',
        subject: `Offer from the ${name(buyer)} for ${fullName(target)}`,
        body: `The ${name(buyer)} called about ${fullName(target)}. They offer ${get.join(', ')}. The offer stands for ${OFFER_DAYS} days.`,
        date: `Day ${season.day + 1}`,
        read: false,
        offerId: offer.id,
      });
      season.rumors = [`Rumor: the ${name(buyer)} are calling about ${fullName(target)}`, ...(season.rumors ?? [])].slice(0, 6);
      break;
    }
  }

  // AI teams trade with each other now and then.
  for (let attempt = 0; attempt < 4 && rng.chance(0.6); attempt++) {
    const seller = rng.pick(others.filter((t) => teamStrategy(league, t) !== 'contend'));
    const buyer = rng.pick(others.filter((t) => t !== seller && teamStrategy(league, t) !== 'rebuild'));
    if (seller && buyer) {
      const vets = rosterOf(league, seller).filter((p) => !p.contract?.noTrade && p.contract?.kind !== 'two-way' && playerAge(p, league.meta.season) >= 27).slice(0, 3);
      const target = vets.length ? rng.pick(vets) : null;
      const deal = target ? buildPackage(league, buyer, seller, [target], rng, { protect: 3, sellerMin: 0, buyerMin: -0.15 }) : null;
      if (deal && target) {
        const got = deal.moves.filter((m) => m.to === seller).map((m) => assetLabel(save, m));
        executeMultiTrade(league, deal);
        season.trades = [...(season.trades ?? []), { day: season.day, teams: deal.teams, sent: got, got: [fullName(target)] }];
        season.rumors = [`Trade: the ${name(buyer)} get ${fullName(target)} from the ${name(seller)}`, ...(season.rumors ?? [])].slice(0, 6);
        break;
      }
    }
  }

  // Rumors: rebuilding teams shopping their veterans.
  const shopper = rng.pick(others.filter((t) => teamStrategy(league, t) === 'rebuild'));
  const vet = shopper ? rosterOf(league, shopper).find((p) => playerAge(p, league.meta.season) >= 28 && !p.contract?.noTrade) : undefined;
  const rumor = shopper && vet ? `Rumor: the ${name(shopper)} are shopping ${fullName(vet)}` : null;
  if (rumor && !(season.rumors ?? []).includes(rumor)) season.rumors = [rumor, ...(season.rumors ?? [])].slice(0, 6);
}

/** The user's answer to an offer. Accepting runs the trade if it is still valid. */
export function answerOffer(original: SaveGame, offerId: string, accept: boolean): { save: SaveGame; ok: boolean; message: string } {
  const offer = original.season.offers?.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'open') return { save: original, ok: false, message: 'This offer is no longer open.' };
  if (offer.expiresDay < original.season.day) return { save: original, ok: false, message: 'This offer has expired.' };
  const save = structuredClone(original);
  const o = save.season.offers!.find((x) => x.id === offerId)!;
  if (!accept) {
    o.status = 'declined';
    return { save, ok: true, message: 'Offer declined.' };
  }
  const check = checkMultiTrade(save.league, o.deal);
  if (!check.valid) {
    o.status = 'expired';
    return { save, ok: false, message: `The deal no longer works: ${check.problems[0]}` };
  }
  o.status = 'accepted';
  return { save: completeDeal(save, o.deal), ok: true, message: 'Trade completed. The new players are on your roster.' };
}
