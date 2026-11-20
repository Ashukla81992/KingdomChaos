import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '@/server/auth';
import { CHAT_BURST, createRoom, endRoom, getRoomForAccount, joinRoom, postChat, postSignal, reportPlayer, resetClosedSessions, resetSweepThrottle, startRoom } from '@/server/rooms';
import { iceServers } from '@/server/ice';
import { MemoryStore, PostgresStore, setStore, type Store } from '@/server/store';
import { POST as chatRoute } from '@/app/api/rooms/[code]/chat/route';

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  setStore(store);
  resetSweepThrottle();
  resetClosedSessions();
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

describe('chat lasts one session', () => {
  it('wipes chat and voice messages when the match ends, and closes chat', async () => {
    const { host, guest, code } = await twoPlayerRoom();
    await postChat({ code, accountId: host.id, text: 'gg soon' });
    await postSignal({ code, accountId: guest.id, payload: { kind: 'hello', to: 'p1' } });
    const ended = await endRoom({ code, accountId: host.id });
    expect(ended.ok).toBe(true);
    expect(await store.listChat(code, 0)).toEqual([]);
    expect(await store.takeSignals(code, 'p1', Date.now())).toEqual([]);
    const after = await getRoomForAccount(code, guest.id, Date.now(), 0);
    expect(after.ok && after.data.chat).toEqual([]);
    expect(await postChat({ code, accountId: guest.id, text: 'hello?' })).toMatchObject({ ok: false, status: 409 });
  });
});

describe('voice signalling', () => {
  it('relays an offer to the other player once, on their next poll', async () => {
    const { host, guest, code } = await twoPlayerRoom();
    const offer = { kind: 'offer', to: 'p2', data: { type: 'offer', sdp: 'v=0 fake' } };
    expect(await postSignal({ code, accountId: host.id, payload: offer })).toEqual({ ok: true });
    const g = await getRoomForAccount(code, guest.id, Date.now(), 0);
    expect(g.ok && g.data.signals).toEqual([expect.objectContaining({ from: 'p1', kind: 'offer', data: { type: 'offer', sdp: 'v=0 fake' } })]);
    const again = await getRoomForAccount(code, guest.id, Date.now(), 0);
    expect(again.ok && again.data.signals).toEqual([]);
    // The host never sees their own message.
    const h = await getRoomForAccount(code, host.id, Date.now(), 0);
    expect(h.ok && h.data.signals).toEqual([]);
  });

  it('refuses strangers, yourself, AI seats and bad payloads, and drops stale messages', async () => {
    const { host, code } = await twoPlayerRoom();
    const stranger = await store.createAccount('Lurker', hashPassword('password1'));
    expect(await postSignal({ code, accountId: stranger.id, payload: { kind: 'hello', to: 'p1' } })).toMatchObject({ ok: false, status: 403 });
    expect(await postSignal({ code, accountId: host.id, payload: { kind: 'hello', to: 'p1' } })).toMatchObject({ ok: false, status: 400 });
    expect(await postSignal({ code, accountId: host.id, payload: { kind: 'offer', to: 'p2' } })).toMatchObject({ ok: false, status: 400 });
    expect(await postSignal({ code, accountId: host.id, payload: { kind: 'shout', to: 'p2' } })).toMatchObject({ ok: false, status: 400 });
    const old = Date.now() - 120_000;
    await postSignal({ code, accountId: host.id, payload: { kind: 'hello', to: 'p2' }, now: old });
    expect(await store.takeSignals(code, 'p2', Date.now())).toEqual([]);
  });

  it('uses free STUN, plus a TURN relay only when configured', () => {
    expect(iceServers({})).toHaveLength(1);
    const withTurn = iceServers({ TURN_URLS: 'turn:relay.example.com:3478, bogus', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' });
    expect(withTurn[1]).toEqual({ urls: ['turn:relay.example.com:3478'], username: 'u', credential: 'c' });
  });
});

describe('reporting a player', () => {
  it('records who reported whom and why', async () => {
    const { host, guest, code } = await twoPlayerRoom();
    expect(await reportPlayer({ code, accountId: host.id, playerId: 'p2', reason: 'Spam' })).toEqual({ ok: true });
    expect(store.reports).toEqual([expect.objectContaining({ roomCode: code, reporterAccount: host.id, reportedAccount: guest.id, reason: 'Spam' })]);
    expect(await reportPlayer({ code, accountId: host.id, playerId: 'p1', reason: 'Spam' })).toMatchObject({ ok: false });
    expect(await reportPlayer({ code, accountId: host.id, playerId: 'p2', reason: 'made up' })).toMatchObject({ ok: false });
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
    expect((await postSignal({ code, accountId: host.id, payload: { kind: 'hello', to: 'p2' } })).ok).toBe(true);
    expect((await pg.takeSignals(code, 'p2', Date.now())).map((x) => x.kind)).toEqual(['hello']);
    expect(await pg.takeSignals(code, 'p2', Date.now())).toEqual([]);
    expect((await reportPlayer({ code, accountId: guest.id, playerId: 'p1', reason: 'Spam' })).ok).toBe(true);
    await pg.clearSession(code);
    expect(await pg.listChat(code, 0)).toEqual([]);
    await pg.deleteRoom(code);
  });
});
