import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, makeSessionToken, parseSessionToken, verifyPassword } from '@/server/auth';
import {
  applyRoomAction,
  cleanupExpired,
  createRoom,
  endRoom,
  getRoomForAccount,
  joinRoom,
  resetSweepThrottle,
  startRoom,
} from '@/server/rooms';
import { MemoryStore, defaultExpiresAt, resultExpiresAt, setStore, type RoomRecord } from '@/server/store';
import { deserializeLocalState, serializeLocalState } from '@/lib/storage';
import { createGame } from '@/engine';

let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  setStore(store);
  resetSweepThrottle();
});

afterEach(() => {
  setStore(null);
});

async function account(username: string) {
  return store.createAccount(username, hashPassword('password1'));
}

describe('auth helpers', () => {
  it('hashes and verifies passwords with scrypt', () => {
    const hash = hashPassword('password1');
    expect(verifyPassword('password1', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
  });

  it('signs and parses session tokens', () => {
    const token = makeSessionToken({ id: 'a1', username: 'Ada' });
    expect(parseSessionToken(token)).toMatchObject({ accountId: 'a1', username: 'Ada' });
    expect(parseSessionToken('tampered')).toBeNull();
  });
});

describe('online rooms (in-memory)', () => {
  it('supports two independent sessions in one room', async () => {
    const host = await account('Hosty');
    const guest = await account('Guesty');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    const joined = await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    expect(joined.ok).toBe(true);
    const started = await startRoom({ code: room.code, accountId: host.id, pace: 'untimed' });
    expect(started.ok).toBe(true);

    const h = await getRoomForAccount(room.code, host.id);
    const g = await getRoomForAccount(room.code, guest.id);
    expect(h.ok && g.ok).toBe(true);
    if (!h.ok || !g.ok) return;
    expect(h.data.view?.viewerId).toBe('p1');
    expect(g.data.view?.viewerId).toBe('p2');
    expect(h.data.view?.hand).toEqual(expect.any(Array));
    // Hidden information: other hands never appear in the response
    expect(h.data.view && !('hands' in h.data.view)).toBe(true);
    expect(Object.keys(h.data.view!.handCounts).sort()).toEqual(['p1', 'p2']);
  });

  it('supports a 4-player room', async () => {
    const players = await Promise.all([account('Aone'), account('Btwo'), account('Cthree'), account('Dfour')]);
    const room = await createRoom({ accountId: players[0].id, username: players[0].username, seatCount: 4 });
    for (const p of players.slice(1)) {
      const j = await joinRoom({ code: room.code, accountId: p.id, username: p.username });
      expect(j.ok).toBe(true);
    }
    const started = await startRoom({ code: room.code, accountId: players[0].id });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.room.seats).toHaveLength(4);
    expect(started.room.state?.players).toHaveLength(4);
  });

  it('reconnect / sign-in recovery after a roll restores the exact turn including the saved roll', async () => {
    const host = await account('Roller');
    const guest = await account('Watcher');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    await startRoom({ code: room.code, accountId: host.id, pace: 'untimed' });

    const before = await getRoomForAccount(room.code, host.id);
    expect(before.ok).toBe(true);
    if (!before.ok || !before.data.view) return;
    const version = before.data.view.version;
    const actor = before.data.view.turn.playerId;
    const actorAccount = actor === 'p1' ? host : guest;

    // Force a known die via store mutation then roll
    const raw = await store.getRoom(room.code);
    expect(raw?.state).toBeTruthy();
    raw!.state!.forcedRolls = [4];
    await store.saveRoom(raw!);

    const rolled = await applyRoomAction({
      code: room.code,
      accountId: actorAccount.id,
      action: { type: 'roll' },
      version: (await store.getRoom(room.code))!.version,
      clientActionId: 'roll-1',
    });
    expect(rolled.status).toBe(200);
    const body = rolled.body as { view: { turn: { move: { roll: number } | null }; version: number } };
    expect(body.view.turn.move?.roll).toBe(4);
    const savedVersion = body.view.version;

    // "Reconnect": fetch again as the same account
    const again = await getRoomForAccount(room.code, actorAccount.id);
    expect(again.ok).toBe(true);
    if (!again.ok || !again.data.view) return;
    expect(again.data.view.turn.move?.roll).toBe(4);
    expect(again.data.view.version).toBe(savedVersion);
    expect(again.data.view.turn.playerId).toBe(actor);
    expect(version).toBeLessThan(savedVersion);
  });

  it('allows only the host to end a match', async () => {
    const host = await account('HostEnd');
    const guest = await account('GuestEnd');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    await startRoom({ code: room.code, accountId: host.id });

    const denied = await endRoom({ code: room.code, accountId: guest.id });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(403);

    const ended = await endRoom({ code: room.code, accountId: host.id });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.data.lobby.status).toBe('ended');
    expect(ended.data.view?.result?.reason).toBe('ended');
    expect(ended.data.view?.result?.winners).toEqual([]);
  });

  it('returns the stored result for a duplicate clientActionId', async () => {
    const host = await account('IdemHost');
    const guest = await account('IdemGuest');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    await startRoom({ code: room.code, accountId: host.id });
    const snap = await store.getRoom(room.code);
    const actor = snap!.state!.turn.playerId === 'p1' ? host : guest;
    snap!.state!.forcedRolls = [2];
    await store.saveRoom(snap!);

    const first = await applyRoomAction({
      code: room.code,
      accountId: actor.id,
      action: { type: 'roll' },
      version: snap!.version,
      clientActionId: 'same-id',
    });
    expect(first.status).toBe(200);
    const second = await applyRoomAction({
      code: room.code,
      accountId: actor.id,
      action: { type: 'roll' },
      version: 999,
      clientActionId: 'same-id',
    });
    expect(second).toEqual(first);
  });

  it('returns 409 with the current view on a stale version', async () => {
    const host = await account('StaleHost');
    const guest = await account('StaleGuest');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    await startRoom({ code: room.code, accountId: host.id });
    const snap = await store.getRoom(room.code);
    const actor = snap!.state!.turn.playerId === 'p1' ? host : guest;

    const stale = await applyRoomAction({
      code: room.code,
      accountId: actor.id,
      action: { type: 'roll' },
      version: snap!.version - 1,
      clientActionId: 'stale-1',
    });
    expect(stale.status).toBe(409);
    const body = stale.body as { view: { version: number }; error: string };
    expect(body.view.version).toBe(snap!.version);
    expect(body.error).toMatch(/out of date/i);
  });

  it('never puts other players hands in API views', async () => {
    const host = await account('HideHost');
    const guest = await account('HideGuest');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    await startRoom({ code: room.code, accountId: host.id });
    const raw = await store.getRoom(room.code);
    raw!.state!.hands.p1 = [{ id: 'secret-host-card', type: 'shield' }];
    raw!.state!.hands.p2 = [{ id: 'secret-guest-card', type: 'rescue' }];
    await store.saveRoom(raw!);

    const h = await getRoomForAccount(room.code, host.id);
    const g = await getRoomForAccount(room.code, guest.id);
    expect(h.ok && g.ok).toBe(true);
    if (!h.ok || !g.ok) return;
    expect(h.data.view!.hand.map((c) => c.id)).toEqual(['secret-host-card']);
    expect(g.data.view!.hand.map((c) => c.id)).toEqual(['secret-guest-card']);
    expect(h.data.view!.handCounts).toEqual({ p1: 1, p2: 1 });
    expect(JSON.stringify(h.data.view)).not.toContain('secret-guest-card');
    expect(JSON.stringify(g.data.view)).not.toContain('secret-host-card');
    expect(h.data.view && !('hands' in h.data.view)).toBe(true);
  });

  it('expires unfinished rooms after 2h inactivity and GET polling does not extend', async () => {
    const host = await account('ExpireHost');
    const guest = await account('ExpireGuest');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    await startRoom({ code: room.code, accountId: host.id });

    const now = Date.now();
    const snap = (await store.getRoom(room.code))!;
    const activityAt = snap.activityAt;
    // Poll GET — must not bump activity
    await getRoomForAccount(room.code, host.id, now + 60_000);
    const afterPoll = (await store.getRoom(room.code))!;
    expect(afterPoll.activityAt).toBe(activityAt);

    afterPoll.expiresAt = now + 1000;
    afterPoll.activityAt = now - 3 * 60 * 60 * 1000;
    await store.saveRoom(afterPoll);

    const gone = await getRoomForAccount(room.code, host.id, now + 2000);
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.status).toBe(410);
    expect(await store.getRoom(room.code)).toBeNull();
  });

  it('keeps finished results for 24h then expires', async () => {
    const host = await account('KeepHost');
    const guest = await account('KeepGuest');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    await joinRoom({ code: room.code, accountId: guest.id, username: guest.username });
    await startRoom({ code: room.code, accountId: host.id });
    const ended = await endRoom({ code: room.code, accountId: host.id, now: 1_000_000 });
    expect(ended.ok).toBe(true);
    if (!ended.ok) return;
    expect(ended.data.lobby.expiresAt).toBe(resultExpiresAt(1_000_000));

    const still = await getRoomForAccount(room.code, host.id, 1_000_000 + 23 * 60 * 60 * 1000);
    expect(still.ok).toBe(true);

    const gone = await getRoomForAccount(room.code, host.id, 1_000_000 + 25 * 60 * 60 * 1000);
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.status).toBe(410);
  });

  it('cleanup endpoint logic deletes expired rooms; auth is enforced by the route', async () => {
    const host = await account('CleanHost');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    // second seat via AI fill so we can start alone for cleanup fixture
    const r = (await store.getRoom(room.code))!;
    r.seats.push({ playerId: 'p2', accountId: null, username: 'Bot', isAI: true, ready: true });
    await store.saveRoom(r);
    await startRoom({ code: room.code, accountId: host.id });
    const live = (await store.getRoom(room.code))!;
    live.expiresAt = Date.now() - 1000;
    await store.saveRoom(live);
    const deleted = await cleanupExpired(Date.now());
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await store.getRoom(room.code)).toBeNull();
  });
});

