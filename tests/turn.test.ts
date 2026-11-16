import { describe, expect, it } from 'vitest';
import { applyAction, forceTimeout, legalMoves, movableCharacters, stepsFor, tick, toPlayerView } from '@/engine';
import { act, endsFor, freshTurn, game, hand, move, noCards, place, player, reject, rollMove, rollWith, routeTo, T0, unlock } from './helpers';

describe('dice and turns', () => {
  it('rolls once per turn; changing the selected piece never rerolls', () => {
    let s = noCards(game());
    s = rollWith(s, 'a', 4);
    const before = s.turn.move;
    expect(endsFor(s, 'a-king')).toEqual(new Set(['c3', 'c37', 'lake-1', 'willow-1']));
    expect(endsFor(s, 'a-queen')).toEqual(endsFor(s, 'a-king'));
    expect(s.turn.move).toEqual(before);
    reject(s, 'a', { type: 'roll' }, /already rolled/);
  });

  it('any roll brings a piece out: the first step lands on the house gate', () => {
    let s = noCards(game());
    s = rollWith(s, 'a', 1);
    expect(routeTo(s, 'a-king', 'c0')).toEqual(['home-red', 'c0']);
    s = noCards(game());
    s = rollWith(s, 'a', 6);
    expect(routeTo(s, 'a-king', 'c5')).toEqual(['home-red', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5']);
  });

  it('uses the whole roll, either way along the road, and never steps on a space twice', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king')).toEqual(new Set(['c11', 'c5', 'blue-road-1', 'crag', 'mine-1']));
    for (const m of legalMoves(s, 'a-king')) {
      expect(m.path).toHaveLength(4);
      expect(new Set(m.path).size).toBe(m.path.length);
    }
    reject(s, 'a', { type: 'move', characterId: 'a-king', path: ['c8', 'c9', 'c10'] });
    reject(s, 'a', { type: 'move', characterId: 'a-king', path: ['c8', 'c9', 'c8', 'c9'] });
  });

  it('turns pass clockwise without a 6 or a cut', () => {
    let s = noCards(game(4));
    expect(s.players.map((p) => p.seat)).toEqual([0, 1, 2, 3]);
    place(s, 'a-king', 'c8');
    s = rollMove(s, 'a', 'a-king', 5, 'c13');
    expect(s.turn.playerId).toBe('b');
    s = rollMove(s, 'b', 'b-king', 1, 'c10');
    expect(s.turn.playerId).toBe('c');
  });
});

describe('extra turns', () => {
  it('a natural 6 earns one extra turn, after the move and adventure finish, in the same round', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c21');
    const round = s.turn.round;
    s = rollWith(s, 'a', 6);
    expect(s.turn.extra).toBe('six');
    expect(s.lastEvents).toContainEqual({ type: 'extraTurn', playerId: 'a', reason: 'six' });
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c27'));
    expect(s.turn).toMatchObject({ playerId: 'a', move: null, moveDone: false, bonus: true, extra: null, round });
    s = rollMove(s, 'a', 'a-king', 2, 'c29');
    expect(s.turn.playerId).toBe('b');
  });

  it('extra turns chain: a 6 on the extra turn earns another', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    s = rollMove(s, 'a', 'a-king', 6, 'c14');
    s = rollMove(s, 'a', 'a-king', 6, 'c20');
    expect(s.turn.playerId).toBe('a');
    s = rollMove(s, 'a', 'a-king', 1, 'c21');
    expect(s.turn.playerId).toBe('b');
  });

  it('a movement cut earns one extra turn', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    place(s, 'b-witch', 'c11');
    s = rollMove(s, 'a', 'a-king', 3, 'c11');
    expect(s.characters['b-witch'].node).toBe('home-purple');
    expect(s.turn).toMatchObject({ playerId: 'a', bonus: true });
    expect(s.log.some((l) => /bonus roll/i.test(l.text))).toBe(true);
  });

  it('a 6 that also cuts still earns only one extra turn', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c5');
    place(s, 'b-witch', 'c11');
    s = rollWith(s, 'a', 6);
    expect(s.lastEvents.filter((e) => e.type === 'extraTurn')).toHaveLength(1);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c11'));
    expect(s.lastEvents.some((e) => e.type === 'cut')).toBe(true);
    expect(s.lastEvents.filter((e) => e.type === 'extraTurn')).toHaveLength(0);
    expect(s.turn.playerId).toBe('a');
    s = rollMove(s, 'a', 'a-king', 2, 'c13');
    expect(s.turn.playerId).toBe('b');
  });

  it('a protected rival cannot be cut, so it earns nothing', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    place(s, 'b-witch', 'c11', { shield: true });
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king').has('c11')).toBe(false);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'crag'));
    expect(s.turn.playerId).toBe('b');
  });

  it('the clock forfeits an earned extra turn', () => {
    let s = noCards(game());
    s = rollWith(s, 'a', 6);
    const r = forceTimeout(s, T0);
    expect(r.ok && r.state.turn.playerId).toBe('b');
  });
});

