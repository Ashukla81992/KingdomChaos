import { describe, expect, it } from 'vitest';
import {
  cardAvailability,
  cardCategory,
  createGame,
  enumerateMoves,
  legalTargets,
  registerBoard,
  type BoardDefinition,
  type CardTarget,
  type GameState,
} from '@/engine';
import { A, act, actionPhase, B, carry, ch, give, place, rolled, setup, tryAct } from './helpers';

const play = (s: GameState, pid: string, cardId: string, target: CardTarget) =>
  act(s, pid, { type: 'playCard', cardId, target });

describe('card play rules', () => {
  it('starting hands have one card of each category', () => {
    const s = createGame({ players: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], seed: 7, now: 0 });
    for (const id of ['A', 'B']) {
      expect(s.hands[id].map((c) => cardCategory(c.type)).sort()).toEqual(['map', 'power', 'special']);
    }
    expect(s.deck.length).toBe(40 - 6);
  });

  it('only after movement, once per turn, from own hand, with a valid target', () => {
    let s = setup();
    const shield = give(s, A, 'shield');
    const guard = give(s, A, 'royal_guard');
    const target = { kind: 'character' as const, characterId: ch(A, 'king') };
    expect(tryAct(s, A, { type: 'playCard', cardId: shield, target })).toMatchObject({ ok: false });
    expect(cardAvailability(s, A, s.hands[A][0])).toMatchObject({ playable: false });
    actionPhase(s, A);
    expect(tryAct(s, A, { type: 'playCard', cardId: 'nope', target }).ok).toBe(false);
    expect(tryAct(s, A, { type: 'playCard', cardId: shield, target: { kind: 'character', characterId: ch(B, 'king') } }).ok).toBe(false);
    s = play(s, A, shield, target);
    expect(s.characters[ch(A, 'king')].power).toEqual({ type: 'shield' });
    expect(s.discard.at(-1)!.id).toBe(shield);
    expect(tryAct(s, A, { type: 'playCard', cardId: guard, target: { kind: 'none' } })).toMatchObject({ ok: false, error: 'You can only play one card per turn.' });
  });

  it('cannot be played without a valid target', () => {
    const s = setup();
    actionPhase(s, A);
    const repair = give(s, A, 'repair');
    expect(legalTargets(s, A, 'repair')).toHaveLength(0);
    expect(cardAvailability(s, A, s.hands[A].find((c) => c.id === repair)!)).toEqual({ playable: false, reason: 'No valid target right now.' });
  });
});

describe('drawing', () => {
  it('draws at end of turn after landing on a card space', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'r0');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'm0'] });
    expect(s.turn.pendingDraws).toBe(1);
    s = act(s, A, { type: 'endTurn' });
    expect(s.hands[A]).toHaveLength(1);
    expect(s.turn.playerId).toBe(B);
  });

  it('full hand: choose a discard or decline', () => {
    let s = setup();
    for (let i = 0; i < 4; i++) give(s, A, 'shield');
    place(s, ch(A, 'king'), 'r0');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'm0'] });
    s = act(s, A, { type: 'endTurn' });
    expect(s.turn.phase).toBe('drawChoice');
    expect(tryAct(s, A, { type: 'endTurn' }).ok).toBe(false);
    const declined = act(s, A, { type: 'resolveDraw', discardCardId: null });
    expect(declined.hands[A]).toHaveLength(4);
    expect(declined.turn.playerId).toBe(B);
    const discardId = s.hands[A][0].id;
    const swapped = act(s, A, { type: 'resolveDraw', discardCardId: discardId });
    expect(swapped.hands[A]).toHaveLength(4);
    expect(swapped.hands[A].some((c) => c.id === discardId)).toBe(false);
    expect(swapped.discard.some((c) => c.id === discardId)).toBe(true);
  });

  it('reshuffles the discard pile when the deck is empty; no draw when both are empty', () => {
    let s = setup();
    s.discard = s.deck.splice(0, 3);
    s.deck = [];
    place(s, ch(A, 'king'), 'r0');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'm0'] });
    s = act(s, A, { type: 'endTurn' });
    expect(s.hands[A]).toHaveLength(1);
    expect(s.deck).toHaveLength(2);
    expect(s.discard).toHaveLength(0);

    let e = setup();
    e.deck = [];
    e.discard = [];
    place(e, ch(A, 'king'), 'r0');
    rolled(e, 1);
    e = act(e, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'm0'] });
    e = act(e, A, { type: 'endTurn' });
    expect(e.hands[A]).toHaveLength(0);
    expect(e.turn.playerId).toBe(B);
  });
});