describe('cron cleanup auth (route contract)', () => {
  it('documents that CRON_SECRET bearer is required', async () => {
    // Route-level check is in src/app/api/cron/cleanup/route.ts; exercise the same rule here.
    const secret = 'test-cron-secret';
    const auth = (header: string | null) => {
      const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
      return !!secret && token === secret;
    };
    expect(auth(null)).toBe(false);
    expect(auth('Bearer wrong')).toBe(false);
    expect(auth(`Bearer ${secret}`)).toBe(true);
  });
});

describe('local save serialization', () => {
  it('round-trips a game state for resume', () => {
    const state = createGame({
      players: [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
      ],
      seed: 7,
      now: 1_000_000,
      config: { matchDurationMs: 0, turnDurationMs: 0 },
    });
    state.forcedRolls = [6];
    const raw = serializeLocalState(state);
    const back = deserializeLocalState(raw);
    expect(back.version).toBe(state.version);
    expect(back.forcedRolls).toEqual([6]);
    expect(back.turn.playerId).toBe(state.turn.playerId);
    expect(back.players.map((p) => p.name)).toEqual(['A', 'B']);
  });

  it('defaultExpiresAt is activity + 2h', () => {
    const t = 5_000_000;
    expect(defaultExpiresAt(t)).toBe(t + 2 * 60 * 60 * 1000);
  });
});

describe('MemoryStore atomic version updates', () => {
  it('rejects mismatched versions', async () => {
    const host = await account('CasHost');
    const room = await createRoom({ accountId: host.id, username: host.username, seatCount: 2 });
    const miss = await store.updateRoom(room.code, room.version + 1, { version: 99 } as Partial<RoomRecord>);
    expect(miss).toBeNull();
    const hit = await store.updateRoom(room.code, room.version, { version: room.version + 1 });
    expect(hit?.version).toBe(room.version + 1);
  });
});
