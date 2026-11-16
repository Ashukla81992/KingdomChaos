import { describe, expect, it } from 'vitest';
import { arrivalPreview, dragonSpaceRule, resolveArrival } from '@/engine/dungeon';
import { connectionBreakReason, keepsEveryoneConnected, mapMarkers } from '@/engine/graph';
import { CARD_CATEGORY, type Ctx } from '@/engine/rules';
import { act, game, hand, noCards, place } from './helpers';

const ctxOf = (s: ReturnType<typeof game>): Ctx => ({ state: s, events: [], now: 1_000_000 });

describe('dungeon encounters', () => {
  it('Stone Golem success carries along the shortcut; failure sends to Fallen Ruins', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-golem');
    s.forcedRolls = [4];
    const ctx = ctxOf(s);
    resolveArrival(ctx, s.characters['a-king']);
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'encounter', monster: 'golem', success: true, to: 'd-e4' }));
    expect(s.characters['a-king'].node).toBe('d-e4');

    s = noCards(game());
    place(s, 'a-king', 'd-golem');
    s.forcedRolls = [3];
    const fail = ctxOf(s);
    resolveArrival(fail, s.characters['a-king']);
    expect(fail.events).toContainEqual(expect.objectContaining({ type: 'encounter', monster: 'golem', success: false, to: 'd-ruins' }));
    expect(s.characters['a-king'].node).toBe('d-ruins');
  });

  it('Cave Spider success draws a power card; failure sends to Crystal Niche', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-spider');
    s.deck = [
      { id: 'p1', type: 'shield' },
      { id: 'm1', type: 'build_bridge' },
    ];
    s.forcedRolls = [5];
    const ctx = ctxOf(s);
    resolveArrival(ctx, s.characters['a-king']);
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'encounter', monster: 'spider', success: true }));
    expect(s.hands.a).toHaveLength(1);
    expect(CARD_CATEGORY[s.hands.a[0].type]).toBe('power');
    expect(s.characters['a-king'].node).toBe('d-spider');

    s = noCards(game());
    place(s, 'a-king', 'd-spider');
    s.forcedRolls = [2];
    const fail = ctxOf(s);
    resolveArrival(fail, s.characters['a-king']);
    expect(s.characters['a-king'].node).toBe('d-safe-crystal');
  });

  it('Knight adds +1; arrivalPreview reports need and both outcomes', () => {
    const s = noCards(game());
    place(s, 'a-knight', 'd-golem');
    const preview = arrivalPreview(s, 'a-knight', 'd-golem')!;
    expect(preview).toMatchObject({ kind: 'golem', need: 3, name: 'Stone Golem' });
    expect(preview.success).toMatch(/shortcut/i);
    expect(preview.failure).toMatch(/Fallen Ruins/);

    s.forcedRolls = [3];
    const ctx = ctxOf(s);
    resolveArrival(ctx, s.characters['a-knight']);
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'encounter', monster: 'golem', roll: 3, total: 4, success: true }));
  });

  it('keeps the Monster Den adventure fight for the Vault Door', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-monster');
    s.forcedRolls = [4];
    s = act(s, 'a', { type: 'fightMonster', characterId: 'a-king' });
    expect(s.characters['a-king'].beatMonster).toBe(true);
  });
});

