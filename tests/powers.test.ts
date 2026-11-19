import { describe, expect, it } from 'vitest';
import { applyAction, isProtected, toPlayerView, type GameState, type GemKind } from '@/engine';
import { expireTrades, powerOptions, spareGems, tradesFor } from '@/engine/powers';
import { act, carry, freshTurn, game, hand, noCards, place, player, reject, rollMove, T0 } from './helpers';

function bank(s: GameState, playerId: string, counts: Partial<Record<GemKind, number>>) {
  const p = player(s, playerId);
  p.bank = { ruby: 0, sapphire: 0, emerald: 0, diamond: 0, ...counts };
  p.gems = (['ruby', 'sapphire', 'emerald', 'diamond'] as const).filter((k) => p.bank[k] >= 1);
}

function afterQueenMoved(s: GameState, playerId = 'a') {
  freshTurn(s, playerId);
  s.turn.moved = [`${playerId}-queen`];
  s.turn.diplomacyUsed = false;
  return s;
}

function afterKingMoved(s: GameState, playerId = 'a') {
  freshTurn(s, playerId);
  s.turn.moved = [`${playerId}-king`];
  return s;
}

describe('spare gems and power options', () => {
  it('lists only kinds with bank >= 2', () => {
    const s = game();
    bank(s, 'a', { ruby: 2, sapphire: 1, emerald: 3 });
    expect(spareGems(player(s, 'a')).sort()).toEqual(['emerald', 'ruby']);
  });
});

describe('Alchemy', () => {
  it('converts a carried gem in her palace and banks it; each kind only once per match', () => {
    let s = noCards(game());
    bank(s, 'a', { ruby: 1, sapphire: 1 });
    const g1 = carry(s, 'a-witch', 'ruby');
    const g2 = carry(s, 'a-witch', 'sapphire');
    freshTurn(s, 'a');
    s = act(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId: g1, to: 'emerald' });
    expect(player(s, 'a').bank.emerald).toBe(1);
    expect(s.characters['a-witch'].carrying).toEqual([g2]);
    expect(s.lastEvents.some((e) => e.type === 'alchemy' && e.from === 'ruby' && e.to === 'emerald')).toBe(true);
    expect(s.turn.moveDone).toBe(false);
    expect(s.turn.adventureDone).toBe(false);
    // A different kind may still be transmuted…
    s = act(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId: g2, to: 'diamond' });
    expect(player(s, 'a').gems.sort()).toEqual(['diamond', 'emerald', 'ruby', 'sapphire']);
    // …but ruby never again.
    const g3 = carry(s, 'a-witch', 'ruby');
    player(s, 'a').bank.diamond = 0;
    reject(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId: g3, to: 'diamond' }, /only once/i);
  });

  it('turns a spare banked copy into a missing kind', () => {
    let s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    freshTurn(s, 'a');
    s = act(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId: 'bank:ruby', to: 'sapphire' });
    expect(player(s, 'a').bank).toMatchObject({ ruby: 1, sapphire: 1 });
  });

  it('works only in her palace (castle or gate)', () => {
    const s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    place(s, 'a-witch', 'c5');
    freshTurn(s, 'a');
    reject(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId: 'bank:ruby', to: 'sapphire' }, /palace/i);
    place(s, 'a-witch', 'c0');
    expect(powerOptions(toPlayerView(s, 'a'), 'a').find((o) => o.type === 'alchemy')?.usable).toBe(true);
  });

  it('rejects Alchemy without a banked copy of the carried kind', () => {
    const s = noCards(game());
    bank(s, 'a', {});
    const gemId = carry(s, 'a-witch', 'ruby');
    freshTurn(s, 'a');
    reject(s, 'a', { type: 'alchemy', characterId: 'a-witch', gemId, to: 'sapphire' }, /banked copy/i);
  });
});

describe('Royal Guard', () => {
  it('guards the King or an adjacent ally once per match without using move/adventure', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    place(s, 'a-queen', 'c2');
    afterKingMoved(s);
    s = act(s, 'a', { type: 'royalGuard', targetId: 'a-queen' });
    expect(s.characters['a-queen'].guarded).toBe(true);
    expect(player(s, 'a').royalGuardUsed).toBe(true);
    expect(s.turn.moveDone).toBe(false);
    expect(s.lastEvents.some((e) => e.type === 'royalGuard' && e.targetId === 'a-queen')).toBe(true);

    afterKingMoved(s);
    reject(s, 'a', { type: 'royalGuard', targetId: 'a-king' }, /already been used/i);
  });

  it('sets guarded so capture is blocked, and it lasts two opposing moves (not until the next turn)', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c4');
    afterKingMoved(s);
    s = act(s, 'a', { type: 'royalGuard', targetId: 'a-king' });
    expect(s.characters['a-king'].guarded).toBe(true);

    if (isProtected(s.characters['a-king'])) {
      place(s, 'b-king', 'c1');
      freshTurn(s, 'b');
      s.forcedRolls = [3];
      s = act(s, 'b', { type: 'roll' });
      const cut = applyAction(s, { playerId: 'b', action: { type: 'move', characterId: 'b-king', path: ['c1', 'c2', 'c3', 'c4'] } }, T0);
      expect(cut.ok).toBe(false);
    }

    expect(s.characters['a-king'].wards?.guarded).toBe(2);
  });
});

