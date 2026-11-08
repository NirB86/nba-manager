import { describe, expect, it } from 'vitest';
import { generateLeague } from '../engine/generator';
import { Rng, checkMultiTrade, rosterOf } from '../engine';
import { advance } from './advance';
import { createCareer } from './career';
import { answerOffer, buildPackage } from './market';
import { assetLabel } from './trades';

const career = () => {
  const league = generateLeague({ seed: 21 });
  return createCareer(league, { teamId: league.teams[0]!.id, role: 'gm', simMode: 'quick', scouting: 'full', difficulty: 'normal' }, 'T');
};

describe('trade market', () => {
  it('builds packages that pass the trade rules', () => {
    const save = career();
    const rng = new Rng(4);
    const me = save.career.teamId;
    let built = 0;
    for (const target of rosterOf(save.league, me).slice(3, 9)) {
      for (const buyer of save.league.teams.slice(1).map((t) => t.id)) {
        const deal = buildPackage(save.league, buyer, me, [target], rng, { sellerMin: -0.05 });
        if (!deal) continue;
        built++;
        expect(checkMultiTrade(save.league, deal).valid).toBe(true);
      }
    }
    expect(built).toBeGreaterThan(0);
  });

  it('sends offers to the inbox before the deadline, and accepting one trades', async () => {
    let save = career();
    for (let i = 0; i < 12; i++) save = await advance(save, 'week');
    const offers = save.season.offers ?? [];
    expect(offers.length).toBeGreaterThan(0);
    expect(save.inbox.some((m) => m.offerId === offers[0]!.id)).toBe(true);
    const open = offers.find((o) => o.status === 'open' && o.expiresDay >= save.season.day);
    if (open) {
      const r = answerOffer(save, open.id, true);
      expect(r.ok).toBe(true);
      const got = open.deal.moves.find((m) => m.to === save.career.teamId && m.kind === 'player');
      if (got) expect(r.save.league.players.find((p) => p.id === got.id)!.teamId).toBe(save.career.teamId);
    }
  });

  it('names whose pick it is', () => {
    const save = career();
    const k = save.league.draftPicks[0]!;
    expect(assetLabel(save, { kind: 'pick', id: k.id, from: k.ownerTeamId, to: 'x' })).toMatch(/^the .+'s? \d{4} (1st|2nd)-round pick$/);
  });
});
