import { describe, expect, it } from 'vitest';
import { createGame, enumerateMoves, isLand, ISLE_OF_EMBERS, legalTargets, registerBoard, type CardTarget, type GameState } from '@/engine';
import { A, act, actionPhase, B, ch, give, place, rolled, setup } from './helpers';

const targets = (s: GameState, id: string, steps: number) => new Set(enumerateMoves(s, id, steps, true).map((o) => o.target));
const play = (s: GameState, pid: string, cardId: string, target: CardTarget) => act(s, pid, { type: 'playCard', cardId, target });
const spaceTargets = (s: GameState, pid: string, type: Parameters<typeof legalTargets>[2]) =>
  new Set(legalTargets(s, pid, type).flatMap((t) => (t.kind === 'space' ? [t.space] : [])));

describe('terrain map', () => {
  it('every castle, treasure and portal sits on land; the map has every terrain', () => {
    const s = setup({ players: 4 });
    for (const sp of ISLE_OF_EMBERS.spaces) {
      if (sp.type !== 'normal' && sp.type !== 'card') expect(isLand(s.terrain[sp.id]), sp.id).toBe(true);
    }
    const kinds = new Set(Object.values(s.terrain));
    for (const t of ['grass', 'forest', 'plateau', 'mountain', 'river', 'lake', 'ocean', 'bridge', 'tunnel', 'harbor', 'airfield'] as const)
      expect(kinds.has(t), t).toBe(true);
  });

  it('has squares only reachable by boat or glider', () => {
    const s = setup({ players: 4 });
    place(s, ch(A, 'king'), 'g0');
    // The north-east cove is ringed by lake, ocean and mountains.
    const reach = new Set<string>();
    const queue = ['g0'];
    while (queue.length) {
      const u = queue.shift()!;
      for (const o of enumerateMoves({ ...s, characters: { ...s.characters, [ch(A, 'king')]: { ...s.characters[ch(A, 'king')], space: u } } }, ch(A, 'king'), 1, false)) {
        if (!reach.has(o.target)) {
          reach.add(o.target);
          queue.push(o.target);
        }
      }
    }
    expect(reach.has('p13-1')).toBe(false);
    expect(isLand(s.terrain['p13-1'])).toBe(true);
  });
});

describe('terrain movement', () => {
  it('walkers cannot enter or stop on water; a Boat sails across but must land', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'm0');
    expect(s.terrain['p8-3']).toBe('river');
    const walk = targets(s, ch(A, 'king'), 2);
    expect(walk.has('p8-3')).toBe(false);
    expect(walk.has('r3')).toBe(false);
    s.characters[ch(A, 'king')].power = { type: 'boat' };
    const sail = targets(s, ch(A, 'king'), 2);
    expect(sail.has('r3')).toBe(true);
    expect(sail.has('p8-3')).toBe(false);
    expect(enumerateMoves(s, ch(A, 'king'), 2, false).some((o) => o.target === 'r3')).toBe(false);
  });

  it('a Boat is used up by the next regular move', () => {
    let s = setup();
    place(s, ch(A, 'king'), 'm0');
    s.characters[ch(A, 'king')].power = { type: 'boat' };
    rolled(s, 2);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['m0', 'p8-3', 'r3'] });
    expect(s.characters[ch(A, 'king')].space).toBe('r3');
    expect(s.characters[ch(A, 'king')].power).toBeNull();
  });

  it('starting on a harbor lets anyone sail', () => {
    const s = setup();
    expect(s.terrain['p1-2']).toBe('harbor');
    place(s, ch(A, 'king'), 'p1-2');
    expect(targets(s, ch(A, 'king'), 2).has('p1-4')).toBe(true);
    place(s, ch(A, 'king'), 'p2-2');
    expect(targets(s, ch(A, 'king'), 2).has('p1-4')).toBe(false);
  });

  it('mountains need a Glider; a Glider also crosses water', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'p3-9');
    expect(s.terrain['p4-9']).toBe('mountain');
    expect(targets(s, ch(A, 'king'), 3).has('p6-9')).toBe(false);
    s.characters[ch(A, 'king')].power = { type: 'glider' };
    const fly = targets(s, ch(A, 'king'), 3);
    expect(fly.has('p6-9')).toBe(true);
    expect(fly.has('p4-9')).toBe(false);
    expect(fly.has('p1-9')).toBe(false); // lake square: fly over, never land
    expect(fly.has('p1-8')).toBe(true);
  });

  it('airfields are linked by a one-step flight', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'p5-1');
    const t = targets(s, ch(A, 'king'), 1);
    expect(t.has('p13-8')).toBe(true);
    expect(t.has('p1-12')).toBe(true);
  });

  it('a Shield bounces a sailing attacker back to land, never onto water', () => {
    const s = setup();
    place(s, ch(A, 'king'), 'm0');
    s.characters[ch(A, 'king')].power = { type: 'boat' };
    place(s, ch(B, 'king'), 'r3');
    s.characters[ch(B, 'king')].power = { type: 'shield' };
    const hit = enumerateMoves(s, ch(A, 'king'), 2, true).find((o) => o.path.join('>') === 'm0>p8-3>r3')!;
    expect(hit.shieldBlocked).toBe(ch(B, 'king'));
    expect(hit.final).toBe('m0');
  });
});

