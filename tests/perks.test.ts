import { describe, expect, it } from 'vitest';
import { adventureOptions, getBoard, legalMoves, powerOptions, stepsFor, toPlayerView, type GameState } from '@/engine';
import { act, carry, freshTurn, game, hand, noCards, place, player, reject, rollWith } from './helpers';

const monster = (s: GameState, id: 'golem' | 'spider') => s.monsters!.find((m) => m.id === id)!;
const companion = (s: GameState, id: string) => {
  s.dragon = { state: 'companion', node: s.characters[id].node, companion: id, recoverUntilTurn: 0, releasedBy: null };
  return s;
};

describe('killing dungeon monsters', () => {
  it('the Attack action from one step away takes a heart and knocks the monster out', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'd-c2');
    freshTurn(s, 'a');
    expect(adventureOptions(toPlayerView(s, 'a'), 'a', []).some((o) => o.action.type === 'attackMonster' && o.action.monster === 'golem')).toBe(true);
    s.forcedRolls = [3]; // 3 + Knight 1 = 4: a hit
    s = act(s, 'a', { type: 'attackMonster', characterId: 'a-knight', monster: 'golem' });
    expect(monster(s, 'golem')).toMatchObject({ hp: 1, restUntilRound: s.turn.round + 1 });
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'monsterHit', monster: 'golem', hit: true, hp: 1, slain: false }));
  });

  it('a miss lets the monster strike back at once', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-e3');
    freshTurn(s, 'a');
    s.forcedRolls = [2];
    s = act(s, 'a', { type: 'attackMonster', characterId: 'a-king', monster: 'spider' });
    expect(monster(s, 'spider').hp).toBe(2);
    expect(s.characters['a-king'].webbed).toBe(true);
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'monsterEvent', counter: true, effect: 'web' }));
  });

  it('refuses an attack from too far away or on a resting monster', () => {
    const s = noCards(game());
    place(s, 'a-king', 'd-entrance');
    freshTurn(s, 'a');
    reject(s, 'a', { type: 'attackMonster', characterId: 'a-king', monster: 'golem' }, /within 1 step/);
    place(s, 'a-king', 'd-c2');
    monster(s, 'golem').restUntilRound = s.turn.round + 1;
    reject(s, 'a', { type: 'attackMonster', characterId: 'a-king', monster: 'golem' }, /resting/);
  });

  it('the last heart slays it for good: no events, and a slain Golem opens its shortcut to everyone', () => {
    let s = noCards(game());
    monster(s, 'golem').hp = 1;
    place(s, 'a-knight', 'd-c2');
    freshTurn(s, 'a');
    s.forcedRolls = [6];
    s = act(s, 'a', { type: 'attackMonster', characterId: 'a-knight', monster: 'golem' });
    expect(monster(s, 'golem')).toMatchObject({ hp: 0, slain: true });
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'monsterHit', slain: true }));
    // A rival ending on the lair takes the shortcut without a fight.
    place(s, 'b-king', 'd-c2');
    freshTurn(s, 'b');
    s = rollWith(s, 'b', 1);
    s = act(s, 'b', { type: 'move', characterId: 'b-king', path: ['d-c2', 'd-golem'] });
    expect(s.characters['b-king'].node).toBe('d-e4');
    expect(s.lastEvents.some((e) => e.type === 'encounter')).toBe(false);
  });

  it('Dragon Fire can burn a monster in range (no strike back)', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-e2');
    companion(s, 'a-king');
    freshTurn(s, 'a');
    s.forcedRolls = [5];
    s = act(s, 'a', { type: 'dragonFire', monster: 'spider' });
    expect(monster(s, 'spider').hp).toBe(1);
    expect(s.turn.adventureDone).toBe(true);
  });
});

