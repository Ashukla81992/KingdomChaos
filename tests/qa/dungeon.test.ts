import { describe, expect, it } from 'vitest';
import { dragonFireTargets, getBoard, keepsEveryoneConnected, legalMoves } from '@/engine';
import { arrivalPreview, dragonSpaceRule } from '../../src/engine/dungeon';
import {
  carry,
  companionDragon,
  endsFor,
  expectReject,
  game,
  hand,
  must,
  noCards,
  place,
  qaFresh,
  qaMoves,
  rollWith,
  routeTo,
  T0,
  wildDragon,
} from './helpers';

function findEncounter(monster: 'golem' | 'spider') {
  const { nodes, out } = getBoard('crownquest');
  const node = Object.values(nodes).find((n) => n.encounter?.monster === monster);
  if (!node) return null;
  const edge = out[node.id]?.[0];
  const from = edge ? (edge.a === node.id ? edge.b : edge.a) : null;
  return { node, from };
}

describe('D1 Stone Golem and Cave Spider encounters', () => {
  it('D1 board exposes golem and spider encounters with previews', () => {
    const golem = findEncounter('golem');
    const spider = findEncounter('spider');
    expect(golem, 'Stone Golem encounter space must exist on the board (A3)').toBeTruthy();
    expect(spider, 'Cave Spider encounter space must exist on the board (A3)').toBeTruthy();
  });

  it('D1 golem success takes the shortcut; failure sends to the safe room; both outcomes are previewed', () => {
    const golem = findEncounter('golem');
    expect(golem?.from).toBeTruthy();
    const enc = golem!.node.encounter!;

    let s = noCards(game());
    place(s, 'a-king', golem!.from!);
    qaFresh(s, 'a');
    s = rollWith(s, 'a', 1);
    const opt = qaMoves(s, 'a-king').find((m) => m.path.at(-1) === golem!.node.id);
    expect(opt).toBeTruthy();
    const preview = opt?.arrival ?? arrivalPreview(s, 'a-king', golem!.node.id);
    expect(preview).toBeTruthy();
    expect(preview!.kind).toBe('golem');
    expect(preview!.need).toBe(s.config.encounterThreshold);
    expect(preview!.success.length).toBeGreaterThan(0);
    expect(preview!.failure.length).toBeGreaterThan(0);

    s.forcedRolls = [s.config.encounterThreshold];
    s = must(s, 'a', { type: 'move', characterId: 'a-king', path: opt!.path }, T0);
    expect(s.lastEvents.some((e) => e.type === 'encounter' && e.monster === 'golem' && e.success)).toBe(true);
    expect(s.characters['a-king'].node).toBe(enc.shortcutTo);

    s = noCards(game());
    place(s, 'a-king', golem!.from!);
    qaFresh(s, 'a');
    s = rollWith(s, 'a', 1);
    const opt2 = qaMoves(s, 'a-king').find((m) => m.path.at(-1) === golem!.node.id)!;
    s.forcedRolls = [1];
    s = must(s, 'a', { type: 'move', characterId: 'a-king', path: opt2.path }, T0);
    expect(s.lastEvents.some((e) => e.type === 'encounter' && e.success === false)).toBe(true);
    expect(s.characters['a-king'].node).toBe(enc.safeRoom);
  });

  it('D1 Cave Spider success draws a power card; Knight gets +1 (P7)', () => {
    const spider = findEncounter('spider');
    expect(spider?.from).toBeTruthy();

    let s = noCards(game());
    place(s, 'a-knight', spider!.from!);
    hand(s, 'a', []);
    qaFresh(s, 'a');
    s = rollWith(s, 'a', 1);
    const opt = qaMoves(s, 'a-knight').find((m) => m.path.at(-1) === spider!.node.id);
    expect(opt).toBeTruthy();
    const preview = opt?.arrival ?? arrivalPreview(s, 'a-knight', spider!.node.id);
    expect(preview?.need).toBe(s.config.encounterThreshold - s.config.knightBonus);
    s.forcedRolls = [3]; // raw 3 + Knight +1 = 4
    s = must(s, 'a', { type: 'move', characterId: 'a-knight', path: opt!.path }, T0);
    expect(s.lastEvents.some((e) => e.type === 'encounter' && e.monster === 'spider' && e.success && e.total >= 4)).toBe(true);
    expect(s.hands.a.length).toBeGreaterThan(0);
  });
});

