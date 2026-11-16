import { describe, expect, it } from 'vitest';
import { CROWN_QUEST, getBoard, legalMoves, type GameState } from '@/engine';
import { act, carry, endsFor, freshTurn, game, hand, noCards, place, player, rollMove, rollWith, unlock } from './helpers';

const { nodes } = getBoard('crownquest');

/** Walk one piece clockwise to circuit index `target` with legal rolls, avoiding trap/shortcut spaces. */
function walkTo(s: GameState, pid: string, chId: string, target: number) {
  for (let guard = 0; guard < 40; guard++) {
    const ch = s.characters[chId];
    const node = nodes[ch.node];
    if (node.circuit === target) return s;
    freshTurn(s, pid);
    let k: number;
    if (node.type === 'castle') k = 1;
    else {
      const left = (target - node.circuit! + 40) % 40;
      k = Math.min(6, left);
      while (k > 1 && nodes[CROWN_QUEST.circuit[(node.circuit! + k) % 40]].teleport) k--;
    }
    s = rollWith(s, pid, k);
    const end = node.type === 'castle' ? CROWN_QUEST.circuit[target] : CROWN_QUEST.circuit[(node.circuit! + k) % 40];
    const opt = legalMoves(s, chId).find((m) => m.path[m.path.length - 1] === end && m.path.every((n) => nodes[n].lane !== 'side' && nodes[n].lane !== 'final') && !m.witchPortal);
    if (!opt) throw new Error(`stuck at ${ch.node}`);
    s = act(s, pid, { type: 'move', characterId: chId, path: opt.path });
  }
  throw new Error('walkTo did not arrive');
}

describe('gems', () => {
  it('passing a station with free hands picks up its gem', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c0');
    s = rollMove(s, 'a', 'a-king', 4, 'c4');
    expect(s.gems.find((g) => g.carriedBy === 'a-king')?.kind).toBe('ruby');
  });

  it('landing on a station picks up too, and a piece carries up to carryLimit gems (default 2)', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c0');
    s = rollMove(s, 'a', 'a-king', 2, 'c2');
    expect(s.characters['a-king'].carrying).toHaveLength(1);
    freshTurn(s, 'a');
    place(s, 'a-king', 'c6');
    s = rollMove(s, 'a', 'a-king', 2, 'c8');
    expect(s.gems.filter((g) => g.carriedBy === 'a-king').map((g) => g.kind)).toEqual(['ruby', 'sapphire']);
    freshTurn(s, 'a');
    place(s, 'a-king', 'c20');
    s = rollMove(s, 'a', 'a-king', 2, 'c22');
    expect(s.characters['a-king'].carrying).toHaveLength(2);
    expect(s.gems.filter((g) => g.carriedBy === 'a-king').map((g) => g.kind)).toEqual(['ruby', 'sapphire']);
  });

  it('carryLimit 1 restores one gem at a time', () => {
    let s = noCards(game(2, { carryLimit: 1 }));
    place(s, 'a-king', 'c0');
    s = rollMove(s, 'a', 'a-king', 2, 'c2');
    freshTurn(s, 'a');
    place(s, 'a-king', 'c6');
    s = rollMove(s, 'a', 'a-king', 2, 'c8');
    expect(s.gems.filter((g) => g.carriedBy === 'a-king').map((g) => g.kind)).toEqual(['ruby']);
  });

  it('banks every carried gem at the gate', () => {
    let s = noCards(game());
    carry(s, 'a-king', 'ruby');
    carry(s, 'a-king', 'sapphire');
    place(s, 'a-king', 'c37', { lap: 3 });
    s = rollMove(s, 'a', 'a-king', 3, 'c0');
    expect(player(s, 'a').gems.sort()).toEqual(['ruby', 'sapphire']);
    expect(s.characters['a-king'].carrying).toEqual([]);
  });

  it('a cut takes as many gems as the attacker has free hands; the rest drop', () => {
    let s = noCards(game());
    carry(s, 'a-knight', 'diamond');
    carry(s, 'b-witch', 'ruby');
    carry(s, 'b-witch', 'sapphire');
    place(s, 'a-knight', 'c8');
    place(s, 'b-witch', 'c11');
    s = rollMove(s, 'a', 'a-knight', 3, 'c11');
    expect(s.gems.filter((g) => g.carriedBy === 'a-knight').map((g) => g.kind)).toEqual(['diamond', 'ruby']);
    expect(s.gems.filter((g) => g.node === 'c11' && !g.carriedBy).map((g) => g.kind)).toEqual(['sapphire']);
  });

  it('does not pick up a gem the kingdom already banked or is already carrying', () => {
    let s = noCards(game());
    player(s, 'a').gems = ['ruby'];
    place(s, 'a-king', 'c0');
    s = rollMove(s, 'a', 'a-king', 4, 'c4');
    expect(s.characters['a-king'].carrying).toEqual([]);
    s = noCards(game());
    carry(s, 'a-queen', 'ruby');
    place(s, 'a-king', 'c0');
    s = rollMove(s, 'a', 'a-king', 4, 'c4');
    expect(s.characters['a-king'].carrying).toEqual([]);
  });

  it('a station supplies every player', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c0');
    place(s, 'b-king', 'c38');
    s = rollMove(s, 'a', 'a-king', 4, 'c4');
    s = rollMove(s, 'b', 'b-king', 5, 'c3');
    expect(s.gems.filter((g) => g.kind === 'ruby' && g.carriedBy).length).toBe(2);
  });

  it('passing your own gate banks automatically; the King draws a card', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c38');
    carry(s, 'a-king', 'emerald');
    s = rollMove(s, 'a', 'a-king', 4, 'c2');
    expect(player(s, 'a').gems).toEqual(['emerald']);
    expect(s.hands.a).toHaveLength(1);
  });

  it('a draw into a full hand is declined unless you name a discard', () => {
    let s = game();
    hand(s, 'a', ['shield', 'swap', 'repair', 'immunity']);
    place(s, 'a-king', 'c39');
    carry(s, 'a-king', 'emerald');
    s = rollMove(s, 'a', 'a-king', 1, 'c0');
    expect(player(s, 'a').gems).toEqual(['emerald']);
    expect(s.hands.a.map((c) => c.type)).toEqual(['shield', 'swap', 'repair', 'immunity']);

    s = game();
    hand(s, 'a', ['shield', 'swap', 'repair', 'immunity']);
    place(s, 'a-king', 'c39');
    carry(s, 'a-king', 'emerald');
    s = rollWith(s, 'a', 1);
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: ['c39', 'c0'], discardCardId: s.hands.a[0].id });
    expect(s.hands.a).toHaveLength(4);
    expect(s.hands.a.some((c) => c.type === 'shield')).toBe(false);
  });

  it('a duplicate gem goes back to its station', () => {
    let s = noCards(game());
    player(s, 'a').gems = ['emerald'];
    place(s, 'a-king', 'c39');
    carry(s, 'a-king', 'emerald');
    s = rollMove(s, 'a', 'a-king', 1, 'c0');
    expect(player(s, 'a').gems).toEqual(['emerald']);
    expect(s.lastEvents.some((e) => e.type === 'banked' && e.duplicate)).toBe(true);
  });

  it('opens the Royal Path once all four gems are banked and a cut is made', () => {
    let s = noCards(game());
    player(s, 'a').gems = ['ruby', 'sapphire', 'diamond'];
    s.stats.a.cuts = 1;
    place(s, 'a-king', 'c39');
    carry(s, 'a-king', 'emerald');
    s = rollMove(s, 'a', 'a-king', 1, 'c0');
    expect(s.lastEvents.some((e) => e.type === 'finalUnlocked' && e.playerId === 'a')).toBe(true);
  });
});