describe('map cards', () => {
  it('Build Bridge opens an unbuilt bridge for everyone; Break Bridge closes it', () => {
    let s = setup();
    actionPhase(s, A);
    const build = give(s, A, 'build_bridge');
    s = play(s, A, build, { kind: 'connection', connectionId: 'i1-x' });
    expect(s.bridges['i1-x']).toBe(true);
    place(s, ch(B, 'king'), 'i1');
    expect(enumerateMoves(s, ch(B, 'king'), 1, true).some((o) => o.target === 'x')).toBe(true);
    actionPhase(s, B);
    const brk = give(s, B, 'break_bridge');
    expect(legalTargets(s, B, 'break_bridge').some((t) => t.kind === 'connection' && t.connectionId === 'r0-r1')).toBe(false);
    s = play(s, B, brk, { kind: 'connection', connectionId: 'i1-x' });
    expect(s.bridges['i1-x']).toBe(false);
  });

  it('Block Path lasts until the owner’s next turn', () => {
    let s = setup();
    actionPhase(s, A);
    const block = give(s, A, 'block_path');
    s = play(s, A, block, { kind: 'connection', connectionId: 'i0-i1' });
    expect(s.blocks).toHaveLength(1);
    s = act(s, A, { type: 'endTurn' });
    expect(s.blocks).toHaveLength(1); // still blocked during B's turn
    s.turn.phase = 'action';
    s = act(s, B, { type: 'endTurn' });
    expect(s.turn.playerId).toBe(A);
    expect(s.blocks).toHaveLength(0);
  });

  it('rejects a block that would cut a castle off from every treasure', () => {
    const cut: BoardDefinition = {
      id: 'cut-test',
      name: 'Cut test',
      width: 100,
      height: 100,
      spaces: [
        { id: 'c0', type: 'castle', x: 0, y: 0, seat: 0 },
        { id: 'a', type: 'normal', x: 20, y: 0 },
        { id: 'x', type: 'treasure', x: 40, y: 0 },
        { id: 'b', type: 'normal', x: 60, y: 0 },
        { id: 's', type: 'normal', x: 20, y: 20 },
        { id: 'c2', type: 'castle', x: 80, y: 0, seat: 1 },
        { id: 'p1', type: 'portal', x: 0, y: 20 },
        { id: 'p2', type: 'portal', x: 20, y: 20 },
      ],
      connections: [
        { id: 'c0-a', a: 'c0', b: 'a', kind: 'permanent' },
        { id: 'a-x', a: 'a', b: 'x', kind: 'permanent' },
        { id: 'x-b', a: 'x', b: 'b', kind: 'blockable' },
        { id: 'a-s', a: 'a', b: 's', kind: 'blockable' },
        { id: 'b-c2', a: 'b', b: 'c2', kind: 'permanent' },
      ],
      castles: ['c0', 'c2'],
      seatOrder: { 2: [0, 1] },
      fixedPortals: ['p1', 'p2'],
    };
    registerBoard(cut);
    const s = createGame({
      players: [
        { id: A, name: 'A' },
        { id: B, name: 'B' },
      ],
      seed: 1,
      now: 0,
      boardId: 'cut-test',
      config: { matchDurationMs: 0, turnDurationMs: 0 },
    });
    actionPhase(s, A);
    const ids = legalTargets(s, A, 'block_path').map((t) => (t.kind === 'connection' ? t.connectionId : ''));
    expect(ids).not.toContain('x-b');
    expect(ids).toContain('a-s');
    const block = give(s, A, 'block_path');
    expect(tryAct(s, A, { type: 'playCard', cardId: block, target: { kind: 'connection', connectionId: 'x-b' } }).ok).toBe(false);
  });

  it('the king’s road means one block never isolates a castle on the real board', () => {
    const s = setup();
    actionPhase(s, A);
    const ids = legalTargets(s, A, 'block_path').map((t) => (t.kind === 'connection' ? t.connectionId : ''));
    expect(ids).toContain('i0-i1');
    expect(ids.length).toBeGreaterThan(100);
  });

  it('Portal links a site to a fixed portal for everyone, then fades', () => {
    let s = setup();
    actionPhase(s, A);
    const portal = give(s, A, 'portal');
    s = play(s, A, portal, { kind: 'portal', space: 'r1', linkedTo: 'm3' });
    place(s, ch(B, 'king'), 'r1');
    const opt = enumerateMoves(s, ch(B, 'king'), 1, true).find((o) => o.target === 'm3');
    expect(opt?.usesPortal).toBe(true);
    expect(legalTargets(s, A, 'portal').some((t) => t.kind === 'portal' && t.space === 'r1')).toBe(false);
    s = act(s, A, { type: 'endTurn' });
    s.turn.phase = 'action';
    s = act(s, B, { type: 'endTurn' });
    expect(s.tempPortals).toHaveLength(0);
  });

  it('Trap sends an opponent home (treasure drops), ignores the owner, respects immunity, expires', () => {
    let s = setup();
    actionPhase(s, A);
    const trap = give(s, A, 'trap');
    s = play(s, A, trap, { kind: 'space', space: 'r0' });
    // Owner is unaffected
    expect(enumerateMoves(s, ch(A, 'king'), 2, true).find((o) => o.target === 'r0')!.trapped).toBe(false);
    s = act(s, A, { type: 'endTurn' });
    // Shield does not help; immunity does
    place(s, ch(B, 'queen'), 'r1');
    s.characters[ch(B, 'queen')].immune = true;
    expect(enumerateMoves(s, ch(B, 'queen'), 1, true).find((o) => o.target === 'r0')!.trapped).toBe(false);
    place(s, ch(B, 'king'), 'r15');
    carry(s, ch(B, 'king'), 'x');
    s.characters[ch(B, 'king')].power = { type: 'shield' };
    rolled(s, 1);
    s = act(s, B, { type: 'move', characterId: ch(B, 'king'), path: ['r15', 'r0'] });
    expect(s.characters[ch(B, 'king')]).toMatchObject({ space: 'c2', carrying: null, recovering: false });
    expect(s.treasures.find((t) => t.id === 't-x')!.space).toBe('r0');
    expect(s.traps).toHaveLength(0);
  });

  it('unused traps expire after two rounds', () => {
    let s = setup();
    actionPhase(s, A);
    s = play(s, A, give(s, A, 'trap'), { kind: 'space', space: 'r0' });
    for (let round = 0; round < 2; round++) {
      expect(s.traps).toHaveLength(1);
      s.turn.phase = 'action';
      s = act(s, s.turn.playerId, { type: 'endTurn' });
      s.turn.phase = 'action';
      s = act(s, s.turn.playerId, { type: 'endTurn' });
    }
    expect(s.traps).toHaveLength(0);
  });
});

