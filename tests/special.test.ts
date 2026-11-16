import { describe, expect, it } from 'vitest';
import { cardTargets, legalMoves, adventureOptions, DEFAULT_DECK, getBoard, type CardType } from '@/engine';
import { act, carry, endsFor, freshTurn, game, hand, move, noCards, place, player, reject, rollMove, rollWith, routeTo } from './helpers';

describe('Witch portal hop', () => {
  it('hops between the Moonstone Arches for free once per turn', () => {
    let s = noCards(game());
    place(s, 'a-witch', 'c14');
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-witch')).toEqual(new Set(['c12', 'c16', 'c32', 'c36', 'camp-trail-1']));
    const m = legalMoves(s, 'a-witch').find((o) => o.path.includes('c34') && o.path.at(-1) === 'c36')!;
    expect(m).toMatchObject({ path: ['c14', 'c34', 'c35', 'c36'], witchPortal: true, cost: 2 });
    s = act(s, 'a', { type: 'move', characterId: 'a-witch', path: m.path });
    expect(s.characters['a-witch'].node).toBe('c36');
  });

  it('nobody else can hop, and the Witch cannot hop with the dragon', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c14');
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king')).toEqual(new Set(['c12', 'c16']));
    s = noCards(game());
    place(s, 'a-witch', 'c14');
    s.dragon = { state: 'companion', node: 'c14', companion: 'a-witch', recoverUntilTurn: 0, releasedBy: null };
    s = rollWith(s, 'a', 4);
    expect(endsFor(s, 'a-witch')).toEqual(new Set(['c12', 'c16']));
  });
});

describe('shortcuts and side routes', () => {
  it('Secret Passage and Magic Lift fire only when a move ends on them', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c31');
    s = rollMove(s, 'a', 'a-king', 2, 'c33');
    expect(s.characters['a-king'].node).toBe('c38');
    s = noCards(game());
    place(s, 'a-king', 'c31');
    s = rollMove(s, 'a', 'a-king', 3, 'c34');
    expect(s.characters['a-king'].node).toBe('c34');
  });

  it('inner routes run both ways once open', () => {
    let s = noCards(game());
    s.bridges['broken-bridge'] = true;
    place(s, 'a-king', 'rope-1');
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king')).toEqual(new Set(['c28', 'falls', 'glade']));
  });

  it('a broken bridge closes the route until rebuilt', () => {
    let s = noCards(game());
    place(s, 'a-king', 'rope-1');
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king')).toEqual(new Set(['falls']));
  });

  it('offers several routes from one space: the main road and an inner trail', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c0');
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king')).toEqual(new Set(['c3', 'c37', 'lake-1', 'willow-1']));
  });

  it('a trail’s trap risk can drag a piece back to the main road, keeping its plates and gems', () => {
    let s = noCards(game());
    place(s, 'a-king', 'camp-west', { plates: [0, 1] });
    const gem = carry(s, 'a-king', 'diamond');
    s = rollWith(s, 'a', 1);
    s.forcedRolls = [1];
    s = move(s, 'a', 'a-king', ['camp-west', 'bramble-1']);
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'hazard', sprung: true }));
    // Bramble Snare's nearest main-road space is c31. The gem stays carried; plates are not reset.
    expect(s.characters['a-king']).toMatchObject({ node: 'c31', plates: [0, 1], carrying: [gem] });
    expect(player(s, 'a').gems).toEqual([]);

    s = noCards(game());
    place(s, 'a-king', 'camp-west');
    s = rollWith(s, 'a', 1);
    s.forcedRolls = [5];
    s = move(s, 'a', 'a-king', ['camp-west', 'bramble-1']);
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'hazard', roll: 5, sprung: false }));
    expect(s.characters['a-king'].node).toBe('bramble-1');
  });
});

