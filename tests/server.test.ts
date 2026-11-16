/**
 * Online HTTP room coverage lives in tests/online.test.ts (in-memory store).
 * This file keeps a lightweight smoke import so older CI filters still resolve.
 */
import { describe, expect, it } from 'vitest';
import { actionSchema, codeSchema } from '@/server/protocol';
import { GET as cleanup } from '@/app/api/cron/cleanup/route';

describe('protocol schemas', () => {
  it('accepts a roll action and normalizes room codes', () => {
    expect(actionSchema.parse({ type: 'roll' })).toEqual({ type: 'roll' });
    expect(codeSchema.parse('abcde')).toBe('ABCDE');
  });
});

describe('GET /api/cron/cleanup', () => {
  it('rejects missing or wrong bearer tokens', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-cron-secret';
    try {
      const denied = await cleanup(new Request('http://localhost/api/cron/cleanup'));
      expect(denied.status).toBe(401);
      const wrong = await cleanup(new Request('http://localhost/api/cron/cleanup', { headers: { authorization: 'Bearer nope' } }));
      expect(wrong.status).toBe(401);
      const ok = await cleanup(new Request('http://localhost/api/cron/cleanup', { headers: { authorization: 'Bearer unit-cron-secret' } }));
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body.ok).toBe(true);
      expect(typeof body.deleted).toBe('number');
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});
