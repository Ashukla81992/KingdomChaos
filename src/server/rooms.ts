import { randomInt, randomUUID } from 'node:crypto';
import * as ai from '../engine/ai';
import {
  applyAction,
  chooseAiAction,
  createGame,
  forceTimeout,
  paceConfig,
  ROOM_CONFIG,
  tick,
  toPlayerView,
  type GameAction,
  type GameState,
  type MatchPace,
  type PlayerView,
} from '../engine';
import { chatTextSchema, REPORT_REASONS, ROOM_CODE_ALPHABET, signalPayloadSchema, type ChatMessage, type RoomGetResponse, type RoomLobbyView } from './protocol';
import {
  defaultExpiresAt,
  getStore,
  resultExpiresAt,
  type RoomRecord,
  type Seat,
  type Store,
} from './store';

export type { RoomGetResponse, RoomLobbyView };

/** Optional AI trade helper — present once A6 exports it. */
function aiRespond(view: PlayerView, random?: () => number): GameAction | null {
  const fn = (ai as { aiRespond?: (v: PlayerView, r?: () => number) => GameAction | null }).aiRespond;
  return typeof fn === 'function' ? fn(view, random) : null;
}

let lastSweep = 0;
const SWEEP_EVERY_MS = 60_000;

export async function opportunisticCleanup(store: Store = getStore(), now = Date.now()) {
  if (now - lastSweep < SWEEP_EVERY_MS) return 0;
  lastSweep = now;
  return store.deleteExpired(now);
}

export function resetSweepThrottle() {
  lastSweep = 0;
}

