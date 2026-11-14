import { describe, expect, it } from 'vitest';
import {
  allCastlesReachTreasure,
  applyAction,
  distancesFrom,
  enumerateMoves,
  getGraph,
  ISLE_OF_EMBERS,
  legalMovesForTurn,
} from '@/engine';
import { A, act, B, carry, ch, place, rolled, setup, tryAct } from './helpers';

const paths = (opts: { path: string[] }[]) => opts.map((o) => o.path.join('>'));

describe('board', () => {
  it('is data-driven and every castle reaches treasure', () => {
    const s = setup({ players: 4 });
    expect(ISLE_OF_EMBERS.spaces).toHaveLength(15 * 15);
    expect(new Set(ISLE_OF_EMBERS.spaces.map((sp) => sp.x)).size).toBe(15);
    expect(new Set(ISLE_OF_EMBERS.spaces.map((sp) => sp.y)).size).toBe(15);
    expect(getGraph(s.boardId).treasureSpaces).toEqual(['m1', 'x', 'm5']);
    expect(allCastlesReachTreasure(s)).toBe(true);
    const fromNorth = distancesFrom(s, 'c0', { allowCastles: ['c0'] });
    expect(fromNorth.x).toBeGreaterThan(6);
    for (const castle of ISLE_OF_EMBERS.castles) {
      const d = distancesFrom(s, castle, { allowCastles: [castle] });
      for (const home of ['m1', 'x', 'm5']) expect(d[home], `${castle} reaches ${home}`).toBeTypeOf('number');
    }
  });

  it('starts all characters at home with three treasures on the board', () => {
    const s = setup();
    expect(Object.values(s.characters).filter((c) => c.owner === A).every((c) => c.space === 'c0')).toBe(true);
    expect(s.treasures.map((t) => t.space)).toEqual(['m1', 'x', 'm5']);
  });
});

describe('rolling and turn order', () => {
  it('rolls once, then moves; rejects out-of-turn, stale and duplicate actions', () => {
    let s = setup();
    expect(tryAct(s, B, { type: 'roll' })).toMatchObject({ ok: false, error: 'It is not your turn.' });
    const v = s.version;
    s = act(s, A, { type: 'roll' });
    expect(s.turn.roll).toBeGreaterThanOrEqual(1);
    expect(s.turn.roll).toBeLessThanOrEqual(6);
    expect(s.turn.phase).toBe('move');
    expect(tryAct(s, A, { type: 'roll' }).ok).toBe(false);
    // Duplicate of the earlier roll envelope (same version) is stale now.
    expect(applyAction(s, { playerId: A, action: { type: 'roll' }, version: v }, 1000)).toMatchObject({ ok: false });
    expect(tryAct(s, A, { type: 'endTurn' }).ok).toBe(false);
  });

  it('does not grant an extra turn on a six', () => {
    let s = setup();
    s.forcedRolls = [6];
    s = act(s, A, { type: 'roll' });
    const m = legalMovesForTurn(s, A)[0];
    s = act(s, A, { type: 'move', characterId: m.characterId, path: m.path });
    s = act(s, A, { type: 'endTurn' });
    expect(s.turn.playerId).toBe(B);
  });

  it('skips movement when no legal move exists', () => {
    let s = setup();
    for (const c of Object.values(s.characters)) if (c.owner === A) c.recovering = true;
    s = act(s, A, { type: 'roll' });
    expect(s.turn.phase).toBe('action');
    expect(s.log.at(-1)!.text).toMatch(/No legal move/);
  });
});