describe('dungeon room perks', () => {
  it('Fallen Ruins: search once per visit for a map card', () => {
    let s = game();
    hand(s, 'a', []);
    place(s, 'a-king', 'd-ruins');
    freshTurn(s, 'a');
    s = act(s, 'a', { type: 'explore', characterId: 'a-king' });
    expect(s.hands.a).toHaveLength(1);
    freshTurn(s, 'a');
    reject(s, 'a', { type: 'explore', characterId: 'a-king' }, /already used/);
  });

  it('Crystal Niche: clears a web and the next move is 2 longer', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-safe-crystal', { webbed: true });
    freshTurn(s, 'a');
    s = act(s, 'a', { type: 'explore', characterId: 'a-king' });
    expect(s.characters['a-king']).toMatchObject({ webbed: false, boosted: true });
    expect(stepsFor(s, 'a-king', 3).steps).toBe(5);
  });

  it('Old Vault: a power card plus a discovery, once per visit; the Den gives a key', () => {
    let s = game();
    hand(s, 'a', []);
    place(s, 'a-king', 'd-vault');
    freshTurn(s, 'a');
    s = act(s, 'a', { type: 'dig', characterId: 'a-king' });
    expect(s.hands.a.length).toBeGreaterThanOrEqual(1);
    freshTurn(s, 'a');
    reject(s, 'a', { type: 'dig', characterId: 'a-king' }, /already looted/);

    place(s, 'a-queen', 'd-monster');
    s.forcedRolls = [6];
    const keys = player(s, 'a').keys;
    s = act(s, 'a', { type: 'fightMonster', characterId: 'a-queen' });
    expect(player(s, 'a').keys).toBe(keys + 1);
  });

  it('Spike Pit: a fast chute to the entrance with a treasure roll', () => {
    let s = game();
    hand(s, 'a', []);
    place(s, 'a-king', 'd-e2');
    freshTurn(s, 'a');
    s.forcedRolls = [1, 5];
    s = act(s, 'a', { type: 'roll' });
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: ['d-e2', 'd-pit'] });
    expect(s.characters['a-king'].node).toBe('d-entrance');
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'spikeTreasure', roll: 5, success: true }));
    expect(s.hands.a).toHaveLength(1);
  });
});

describe('Crystal Mine Tunnel, spares, vehicles', () => {
  it('the dug tunnel yields one Diamond per kingdom', () => {
    let s = noCards(game());
    const { board } = getBoard(s.boardId);
    const tunnel = board.edges.find((e) => e.gate === 'mine-tunnel')!;
    s.bridges['mine-tunnel'] = true;
    place(s, 'a-king', tunnel.a);
    freshTurn(s, 'a');
    s = rollWith(s, 'a', 1);
    const route = legalMoves(s, 'a-king').find((o) => o.path[1] === tunnel.b)!;
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: route.path });
    expect(s.gems.find((g) => g.carriedBy === 'a-king')?.kind).toBe('diamond');
    expect(player(s, 'a').mined).toBe(true);
  });

  it('the Queen collects a spare at a station whose kind is already banked', () => {
    let s = noCards(game());
    player(s, 'a').bank.ruby = 1;
    player(s, 'a').gems = ['ruby'];
    place(s, 'a-queen', 'c1');
    freshTurn(s, 'a');
    s = rollWith(s, 'a', 1);
    s = act(s, 'a', { type: 'move', characterId: 'a-queen', path: ['c1', 'c2'] });
    expect(s.gems.find((g) => g.carriedBy === 'a-queen')?.kind).toBe('ruby');
    // The King does not.
    let t = noCards(game());
    player(t, 'a').bank.ruby = 1;
    player(t, 'a').gems = ['ruby'];
    place(t, 'a-king', 'c1');
    freshTurn(t, 'a');
    t = rollWith(t, 'a', 1);
    t = act(t, 'a', { type: 'move', characterId: 'a-king', path: ['c1', 'c2'] });
    expect(t.characters['a-king'].carrying).toEqual([]);
  });

  it('Diplomacy explains why it is locked', () => {
    const s = noCards(game());
    freshTurn(s, 'a');
    const trade = powerOptions(toPlayerView(s, 'a'), 'a').find((o) => o.type === 'offerTrade')!;
    expect(trade.usable).toBe(false);
    expect(trade.reason).toMatch(/Queen/);
    void carry;
  });

  it('landing on a safe space beside a rival says why nothing happened', () => {
    let s = noCards(game());
    place(s, 'b-king', 'c3');
    place(s, 'a-king', 'c1');
    freshTurn(s, 'a');
    s = rollWith(s, 'a', 2);
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: ['c1', 'c2', 'c3'] });
    expect(s.characters['b-king'].node).toBe('c3');
    expect(s.log.some((l) => /safe space.*No capture here/.test(l.text))).toBe(true);
  });
});