describe('wild dragon and Dragon Slayer arrival', () => {
  it('Witch passes a wild dragon; Queen with Slayer may slay; others block', () => {
    const s = noCards(game());
    s.dragon = { state: 'wild', node: 'c3', companion: null, recoverUntilTurn: 0, releasedBy: null };
    expect(dragonSpaceRule(s, 'a-witch')).toBe('pass');
    expect(dragonSpaceRule(s, 'a-king')).toBe('block');
    hand(s, 'a', ['dragon_slayer']);
    expect(dragonSpaceRule(s, 'a-queen')).toBe('slay');
    expect(dragonSpaceRule(s, 'a-knight')).toBe('block');
  });

  it('Dragon Slayer arrival success clears the block and recovers the dragon', () => {
    const s = noCards(game());
    s.dragon = { state: 'wild', node: 'c3', companion: null, recoverUntilTurn: 0, releasedBy: null };
    hand(s, 'a', ['dragon_slayer']);
    place(s, 'a-queen', 'c3');
    s.forcedRolls = [4];
    const ctx = ctxOf(s);
    resolveArrival(ctx, s.characters['a-queen']);
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'slay', success: true }));
    expect(s.dragon).toMatchObject({ state: 'recovering', node: 'd-lair' });
    expect(s.hands.a.some((c) => c.type === 'dragon_slayer')).toBe(true);
  });

  it('Dragon Slayer arrival failure retreats the Queen and discards the card', () => {
    const s = noCards(game());
    s.dragon = { state: 'wild', node: 'c3', companion: null, recoverUntilTurn: 0, releasedBy: null };
    hand(s, 'a', ['dragon_slayer']);
    place(s, 'a-queen', 'c3');
    s.forcedRolls = [3];
    const ctx = ctxOf(s);
    resolveArrival(ctx, s.characters['a-queen']);
    expect(ctx.events).toContainEqual(expect.objectContaining({ type: 'slay', success: false }));
    expect(s.dragon.state).toBe('wild');
    expect(s.hands.a.some((c) => c.type === 'dragon_slayer')).toBe(false);
    expect(s.characters['a-queen'].node).not.toBe('c3');
  });

  it('non-Queen cannot slay on arrival', () => {
    const s = noCards(game());
    s.dragon = { state: 'wild', node: 'c3', companion: null, recoverUntilTurn: 0, releasedBy: null };
    hand(s, 'a', ['dragon_slayer']);
    place(s, 'a-king', 'c3');
    expect(dragonSpaceRule(s, 'a-king')).toBe('block');
    expect(arrivalPreview(s, 'a-king', 'c3')).toBeNull();
    s.forcedRolls = [6];
    const ctx = ctxOf(s);
    resolveArrival(ctx, s.characters['a-king']);
    expect(ctx.events.filter((e) => e.type === 'slay')).toHaveLength(0);
    expect(s.dragon.state).toBe('wild');
  });
});

describe('map markers and connectivity', () => {
  it('mapMarkers lists portals, encounters, safe rooms and the dragon with distinct colors', () => {
    const s = game();
    const markers = mapMarkers(s);
    const kinds = new Set(markers.map((m) => m.kind));
    expect(kinds.has('portal')).toBe(true);
    expect(kinds.has('trap')).toBe(true);
    expect(kinds.has('shortcut')).toBe(true);
    expect(kinds.has('encounter')).toBe(true);
    expect(kinds.has('safeRoom')).toBe(true);
    expect(kinds.has('dragon')).toBe(true);
    expect(markers.find((m) => m.id === 'encounter:d-golem')?.label).toBe('Stone Golem');
    expect(markers.find((m) => m.id === 'encounter:d-spider')?.label).toBe('Cave Spider');
    const colors = new Set(markers.map((m) => m.color));
    expect(colors.size).toBeGreaterThan(5);
    expect(markers.filter((m) => m.kind === 'hazard').every((m) => m.hidden)).toBe(true);
  });

  it('connectivity guard refuses a change that cuts a plate or Royal Path entry', () => {
    const s = game();
    expect(keepsEveryoneConnected(s, {})).toBe(true);
    expect(keepsEveryoneConnected(s, { transforms: { c0: 'mountain' } })).toBe(false);
    expect(connectionBreakReason(s, { transforms: { c1: 'mountain' } })).toMatch(/Royal Path/);
  });
});

describe('dungeon reachability', () => {
  it('encounter spaces are within exact rolls 1–6 from a neighbor', async () => {
    const { walkingDistances } = await import('@/engine/graph');
    const s = game();
    expect(walkingDistances(s, 'd-c2')['d-golem']).toBe(1);
    expect(walkingDistances(s, 'd-e3')['d-spider']).toBe(1);
    expect(walkingDistances(s, 'd-entrance')['d-golem']).toBe(4);
    expect(walkingDistances(s, 'd-entrance')['d-spider']).toBe(4);
  });
});
