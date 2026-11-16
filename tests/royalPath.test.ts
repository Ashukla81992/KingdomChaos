import { describe, expect, it } from 'vitest';
import { CROWN_QUEST, toPlayerView, type GameState } from '@/engine';
import { destinations, startPlan } from '@/lib/movePlan';
import { royalPlaySeat } from '@/lib/royalPath';
import { bankAll, game, noCards, place, rollWith, unlock } from './helpers';

const fresh = () => noCards(game());
const view = (s: GameState) => toPlayerView(s, 'a');
const endsOf = (s: GameState, id: string) => new Set(startPlan(s, id) ? [...destinations(startPlan(s, id)!).keys()] : []);

describe('Royal Path presentation', () => {
  it('highlights an eligible piece whose current move can enter its own path (markers not required to enter)', () => {
    let s = bankAll(fresh(), 'a');
    place(s, 'a-queen', 'c0', { lap: 0, plates: [] });
    s = rollWith(s, 'a', 2);
    const ends = endsOf(s, 'a-queen');
    expect(ends.has('f-red-1')).toBe(true);
    expect(royalPlaySeat(view(s), 'a-queen', ends)).toBe(0);
    expect(royalPlaySeat(view(s), null, ends)).toBeNull();
  });

  it('stays hidden when the path is locked or this roll cannot reach it', () => {
    let locked = fresh();
    place(locked, 'a-queen', 'c0', { lap: 4 });
    locked = rollWith(locked, 'a', 2);
    expect(endsOf(locked, 'a-queen').has('f-red-1')).toBe(false);
    expect(royalPlaySeat(view(locked), 'a-queen', endsOf(locked, 'a-queen'))).toBeNull();
    expect(royalPlaySeat(view(locked), 'a-queen', ['f-red-1'])).toBeNull();

    let far = unlock(fresh(), 'a');
    place(far, 'a-queen', 'c15', { lap: 4 });
    far = rollWith(far, 'a', 1);
    expect(royalPlaySeat(view(far), 'a-queen', endsOf(far, 'a-queen'))).toBeNull();
  });

  it('follows the bent road into the temple rather than a straight chord', () => {
    for (const house of CROWN_QUEST.houses) {
      const edges = CROWN_QUEST.edges.filter((e) => e.lane === 'final' && [e.a, e.b].some((id) => CROWN_QUEST.nodes.find((n) => n.id === id)?.house === house.seat));
      const pts = edges.flatMap((e) => e.route);
      const fork = CROWN_QUEST.nodes.find((n) => n.id === house.branch)!.xy;
      const temple = CROWN_QUEST.nodes.find((n) => n.id === 'temple')!.xy;
      const dx = temple[0] - fork[0];
      const dy = temple[1] - fork[1];
      const len = Math.hypot(dx, dy) || 1;
      const bend = Math.max(...pts.map(([x, y]) => Math.abs(dx * (fork[1] - y) - dy * (fork[0] - x)) / len));
      expect(bend, house.key).toBeGreaterThan(12);
    }
  });

  it('Royal Path edges are two-way', () => {
    const finalEdges = CROWN_QUEST.edges.filter((e) => e.lane === 'final');
    expect(finalEdges.every((e) => !e.oneWay)).toBe(true);
  });
});