describe('movement rules', () => {
  it('allows stopping early and choosing between routes', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'r0');
    const opts = enumerateMoves(s, ch(A, 'king'), 3, true);
    expect(opts.some((o) => o.target === 'r1')).toBe(true); // stop early
    expect(opts.some((o) => o.path.join('>') === 'r0>g0')).toBe(true);
    // The grid offers more than one way to the same square.
    const four = enumerateMoves(s, ch(A, 'king'), 4, true).filter((o) => o.target === 'p8-1');
    expect(four.length).toBeGreaterThanOrEqual(2);
  });

  it('passes through but never ends on friendly characters; castles hold many friends', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'r0');
    place(s, ch(A, 'queen'), 'r1');
    const opts = enumerateMoves(s, ch(A, 'king'), 2, true);
    expect(opts.some((o) => o.target === 'r1')).toBe(false);
    expect(paths(opts)).toContain('r0>r1>r2');
    expect(opts.some((o) => o.target === 'c0')).toBe(true); // castle with 2 friends inside
  });

  it('cannot enter an opponent castle', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'g2');
    const opts = enumerateMoves(s, ch(A, 'king'), 2, true);
    expect(opts.some((o) => o.path.includes('c2'))).toBe(false);
  });

  it('standard characters cannot pass through opponents; entering captures and stops', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'r0');
    place(s, ch(B, 'king'), 'r1');
    const opts = enumerateMoves(s, ch(A, 'king'), 3, true);
    expect(opts.some((o) => o.path.indexOf('r1') > -1 && o.target !== 'r1')).toBe(false);
    expect(opts.find((o) => o.target === 'r1')!.captures).toEqual([ch(B, 'king')]);
  });

  it('blocked connections and unbuilt bridges cannot be crossed', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'i1');
    expect(enumerateMoves(s, ch(A, 'king'), 1, true).some((o) => o.target === 'x')).toBe(false); // bridge i1-x unbuilt
    s.bridges['i1-x'] = true;
    expect(enumerateMoves(s, ch(A, 'king'), 1, true).some((o) => o.target === 'x')).toBe(true);
    s.blocks.push({ connectionId: 'i0-i1', owner: B });
    expect(enumerateMoves(s, ch(A, 'king'), 1, true).some((o) => o.target === 'i0')).toBe(false);
  });

  it('server rejects a route that is not legal', () => {
    let s = setup();
    rolled(s, 2);
    expect(tryAct(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['c0', 'g0', 'r0', 'r1'] }).ok).toBe(false);
    expect(tryAct(s, A, { type: 'move', characterId: ch(B, 'king'), path: ['c2', 'g2'] }).ok).toBe(false);
    expect(tryAct(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['c0', 'r0'] }).ok).toBe(false);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['c0', 'g0', 'r0'] });
    expect(s.characters[ch(A, 'king')].space).toBe('r0');
    expect(tryAct(s, A, { type: 'move', characterId: ch(A, 'queen'), path: ['c0', 'g0'] }).ok).toBe(false);
  });
});

describe('character abilities', () => {
  it('Queen moves through opponents without capturing', () => {
    let s = setup();
    place(s, ch(A, 'queen'), 'r0');
    place(s, ch(B, 'king'), 'r1');
    rolled(s, 2);
    s = act(s, A, { type: 'move', characterId: ch(A, 'queen'), path: ['r0', 'r1', 'r2'] });
    expect(s.characters[ch(B, 'king')].space).toBe('r1');
    expect(s.characters[ch(A, 'queen')].space).toBe('r2');
  });

  it('Queen ending on an opponent captures normally', () => {
    let s = setup();
    place(s, ch(A, 'queen'), 'r0');
    place(s, ch(B, 'king'), 'r1');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'queen'), path: ['r0', 'r1'] });
    expect(s.characters[ch(B, 'king')].space).toBe('c2');
  });

  it('Knight captures and continues, max one capture per move', () => {
    let s = setup();
    place(s, ch(A, 'knight'), 'r0');
    place(s, ch(B, 'king'), 'r1');
    place(s, ch(B, 'queen'), 'r3');
    rolled(s, 4);
    const opts = enumerateMoves(s, ch(A, 'knight'), 4, true);
    expect(paths(opts)).toContain('r0>r1>r2>m1');
    expect(opts.some((o) => o.target === 'r3' && o.path.includes('r1'))).toBe(false); // second capture
    s = act(s, A, { type: 'move', characterId: ch(A, 'knight'), path: ['r0', 'r1', 'r2', 'm1'] });
    expect(s.characters[ch(B, 'king')].space).toBe('c2');
    expect(s.characters[ch(B, 'king')].recovering).toBe(true);
    expect(s.characters[ch(A, 'knight')].carrying).toBe('t-m1');
  });

  it('Witch can use the fixed portal link for one step', () => {
    const s = setup();
    place(s, ch(A, 'witch'), 'm7');
    place(s, ch(A, 'king'), 'm7');
    expect(enumerateMoves(s, ch(A, 'witch'), 1, true).find((o) => o.target === 'm3')?.usesPortal).toBe(true);
    expect(enumerateMoves(s, ch(A, 'king'), 1, true).some((o) => o.target === 'm3')).toBe(false);
  });

  it('King draws a bonus card after banking', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'g0');
    carry(s, ch(A, 'king'));
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['g0', 'c0'] });
    expect(s.players[0].score).toBe(1);
    expect(s.turn.pendingDraws).toBe(1);
    s = act(s, A, { type: 'endTurn' });
    expect(s.hands[A]).toHaveLength(1);
  });
});

