import { describe, expect, it } from 'vitest';
import { actionPayloadSchema } from '@/server/protocol';

describe('online action schema', () => {
  it.each([
    { type: 'dragonFire', targetId: 'b-king' },
    { type: 'dragonFire', monster: 'golem' },
    { type: 'attackMonster', characterId: 'a-king', monster: 'spider' },
    { type: 'explore', characterId: 'a-king' },
    { type: 'battle', choice: 'guard' },
    { type: 'fly', characterId: 'a-king', to: 'c9', fuelCardId: 'x1' },
  ])('accepts %o without dropping fields', (action) => {
    const r = actionPayloadSchema.safeParse({ action, version: 3 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.action).toEqual(action);
  });

  it('rejects an unknown battle choice', () => {
    expect(actionPayloadSchema.safeParse({ action: { type: 'battle', choice: 'flee' }, version: 1 }).success).toBe(false);
  });
});
