import { describe, expect, it } from 'vitest';
import { applyAction } from '@/engine';
import { game, hand, noCards, T0, viewOf } from './helpers';

describe('hidden info and versioning', () => {
  it('toPlayerView hides other hands and deck order', () => {
    const s = noCards(game());
    hand(s, 'a', ['shield', 'rescue']);
    hand(s, 'b', ['immunity', 'dragon_slayer', 'swap']);
    s.deck = [
      { id: 'd1', type: 'build_bridge' },
      { id: 'd2', type: 'landslide' },
      { id: 'd3', type: 'raise_mountain' },
    ];
    const va = viewOf(s, 'a');
    expect(va.hand.map((c) => c.type).sort()).toEqual(['rescue', 'shield']);
    expect(va.handCounts.b).toBe(3);
    expect((va as { hands?: unknown }).hands).toBeUndefined();
    expect(va.deckCount).toBe(3);
    expect((va as { deck?: unknown }).deck).toBeUndefined();
    expect((va as { rngState?: unknown }).rngState).toBeUndefined();

    const vb = viewOf(s, 'b');
    expect(vb.hand.map((c) => c.type)).toContain('dragon_slayer');
    expect(vb.handCounts.a).toBe(2);
    expect(vb.hand.some((c) => c.type === 'shield')).toBe(false);
  });

  it('applyAction rejects a duplicate/stale action version', () => {
    const s = game();
    const stale = applyAction(s, { playerId: 'a', action: { type: 'roll' }, version: s.version + 1 }, T0);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toMatch(/out of date|stale|changed/i);

    const ok = applyAction(s, { playerId: 'a', action: { type: 'roll' }, version: s.version }, T0);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const again = applyAction(ok.state, { playerId: 'a', action: { type: 'roll' }, version: s.version }, T0);
      expect(again.ok).toBe(false);
    }
  });
});
