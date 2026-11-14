import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { attachGameServer } from '@/server/gameServer';
import type { ClientToServer, RoomSnapshot, ServerToClient, SessionInfo } from '@/server/protocol';
import type { PlayerView } from '@/engine';

type Client = Socket<ServerToClient, ClientToServer>;

let http: Server;
let game: ReturnType<typeof attachGameServer>;
let url: string;
const clients: Client[] = [];

function start(gameConfig = {}, roomConfig = {}) {
  http = createServer();
  game = attachGameServer(http, { gameConfig, roomConfig, matchLogFile: null });
  return new Promise<void>((resolve) =>
    http.listen(0, () => {
      url = `http://localhost:${(http.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}

async function client(): Promise<Client> {
  const c: Client = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(c);
  await new Promise<void>((r) => c.on('connect', () => r()));
  return c;
}

function next<E extends 'room:update' | 'game:view'>(
  c: Client,
  event: E,
  pred: (v: E extends 'room:update' ? RoomSnapshot : PlayerView) => boolean = () => true,
  timeout = 3000,
) {
  return new Promise<E extends 'room:update' ? RoomSnapshot : PlayerView>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    const handler = (v: never) => {
      if (pred(v)) {
        clearTimeout(t);
        c.off(event, handler as never);
        resolve(v);
      }
    };
    c.on(event, handler as never);
  });
}

async function create(c: Client, name: string) {
  const r = await c.emitWithAck('room:create', { name });
  if (!r.ok) throw new Error(r.error);
  return r.session;
}

async function join(c: Client, code: string, name: string) {
  const r = await c.emitWithAck('room:join', { code, name });
  if (!r.ok) throw new Error(r.error);
  return r.session;
}

async function twoPlayerMatch(gameConfig = {}) {
  await start({ aiActionDelayMs: 10, ...gameConfig }, { hostTransferGraceMs: 100 });
  const host = await client();
  const guest = await client();
  const hs = await create(host, 'Hana');
  const gs = await join(guest, hs.code, 'Gus');
  const hv = next(host, 'game:view');
  const gv = next(guest, 'game:view');
  expect(await host.emitWithAck('room:start')).toEqual({ ok: true });
  return { host, guest, hs, gs, hostView: await hv, guestView: await gv };
}

beforeEach(() => {
  clients.length = 0;
});

afterEach(async () => {
  for (const c of clients) c.disconnect();
  game?.close();
  await new Promise((r) => http?.close(r));
});

describe('rooms and lobby', () => {
  it('creates a room with a short code and lets others join by code', async () => {
    await start();
    const a = await client();
    const b = await client();
    const s = await create(a, 'Alice');
    expect(s.code).toMatch(/^[A-Z2-9]{5}$/);
    const update = next(a, 'room:update', (r) => r.players.length === 2);
    await join(b, s.code.toLowerCase(), 'Bob');
    const room = await update;
    expect(room.players.map((p) => p.name)).toEqual(['Alice', 'Bob']);
    expect(room.players[0].isHost).toBe(true);
    expect(room.status).toBe('lobby');
  });

  it('validates names and codes with clear errors', async () => {
    await start();
    const a = await client();
    expect(await a.emitWithAck('room:create', { name: '   ' })).toMatchObject({ ok: false, error: 'Enter a display name.' });
    expect(await a.emitWithAck('room:join', { code: 'ZZZZZ', name: 'Al' })).toMatchObject({ ok: false, error: expect.stringMatching(/No room/) });
    expect(await a.emitWithAck('room:join', { code: 'AB', name: 'Al' })).toMatchObject({ ok: false });
  });

  it('enforces a 4 player maximum and deduplicates names', async () => {
    await start();
    const host = await client();
    const s = await create(host, 'Sam');
    const names: string[] = [];
    for (let i = 0; i < 3; i++) names.push((await join(await client(), s.code, 'Sam')).name);
    expect(names).toEqual(['Sam 2', 'Sam 3', 'Sam 4']);
    expect(await (await client()).emitWithAck('room:join', { code: s.code, name: 'Late' })).toMatchObject({ ok: false, error: expect.stringMatching(/full/) });
  });

  it('only the host can start, and only with at least two players', async () => {
    await start();
    const host = await client();
    const s = await create(host, 'Host');
    expect(await host.emitWithAck('room:start')).toMatchObject({ ok: false, error: expect.stringMatching(/At least 2/) });
    const guest = await client();
    await join(guest, s.code, 'Guest');
    expect(await guest.emitWithAck('room:start')).toMatchObject({ ok: false, error: 'Only the host can start the match.' });
    expect(await host.emitWithAck('room:start')).toEqual({ ok: true });
    expect(await (await client()).emitWithAck('room:join', { code: s.code, name: 'Late' })).toMatchObject({ ok: false, error: expect.stringMatching(/already started/) });
  });

  it('transfers host privileges when the host disconnects', async () => {
    await start({}, { hostTransferGraceMs: 50 });
    const host = await client();
    const guest = await client();
    const s = await create(host, 'Host');
    const g = await join(guest, s.code, 'Guest');
    const transferred = next(guest, 'room:update', (r) => r.hostId === g.playerId);
    host.disconnect();
    expect((await transferred).players.find((p) => p.id === g.playerId)!.isHost).toBe(true);
  });
});

describe('authoritative match', () => {
  it('sends each player only their own hand', async () => {
    const { hostView, guestView, hs, gs } = await twoPlayerMatch();
    expect(hostView.viewerId).toBe(hs.playerId);
    expect(hostView.hand).toHaveLength(3);
    expect(hostView.handCounts[gs.playerId]).toBe(3);
    const hostIds = hostView.hand.map((c) => c.id);
    expect(guestView.hand.some((c) => hostIds.includes(c.id))).toBe(false);
    expect(JSON.stringify(hostView)).not.toContain(guestView.hand[0].id + '"');
  });

  it('rejects out-of-turn, stale, duplicate and malformed actions', async () => {
    const { host, guest, hostView, hs } = await twoPlayerMatch();
    const [current, other] = hostView.turn.playerId === hs.playerId ? [host, guest] : [guest, host];
    const v = hostView.version;
    expect(await other.emitWithAck('game:action', { action: { type: 'roll' }, version: v })).toMatchObject({ ok: false, error: 'It is not your turn.' });
    expect(await current.emitWithAck('game:action', { action: { type: 'hack' } as never, version: v })).toMatchObject({ ok: false, error: 'Malformed action.' });
    expect(await current.emitWithAck('game:action', { action: { type: 'roll' }, version: v })).toEqual({ ok: true });
    // Same envelope again → stale.
    expect(await current.emitWithAck('game:action', { action: { type: 'roll' }, version: v })).toMatchObject({ ok: false });
    expect(await current.emitWithAck('game:action', { action: { type: 'endTurn' }, version: v + 1 })).toMatchObject({ ok: false, error: 'Move a character first.' });
  });

  it('keeps a seat through a disconnection and auto-plays the absent player’s turns', async () => {
    const { host, guest, hostView, hs, gs } = await twoPlayerMatch({ disconnectedTurnMs: 150 });
    const absent = hostView.turn.playerId === hs.playerId ? { c: host, s: hs } : { c: guest, s: gs };
    const present = absent.c === host ? guest : host;
    const turnPassed = next(present, 'game:view', (v) => v.turn.playerId !== absent.s.playerId);
    absent.c.disconnect();
    const after = await turnPassed;
    expect(after.log.some((l) => /ran out of time/.test(l.text))).toBe(true);

    const back = await client();
    const viewOnResume = next(back, 'game:view');
    const r = await back.emitWithAck('room:resume', { code: absent.s.code, playerId: absent.s.playerId, token: absent.s.token });
    expect(r.ok).toBe(true);
    expect((await viewOnResume).viewerId).toBe(absent.s.playerId);
    const bad = await (await client()).emitWithAck('room:resume', { code: absent.s.code, playerId: absent.s.playerId, token: 'wrong' });
    expect(bad.ok).toBe(false);
  });

  it('ends the match when the match timer runs out and can return to the lobby', async () => {
    const { host, guest } = await twoPlayerMatch({ matchDurationMs: 400 });
    const finished = await next(host, 'game:view', (v) => v.status === 'finished');
    expect(finished.result?.reason).toBe('timer');
    await next(guest, 'room:update', (r) => r.status === 'finished');
    expect(await guest.emitWithAck('room:toLobby')).toMatchObject({ ok: false });
    const lobby = next(guest, 'room:update', (r) => r.status === 'lobby');
    expect(await host.emitWithAck('room:toLobby')).toEqual({ ok: true });
    expect((await lobby).players).toHaveLength(2);
  });
});

export type { SessionInfo };
