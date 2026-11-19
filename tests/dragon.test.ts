import { describe, expect, it } from 'vitest';
import { adventureOptions, dragonFireTargets, legalMoves, type GameState } from '@/engine';
import { dragonSpaceRule } from '@/engine/dungeon';
import { act, carry, endsFor, freshTurn, game, hand, noCards, place, reject, rollWith, routeTo } from './helpers';

const wild = (s: GameState, node: string) => {
  s.dragon = { state: 'wild', node, companion: null, recoverUntilTurn: 0, releasedBy: null };
  return s;
};
const companion = (s: GameState, id: string) => {
  s.dragon = { state: 'companion', node: s.characters[id].node, companion: id, recoverUntilTurn: 0, releasedBy: null };
  return s;
};

describe('dragon', () => {
  it('tames on 5–6; a failure retreats to the nearest safe space behind', () => {
    let s = noCards(wild(game(), 'c3'));
    place(s, 'a-king', 'c3');
    s.forcedRolls = [5];
    s = act(s, 'a', { type: 'tame', characterId: 'a-king' });
    expect(s.dragon).toMatchObject({ state: 'companion', companion: 'a-king' });

    s = noCards(wild(game(), 'c3'));
    place(s, 'a-king', 'c3');
    s.forcedRolls = [4];
    s = act(s, 'a', { type: 'tame', characterId: 'a-king' });
    expect(s.dragon.state).toBe('wild');
    expect(s.characters['a-king'].node).toBe('c0');
  });

  it('Dragon Feast tames on 3+', () => {
    let s = wild(game(), 'c3');
    hand(s, 'a', ['dragon_feast']);
    place(s, 'a-king', 'c3');
    s.forcedRolls = [3];
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'character', characterId: 'a-king' } });
    expect(s.dragon.companion).toBe('a-king');
  });

  it('a wild dragon can be landed on but never passed', () => {
    let s = noCards(wild(game(), 'c3'));
    place(s, 'a-king', 'c1');
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king').has('c3')).toBe(true);
    s = noCards(wild(game(), 'c3'));
    place(s, 'a-king', 'c1');
    s = rollWith(s, 'a', 4);
    expect(endsFor(s, 'a-king').has('c5')).toBe(false);
    expect(legalMoves(s, 'a-king').every((m) => !m.path.includes('c3'))).toBe(true);
  });

  it('a companion moves max(1, roll − 2)', () => {
    let s = noCards(companion(place(game(), 'a-king', 'c8'), 'a-king'));
    s = rollWith(s, 'a', 5);
    expect(routeTo(s, 'a-king', 'c11')).toHaveLength(4);
  });

  it('Dragon Fire hits within range 3, not castles, plates or Royal Paths, blocked by Shield, and is not a cut', () => {
    let s = noCards(companion(place(game(), 'a-king', 'c8'), 'a-king'));
    place(s, 'b-king', 'c9');
    place(s, 'b-queen', 'c12');
    place(s, 'b-witch', 'f-purple-1');
    place(s, 'b-knight', 'c11', { shield: true });
    expect(dragonFireTargets(s, 'a').map((c) => c.id)).toEqual(['b-king']);
    s.forcedRolls = [4];
    s = act(s, 'a', { type: 'dragonFire', targetId: 'b-king' });
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.stats.a.cuts).toBe(0);
  });

  it('Witch is immune to Dragon Fire; fire drops gems and earns no cut credit', () => {
    let s = noCards(companion(place(game(), 'a-king', 'c8'), 'a-king'));
    place(s, 'b-witch', 'c9');
    place(s, 'b-king', 'c7');
    const gem = carry(s, 'b-king', 'ruby');
    expect(dragonFireTargets(s, 'a').map((c) => c.id)).toEqual(['b-king']);
    expect(dragonFireTargets(s, 'a').some((c) => c.kind === 'witch')).toBe(false);
    s.forcedRolls = [6];
    s = act(s, 'a', { type: 'dragonFire', targetId: 'b-king' });
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.gems.find((g) => g.id === gem)).toMatchObject({ node: 'c7', carriedBy: null });
    expect(s.stats.a.cuts).toBe(0);
  });

  it('Dragon Fire needs no card: it spends the Adventure action and hits on a 4–6 attack die', () => {
    const base = noCards(companion(place(game(), 'a-king', 'c8'), 'a-king'));
    place(base, 'b-king', 'c9');
    for (const low of [1, 2, 3]) {
      let s = structuredClone(base);
      s.forcedRolls = [low];
      s = act(s, 'a', { type: 'dragonFire', targetId: 'b-king' });
      expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'dragonFire', roll: low, hit: false }));
      expect(s.characters['b-king'].node).toBe('c9');
      expect(s.turn.adventureDone).toBe(true);
      reject(s, 'a', { type: 'dragonFire', targetId: 'b-king' }, /already used your adventure/);
    }
    for (const high of [4, 5, 6]) {
      let s = structuredClone(base);
      s.forcedRolls = [high];
      s = act(s, 'a', { type: 'dragonFire', targetId: 'b-king' });
      expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'dragonFire', roll: high, hit: true }));
      expect(s.characters['b-king'].node).toBe('home-purple');
      // A 6 on the attack die is not a movement 6: no bonus roll.
      expect(s.turn.extra).toBeNull();
    }
  });

  it('Dragon Fire is offered with its odds and the target is chosen before the die', () => {
    const s = noCards(companion(place(game(), 'a-king', 'c8'), 'a-king'));
    place(s, 'b-king', 'c9');
    const fire = adventureOptions(s, 'a', []).filter((o) => o.action.type === 'dragonFire');
    expect(fire.map((o) => o.action)).toEqual([{ type: 'dragonFire', targetId: 'b-king' }]);
    expect(fire[0].detail).toMatch(/4–6 hits \(50%\)/);
    reject(s, 'a', { type: 'dragonFire', targetId: 'b-queen' }, /castle cannot be burned/);
  });

  it('Witch may pass a wild dragon space', () => {
    const s = noCards(wild(game(), 'c3'));
    expect(dragonSpaceRule(s, 'a-witch')).toBe('pass');
    expect(dragonSpaceRule(s, 'a-king')).toBe('block');
  });

  it('Dragon Fire does not cross a blocked edge', () => {
    const s = noCards(game());
    s.bridges['broken-bridge'] = false;
    place(s, 'a-king', 'rope-west');
    companion(s, 'a-king');
    place(s, 'b-king', 'rope-1');
    expect(dragonFireTargets(s, 'a')).toEqual([]);
  });

  it('release is free, but only at the start of your turn', () => {
    let s = noCards(companion(place(game(), 'a-king', 'c8'), 'a-king'));
    s = act(s, 'a', { type: 'release' });
    expect(s.dragon).toMatchObject({ state: 'wild', node: 'c8', releasedBy: 'a' });
    expect(s.turn.adventureDone).toBe(false);
    s = noCards(companion(place(game(), 'a-king', 'c8'), 'a-king'));
    s = rollWith(s, 'a', 3);
    reject(s, 'a', { type: 'release' }, /start of your turn/);
  });

  it('Queen + Dragon Slayer: 4–6 sends the dragon home to recover for a round; failure retreats her', () => {
    let s = wild(game(), 'c3');
    hand(s, 'a', ['dragon_slayer']);
    place(s, 'a-queen', 'c4');
    s.forcedRolls = [4];
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'character', characterId: 'a-queen' } });
    expect(s.dragon).toMatchObject({ state: 'recovering', node: 'd-lair' });
    s = noCards(s);
    s = rollWith(s, 'a', 1);
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: ['home-red', 'c0'] });
    expect(s.dragon.state).toBe('recovering');
    s = rollWith(s, 'b', 1);
    s = act(s, 'b', { type: 'move', characterId: 'b-king', path: ['home-purple', 'c20'] });
    expect(s.turn.playerId).toBe('a');
    expect(s.dragon.state).toBe('guarding');

    s = wild(game(), 'c3');
    hand(s, 'a', ['dragon_slayer']);
    place(s, 'a-queen', 'c3');
    s.forcedRolls = [3];
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'character', characterId: 'a-queen' } });
    expect(s.characters['a-queen'].node).toBe('c0');
  });

  it('only the Queen can use Dragon Slayer', () => {
    const s = wild(game(), 'c3');
    hand(s, 'a', ['dragon_slayer']);
    place(s, 'a-king', 'c3');
    reject(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'character', characterId: 'a-king' } });
    void freshTurn;
  });
});

describe('Dragon Fire on Royal Paths', () => {
  it('can target a rival on a Royal Path, but still not on other safe spaces or in the temple', async () => {
    const { dragonFireBlock } = await import('@/engine/queries');
    const { getBoard } = await import('@/engine/board');
    const { walkingDistances } = await import('@/engine/graph');
    const s = noCards(game());
    const { nodes } = getBoard(s.boardId);
    // Find a Royal Path space and a road space within 3 steps of it for the dragon rider.
    const final = Object.keys(nodes).find((n) => nodes[n].lane === 'final' && nodes[n].house !== undefined && nodes[n].map === 'island')!;
    const near = Object.entries(walkingDistances(s, final)).find(([n, d]) => d >= 1 && d <= 3 && nodes[n].lane !== 'final' && !nodes[n].safe && nodes[n].type !== 'castle')![0];
    companion(place(s, 'a-king', near), 'a-king');
    place(s, 'b-king', final);
    expect(dragonFireBlock(s, 'a', 'b-king')).toBeNull();
    let t = structuredClone(s);
    t.forcedRolls = [5];
    t = act(t, 'a', { type: 'dragonFire', targetId: 'b-king' });
    expect(t.characters['b-king'].node).toBe('home-purple');
  });
});