describe('vehicles', () => {
  it('the boat sails dock to dock, stays there, and touches no plates on the way', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c15', { plates: [0] });
    s = act(s, 'a', { type: 'sail', characterId: 'a-king' });
    expect(s.characters['a-king'].node).toBe('c26');
    expect(s.vehicles.boat).toBe('c26');
    expect(s.characters['a-king'].plates).toEqual([0]);
  });

  it('the plane flies only when it is at your airfield', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c35');
    reject(s, 'a', { type: 'fly', characterId: 'a-king', to: 'c12' }, /plane is not/);
    place(s, 'a-king', 'c12');
    s = act(s, 'a', { type: 'fly', characterId: 'a-king', to: 'c35' });
    expect(s.vehicles.plane).toBe('c35');
  });

  it('a dragon companion cannot ride', () => {
    const s = noCards(game());
    place(s, 'a-king', 'c15');
    s.dragon = { state: 'companion', node: 'c15', companion: 'a-king', recoverUntilTurn: 0, releasedBy: null };
    reject(s, 'a', { type: 'sail', characterId: 'a-king' }, /dragon/);
  });
});

describe('dungeon', () => {
  it('enter from the Dragon Gate, move with early stops, and leave back to the gate', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c16');
    s = act(s, 'a', { type: 'enterDungeon', characterId: 'a-king' });
    expect(s.characters['a-king'].node).toBe('d-entrance');
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king').has('d-w1')).toBe(true);
    expect(endsFor(s, 'a-king').has('d-c1')).toBe(true);
    freshTurn(s, 'a');
    place(s, 'a-king', 'd-entrance');
    s = act(s, 'a', { type: 'leaveDungeon', characterId: 'a-king' });
    expect(s.characters['a-king'].node).toBe('c16');
  });

  it('the Vault Door needs the monster beaten (Knight +1) or a key', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'd-monster');
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-knight').has('d-w4')).toBe(false);
    freshTurn(s, 'a');
    s.forcedRolls = [3];
    s = act(s, 'a', { type: 'fightMonster', characterId: 'a-knight' });
    expect(s.characters['a-knight'].beatMonster).toBe(true);
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-knight').has('d-vault')).toBe(true);

    s = noCards(game());
    place(s, 'a-king', 'd-monster');
    player(s, 'a').keys = 1;
    s = rollMove(s, 'a', 'a-king', 1, 'd-w4');
    expect(player(s, 'a').keys).toBe(0);
  });

  it('losing to the monster retreats to the nearest safe room', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-monster');
    s.forcedRolls = [2];
    s = act(s, 'a', { type: 'fightMonster', characterId: 'a-king' });
    expect(s.characters['a-king'].node).toBe('d-ruins');
  });

  it('the Crystal Shrine offers any gem you still need', () => {
    let s = noCards(game());
    player(s, 'a').gems = ['ruby'];
    place(s, 'a-king', 'd-shrine');
    const offers = adventureOptions(s, 'a', []).filter((o) => o.action.type === 'dig').map((o) => (o.action as { gem?: string }).gem);
    expect(offers).toEqual(['sapphire', 'emerald', 'diamond']);
    s = act(s, 'a', { type: 'dig', characterId: 'a-king', gem: 'diamond' });
    expect(s.gems.find((g) => g.carriedBy === 'a-king')?.kind).toBe('diamond');
  });

  it('the Spike Pit drops you through the trapdoor to the entrance', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-e2');
    s = rollMove(s, 'a', 'a-king', 1, 'd-pit');
    expect(s.characters['a-king'].node).toBe('d-entrance');
  });
});