describe('Diplomacy', () => {
  it('accepts a gem-for-gem trade atomically and keeps Royal Path spares', () => {
    let s = noCards(game());
    bank(s, 'a', { ruby: 2, sapphire: 1 });
    bank(s, 'b', { emerald: 2, diamond: 1 });
    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'gem', gem: 'emerald' } });
    expect(s.turn.diplomacyUsed).toBe(true);
    expect(s.turn.moveDone).toBe(false);
    const offerId = s.trades[0].id;
    expect(offerId).toMatch(/^t\d+$/);

    freshTurn(s, 'b');
    s = act(s, 'b', { type: 'respondTrade', offerId, accept: true });
    expect(player(s, 'a').bank).toMatchObject({ ruby: 1, emerald: 1 });
    expect(player(s, 'b').bank).toMatchObject({ ruby: 1, emerald: 1 });
    expect(player(s, 'a').gems.sort()).toEqual(['emerald', 'ruby', 'sapphire']);
    expect(s.trades).toEqual([]);
    expect(s.lastEvents.some((e) => e.type === 'tradeResolved' && e.outcome === 'accepted')).toBe(true);
  });

  it('accepts a gem-for-power-card trade and enforces the hand limit', () => {
    let s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    bank(s, 'b', { sapphire: 1 });
    hand(s, 'b', ['shield']);
    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'card', cardType: 'shield' } });
    const offerId = s.trades[0].id;
    freshTurn(s, 'b');
    s = act(s, 'b', { type: 'respondTrade', offerId, accept: true });
    expect(s.hands.a.some((c) => c.type === 'shield')).toBe(true);
    expect(s.hands.b).toEqual([]);
    expect(player(s, 'a').bank.ruby).toBe(1);
    expect(player(s, 'b').bank.ruby).toBe(1);

    s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    hand(s, 'a', ['swap', 'repair', 'immunity', 'slow_down']);
    hand(s, 'b', ['shield']);
    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'card', cardType: 'shield' } });
    const full = s.trades[0].id;
    freshTurn(s, 'b');
    reject(s, 'b', { type: 'respondTrade', offerId: full, accept: true }, /hand is full/i);
  });

  it('lets the recipient decline or answer off-turn, and the offerer cancel', () => {
    let s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    bank(s, 'b', { sapphire: 2 });
    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'gem', gem: 'sapphire' } });
    const offerId = s.trades[0].id;
    // Recipient answers while it is still the offerer's turn.
    s = act(s, 'b', { type: 'respondTrade', offerId, accept: false });
    expect(s.trades).toEqual([]);
    expect(s.lastEvents.some((e) => e.type === 'tradeResolved' && e.outcome === 'declined')).toBe(true);

    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'gem', gem: 'sapphire' } });
    const cancelId = s.trades[0].id;
    freshTurn(s, 'b');
    s = act(s, 'a', { type: 'cancelTrade', offerId: cancelId });
    expect(s.trades).toEqual([]);
    expect(s.lastEvents.some((e) => e.type === 'tradeResolved' && e.outcome === 'cancelled')).toBe(true);
  });

  it('expires open offers from the offerer at turn end via expireTrades', () => {
    let s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    bank(s, 'b', { sapphire: 2 });
    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'gem', gem: 'sapphire' } });
    expect(s.trades).toHaveLength(1);
    const ctx = { state: s, events: [] as GameState['lastEvents'], now: T0 };
    expireTrades(ctx, 'a');
    expect(s.trades).toEqual([]);
    expect(ctx.events.some((e) => e.type === 'tradeResolved' && e.outcome === 'expired')).toBe(true);
  });

  it('redacts trade details for third parties', () => {
    let s = noCards(game(3));
    bank(s, 'a', { ruby: 2 });
    bank(s, 'b', { sapphire: 2 });
    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'gem', gem: 'sapphire' } });
    const forA = tradesFor(s, 'a');
    const forB = tradesFor(s, 'b');
    const forC = tradesFor(s, 'c');
    expect(forA[0]).toMatchObject({ give: 'ruby', want: { kind: 'gem', gem: 'sapphire' } });
    expect(forB[0]).toMatchObject({ give: 'ruby' });
    expect(forC[0]).toEqual({ id: s.trades[0].id, from: 'a', to: 'b' });
    expect(toPlayerView(s, 'c').trades[0]).toEqual({ id: s.trades[0].id, from: 'a', to: 'b' });
  });

  it('does not reveal whether the recipient holds a requested power card on offer', () => {
    let s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    hand(s, 'b', []);
    afterQueenMoved(s);
    s = act(s, 'a', { type: 'offerTrade', to: 'b', give: 'ruby', want: { kind: 'card', cardType: 'shield' } });
    expect(s.trades).toHaveLength(1);
    freshTurn(s, 'b');
    reject(s, 'b', { type: 'respondTrade', offerId: s.trades[0].id, accept: true }, /does not hold/i);
  });
});

describe('powerOptions', () => {
  it('reports usable free actions from a PlayerView', () => {
    const s = noCards(game());
    bank(s, 'a', { ruby: 2 });
    bank(s, 'b', { sapphire: 2 });
    const gemId = carry(s, 'a-witch', 'ruby');
    place(s, 'a-king', 'c1');
    afterKingMoved(s);
    s.turn.moved = ['a-king', 'a-queen'];
    const view = toPlayerView(s, 'a');
    const opts = powerOptions(view, 'a');
    expect(opts.find((o) => o.type === 'royalGuard')?.usable).toBe(true);
    expect(opts.find((o) => o.type === 'alchemy')?.usable).toBe(true);
    expect(opts.find((o) => o.type === 'alchemy')?.alchemy?.[0]).toMatchObject({ gemId, from: 'ruby' });
    expect(opts.find((o) => o.type === 'offerTrade')?.usable).toBe(true);
  });
});