describe('terrain cards', () => {
  it('Build Bridge turns river into a bridge anyone can walk; Break Bridge turns it back', () => {
    let s = setup();
    actionPhase(s, A);
    const build = give(s, A, 'build_bridge');
    expect(spaceTargets(s, A, 'build_bridge').has('p8-3')).toBe(true);
    s = play(s, A, build, { kind: 'space', space: 'p8-3' });
    expect(s.terrain['p8-3']).toBe('bridge');
    expect(s.lastEvents.some((e) => e.type === 'terrainChanged' && e.space === 'p8-3')).toBe(true);
    place(s, ch(B, 'king'), 'm0');
    expect(targets(s, ch(B, 'king'), 2).has('r3')).toBe(true);
    actionPhase(s, B);
    const brk = give(s, B, 'break_bridge');
    const breakable = spaceTargets(s, B, 'break_bridge');
    expect(breakable.has('r1')).toBe(false); // king's road bridge
    expect(breakable.has('p11-7')).toBe(false);
    s = play(s, B, brk, { kind: 'space', space: 'p8-3' });
    expect(s.terrain['p8-3']).toBe('river');
  });

  it('Carve Tunnel opens a mountain to walkers', () => {
    let s = setup();
    place(s, ch(B, 'king'), 'p3-9');
    expect(targets(s, ch(B, 'king'), 1).has('p4-9')).toBe(false);
    actionPhase(s, A);
    const card = give(s, A, 'carve_tunnel');
    s = play(s, A, card, { kind: 'space', space: 'p4-9' });
    expect(s.terrain['p4-9']).toBe('tunnel');
    expect(targets(s, ch(B, 'king'), 1).has('p4-9')).toBe(true);
  });

  it('Raise Mountain and Dig Canal reshape open ground but never the road or occupied squares', () => {
    let s = setup();
    actionPhase(s, A);
    place(s, ch(B, 'queen'), 'r4');
    const raise = spaceTargets(s, A, 'raise_mountain');
    expect(raise.has('r3')).toBe(true);
    expect(raise.has('p8-3')).toBe(true); // river → mountain
    expect(raise.has('r2')).toBe(false); // king's road
    expect(raise.has('r4')).toBe(false); // occupied
    expect(raise.has('m1')).toBe(false); // treasure
    const dig = spaceTargets(s, A, 'dig_canal');
    expect(dig.has('p10-4')).toBe(true);
    expect(dig.has('p8-3')).toBe(false); // already water
    const card = give(s, A, 'raise_mountain');
    s = play(s, A, card, { kind: 'space', space: 'r3' });
    expect(s.terrain.r3).toBe('mountain');
    place(s, ch(A, 'king'), 'r2');
    expect(targets(s, ch(A, 'king'), 1).has('r3')).toBe(false);
  });

  it('reshaping never cuts a castle off from every treasure', () => {
    registerBoard({
      id: 'cut-terrain',
      name: 'Cut terrain',
      width: 100,
      height: 100,
      spaces: [
        { id: 'c0', type: 'castle', x: 0, y: 0, seat: 0 },
        { id: 'a', type: 'normal', x: 20, y: 0 },
        { id: 'x', type: 'treasure', x: 40, y: 0 },
        { id: 'b', type: 'normal', x: 60, y: 0 },
        { id: 's', type: 'normal', x: 20, y: 20 },
        { id: 'c2', type: 'castle', x: 80, y: 0, seat: 1 },
        { id: 'p1', type: 'portal', x: 0, y: 40 },
        { id: 'p2', type: 'portal', x: 40, y: 40 },
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
    });
    const s = createGame({
      players: [
        { id: A, name: 'A' },
        { id: B, name: 'B' },
      ],
      seed: 1,
      now: 0,
      boardId: 'cut-terrain',
      config: { matchDurationMs: 0, turnDurationMs: 0 },
    });
    for (const card of ['dig_canal', 'raise_mountain'] as const) {
      const t = spaceTargets(s, A, card);
      expect(t.has('a'), card).toBe(false);
      expect(t.has('b'), card).toBe(false);
      expect(t.has('s'), card).toBe(true);
    }
  });

  it('Boat and Glider powers attach to a character', () => {
    let s = setup();
    actionPhase(s, A);
    const boat = give(s, A, 'boat');
    s = play(s, A, boat, { kind: 'character', characterId: ch(A, 'witch') });
    expect(s.characters[ch(A, 'witch')].power).toEqual({ type: 'boat' });
    actionPhase(s, B);
    const glider = give(s, B, 'glider');
    s = play(s, B, glider, { kind: 'character', characterId: ch(B, 'knight') });
    expect(s.characters[ch(B, 'knight')].power).toEqual({ type: 'glider' });
  });

  it('traps can only be set on land', () => {
    const s = setup();
    const trapSpots = spaceTargets(s, A, 'trap');
    for (const id of trapSpots) expect(isLand(s.terrain[id]), id).toBe(true);
    expect(trapSpots.has('p8-3')).toBe(false);
  });
});
