import { describe, expect, it } from 'vitest';
import { alternatives, choose, consequences, destinations, routeNote, startPlan, whyNot } from '@/lib/movePlan';
import { carry, game, hand, noCards, place, rollWith, unlock } from './helpers';

const fresh = () => noCards(game());

describe('move preview', () => {
  it('lists every legal end for the roll and previews one route', () => {
    let s = fresh();
    place(s, 'a-king', 'c8');
    s = rollWith(s, 'a', 3);
    const plan = startPlan(s, 'a-king')!;
    expect(plan.steps).toBe(3);
    expect(new Set(destinations(plan).keys())).toEqual(new Set(['blue-road-1', 'c11', 'c5', 'crag', 'mine-1']));
    const chosen = choose(plan, 'c11')!;
    expect(chosen.choice!.path).toEqual(['c8', 'c9', 'c10', 'c11']);
    expect(choose(plan, 'c12')).toBeNull();
  });

  it('describes what the move will do before it is committed', () => {
    let s = fresh();
    place(s, 'a-king', 'c1');
    place(s, 'b-witch', 'c4');
    carry(s, 'b-witch', 'emerald');
    s = rollWith(s, 'a', 3);
    const plan = choose(startPlan(s, 'a-king')!, 'c4')!;
    const text = consequences(s, 'a-king', plan.choice!).join(' | ');
    expect(text).toMatch(/Picks up the Ruby/);
    expect(text).toMatch(/Cuts B's Witch/);
  });

  it('previews a shortcut and the Royal Path turn-in', () => {
    let s = fresh();
    place(s, 'a-witch', 'c10', { lap: 1 });
    s = rollWith(s, 'a', 3);
    const lift = choose(startPlan(s, 'a-witch')!, 'c13')!;
    expect(consequences(s, 'a-witch', lift.choice!).join(' ')).toMatch(/Magic Lift: rides to/);

    let t = unlock(fresh(), 'a');
    place(t, 'a-queen', 'c0', { lap: 4 });
    t = rollWith(t, 'a', 2);
    const plan = startPlan(t, 'a-queen')!;
    expect(new Set(destinations(plan).keys())).toEqual(new Set(['f-red-1', 'c2', 'c38']));
    expect(consequences(t, 'a-queen', choose(plan, 'f-red-1')!.choice!)).toContain('Turns onto your Royal Path');
  });

  it('previews plates touched, the cut’s extra turn, and a trail’s trade-off and trap risk', () => {
    let s = fresh();
    place(s, 'a-king', 'c8');
    place(s, 'b-witch', 'c11');
    s = rollWith(s, 'a', 3);
    const text = consequences(s, 'a-king', choose(startPlan(s, 'a-king')!, 'c11')!.choice!).join(' | ');
    expect(text).toMatch(/Touches the Blue plate \(1 of 4\)/);
    expect(text).toMatch(/bonus roll/);

    s = fresh();
    place(s, 'a-king', 'camp-west');
    s = rollWith(s, 'a', 1);
    const trail = choose(startPlan(s, 'a-king')!, 'bramble-1')!.choice!;
    expect(consequences(s, 'a-king', trail).join(' ')).toMatch(/Trap risk: stopping at the Bramble Snare springs a snare on a roll of 1–2/);
    expect(routeNote(s, trail)).toMatch(/^Camp and Glade Roads: .+ Risk: /);

    s = fresh();
    place(s, 'a-king', 'c0');
    s = rollWith(s, 'a', 1);
    expect(routeNote(s, choose(startPlan(s, 'a-king')!, 'c1')!.choice!)).toBeNull();
  });

  it('explains why a space is not a legal end', () => {
    let s = fresh();
    place(s, 'a-king', 'c8');
    place(s, 'b-king', 'c10');
    s = rollWith(s, 'a', 3);
    const plan = startPlan(s, 'a-king')!;
    expect(whyNot(s, plan, 'c9')).toMatch(/all 3 steps/);
    expect(whyNot(s, plan, 'c1')).toMatch(/whole roll/);
    expect(whyNot(s, plan, 'home-blue')).toMatch(/castle/i);
    expect(whyNot(s, plan, 'f-purple-1')).toMatch(/another house/);
    expect(whyNot(s, plan, 'f-red-1')).toMatch(/four gem/);
  });

  it('refuses a protected opponent and says why', () => {
    let s = fresh();
    place(s, 'a-king', 'c8');
    place(s, 'b-king', 'c11', { shield: true });
    s = rollWith(s, 'a', 3);
    const plan = startPlan(s, 'a-king')!;
    expect(destinations(plan).has('c11')).toBe(false);
    expect(whyNot(s, plan, 'c11')).toMatch(/Shield/);
  });

  it('cycles alternative routes to the same end (the Witch portal)', () => {
    let s = fresh();
    place(s, 'a-witch', 'c13', { lap: 1 });
    s = rollWith(s, 'a', 2);
    const plan = startPlan(s, 'a-witch')!;
    const withHop = [...destinations(plan).entries()].find(([, routes]) => routes.length > 1);
    if (withHop) {
      const first = choose(plan, withHop[0])!;
      expect(alternatives(first)).toBeGreaterThan(1);
      const second = choose(first, withHop[0])!;
      expect(second.choice!.path).not.toEqual(first.choice!.path);
    } else expect(plan.options.some((o) => o.witchPortal)).toBe(true);
  });

  it('only shows a plan after the roll and for the current player', () => {
    const s = fresh();
    hand(s, 'a', []);
    expect(startPlan(s, 'a-king')).toBeNull();
  });
});
