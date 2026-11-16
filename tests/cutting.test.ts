import { describe, expect, it } from 'vitest';
import { applyAction, legalMoves } from '@/engine';
import { act, carry, endsFor, game, hand, move, noCards, place, reject, rollMove, rollWith, routeTo, T0 } from './helpers';

describe('cuts', () => {
  it('ending a move on an opponent on an unsafe space cuts it home and resets its lap', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c4', { lap: 2 });
    s = rollMove(s, 'a', 'a-king', 3, 'c4');
    expect(s.characters['b-king']).toMatchObject({ node: 'home-purple', lap: 0 });
    expect(s.stats.a.cuts).toBe(1);
    expect(s.lastEvents.some((e) => e.type === 'cut')).toBe(true);
  });

  it('a cut does not use the adventure action', () => {
    let s = game();
    hand(s, 'a', ['shield']);
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c4');
    s = rollMove(s, 'a', 'a-king', 3, 'c4');
    expect(s.turn.playerId).toBe('a');
    expect(s.turn.adventureDone).toBe(false);
  });

  it('the attacker takes the victim’s gem with free hands; otherwise it drops on the space', () => {
    let s = noCards(game());
    s.players.find((p) => p.id === 'a')!.gems = ['ruby'];
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c4');
    carry(s, 'b-king', 'emerald');
    s = rollMove(s, 'a', 'a-king', 3, 'c4');
    expect(s.gems.find((g) => g.carriedBy === 'a-king')?.kind).toBe('emerald');

    s = noCards(game());
    place(s, 'a-king', 'c1');
    carry(s, 'a-king', 'diamond');
    place(s, 'b-king', 'c4');
    carry(s, 'b-king', 'emerald');
    s = rollMove(s, 'a', 'a-king', 3, 'c4');
    expect(s.gems.find((g) => g.kind === 'emerald')).toMatchObject({ node: 'c4', carriedBy: null });
  });

  it('banked gems can never be taken', () => {
    let s = noCards(game());
    s.players.find((p) => p.id === 'b')!.gems = ['ruby'];
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c4');
    s = rollMove(s, 'a', 'a-king', 3, 'c4');
    expect(s.players.find((p) => p.id === 'b')!.gems).toEqual(['ruby']);
  });

  it('safe spaces hold several pieces, even opponents, and nobody is cut there', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c6');
    place(s, 'b-king', 'c3');
    s = rollMove(s, 'a', 'a-king', 3, 'c3');
    expect(s.characters['b-king'].node).toBe('c3');
    expect(s.characters['a-king'].node).toBe('c3');
  });

  it('you may pass your own pieces but not end on one outside a safe space', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c4');
    place(s, 'a-queen', 'c6');
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king').has('c6')).toBe(false);
    s = noCards(game());
    place(s, 'a-king', 'c4');
    place(s, 'a-queen', 'c5');
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king').has('c7')).toBe(true);
  });

  it('an opponent on an unsafe space blocks passing (the other way is still open)', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c2');
    s = rollWith(s, 'a', 4);
    expect(legalMoves(s, 'a-king').every((m) => !m.path.includes('c2'))).toBe(true);
    expect(endsFor(s, 'a-king').has('c37')).toBe(true);
  });

  it('the Queen passes opponents without cutting them', () => {
    let s = noCards(game());
    place(s, 'a-queen', 'c1');
    place(s, 'b-king', 'c2');
    s = rollMove(s, 'a', 'a-queen', 3, 'c4');
    expect(s.characters['b-king'].node).toBe('c2');
  });

  it('the Knight cuts one opponent he passes and keeps moving, but not a protected one', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c2');
    s = rollMove(s, 'a', 'a-knight', 3, 'c4');
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.characters['a-knight'].node).toBe('c4');

    s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c2', { shield: true });
    s = rollWith(s, 'a', 3);
    expect(legalMoves(s, 'a-knight').every((m) => !m.path.includes('c2'))).toBe(true);
  });

  it('the Knight cannot pass a second opponent in one move', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c6');
    place(s, 'b-king', 'c8');
    place(s, 'b-queen', 'c9');
    s = rollWith(s, 'a', 4);
    expect(endsFor(s, 'a-knight').has('c10')).toBe(false);
  });

  it('Shield or Immunity makes landing illegal and the server rejects it', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c4', { immune: true });
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king').has('c4')).toBe(false);
    reject(s, 'a', { type: 'move', characterId: 'a-king', path: ['c1', 'c2', 'c3', 'c4'] }, /not legal/);
  });

  it('a route that became illegal is rejected (stale preview)', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    s = rollWith(s, 'a', 3);
    const path = routeTo(s, 'a-king', 'c4');
    s.characters['b-king'].node = 'c4';
    s.characters['b-king'].shield = true;
    const r = applyAction(s, { playerId: 'a', action: { type: 'move', characterId: 'a-king', path } }, T0);
    expect(r.ok).toBe(false);
  });

  it('cutting the dragon’s companion sets the dragon wild on that space', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c4');
    s.dragon = { state: 'companion', node: 'c4', companion: 'b-king', recoverUntilTurn: 0, releasedBy: null };
    s = rollMove(s, 'a', 'a-king', 3, 'c4');
    expect(s.dragon).toMatchObject({ state: 'wild', node: 'c4', companion: null });
  });

  it('Magic Boots never cut', () => {
    let s = game();
    hand(s, 'a', ['magic_boots']);
    place(s, 'a-king', 'c2');
    place(s, 'b-king', 'c4');
    reject(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'path', characterId: 'a-king', path: ['c2', 'c3', 'c4'] } }, /not allowed/);
    s = act(s, 'a', { type: 'roll' });
    void move;
  });
});