async function newCode(store: Store): Promise<string> {
  for (let i = 0; i < 40; i++) {
    let code = '';
    for (let j = 0; j < ROOM_CONFIG.roomCodeLength; j++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
    if (!(await store.getRoom(code))) return code;
  }
  throw new Error('Could not allocate a room code.');
}

function seatOf(room: RoomRecord, accountId: string) {
  return room.seats.find((s) => s.accountId === accountId) ?? null;
}

function lobbyView(room: RoomRecord, accountId: string | null, now = Date.now()): RoomLobbyView {
  const you = accountId ? seatOf(room, accountId) : null;
  return {
    code: room.code,
    status: room.status,
    hostAccount: room.hostAccount,
    you: accountId,
    youPlayerId: you?.playerId ?? null,
    isHost: !!accountId && room.hostAccount === accountId,
    minPlayers: ROOM_CONFIG.minPlayers,
    maxPlayers: ROOM_CONFIG.maxPlayers,
    seatCount: room.seatCount,
    pace: room.pace,
    seats: room.seats.map((s) => ({
      playerId: s.playerId,
      username: s.username,
      accountId: s.accountId,
      isAI: s.isAI,
      ready: s.ready,
      isHost: s.accountId === room.hostAccount,
      isYou: !!accountId && s.accountId === accountId,
    })),
    activityAt: room.activityAt,
    endedAt: room.endedAt,
    expiresAt: room.expiresAt,
    serverNow: now,
  };
}

function playerViewFor(room: RoomRecord, accountId: string | null, now = Date.now()): (PlayerView & { serverNow: number }) | null {
  if (!room.state || room.status === 'lobby') return null;
  const seat = accountId ? seatOf(room, accountId) : null;
  const viewerId = seat?.playerId ?? null;
  return { ...toPlayerView(room.state, viewerId), serverNow: now };
}

export async function assertRoomFresh(room: RoomRecord, store: Store = getStore(), now = Date.now()): Promise<'ok' | 'gone'> {
  if (room.expiresAt <= now) {
    await store.deleteRoom(room.code);
    return 'gone';
  }
  return 'ok';
}

export async function createRoom(opts: {
  accountId: string;
  username: string;
  seatCount?: number;
  pace?: MatchPace;
  fillAi?: boolean;
}): Promise<RoomRecord> {
  const store = getStore();
  await opportunisticCleanup(store);
  const seatCount = Math.min(ROOM_CONFIG.maxPlayers, Math.max(ROOM_CONFIG.minPlayers, opts.seatCount ?? 2));
  const pace = opts.pace === 'clock' || opts.pace === 'rounds' || opts.pace === 'untimed' ? opts.pace : 'untimed';
  const now = Date.now();
  const code = await newCode(store);
  const seats: Seat[] = [
    {
      playerId: 'p1',
      accountId: opts.accountId,
      username: opts.username,
      isAI: false,
      ready: false,
    },
  ];
  if (opts.fillAi) {
    const aiNames = ['Sir Bumble', 'Lady Quill', 'Old Grimsby'];
    for (let i = 1; i < seatCount; i++) {
      seats.push({
        playerId: `ai${i}`,
        accountId: null,
        username: aiNames[i - 1] ?? `AI ${i}`,
        isAI: true,
        ready: true,
      });
    }
  }
  const room: RoomRecord = {
    code,
    hostAccount: opts.accountId,
    status: 'lobby',
    state: null,
    version: 0,
    seats,
    seatCount,
    pace,
    activityAt: now,
    endedAt: null,
    expiresAt: defaultExpiresAt(now),
    createdAt: now,
  };
  return store.createRoom(room);
}

export async function joinRoom(opts: { code: string; accountId: string; username: string }): Promise<
  { ok: true; room: RoomRecord } | { ok: false; status: number; error: string }
> {
  const store = getStore();
  await opportunisticCleanup(store);
  const room = await store.getRoom(opts.code);
  if (!room) return { ok: false, status: 404, error: 'No room with that code. Check the code and try again.' };
  if ((await assertRoomFresh(room, store)) === 'gone') return { ok: false, status: 410, error: 'That room has expired.' };
  if (room.status !== 'lobby') return { ok: false, status: 409, error: 'That match has already started.' };
  const existing = seatOf(room, opts.accountId);
  if (existing) return { ok: true, room };
  const humanSeats = room.seats.filter((s) => !s.isAI).length;
  if (humanSeats >= room.seatCount) return { ok: false, status: 409, error: `That room is full (${room.seatCount} seats).` };
  if (room.seats.length >= room.seatCount && room.seats.every((s) => s.accountId || s.isAI)) {
    return { ok: false, status: 409, error: `That room is full (${room.seatCount} seats).` };
  }
  const now = Date.now();
  const playerId = `p${room.seats.filter((s) => !s.isAI).length + 1}`;
  room.seats.push({
    playerId,
    accountId: opts.accountId,
    username: opts.username,
    isAI: false,
    ready: false,
  });
  room.activityAt = now;
  room.expiresAt = defaultExpiresAt(now);
  await store.saveRoom(room);
  return { ok: true, room };
}

export async function startRoom(opts: {
  code: string;
  accountId: string;
  pace?: MatchPace;
}): Promise<{ ok: true; room: RoomRecord } | { ok: false; status: number; error: string }> {
  const store = getStore();
  const room = await store.getRoom(opts.code);
  if (!room) return { ok: false, status: 404, error: 'No room with that code.' };
  if ((await assertRoomFresh(room, store)) === 'gone') return { ok: false, status: 410, error: 'That room has expired.' };
  if (room.hostAccount !== opts.accountId) return { ok: false, status: 403, error: 'Only the host can start the match.' };
  if (room.status !== 'lobby') return { ok: false, status: 409, error: 'The match has already started.' };
  const humans = room.seats.filter((s) => !s.isAI);
  if (humans.length < ROOM_CONFIG.minPlayers && room.seats.length < ROOM_CONFIG.minPlayers) {
    return { ok: false, status: 400, error: `At least ${ROOM_CONFIG.minPlayers} players are needed.` };
  }
  if (room.seats.length < ROOM_CONFIG.minPlayers) {
    return { ok: false, status: 400, error: `At least ${ROOM_CONFIG.minPlayers} players are needed.` };
  }
  const pace = opts.pace === 'clock' || opts.pace === 'rounds' || opts.pace === 'untimed' ? opts.pace : room.pace;
  room.pace = pace;
  const now = Date.now();
  const players = room.seats.map((s) => ({ id: s.playerId, name: s.username, isAI: s.isAI || undefined }));
  const state = createGame({
    players,
    seed: randomInt(2 ** 31),
    now,
    config: paceConfig(pace),
  });
  room.state = state;
  room.version = state.version;
  room.status = 'playing';
  room.activityAt = now;
  room.expiresAt = defaultExpiresAt(now);
  await store.saveRoom(room);
  const progressed = await progressRoom(room, store, now);
  return { ok: true, room: progressed };
}

/**
 * Advance clocks and AI seats without extending expiry.
 * Saves when the state changes.
 */
export async function progressRoom(room: RoomRecord, store: Store = getStore(), now = Date.now()): Promise<RoomRecord> {
  if (!room.state || room.status !== 'playing') return room;
  const baseVersion = room.version;
  let state = room.state;
  let changed = false;

  for (let guard = 0; guard < 32; guard++) {
    const timed = tick(state, now);
    if (timed?.ok) {
      state = timed.state;
      changed = true;
      if (state.status !== 'playing') break;
      continue;
    }

    // Off-turn AI trade responses
    if (state.trades?.length) {
      let traded = false;
      for (const offer of state.trades) {
        const seat = room.seats.find((s) => s.playerId === offer.to);
        if (!seat?.isAI) continue;
        const action = aiRespond(toPlayerView(state, offer.to));
        if (!action) continue;
        const r = applyAction(state, { playerId: offer.to, action }, now);
        if (r.ok) {
          state = r.state;
          changed = true;
          traded = true;
          break;
        }
      }
      if (traded) continue;
    }

    const actor = state.turn.playerId;
    const seat = room.seats.find((s) => s.playerId === actor);
    if (seat?.isAI) {
      const action = chooseAiAction(toPlayerView(state, actor));
      const r = action ? applyAction(state, { playerId: actor, action }, now) : null;
      if (r?.ok) {
        state = r.state;
        changed = true;
        continue;
      }
      const forced = forceTimeout(state, now);
      if (forced.ok) {
        state = forced.state;
        changed = true;
        continue;
      }
    }
    break;
  }

  if (!changed) return room;
  const patch: Partial<RoomRecord> = { state, version: state.version };
  if (state.status === 'finished') {
    patch.status = 'finished';
    patch.endedAt = now;
    patch.expiresAt = resultExpiresAt(now);
  }
  // Compare-and-set so a poll that advances clocks or AI never overwrites a newer move saved meanwhile.
  const saved = await store.updateRoom(room.code, baseVersion, patch);
  if (saved && saved.status !== 'playing') await closeSession(saved.code, store);
  if (saved) return saved;
  return (await store.getRoom(room.code)) ?? room;
}

/** A seated player's poll keeps an open room alive; written at most once a minute per room. */
const HEARTBEAT_EVERY_MS = 60_000;

async function heartbeat(room: RoomRecord, accountId: string | null, store: Store, now: number) {
  if (!accountId || (room.status !== 'lobby' && room.status !== 'playing')) return;
  const seat = seatOf(room, accountId);
  if (!seat || seat.isAI) return;
  const next = defaultExpiresAt(now);
  if (next - room.expiresAt < HEARTBEAT_EVERY_MS) return;
  await store.touchRoom(room.code, next);
  room.expiresAt = next;
}

export async function getRoomForAccount(
  code: string,
  accountId: string | null,
  now = Date.now(),
  chatAfter: number | null = null,
): Promise<{ ok: true; data: RoomGetResponse } | { ok: false; status: number; error: string }> {
  const store = getStore();
  let room = await store.getRoom(code);
  if (!room) return { ok: false, status: 404, error: 'No room with that code.' };
  if ((await assertRoomFresh(room, store, now)) === 'gone') return { ok: false, status: 410, error: 'That room has expired.' };
  if (accountId && !seatOf(room, accountId) && room.status !== 'lobby') {
    return { ok: false, status: 403, error: 'You are not part of this room.' };
  }
  room = await progressRoom(room, store, now);
  // Re-check expiry after progress (finished rooms get a new expiry)
  if ((await assertRoomFresh(room, store, now)) === 'gone') return { ok: false, status: 410, error: 'That room has expired.' };
  await heartbeat(room, accountId, store, now);
  const seat = accountId ? seatOf(room, accountId) : null;
  const data: RoomGetResponse = {
    lobby: lobbyView(room, accountId, now),
    view: playerViewFor(room, accountId, now),
  };
  // Chat and voice signals ride along with the poll the client already makes, so there is no extra request per tick.
  if (seat && !seat.isAI && chatAfter !== null) {
    if (isOpen(room)) {
      data.chat = await store.listChat(room.code, Math.max(0, chatAfter));
      data.signals = await store.takeSignals(room.code, seat.playerId, now);
    } else {
      // Chat lasts one session: once the match is over nothing is kept or shown.
      await closeSession(room.code, store);
      data.chat = [];
      data.signals = [];
    }
  }
  return { ok: true, data };
}

function isOpen(room: RoomRecord) {
  return room.status === 'lobby' || room.status === 'playing';
}

/** Rooms whose chat and voice messages this server instance already wiped. */
const closedSessions = new Set<string>();

/** The match is over: delete its chat lines and voice messages. */
export async function closeSession(code: string, store: Store = getStore()) {
  const key = code.toUpperCase();
  if (closedSessions.has(key)) return;
  await store.clearSession(key);
  closedSessions.add(key);
  if (closedSessions.size > 5000) closedSessions.clear();
}

/** Test helper. */
export function resetClosedSessions() {
  closedSessions.clear();
}

type Fail = { ok: false; status: number; error: string };

/** The caller's seat in an open room, or why they cannot talk there. */
async function talkingSeat(store: Store, code: string, accountId: string, now: number): Promise<{ ok: true; room: RoomRecord; seat: Seat } | Fail> {
  const room = await store.getRoom(code);
  if (!room) return { ok: false, status: 404, error: 'No room with that code.' };
  if ((await assertRoomFresh(room, store, now)) === 'gone') return { ok: false, status: 410, error: 'That room has expired.' };
  const seat = seatOf(room, accountId);
  if (!seat || seat.isAI) return { ok: false, status: 403, error: 'Only players in this room can chat.' };
  if (!isOpen(room)) return { ok: false, status: 409, error: 'The match is over, so chat has closed.' };
  return { ok: true, room, seat };
}

function otherHuman(room: RoomRecord, me: Seat, playerId: string) {
  const s = room.seats.find((x) => x.playerId === playerId);
  return s && !s.isAI && s.accountId && s.playerId !== me.playerId ? s : null;
}

/** Relay a WebRTC connection message (offer/answer with its network candidates, hello, bye) to another player. */
export async function postSignal(opts: { code: string; accountId: string; payload: unknown; now?: number }): Promise<{ ok: true } | Fail> {
  const store = getStore();
  const now = opts.now ?? Date.now();
  const parsed = signalPayloadSchema.safeParse(opts.payload);
  if (!parsed.success) return { ok: false, status: 400, error: 'That voice message is not valid.' };
  const got = await talkingSeat(store, opts.code, opts.accountId, now);
  if (!got.ok) return got;
  const target = otherHuman(got.room, got.seat, parsed.data.to);
  if (!target) return { ok: false, status: 400, error: 'That player is not in this room.' };
  await store.addSignal(got.room.code, {
    from: got.seat.playerId,
    to: target.playerId,
    kind: parsed.data.kind,
    data: 'data' in parsed.data ? parsed.data.data : null,
    at: now,
  });
  return { ok: true };
}

/** Report another player for something they said or did in chat or voice. */
export async function reportPlayer(opts: { code: string; accountId: string; playerId: string; reason: string; now?: number }): Promise<{ ok: true } | Fail> {
  const store = getStore();
  const now = opts.now ?? Date.now();
  const room = await store.getRoom(opts.code);
  if (!room) return { ok: false, status: 404, error: 'No room with that code.' };
  const seat = seatOf(room, opts.accountId);
  if (!seat || seat.isAI) return { ok: false, status: 403, error: 'Only players in this room can report.' };
  const target = otherHuman(room, seat, opts.playerId);
  if (!target?.accountId) return { ok: false, status: 400, error: 'That player is not in this room.' };
  if (!(REPORT_REASONS as readonly string[]).includes(opts.reason)) return { ok: false, status: 400, error: 'Pick a reason.' };
  await store.addReport({
    roomCode: room.code,
    reporterAccount: opts.accountId,
    reportedAccount: target.accountId,
    reportedName: target.username,
    reason: opts.reason,
    at: now,
  });
  console.warn(`[kingdom-chaos] report: room ${room.code}, ${seat.username} reported ${target.username} (${opts.reason})`);
  return { ok: true };
}

/** A player may send this many chat messages in CHAT_WINDOW_MS before being asked to slow down. */
export const CHAT_BURST = 5;
export const CHAT_WINDOW_MS = 10_000;

export async function postChat(opts: {
  code: string;
  accountId: string;
  text: unknown;
  now?: number;
}): Promise<{ ok: true; message: ChatMessage } | { ok: false; status: number; error: string }> {
  const store = getStore();
  const now = opts.now ?? Date.now();
  const parsed = chatTextSchema.safeParse(opts.text);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues[0]?.message ?? 'That message cannot be sent.' };
  const got = await talkingSeat(store, opts.code, opts.accountId, now);
  if (!got.ok) return got;
  const { room, seat } = got;
  if ((await store.countRecentChat(room.code, opts.accountId, now - CHAT_WINDOW_MS)) >= CHAT_BURST) {
    return { ok: false, status: 429, error: 'You are sending messages quickly. Wait a few seconds.' };
  }
  const message = await store.addChat(room.code, {
    accountId: opts.accountId,
    playerId: seat.playerId,
    username: seat.username,
    text: parsed.data,
    at: now,
  });
  // Talking counts as being here, so chat keeps an open room from expiring.
  await heartbeat(room, opts.accountId, store, now);
  return { ok: true, message };
}