describe('laps (house plates)', () => {
  for (const [pid, house] of [
    ['a', 'red'],
    ['b', 'blue'],
    ['c', 'purple'],
    ['d', 'green'],
  ] as const) {
    it(`the ${house} King completes a lap by touching all four plates, whichever way round`, () => {
      let s = noCards(game(4));
      for (const p of s.players) p.gems = ['ruby', 'sapphire', 'emerald', 'diamond'];
      const h = CROWN_QUEST.houses.find((x) => x.key === house)!;
      const entry = nodes[h.entry].circuit!;
      const id = `${pid}-king`;
      s = walkTo(s, pid, id, entry);
      expect(s.characters[id].plates).toEqual([h.seat]);
      s = walkTo(s, pid, id, (entry + 28) % 40);
      expect(s.characters[id].lap).toBe(3);
      s = walkTo(s, pid, id, (entry + 31) % 40);
      expect(s.characters[id].lap).toBe(4);
      expect(new Set(s.characters[id].plates)).toEqual(new Set([0, 1, 2, 3]));
    });
  }

  it('counts plates in any order, by passing or by landing, and only once each', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c22');
    s = rollMove(s, 'a', 'a-king', 4, 'c18');
    expect(s.characters['a-king'].plates).toEqual([2]);
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'lap', characterId: 'a-king', plate: 2, checkpoint: 1 }));
    expect(s.log.some((l) => /visited the Purple plate \(1 of 4\)/.test(l.text))).toBe(true);
    freshTurn(s, 'a');
    place(s, 'a-king', 'c8');
    s = rollMove(s, 'a', 'a-king', 2, 'c10');
    expect(s.characters['a-king'].plates).toEqual([2, 1]);
    freshTurn(s, 'a');
    s = rollMove(s, 'a', 'a-king', 2, 'c8');
    expect(s.characters['a-king'].plates).toEqual([2, 1]);
    freshTurn(s, 'a');
    place(s, 'a-king', 'c32');
    s = rollMove(s, 'a', 'a-king', 3, 'c29');
    freshTurn(s, 'a');
    place(s, 'a-king', 'c2');
    s = rollMove(s, 'a', 'a-king', 2, 'c0');
    expect(s.characters['a-king'].lap).toBe(4);
    expect(s.log.some((l) => /all four house plates/i.test(l.text))).toBe(true);
  });

  it('a cut resets the victim’s plates; its house keeps banked gems and its cut', () => {
    let s = noCards(game());
    player(s, 'b').gems = ['ruby'];
    s.stats.b.cuts = 1;
    place(s, 'b-witch', 'c11', { lap: 3 });
    place(s, 'a-knight', 'c8');
    s = rollMove(s, 'a', 'a-knight', 3, 'c11');
    expect(s.characters['b-witch']).toMatchObject({ node: 'home-purple', plates: [], lap: 0 });
    expect(player(s, 'b').gems).toEqual(['ruby']);
    expect(s.stats.b.cuts).toBe(1);
  });

  it('a lapped piece turns in at its fork once the path is open, and must land exactly on the temple', () => {
    let s = noCards(unlock(game(), 'a'));
    place(s, 'a-king', 'c0', { lap: 4 });
    s = rollWith(s, 'a', 5);
    const ends = endsFor(s, 'a-king');
    expect(ends.has('f-red-4')).toBe(true);
    expect(ends.has('c5')).toBe(true);
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: ['c0', 'c1', 'f-red-1', 'f-red-2', 'f-red-3', 'f-red-4'] });
    freshTurn(s, 'a');
    s = rollMove(s, 'a', 'a-king', 1, 'f-red-5');
    freshTurn(s, 'a');
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king').has('temple')).toBe(false);
    freshTurn(s, 'a');
    s.turn.moveDone = false;
    s = rollMove(s, 'a', 'a-king', 1, 'temple');
    expect(s.status).toBe('finished');
    expect(s.result).toMatchObject({ winners: ['a'], reason: 'temple' });
  });

  it('the fork stays shut without the gems and the cut, or without all four plates', () => {
    const noFinal = (s: GameState) => [...endsFor(s, 'a-king')].every((n) => nodes[n].lane !== 'final');
    let s = noCards(game());
    place(s, 'a-king', 'c0', { lap: 4 });
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king').has('c3')).toBe(true);
    expect(noFinal(s)).toBe(true);
    s = noCards(unlock(game(), 'a'));
    place(s, 'a-king', 'c0', { plates: [0, 1, 2] });
    s = rollWith(s, 'a', 3);
    expect(noFinal(s)).toBe(true);
  });

  it('teleports skip the plates in between; a trap keeps plate progress', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c16', { plates: [1] });
    s = rollMove(s, 'a', 'a-king', 1, 'c17');
    expect(s.characters['a-king']).toMatchObject({ node: 'c4', plates: [1] });

    s = noCards(game());
    place(s, 'a-king', 'c4', { plates: [0] });
    s = rollMove(s, 'a', 'a-king', 1, 'c5');
    expect(s.characters['a-king']).toMatchObject({ node: 'c37', plates: [0] });

    s = noCards(game());
    place(s, 'a-king', 'c12', { plates: [1] });
    s = rollMove(s, 'a', 'a-king', 1, 'c13');
    expect(s.characters['a-king']).toMatchObject({ node: 'c18', plates: [1] });
  });

  it('a swap onto a plate counts that plate (the destination only)', () => {
    let s = noCards(game());
    hand(s, 'a', ['swap']);
    place(s, 'a-king', 'c5');
    place(s, 'b-king', 'c10');
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'swap', characterId: 'a-king', targetId: 'b-king' } });
    expect(s.characters['a-king']).toMatchObject({ node: 'c10', plates: [1] });
  });

  it('an occupied trap destination steps back to the nearest free or safe space', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c4');
    place(s, 'b-king', 'c37');
    s = rollMove(s, 'a', 'a-king', 1, 'c5');
    expect(s.characters['a-king'].node).toBe('c36');
    expect(s.characters['b-king'].node).toBe('c37');
  });

  it('a trap keeps the carried gem', () => {
    let s = noCards(game());
    player(s, 'a').gems = ['ruby'];
    place(s, 'a-king', 'c4');
    carry(s, 'a-king', 'diamond');
    s = rollMove(s, 'a', 'a-king', 1, 'c5');
    expect(s.characters['a-king'].node).toBe('c37');
    expect(s.gems.find((g) => g.carriedBy === 'a-king')?.kind).toBe('diamond');
  });
});