describe('character power cards', () => {
  it('Speed Boost moves up to 2 with captures but never draws', () => {
    let s = setup();
    actionPhase(s, A);
    place(s, ch(A, 'king'), 'r0');
    const boost = give(s, A, 'speed_boost');
    s = play(s, A, boost, { kind: 'characterPath', characterId: ch(A, 'king'), path: ['r0', 'm0'] });
    expect(s.characters[ch(A, 'king')].space).toBe('m0');
    expect(s.turn.pendingDraws).toBe(0);
  });

  it('Shield replaces an existing power; Attack Boost cannot go on a Knight', () => {
    let s = setup();
    actionPhase(s, A);
    s.characters[ch(A, 'queen')].power = { type: 'attack_boost' };
    s = play(s, A, give(s, A, 'shield'), { kind: 'character', characterId: ch(A, 'queen') });
    expect(s.characters[ch(A, 'queen')].power).toEqual({ type: 'shield' });
    expect(legalTargets(s, A, 'attack_boost').some((t) => t.kind === 'character' && t.characterId === ch(A, 'knight'))).toBe(false);
  });

  it('Attack Boost: capture while continuing, max once, consumed after the next regular move', () => {
    let s = setup();
    actionPhase(s, A);
    place(s, ch(A, 'king'), 'r0');
    s = play(s, A, give(s, A, 'attack_boost'), { kind: 'character', characterId: ch(A, 'king') });
    s.turn.playerId = A;
    place(s, ch(B, 'witch'), 'r1');
    rolled(s, 2);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'r1', 'r2'] });
    expect(s.characters[ch(B, 'witch')].space).toBe('c2');
    expect(s.characters[ch(A, 'king')]).toMatchObject({ space: 'r2', power: null });
  });

  it('Teleport moves to an empty fixed portal and picks up treasure there without drawing', () => {
    let s = setup();
    actionPhase(s, A);
    s.treasures.find((t) => t.id === 't-x')!.space = 'm3';
    s = play(s, A, give(s, A, 'teleport'), { kind: 'characterSpace', characterId: ch(A, 'witch'), space: 'm3' });
    expect(s.characters[ch(A, 'witch')]).toMatchObject({ space: 'm3', carrying: 't-x' });
    place(s, ch(B, 'king'), 'm7');
    actionPhase(s, B);
    expect(legalTargets(s, B, 'teleport').every((t) => t.kind === 'characterSpace' && t.space !== 'm7' && t.space !== 'm3')).toBe(true);
  });

  it('Royal Guard blocks the next Castle Attack and is consumed', () => {
    let s = setup();
    actionPhase(s, B);
    s = play(s, B, give(s, B, 'royal_guard'), { kind: 'none' });
    expect(s.castles.c2.royalGuard).toBe(true);
    actionPhase(s, A);
    s = play(s, A, give(s, A, 'castle_attack'), { kind: 'player', playerId: B });
    expect(s.castles.c2).toMatchObject({ royalGuard: false, damagedBy: null });
  });
});