describe('P6/D3/D4/D5 witch, fire, release, slayer', () => {
  it('P6 Witch may pass a wild dragon; others may not', () => {
    let s = noCards(wildDragon(game(), 'c3'));
    place(s, 'a-witch', 'c1');
    place(s, 'a-king', 'home-red');
    place(s, 'a-queen', 'home-red');
    place(s, 'a-knight', 'home-red');
    expect(dragonSpaceRule(s, 'a-witch')).toBe('pass');
    s = rollWith(s, 'a', 4);
    expect(endsFor(s, 'a-witch').has('c5')).toBe(true);
    expect(qaMoves(s, 'a-witch').some((m) => m.path.includes('c3') && m.path.at(-1) === 'c5')).toBe(true);

    s = noCards(wildDragon(game(), 'c3'));
    place(s, 'a-king', 'c1');
    expect(dragonSpaceRule(s, 'a-king')).toBe('block');
    s = rollWith(s, 'a', 4);
    expect(endsFor(s, 'a-king').has('c5')).toBe(false);
  });

  it('P6 Witch is immune to Dragon Fire', () => {
    const s = noCards(game());
    place(s, 'a-king', 'c8');
    companionDragon(s, 'a-king');
    place(s, 'b-witch', 'c9');
    place(s, 'b-king', 'c7');
    const targets = dragonFireTargets(s, 'a').map((c) => c.id);
    expect(targets).not.toContain('b-witch');
    expect(targets).toContain('b-king');
    expectReject(s, 'a', { type: 'dragonFire', targetId: 'b-witch' });
  });

  it('D3 Dragon Fire drops gems, grants no cut credit and no bonus', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    companionDragon(s, 'a-king');
    place(s, 'b-king', 'c9'); // avoid safe gates (c10)
    carry(s, 'b-king', 'emerald');
    const cuts = s.stats.a.cuts;
    s = must(s, 'a', { type: 'dragonFire', targetId: 'b-king' }, T0);
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.stats.a.cuts).toBe(cuts);
    expect(s.gems.some((g) => g.kind === 'emerald' && g.node === 'c9' && !g.carriedBy)).toBe(true);
    expect(s.turn.extra).toBeNull();
    expect(s.lastEvents.some((e) => e.type === 'extraTurn')).toBe(false);
  });

  it('D4 release leaves a wild dragon that blocks everyone except the Witch', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    companionDragon(s, 'a-king');
    s = must(s, 'a', { type: 'release' }, T0);
    expect(s.dragon).toMatchObject({ state: 'wild', node: 'c8' });
    expect(dragonSpaceRule(s, 'b-king')).toBe('block');
    expect(dragonSpaceRule(s, 'b-witch')).toBe('pass');
  });

  it('D5 Dragon Slayer: Queen holding the card ends on the wild dragon, rolls 4+, clears block, dragon recovers', () => {
    let s = noCards(wildDragon(game(), 'c3'));
    hand(s, 'a', ['dragon_slayer']);
    place(s, 'a-queen', 'c2');
    place(s, 'a-king', 'home-red');
    place(s, 'a-witch', 'home-red');
    place(s, 'a-knight', 'home-red');
    expect(dragonSpaceRule(s, 'a-queen')).toBe('slay');
    qaFresh(s, 'a');
    s = rollWith(s, 'a', 1);
    expect(endsFor(s, 'a-queen').has('c3')).toBe(true);
    s.forcedRolls = [4];
    s = must(s, 'a', { type: 'move', characterId: 'a-queen', path: routeTo(s, 'a-queen', 'c3') }, T0);
    expect(s.lastEvents.some((e) => e.type === 'slay' && e.success)).toBe(true);
    expect(s.dragon.state).toBe('recovering');
    expect(s.dragon.node).toBe('d-lair');
  });
});

describe('B2 terrain/bridge changes update routes and never cut off objectives', () => {
  it('B2 closing a bridge updates legal routes; keepsEveryoneConnected keeps objectives reachable', () => {
    let s = noCards(game());
    s.bridges['broken-bridge'] = true;
    place(s, 'a-king', 'rope-1');
    qaFresh(s, 'a');
    s = rollWith(s, 'a', 2);
    const openEnds = endsFor(s, 'a-king');
    expect(openEnds.has('c28') || openEnds.has('glade') || openEnds.has('falls')).toBe(true);

    s.bridges['broken-bridge'] = false;
    const after = legalMoves(s, 'a-king');
    expect(after.some((m) => m.path.includes('rope-west'))).toBe(false);

    expect(keepsEveryoneConnected(s, {})).toBe(true);
    const allClosed = { ...s.bridges };
    for (const k of Object.keys(allClosed)) allClosed[k] = false;
    expect(keepsEveryoneConnected(s, { bridges: allClosed })).toBe(true);
  });
});