describe('turn flow', () => {
  it('allows the adventure action before or after moving', () => {
    let s = game();
    hand(s, 'a', ['shield']);
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'character', characterId: 'a-king' } });
    expect(s.turn.adventureDone).toBe(true);
    expect(s.turn.playerId).toBe('a');
    s = rollMove(s, 'a', 'a-king', 2, 'c1');
    expect(s.turn.playerId).toBe('b');
  });

  it('will not let you skip a move when a legal one exists', () => {
    let s = noCards(game());
    s = rollWith(s, 'a', 3);
    reject(s, 'a', { type: 'skipMove' }, /legal move/);
  });

  it('explains and skips when no piece can use the roll; pending bonus still resolves', () => {
    let s = noCards(game(2, { finishersToWin: 5 }));
    for (const k of ['king', 'queen', 'witch', 'knight']) place(s, `a-${k}`, 'temple', { finished: true, lap: 4 });
    s = rollWith(s, 'a', 6);
    expect(s.lastEvents.some((e) => e.type === 'noMove')).toBe(true);
    expect(s.log.some((l) => /No legal move/.test(l.text))).toBe(true);
    expect(s.turn).toMatchObject({ playerId: 'a', bonus: true, move: null, moveDone: false });
  });

  it('never lets a piece into an opponent castle or Royal Path', () => {
    let s = noCards(unlock(game(4), 'a'));
    place(s, 'a-king', 'c10', { lap: 4 });
    s = rollWith(s, 'a', 2);
    expect(legalMoves(s, 'a-king').every((m) => !m.path.some((n) => n.startsWith('f-blue') || n === 'home-blue'))).toBe(true);
  });

  it('rejects a stale action version', () => {
    const s = game();
    const r = applyAction(s, { playerId: 'a', action: { type: 'roll' }, version: s.version + 1 }, T0);
    expect(r.ok).toBe(false);
  });

  it('shows companion movement as Roll − Dragon = Move', () => {
    const s = game();
    place(s, 'a-king', 'c3');
    s.dragon = { state: 'companion', node: 'c3', companion: 'a-king', recoverUntilTurn: 0, releasedBy: null };
    expect(stepsFor(s, 'a-king', 5, false)).toEqual({ steps: 3, note: 'Roll 5 − Dragon 2 = Move 3' });
    expect(stepsFor(s, 'a-king', 2, false).steps).toBe(1);
  });
});

describe('timers', () => {
  it('auto-plays a timed-out turn: rolls, moves, skips the adventure', () => {
    let s = game(2, { turnDurationMs: 30_000 });
    s.forcedRolls = [3];
    const r = tick(s, T0 + 31_000)!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.turn.playerId).toBe('b');
    expect(Object.values(s.characters).some((c) => c.owner === 'a' && c.node !== 'home-red')).toBe(true);
    expect(s.stats.a.timeouts).toBe(1);
  });

  it('ends the match on the clock: most gems, then a cut, then shared', () => {
    let s = game(3, { matchDurationMs: 60_000 });
    player(s, 'a').gems = ['ruby', 'sapphire'];
    player(s, 'b').gems = ['ruby', 'emerald'];
    player(s, 'c').gems = ['ruby'];
    s.stats.b.cuts = 1;
    let r = tick(s, T0 + 61_000)!;
    expect(r.ok && r.state.result).toMatchObject({ winners: ['b'], reason: 'timer', tieBreak: 'cut' });
    s = game(2, { matchDurationMs: 60_000 });
    r = tick(s, T0 + 61_000)!;
    expect(r.ok && r.state.result).toMatchObject({ winners: ['a', 'b'], tieBreak: 'shared' });
  });

  it('supports a fixed round limit (the physical-game option)', () => {
    let s = noCards(game(2, { roundLimit: 1 }));
    s = rollMove(s, 'a', 'a-king', 1, 'c0');
    s = rollMove(s, 'b', 'b-king', 1, 'c20');
    expect(s.status).toBe('finished');
    expect(s.result?.reason).toBe('rounds');
  });

  it('forceTimeout works mid-turn after a roll', () => {
    let s = noCards(game());
    s = rollWith(s, 'a', 2);
    const r = forceTimeout(s, T0);
    expect(r.ok && r.state.turn.playerId).toBe('b');
  });
});

describe('hidden information', () => {
  it('a player view shows only your own hand and no deck or discovery order', () => {
    const s = game();
    const v = toPlayerView(s, 'a');
    expect(v.hand).toEqual(s.hands.a);
    expect(JSON.stringify(v)).not.toContain(JSON.stringify(s.hands.b));
    expect(v).not.toHaveProperty('deck');
    expect(v).not.toHaveProperty('discoveries');
    expect(v).not.toHaveProperty('rngState');
    expect(v.handCounts.b).toBe(3);
  });

  it('everyone starts with one card of each category', () => {
    const s = game(4);
    for (const p of s.players) expect(s.hands[p.id]).toHaveLength(3);
  });
});

describe('movers', () => {
  it('lists only pieces with a legal route', () => {
    let s = noCards(game());
    s = rollWith(s, 'a', 2);
    expect(movableCharacters(s).map((m) => m.characterId).sort()).toEqual(['a-king', 'a-knight', 'a-queen', 'a-witch']);
    s = move(s, 'a', 'a-king', ['home-red', 'c0', 'c1']);
    freshTurn(s, 'a');
    s = rollWith(s, 'a', 1);
    // Leaving home onto c0 is fine (safe); the king can step on to c2 or back to the gate.
    expect(endsFor(s, 'a-king')).toEqual(new Set(['c0', 'c2']));
  });
});