describe('special move cards', () => {
  it('Swap exchanges positions; carriers keep treasure; no pickup or trap triggers', () => {
    let s = setup();
    actionPhase(s, A);
    place(s, ch(A, 'king'), 'r0');
    carry(s, ch(A, 'king'), 'm1');
    place(s, ch(B, 'knight'), 'r9');
    carry(s, ch(B, 'knight'), 'x');
    s.traps.push({ space: 'r0', owner: A, roundsLeft: 2 });
    s = play(s, A, give(s, A, 'swap'), { kind: 'swap', characterId: ch(A, 'king'), targetCharacterId: ch(B, 'knight') });
    expect(s.characters[ch(A, 'king')]).toMatchObject({ space: 'r9', carrying: 't-m1' });
    expect(s.characters[ch(B, 'knight')]).toMatchObject({ space: 'r0', carrying: 't-x' });
    expect(s.traps).toHaveLength(1);
  });

  it('Swap cannot target immune, castle or treasure-space characters', () => {
    const s = setup();
    actionPhase(s, A);
    place(s, ch(A, 'king'), 'r0');
    place(s, ch(B, 'king'), 'r9');
    s.characters[ch(B, 'king')].immune = true;
    place(s, ch(B, 'queen'), 'm5');
    const targets = legalTargets(s, A, 'swap').map((t) => (t.kind === 'swap' ? t.targetCharacterId : ''));
    expect(targets).not.toContain(ch(B, 'king'));
    expect(targets).not.toContain(ch(B, 'queen'));
    expect(targets).not.toContain(ch(B, 'witch')); // in castle
    expect(legalTargets(s, A, 'swap')).toHaveLength(0);
  });

  it('Immunity lasts until the start of the owner’s next turn', () => {
    let s = setup();
    actionPhase(s, A);
    s = play(s, A, give(s, A, 'immunity'), { kind: 'character', characterId: ch(A, 'king') });
    s = act(s, A, { type: 'endTurn' });
    expect(s.characters[ch(A, 'king')].immune).toBe(true);
    s.turn.phase = 'action';
    s = act(s, B, { type: 'endTurn' });
    expect(s.characters[ch(A, 'king')].immune).toBe(false);
  });

  it('Slow Down caps the next regular move at 2; only one pending', () => {
    let s = setup();
    actionPhase(s, A);
    s = play(s, A, give(s, A, 'slow_down'), { kind: 'player', playerId: B });
    expect(legalTargets(s, A, 'slow_down')).toHaveLength(0);
    s = act(s, A, { type: 'endTurn' });
    s.forcedRolls = [6];
    s = act(s, B, { type: 'roll' });
    expect(s.turn).toMatchObject({ roll: 6, steps: 2, slowed: true });
    expect(s.players[1].slowDownPending).toBe(false);
  });

  it('Castle Attack stops banking; carrier inside banks when damage expires', () => {
    let s = setup();
    actionPhase(s, A);
    s = play(s, A, give(s, A, 'castle_attack'), { kind: 'player', playerId: B });
    expect(s.castles.c2.damagedBy).toBe(A);
    expect(legalTargets(s, A, 'castle_attack')).toHaveLength(0);
    s = act(s, A, { type: 'endTurn' });
    place(s, ch(B, 'queen'), 'g2');
    carry(s, ch(B, 'queen'), 'm5');
    rolled(s, 1);
    s = act(s, B, { type: 'move', characterId: ch(B, 'queen'), path: ['g2', 'c2'] });
    expect(s.players[1].score).toBe(0);
    expect(s.characters[ch(B, 'queen')].carrying).toBe('t-m5');
    s = act(s, B, { type: 'endTurn' });
    expect(s.turn.playerId).toBe(A);
    expect(s.castles.c2.damagedBy).toBeNull();
    expect(s.players[1].score).toBe(1);
    expect(s.treasures.find((t) => t.id === 't-m5')!.space).toBe('m5');
  });

  it('Repair fixes a damaged castle (banking carriers inside) or clears a block, never a bridge', () => {
    let s = setup();
    s.castles.c0.damagedBy = B;
    carry(s, ch(A, 'knight'), 'm1');
    s.blocks.push({ connectionId: 'i0-i1', owner: B });
    s.bridges['r3-r4'] = false;
    actionPhase(s, A);
    const targets = legalTargets(s, A, 'repair');
    expect(targets).toHaveLength(2);
    expect(targets.some((t) => t.kind === 'connection' && t.connectionId === 'r3-r4')).toBe(false);
    s = play(s, A, give(s, A, 'repair'), { kind: 'none' });
    expect(s.castles.c0.damagedBy).toBeNull();
    expect(s.players[0].score).toBe(1);
    expect(s.characters[ch(A, 'knight')].carrying).toBeNull();
  });
});
