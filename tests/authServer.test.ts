import { afterEach, describe, expect, it } from 'vitest';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as register } from '@/app/api/auth/register/route';
import { identityFromIdToken } from '@/server/google';
import { verifyPassword } from '@/server/auth';
import { GOOGLE_ONLY_PASS_HASH, googleUsernameCandidates, MemoryStore, PostgresStore, setStore, type Store } from '@/server/store';

const req = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: 'POST', body: JSON.stringify(body) });
const idToken = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;

afterEach(() => setStore(null));

describe('auth routes', () => {
  it('turns an unexpected store failure into a JSON 500 instead of an empty response', async () => {
    const broken = new MemoryStore();
    broken.findAccountByUsername = async () => {
      throw new Error('relation "kc_accounts" does not exist');
    };
    setStore(broken as Store);
    const res = await login(req('/api/auth/login', { username: 'ace', password: 'secret1' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/game server hit a problem/);
  });

  it('registers then signs in', async () => {
    setStore(new MemoryStore());
    expect((await register(req('/api/auth/register', { username: 'ace', password: 'secret1' }))).status).toBe(201);
    expect((await login(req('/api/auth/login', { username: 'ace', password: 'secret1' }))).status).toBe(200);
    expect((await login(req('/api/auth/login', { username: 'ace', password: 'wrong12' }))).status).toBe(401);
  });
});

describe('Google sign-in helpers', () => {
  const now = Date.UTC(2026, 10, 20);
  const good = { aud: 'cid', iss: 'https://accounts.google.com', exp: now / 1000 + 600, sub: '123', given_name: 'Abhi', email: 'a@b.c' };

  it('accepts a valid ID token and rejects wrong audience, issuer or expiry', () => {
    expect(identityFromIdToken(idToken(good), 'cid', now)).toEqual({ sub: '123', preferredName: 'Abhi' });
    expect(() => identityFromIdToken(idToken({ ...good, aud: 'other' }), 'cid', now)).toThrow();
    expect(() => identityFromIdToken(idToken({ ...good, iss: 'evil.com' }), 'cid', now)).toThrow();
    expect(() => identityFromIdToken(idToken({ ...good, exp: now / 1000 - 1 }), 'cid', now)).toThrow();
  });

  it('builds valid usernames and Google-only accounts cannot sign in with a password', () => {
    for (const name of ['José María', 'x', '李']) {
      for (const u of googleUsernameCandidates(name)) expect(u).toMatch(/^[A-Za-z0-9_.-]{3,24}$/);
    }
    expect(verifyPassword('', GOOGLE_ONLY_PASS_HASH)).toBe(false);
  });

  it('MemoryStore links a Google user to one account and avoids taken names', async () => {
    const store = new MemoryStore();
    await store.createAccount('Abhi', 'scrypt$a$b');
    const a = await store.findOrCreateGoogleAccount('g1', 'Abhi');
    expect(a.username).not.toBe('Abhi');
    expect((await store.findOrCreateGoogleAccount('g1', 'Abhi')).id).toBe(a.id);
  });
});

// Runs against a real, empty Postgres when TEST_DATABASE_URL is set (e.g. a scratch database).
describe.skipIf(!process.env.TEST_DATABASE_URL)('PostgresStore on a fresh database', () => {
  it('creates its tables on first use, then signs up, signs in and links Google', async () => {
    const store = new PostgresStore(process.env.TEST_DATABASE_URL!);
    setStore(store);
    const name = `ace${Date.now() % 100000}`;
    expect((await register(req('/api/auth/register', { username: name, password: 'secret1' }))).status).toBe(201);
    expect((await login(req('/api/auth/login', { username: name, password: 'secret1' }))).status).toBe(200);
    const sub = `g${Date.now()}`;
    const g = await store.findOrCreateGoogleAccount(sub, name);
    expect(g.username).not.toBe(name);
    expect((await store.findOrCreateGoogleAccount(sub, name)).id).toBe(g.id);
  });
});