describe('discoveries', () => {
  it('digging draws a discovery: a key, a gem, a card, a trap or a hidden route', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c19');
    s.discoveries = [{ id: 'x1', type: 'key' }];
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(player(s, 'a').keys).toBe(1);

    s = noCards(game());
    place(s, 'a-king', 'c19');
    s.discoveries = [{ id: 'x1', type: 'gem', gem: 'emerald' }];
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(s.gems.find((g) => g.carriedBy === 'a-king')?.kind).toBe('emerald');

    s = noCards(game());
    place(s, 'a-king', 'c19');
    s.discoveries = [{ id: 'x1', type: 'power_card' }];
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(s.hands.a).toHaveLength(1);

    s = noCards(game());
    place(s, 'a-king', 'c19');
    s.discoveries = [{ id: 'x1', type: 'trap' }];
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(s.characters['a-king'].node).toBe('c14');

    s = noCards(game());
    place(s, 'a-king', 'c19');
    s.discoveries = [{ id: 'x1', type: 'route' }];
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(s.characters['a-king'].node).toBe('c19');
    expect(s.bridges['ruins-road']).toBe(true);
    expect(s.bridges['camp-road']).toBe(false);
    expect(s.lastEvents).toContainEqual({ type: 'edgeChanged', edgeId: 'pit~ruins' });
  });

  it('a hidden-route find opens the nearest closed route, or becomes a map card when all are open', () => {
    let s = noCards(game());
    place(s, 'a-king', 'lake-1');
    s.discoveries = [{ id: 'x1', type: 'route' }];
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(s.bridges['camp-road']).toBe(true);
    expect(s.bridges['broken-bridge']).toBe(false);
    expect(s.bridges['ruins-road']).toBe(false);
    expect(s.bridges['mine-tunnel']).toBe(false);
    expect(s.lastEvents).toContainEqual({ type: 'edgeChanged', edgeId: 'camp-road-1~camp-east' });

    s = noCards(game());
    for (const k of Object.keys(s.bridges)) s.bridges[k] = true;
    place(s, 'a-king', 'c19');
    s.discoveries = [{ id: 'x1', type: 'route' }];
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(s.hands.a).toHaveLength(1);
    expect(['build_bridge', 'collapse_bridge', 'dig_tunnel', 'build_road', 'raise_mountain', 'create_river', 'landslide', 'repair']).toContain(s.hands.a[0].type);
  });
});

describe('map cards', () => {
  it('Build Bridge opens a closed bridge for everyone; Collapse cannot strand anyone', () => {
    let s = game();
    hand(s, 'a', ['build_bridge', 'collapse_bridge']);
    expect(cardTargets(s, 'a', 'build_bridge')).toEqual([{ kind: 'edge', edgeId: 'rope-west~rope-1' }]);
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'edge', edgeId: 'rope-west~rope-1' } });
    expect(s.bridges['broken-bridge']).toBe(true);

    s = game();
    place(s, 'a-king', 'bridge-east');
    // Seal the gorge and the ruins lane, so the east bank's only way back to the road is the Stone Bridge.
    s.transforms.falls = 'mountain';
    s.transforms.ruins = 'mountain';
    expect(cardTargets(s, 'a', 'collapse_bridge')).toEqual([]);
    delete s.transforms.falls;
    expect(cardTargets(s, 'a', 'collapse_bridge')).toEqual([{ kind: 'edge', edgeId: 'bridge-west~stone-1' }]);
    expect(getBoard(s.boardId).edges['bridge-west~stone-1'].gate).toBe('stone-bridge');
  });

  it('the server rejects a map change that would strand a piece', () => {
    const s = game();
    hand(s, 'a', ['collapse_bridge']);
    place(s, 'a-king', 'bridge-east');
    s.transforms.falls = 'mountain';
    s.transforms.ruins = 'mountain';
    reject(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'edge', edgeId: 'bridge-west~stone-1' } });
  });

  it('Build Road paves an unbuilt road that changes the routes everyone can walk', () => {
    let s = noCards(game());
    hand(s, 'a', ['build_road']);
    expect(cardTargets(s, 'a', 'build_road')).toEqual([
      { kind: 'edge', edgeId: 'camp-road-1~camp-east' },
      { kind: 'edge', edgeId: 'pit~ruins' },
    ]);
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'edge', edgeId: 'camp-road-1~camp-east' } });
    expect(s.bridges['camp-road']).toBe(true);
    place(s, 'b-king', 'camp-west');
    freshTurn(s, 'b');
    s = rollWith(s, 'b', 2);
    expect(endsFor(s, 'b-king').has('camp-east')).toBe(true);
  });

  it('Landslide blocks a marked pass, one per player at a time', () => {
    let s = game();
    hand(s, 'a', ['landslide']);
    const targets = cardTargets(s, 'a', 'landslide');
    expect(targets.length).toBeGreaterThan(0);
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: targets[0] });
    expect(s.blocks).toEqual([{ edgeId: (targets[0] as { edgeId: string }).edgeId, owner: 'a' }]);
  });

  it('Raise Mountain only targets empty marked terrain sites and Repair restores them', () => {
    let s = game();
    hand(s, 'a', ['raise_mountain', 'repair']);
    const sites = [
      { kind: 'node' as const, node: 'lake-2' },
      { kind: 'node' as const, node: 'vale-road-1' },
      { kind: 'node' as const, node: 'falls-path-1' },
    ];
    expect(cardTargets(s, 'a', 'raise_mountain')).toEqual(sites);
    expect(cardTargets(s, 'a', 'create_river')).toEqual(sites);
    place(s, 'b-king', 'lake-2');
    expect(cardTargets(s, 'a', 'raise_mountain')).toEqual([
      { kind: 'node', node: 'vale-road-1' },
      { kind: 'node', node: 'falls-path-1' },
    ]);
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'node', node: 'vale-road-1' } });
    expect(s.transforms['vale-road-1']).toBe('mountain');
    expect(cardTargets(s, 'a', 'repair')).toContainEqual({ kind: 'node', node: 'vale-road-1' });
  });

  it('Dig Tunnel opens the Crystal Mine Tunnel', () => {
    let sealed = noCards(game());
    place(sealed, 'a-king', 'mine-1');
    sealed = rollWith(sealed, 'a', 3);
    expect(endsFor(sealed, 'a-king').has('c7')).toBe(false);

    let s = game();
    hand(s, 'a', ['dig_tunnel']);
    expect(cardTargets(s, 'a', 'dig_tunnel')).toEqual([{ kind: 'edge', edgeId: 'mine-3~c7' }]);
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: cardTargets(s, 'a', 'dig_tunnel')[0] });
    expect(s.bridges['mine-tunnel']).toBe(true);
    place(s, 'a-king', 'mine-1');
    s = rollWith(s, 'a', 3);
    const path = routeTo(s, 'a-king', 'c7');
    expect(path).toEqual(['mine-1', 'mine-2', 'mine-3', 'c7']);
    expect(path).not.toContain('c5');
  });

  it('Rescue carries a piece home and banks its gem; its plates start over', () => {
    let s = game();
    hand(s, 'a', ['rescue']);
    place(s, 'a-king', 'c15', { lap: 1 });
    s.gems.push({ id: 'g1', kind: 'sapphire', node: null, carriedBy: 'a-king' });
    s.characters['a-king'].carrying = ['g1'];
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'character', characterId: 'a-king' } });
    expect(s.characters['a-king']).toMatchObject({ node: 'home-red', lap: 0, plates: [], carrying: [] });
    expect(player(s, 'a').gems).toEqual(['sapphire']);
  });
});