export async function applyRoomAction(opts: {
  code: string;
  accountId: string;
  action: GameAction;
  version: number;
  clientActionId: string;
  now?: number;
}): Promise<{ status: number; body: unknown }> {
  const store = getStore();
  await opportunisticCleanup(store);
  const now = opts.now ?? Date.now();

  const prior = await store.getAction(opts.code, opts.clientActionId);
  if (prior) return prior;

  let room = await store.getRoom(opts.code);
  if (!room) {
    const result = { status: 404, body: { error: 'No room with that code.' } };
    return result;
  }
  if ((await assertRoomFresh(room, store, now)) === 'gone') {
    return { status: 410, body: { error: 'That room has expired.' } };
  }
  const seat = seatOf(room, opts.accountId);
  if (!seat || seat.isAI) return { status: 403, body: { error: 'You are not seated in this room.' } };
  if (room.status !== 'playing' || !room.state) return { status: 409, body: { error: 'No match is running.' } };

  room = await progressRoom(room, store, now);
  if (room.status !== 'playing' || !room.state) {
    const body = { error: 'The match is over.', lobby: lobbyView(room, opts.accountId, now), view: playerViewFor(room, opts.accountId, now) };
    const result = { status: 409, body };
    await store.saveAction(opts.code, opts.clientActionId, opts.accountId, result);
    return result;
  }

  if (opts.version !== room.version) {
    return {
      status: 409,
      body: {
        error: 'That action is out of date — the board changed. Try again.',
        lobby: lobbyView(room, opts.accountId, now),
        view: playerViewFor(room, opts.accountId, now),
      },
    };
  }

  const expected = room.version;
  const r = applyAction(room.state, { playerId: seat.playerId, action: opts.action, version: opts.version }, now);
  if (!r.ok) {
    const result = { status: 400, body: { error: r.error } };
    await store.saveAction(opts.code, opts.clientActionId, opts.accountId, result);
    return result;
  }

  room.state = r.state;
  room.version = r.state.version;
  room.activityAt = now;
  room.expiresAt = defaultExpiresAt(now);
  if (r.state.status === 'finished') {
    room.status = 'finished';
    room.endedAt = now;
    room.expiresAt = resultExpiresAt(now);
  }

  const saved = await store.updateRoom(room.code, expected, {
    state: room.state,
    version: room.version,
    status: room.status,
    activityAt: room.activityAt,
    endedAt: room.endedAt,
    expiresAt: room.expiresAt,
    seats: room.seats,
    seatCount: room.seatCount,
    pace: room.pace,
    hostAccount: room.hostAccount,
  });
  if (!saved) {
    // Lost the race — reload and return 409 with current view
    const fresh = await store.getRoom(opts.code);
    return {
      status: 409,
      body: {
        error: 'That action is out of date — the board changed. Try again.',
        lobby: fresh ? lobbyView(fresh, opts.accountId, now) : null,
        view: fresh ? playerViewFor(fresh, opts.accountId, now) : null,
      },
    };
  }

  if (saved.status !== 'playing') await closeSession(saved.code, store);
  room = await progressRoom(saved, store, now);
  const result = {
    status: 200,
    body: {
      lobby: lobbyView(room, opts.accountId, now),
      view: playerViewFor(room, opts.accountId, now),
    },
  };
  await store.saveAction(opts.code, opts.clientActionId, opts.accountId, result);
  return result;
}

