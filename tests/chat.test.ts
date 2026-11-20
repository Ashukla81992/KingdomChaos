import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@/server/auth';
import { CHAT_BURST, createRoom, getRoomForAccount, joinRoom, postChat, resetSweepThrottle, startRoom } from '@/server/rooms';
import { MemoryStore, PostgresStore, setStore, type Store } from '@/server/store';
import { POST as chatRoute } from '@/app/api/rooms/[code]/chat/route';

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  setStore(store);
  resetSweepThrottle();
});

afterEach(() => {
  setStore(null);
});

async function twoPlayerRoom(s: Store = store, start = true) {
  const tag = Date.now() % 100000;
  const host = await s.createAccount(`Host${tag}${Math.floor(Math.random() * 900 + 100)}`, hashPassword('password1'));
  const guest = await s.createAccount(`Guest${tag}${Math.floor(Math.random() * 900 + 100)}`, hashPassword('password1'));
  const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
  await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
  if (start) await startRoom({ code: room.code, accountId: host.id, pace: 'untimed' });
  return { host, guest, code: room.code };
}

describe('match chat', () => {
  it('delivers a message to the other player on their next poll', async () => {
    const { host, guest, code } = await twoPlayerRoom();
    const sent = await postChat({ code, accountId: host.id, text: '  Good   luck!\n' });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.message).toMatchObject({ playerId: 'p1', username: host.username, text: 'Good luck!' });

    const g = await getRoomForAccount(code, guest.id, Date.now(), 0);
    expect(g.ok && g.data.chat?.map((m) => m.text)).toEqual(['Good luck!']);
    // Asking for messages after the newest one returns nothing new.
    const again = await getRoomForAccount(code, guest.id, Date.now(), sent.message.id);
    expect(again.ok && again.data.chat).toEqual([]);
    // Without chatAfter the poll stays as it was (no chat field).
    const plain = await getRoomForAccount(code, guest.id);
    expect(plain.ok && plain.data.chat).toBeUndefined();
  });

  it('works in the lobby before the match starts', async () => {
    const { guest, code } = await twoPlayerRoom(store, false);
    const sent = await postChat({ code, accountId: guest.id, text: 'Ready when you are' });
    expect(sent.ok && sent.message.playerId).toBe('p2');
  });

  it('only lets seated players chat and read chat', async () => {
    const { host, code } = await twoPlayerRoom(store, false);
    await postChat({ code, accountId: host.id, text: 'hello' });
    const stranger = await store.createAccount('Stranger', hashPassword('password1'));
    expect(await postChat({ code, accountId: stranger.id, text: 'hi' })).toMatchObject({ ok: false, status: 403 });
    const peek = await getRoomForAccount(code, stranger.id, Date.now(), 0);
    expect(peek.ok && peek.data.chat).toBeUndefined();
  });

  it('rejects empty and over-long messages', async () => {
    const { host, code } = await twoPlayerRoom();
    expect(await postChat({ code, accountId: host.id, text: '   ' })).toMatchObject({ ok: false, status: 400 });
    expect(await postChat({ code, accountId: host.id, text: 'x'.repeat(201) })).toMatchObject({ ok: false, status: 400 });
    expect(await postChat({ code, accountId: host.id, text: 42 })).toMatchObject({ ok: false, status: 400 });
  });

  it('slows down a player who floods the chat', async () => {
    const { host, guest, code } = await twoPlayerRoom();
    const now = Date.now();
    for (let i = 0; i < CHAT_BURST; i++) expect((await postChat({ code, accountId: host.id, text: `m${i}`, now })).ok).toBe(true);
    expect(await postChat({ code, accountId: host.id, text: 'too many', now })).toMatchObject({ ok: false, status: 429 });
    // Others can still talk, and the sender can again after the window.
    expect((await postChat({ code, accountId: guest.id, text: 'calm down', now })).ok).toBe(true);
    expect((await postChat({ code, accountId: host.id, text: 'sorry', now: now + 11_000 })).ok).toBe(true);
  });

  it('keeps the room alive and goes away with it', async () => {
    const { host, code } = await twoPlayerRoom();
    const before = (await store.getRoom(code))!.expiresAt;
    const later = Date.now() + 10 * 60_000;
    await postChat({ code, accountId: host.id, text: 'still here', now: later });
    expect((await store.getRoom(code))!.expiresAt).toBeGreaterThan(before);
    await store.deleteRoom(code);
    expect(await store.listChat(code, 0)).toEqual([]);
  });

  it('returns only the newest 50 when starting from scratch', async () => {
    const { host, code } = await twoPlayerRoom();
    for (let i = 0; i < 60; i++) await store.addChat(code, { accountId: host.id, playerId: 'p1', username: 'H', text: `m${i}`, at: i });
    const latest = await store.listChat(code, 0);
    expect(latest).toHaveLength(50);
    expect(latest[0].text).toBe('m10');
    expect(latest.at(-1)!.text).toBe('m59');
  });

  it('POST /api/rooms/:code/chat needs a signed-in player', async () => {
    const { code } = await twoPlayerRoom();
    const res = await chatRoute(new Request(`http://x/api/rooms/${code}/chat`, { method: 'POST', body: JSON.stringify({ text: 'hi' }) }), {
      params: Promise.resolve({ code }),
    });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)('match chat on Postgres', () => {
  it('stores, lists after an id, rate-limits and cascades with the room', async () => {
    const pg = new PostgresStore(process.env.TEST_DATABASE_URL!);
    setStore(pg);
    const { host, guest, code } = await twoPlayerRoom(pg);
    const a = await postChat({ code, accountId: host.id, text: 'one' });
    const b = await postChat({ code, accountId: guest.id, text: 'two' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect((await pg.listChat(code, 0)).map((m) => m.text)).toEqual(['one', 'two']);
    expect((await pg.listChat(code, a.message.id)).map((m) => m.text)).toEqual(['two']);
    expect(await pg.countRecentChat(code, host.id, Date.now() - 10_000)).toBe(1);
    await pg.deleteRoom(code);
    expect(await pg.listChat(code, 0)).toEqual([]);
  });
});