/**
 * Every card in the deck must have a working effect: in a busy mid-game position each type has at
 * least one legal target, and playing it is accepted and changes the game.
 */
describe('every deck card works', () => {
  const busy = () => {
    const s = game();
    s.dragon = { state: 'wild', node: 'c4', companion: null, recoverUntilTurn: 0, releasedBy: null };
    place(s, 'a-king', 'c4');
    place(s, 'a-queen', 'c3');
    place(s, 'a-witch', 'c15', { lap: 1 });
    carry(s, 'a-witch', 'emerald');
    place(s, 'a-knight', 'f-red-1', { lap: 4 });
    place(s, 'b-king', 'c30');
    place(s, 'b-queen', 'c33');
    s.bridges['ruins-road'] = true;
    s.transforms['falls-path-1'] = 'river';
    return s;
  };
  for (const type of Object.keys(DEFAULT_DECK) as CardType[]) {
    it(type, () => {
      const s = busy();
      hand(s, 'a', [type]);
      const targets = cardTargets(s, 'a', type);
      expect(targets.length, `${type} has no target`).toBeGreaterThan(0);
      if (type === 'reveal_discovery') {
        const { nodes } = getBoard(s.boardId);
        expect(nodes[s.characters['a-knight'].node].lane).toBe('final');
        for (const t of targets) {
          if (t.kind === 'character') expect(nodes[s.characters[t.characterId].node].lane).not.toBe('final');
        }
      }
      s.forcedRolls = [6];
      const after = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: targets[0] });
      expect(after.turn.adventureDone).toBe(true);
      expect(after.hands.a.some((c) => c.id === s.hands.a[0].id)).toBe(false);
      const changed = JSON.stringify({ ...after, log: 0, version: 0, turn: 0, hands: 0, discard: 0, lastEvents: 0, stats: 0, deck: 0 }) !== JSON.stringify({ ...s, log: 0, version: 0, turn: 0, hands: 0, discard: 0, lastEvents: 0, stats: 0, deck: 0 });
      expect(changed, `${type} changed nothing`).toBe(true);
    });
  }
});