describe('capture, shield, immunity, recovery', () => {
  it('capturing a carrier: treasure drops, empty-handed capturer grabs it, victim recovers', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'r0');
    place(s, ch(B, 'witch'), 'r1');
    carry(s, ch(B, 'witch'), 'x');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'r1'] });
    expect(s.characters[ch(B, 'witch')]).toMatchObject({ space: 'c2', carrying: null, recovering: true });
    expect(s.characters[ch(A, 'king')].carrying).toBe('t-x');
    s = act(s, A, { type: 'endTurn' });
    // B's turn: the witch is not movable
    s.forcedRolls = [1];
    s = act(s, B, { type: 'roll' });
    expect(legalMovesForTurn(s, B).some((m) => m.characterId === ch(B, 'witch'))).toBe(false);
    expect(tryAct(s, B, { type: 'move', characterId: ch(B, 'witch'), path: ['c2', 'g2'] })).toMatchObject({ ok: false });
    s = act(s, B, { type: 'move', characterId: ch(B, 'king'), path: ['c2', 'g2'] });
    s = act(s, B, { type: 'endTurn' });
    expect(s.characters[ch(B, 'witch')].recovering).toBe(false);
  });

  it('a carrying capturer leaves the dropped treasure on the space', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'r0');
    carry(s, ch(A, 'king'), 'm1');
    place(s, ch(B, 'witch'), 'r1');
    carry(s, ch(B, 'witch'), 'x');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'r1'] });
    expect(s.treasures.find((t) => t.id === 't-x')!.space).toBe('r1');
    expect(s.characters[ch(A, 'king')].carrying).toBe('t-m1');
  });

  it('shield blocks a capture: attacker stops on the last free space', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'r0');
    place(s, ch(B, 'king'), 'r2');
    s.characters[ch(B, 'king')].power = { type: 'shield' };
    rolled(s, 2);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'r1', 'r2'] });
    expect(s.characters[ch(A, 'king')].space).toBe('r1');
    expect(s.characters[ch(B, 'king')]).toMatchObject({ space: 'r2', power: null });
  });

  it('shield with no free previous space leaves the attacker where it started', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'r0');
    place(s, ch(A, 'queen'), 'r1');
    place(s, ch(B, 'king'), 'r2');
    s.characters[ch(B, 'king')].power = { type: 'shield' };
    rolled(s, 2);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'r1', 'r2'] });
    expect(s.characters[ch(A, 'king')].space).toBe('r0');
    expect(s.characters[ch(B, 'king')].power).toBeNull();
  });

  it('Knight hitting a shield mid-route stops', () => {
    const s = setup();
    place(s, ch(A, 'knight'), 'r0');
    place(s, ch(B, 'king'), 'r1');
    s.characters[ch(B, 'king')].power = { type: 'shield' };
    const opts = enumerateMoves(s, ch(A, 'knight'), 3, true);
    expect(opts.some((o) => o.path.includes('r2'))).toBe(false);
    expect(opts.find((o) => o.path.join('>') === 'r0>r1')).toMatchObject({ final: 'r0', shieldBlocked: ch(B, 'king') });
  });

  it('immune characters cannot be captured; the Queen may still pass', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'r0');
    place(s, ch(A, 'queen'), 'r0');
    place(s, ch(B, 'king'), 'r1');
    s.characters[ch(B, 'king')].immune = true;
    expect(enumerateMoves(s, ch(A, 'king'), 1, true).some((o) => o.target === 'r1')).toBe(false);
    expect(paths(enumerateMoves(s, ch(A, 'queen'), 2, true))).toContain('r0>r1>r2');
  });

  it('captured character returns to a castle that already holds friends', () => {
    let s = setup();
    place(s, ch(B, 'king'), 'g2');
    place(s, ch(A, 'king'), 'r8');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r8', 'g2'] });
    expect(Object.values(s.characters).filter((c) => c.space === 'c2')).toHaveLength(4);
  });
});

describe('treasure and banking', () => {
  it('picks up treasure only by ending on it, and only one at a time', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'r2');
    rolled(s, 2);
    const passOver = enumerateMoves(s, ch(A, 'king'), 2, true).find((o) => o.path.join('>') === 'r2>m1>i1')!;
    expect(passOver.pickup).toBe(false);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r2', 'm1'] });
    expect(s.characters[ch(A, 'king')].carrying).toBe('t-m1');
  });

  it('a carrier cannot pick up a second treasure', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'r2');
    carry(s, ch(A, 'king'), 'x');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r2', 'm1'] });
    expect(s.characters[ch(A, 'king')].carrying).toBe('t-x');
    expect(s.treasures.find((t) => t.id === 't-m1')!.space).toBe('m1');
  });

  it('banked treasure respawns at home even when that space is occupied', () => {
    let s = setup();
    place(s, ch(A, 'queen'), 'g0');
    carry(s, ch(A, 'queen'), 'm1');
    place(s, ch(B, 'king'), 'm1');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'queen'), path: ['g0', 'c0'] });
    expect(s.players[0].score).toBe(1);
    expect(s.treasures.find((t) => t.id === 't-m1')).toMatchObject({ space: 'm1', carriedBy: null });
    expect(s.characters[ch(B, 'king')].carrying).toBeNull();
  });

  it('the third banked treasure wins immediately', () => {
    let s = setup();
    s.players[0].score = 2;
    place(s, ch(A, 'queen'), 'g0');
    carry(s, ch(A, 'queen'));
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'queen'), path: ['g0', 'c0'] });
    expect(s.status).toBe('finished');
    expect(s.result).toMatchObject({ winners: [A], reason: 'treasures' });
    expect(tryAct(s, A, { type: 'endTurn' }).ok).toBe(false);
  });
});
