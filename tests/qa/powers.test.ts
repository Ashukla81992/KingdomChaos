import { describe, expect, it } from 'vitest';
import {
  carry,
  endsFor,
  expectReject,
  game,
  hand,
  must,
  noCards,
  place,
  player,
  qaFresh,
  rollWith,
  routeTo,
  setBank,
  T0,
  viewOf,
} from './helpers';

describe('P4 Alchemy repeatable', () => {
  it('P4 Witch may alchemy multiple times on her turn when banked copies allow', () => {
    let s = noCards(game());
    setBank(s, 'a', { ruby: 1 });
    const gem1 = carry(s, 'a-witch', 'ruby');
    place(s, 'a-witch', 'c8');
    qaFresh(s, 'a');
    s = must(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId: gem1, to: 'sapphire' }, T0);
    expect(s.gems.find((g) => g.id === gem1)?.kind).toBe('sapphire');
    expect(s.lastEvents.some((e) => e.type === 'alchemy')).toBe(true);
    setBank(s, 'a', { ruby: 1, sapphire: 1 });
    s = must(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId: gem1, to: 'emerald' }, T0);
    expect(s.gems.find((g) => g.id === gem1)?.kind).toBe('emerald');
  });
});

describe('P3 Diplomacy', () => {
  it('P3 accepted trade swaps gems atomically', () => {
    let s = noCards(game());
    setBank(s, 'a', { ruby: 2, sapphire: 1 });
    setBank(s, 'b', { ruby: 1, sapphire: 2 });
    place(s, 'a-queen', 'c8');
    qaFresh(s, 'a');
    s = rollWith(s, 'a', 1);
    const end = [...endsFor(s, 'a-queen')][0];
    s = must(s, 'a', { type: 'move', characterId: 'a-queen', path: routeTo(s, 'a-queen', end) }, T0);
    // Diplomacy is free after the Queen moved; if the turn already advanced into a bonus, keep ownership.
    if (s.turn.playerId !== 'a') qaFresh(s, 'a');
    s.turn.moved = ['a-queen'];
    s.turn.diplomacyUsed = false;
    s = must(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'gem', gem: 'sapphire' } }, T0);
    expect(s.trades.length).toBe(1);
    const offerId = s.trades[0].id;
    const after = must(s, 'b', { type: 'respondTrade', offerId, accept: true }, T0);
    expect(player(after, 'a').bank.ruby).toBe(1);
    expect(player(after, 'a').bank.sapphire).toBeGreaterThanOrEqual(2);
    expect(player(after, 'b').bank.sapphire).toBe(1);
    expect(player(after, 'b').bank.ruby).toBeGreaterThanOrEqual(2);
  });

  it('P3 full hand cannot accept a card trade', () => {
    let s = noCards(game());
    setBank(s, 'a', { ruby: 2 });
    // Offerer receives the card — a full offerer hand cannot accept.
    hand(s, 'a', ['build_bridge', 'landslide', 'rescue', 'swap']);
    hand(s, 'b', ['shield']);
    qaFresh(s, 'a');
    s.turn.moved = ['a-queen'];
    s = must(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'card', cardType: 'shield' } }, T0);
    expectReject(s, 'b', {
      type: 'respondTrade',
      offerId: s.trades[0].id,
      accept: true,
      cardId: s.hands.b[0].id,
    });
  });

  it('P3 open offers expire when the offerer turn ends', () => {
    let s = noCards(game());
    setBank(s, 'a', { ruby: 2 });
    setBank(s, 'b', { sapphire: 2 });
    place(s, 'a-king', 'c8');
    qaFresh(s, 'a');
    s.turn.moved = ['a-queen'];
    s = must(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'gem', gem: 'sapphire' } }, T0);
    expect(s.trades.length).toBe(1);
    // Complete a's remaining turn so expireTrades runs.
    if (!s.turn.moveDone) {
      s = rollWith(s, 'a', 1);
      s = must(s, 'a', { type: 'move', characterId: 'a-king', path: routeTo(s, 'a-king', 'c9') }, T0);
    } else if (!s.turn.adventureDone) {
      s = must(s, 'a', { type: 'skipAdventure' }, T0);
    }
    // Drain any bonus rolls so the turn truly passes.
    for (let i = 0; i < 4 && s.turn.playerId === 'a' && s.status === 'playing'; i++) {
      if (!s.turn.move && !s.turn.moveDone) {
        s = rollWith(s, 'a', 1);
        const ends = [...endsFor(s, 'a-king')];
        if (ends[0]) s = must(s, 'a', { type: 'move', characterId: 'a-king', path: routeTo(s, 'a-king', ends[0]) }, T0);
        else s = must(s, 'a', { type: 'skipMove' }, T0);
      } else if (!s.turn.adventureDone) {
        s = must(s, 'a', { type: 'skipAdventure' }, T0);
      } else break;
    }
    expect(s.turn.playerId).not.toBe('a');
    expect(s.trades.filter((t) => t.from === 'a')).toHaveLength(0);
  });

  it('P3 third parties see only who is trading (redacted give/want)', () => {
    const s = noCards(game(4));
    setBank(s, 'a', { ruby: 2 });
    setBank(s, 'b', { sapphire: 2 });
    s.trades = [
      {
        id: 't-redact',
        from: 'a',
        to: 'b',
        give: 'ruby',
        want: { kind: 'gem', gem: 'sapphire' },
        turn: 1,
      },
    ];
    const third = viewOf(s, 'c');
    expect(third.trades.length).toBe(1);
    expect(third.trades[0]).toMatchObject({ from: 'a', to: 'b' });
    expect(third.trades[0].give).toBeUndefined();
    expect(third.trades[0].want).toBeUndefined();
    const party = viewOf(s, 'a');
    expect(party.trades[0].give).toBe('ruby');
    expect(party.trades[0].want).toEqual({ kind: 'gem', gem: 'sapphire' });
  });
});