export async function endRoom(opts: {
  code: string;
  accountId: string;
  now?: number;
}): Promise<{ ok: true; data: RoomGetResponse } | { ok: false; status: number; error: string }> {
  const store = getStore();
  await opportunisticCleanup(store);
  const now = opts.now ?? Date.now();
  const room = await store.getRoom(opts.code);
  if (!room) return { ok: false, status: 404, error: 'No room with that code.' };
  if ((await assertRoomFresh(room, store, now)) === 'gone') return { ok: false, status: 410, error: 'That room has expired.' };
  if (room.hostAccount !== opts.accountId) return { ok: false, status: 403, error: 'Only the host can end the match.' };
  if (room.status !== 'playing' || !room.state) return { ok: false, status: 409, error: 'No match is running.' };

  const state = structuredClone(room.state) as GameState;
  state.status = 'finished';
  state.turn.deadline = null;
  state.result = {
    winners: [],
    reason: 'ended',
    tieBreak: null,
    durationMs: now - state.startedAt,
    turns: state.turn.number,
    rounds: state.turn.round,
    finalGems: Object.fromEntries(state.players.map((p) => [p.id, p.gems.length])),
  };
  state.version += 1;
  state.lastEvents = [{ type: 'gameOver', winners: [] }];
  room.state = state;
  room.version = state.version;
  room.status = 'ended';
  room.endedAt = now;
  room.expiresAt = resultExpiresAt(now);
  // Ending is intentional activity for retention, but expiry is ended+24h (not activity+2h).
  await store.saveRoom(room);
  await closeSession(room.code, store);
  return {
    ok: true,
    data: {
      lobby: lobbyView(room, opts.accountId, now),
      view: playerViewFor(room, opts.accountId, now),
    },
  };
}

export async function cleanupExpired(now = Date.now()) {
  return getStore().deleteExpired(now);
}

/** Test helper: fabricate an invite code without colliding. */
export function testRoomId() {
  return `t_${randomUUID().slice(0, 8)}`;
}
