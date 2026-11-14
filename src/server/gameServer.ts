import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import { ROOM_CONFIG, type GameConfig } from '../engine/config';
import { toPlayerView } from '../engine/view';
import type { GameState } from '../engine/types';
import { GameRunner } from '../runner/GameRunner';
import {
  actionPayloadSchema,
  codeSchema,
  nameSchema,
  ROOM_CODE_ALPHABET,
  type ClientToServer,
  type RoomSnapshot,
  type ServerToClient,
  type SessionInfo,
} from './protocol';

interface Member {
  id: string;
  name: string;
  token: string;
  socketId: string | null;
  ready: boolean;
  left: boolean;
  removeTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  code: string;
  hostId: string;
  status: RoomSnapshot['status'];
  members: Member[];
  runner: GameRunner | null;
  hostTimer: ReturnType<typeof setTimeout> | null;
  emptyTimer: ReturnType<typeof setTimeout> | null;
}

interface SocketData {
  code?: string;
  playerId?: string;
  actionTimes: number[];
}

type IO = Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>;
type ClientSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export interface GameServerOptions {
  /** Override match rules (tests use short timers). */
  gameConfig?: Partial<GameConfig>;
  roomConfig?: Partial<typeof ROOM_CONFIG>;
  /** Append finished-match telemetry to this JSONL file. Disabled when null. */
  matchLogFile?: string | null;
  cors?: boolean;
}

/**
 * In-memory, single-process room store with an authoritative Socket.IO API.
 * Rooms are lost when the process restarts (see README for production notes).
 */
export function attachGameServer(httpServer: HttpServer, options: GameServerOptions = {}) {
  const cfg = { ...ROOM_CONFIG, ...options.roomConfig };
  const matchLogFile =
    options.matchLogFile === undefined ? path.join(process.cwd(), 'logs', 'matches.jsonl') : options.matchLogFile;
  const io: IO = new Server(httpServer, {
    path: '/socket.io',
    ...(options.cors ? { cors: { origin: true } } : {}),
    connectionStateRecovery: undefined,
  });
  const rooms = new Map<string, Room>();

  const isConnected = (m: Member) => m.socketId !== null && io.sockets.sockets.has(m.socketId);

  function newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < cfg.roomCodeLength; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!rooms.has(code)) return code;
    }
  }

  function snapshot(room: Room, you: string): RoomSnapshot {
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      you,
      minPlayers: cfg.minPlayers,
      maxPlayers: cfg.maxPlayers,
      players: room.members.map((m) => ({
        id: m.id,
        name: m.name,
        connected: isConnected(m),
        ready: m.ready,
        isHost: m.id === room.hostId,
        left: m.left,
      })),
    };
  }

  function socketOf(m: Member): ClientSocket | undefined {
    return m.socketId ? io.sockets.sockets.get(m.socketId) : undefined;
  }

  function broadcastRoom(room: Room) {
    for (const m of room.members) socketOf(m)?.emit('room:update', snapshot(room, m.id));
  }

  function sendViews(room: Room, state: GameState) {
    for (const m of room.members) socketOf(m)?.emit('game:view', { ...toPlayerView(state, m.id), serverNow: Date.now() });
  }

  function connectedMembers(room: Room) {
    return room.members.filter((m) => isConnected(m) && !m.left);
  }

  function transferHost(room: Room) {
    const next = connectedMembers(room).find((m) => m.id !== room.hostId);
    if (next) room.hostId = next.id;
  }

  function refreshTimers(room: Room) {
    const host = room.members.find((m) => m.id === room.hostId);
    if (room.hostTimer) clearTimeout(room.hostTimer);
    room.hostTimer = null;
    if (!host || host.left) transferHost(room);
    else if (!isConnected(host)) {
      room.hostTimer = setTimeout(() => {
        room.hostTimer = null;
        const h = room.members.find((m) => m.id === room.hostId);
        if (h && !isConnected(h)) {
          transferHost(room);
          broadcastRoom(room);
        }
      }, cfg.hostTransferGraceMs);
    }
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    room.emptyTimer = null;
    if (connectedMembers(room).length === 0) {
      room.emptyTimer = setTimeout(() => deleteRoom(room.code), cfg.emptyRoomTtlMs);
    }
  }

  function deleteRoom(code: string) {
    const room = rooms.get(code);
    if (!room) return;
    room.runner?.dispose();
    for (const m of room.members) if (m.removeTimer) clearTimeout(m.removeTimer);
    if (room.hostTimer) clearTimeout(room.hostTimer);
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    rooms.delete(code);
  }

  function removeMember(room: Room, memberId: string) {
    const m = room.members.find((x) => x.id === memberId);
    if (m?.removeTimer) clearTimeout(m.removeTimer);
    room.members = room.members.filter((x) => x.id !== memberId);
    if (room.members.length === 0) return deleteRoom(room.code);
    if (room.hostId === memberId) transferHost(room);
    refreshTimers(room);
    broadcastRoom(room);
  }

  function bind(socket: ClientSocket, room: Room, m: Member) {
    const previous = socketOf(m);
    if (previous && previous.id !== socket.id) {
      previous.data.code = undefined;
      previous.data.playerId = undefined;
      previous.emit('room:closed', 'You joined this room from another tab.');
      previous.disconnect(true);
    }
    m.socketId = socket.id;
    if (m.removeTimer) clearTimeout(m.removeTimer);
    m.removeTimer = null;
    socket.data.code = room.code;
    socket.data.playerId = m.id;
    socket.join(room.code);
  }

  function session(room: Room, m: Member): SessionInfo {
    return { code: room.code, playerId: m.id, token: m.token, name: m.name };
  }

  function uniqueName(room: Room, name: string) {
    let candidate = name;
    for (let i = 2; room.members.some((m) => m.name.toLowerCase() === candidate.toLowerCase()); i++) {
      candidate = `${name.slice(0, cfg.maxNameLength - 2)} ${i}`;
    }
    return candidate;
  }

  function current(socket: ClientSocket): { room: Room; member: Member } | null {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return null;
    const room = rooms.get(code);
    const member = room?.members.find((m) => m.id === playerId);
    if (!room || !member || member.socketId !== socket.id) return null;
    return { room, member };
  }

  function leaveCurrent(socket: ClientSocket) {
    const cur = current(socket);
    if (!cur) return;
    const { room, member } = cur;
    socket.leave(room.code);
    socket.data.code = undefined;
    socket.data.playerId = undefined;
    member.socketId = null;
    if (room.status === 'playing') {
      member.left = true;
      if (room.hostId === member.id) transferHost(room);
      room.runner?.connectionChanged();
      refreshTimers(room);
      broadcastRoom(room);
    } else {
      removeMember(room, member.id);
    }
  }

  async function logMatch(room: Room, state: GameState) {
    if (!matchLogFile || !state.result) return;
    const line = {
      at: new Date().toISOString(),
      room: room.code,
      players: state.players.length,
      durationMs: state.result.durationMs,
      turns: state.result.turns,
      reason: state.result.reason,
      tieBreak: state.result.tieBreak,
      scores: state.players.map((p) => p.score),
      stats: Object.values(state.stats),
    };
    try {
      await mkdir(path.dirname(matchLogFile), { recursive: true });
      await appendFile(matchLogFile, JSON.stringify(line) + '\n');
    } catch {
      // Telemetry is best-effort.
    }
  }

  io.on('connection', (socket) => {
    socket.data.actionTimes = [];

    socket.on('room:create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const name = nameSchema.safeParse(payload?.name);
      if (!name.success) return ack({ ok: false, error: name.error.issues[0].message });
      leaveCurrent(socket);
      const code = newCode();
      const m: Member = { id: `p_${randomUUID().slice(0, 8)}`, name: name.data, token: randomBytes(16).toString('hex'), socketId: null, ready: false, left: false, removeTimer: null };
      const room: Room = { code, hostId: m.id, status: 'lobby', members: [m], runner: null, hostTimer: null, emptyTimer: null };
      rooms.set(code, room);
      bind(socket, room, m);
      ack({ ok: true, session: session(room, m) });
      broadcastRoom(room);
    });

    socket.on('room:join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const name = nameSchema.safeParse(payload?.name);
      if (!name.success) return ack({ ok: false, error: name.error.issues[0].message });
      const code = codeSchema.safeParse(payload?.code);
      if (!code.success) return ack({ ok: false, error: code.error.issues[0].message });
      const room = rooms.get(code.data);
      if (!room) return ack({ ok: false, error: 'No room with that code. Check the code and try again.' });
      if (room.status !== 'lobby') return ack({ ok: false, error: 'That match has already started.' });
      if (room.members.length >= cfg.maxPlayers) return ack({ ok: false, error: `That room is full (${cfg.maxPlayers} players).` });
      leaveCurrent(socket);
      const m: Member = { id: `p_${randomUUID().slice(0, 8)}`, name: uniqueName(room, name.data), token: randomBytes(16).toString('hex'), socketId: null, ready: false, left: false, removeTimer: null };
      room.members.push(m);
      bind(socket, room, m);
      refreshTimers(room);
      ack({ ok: true, session: session(room, m) });
      broadcastRoom(room);
    });

    socket.on('room:resume', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const room = typeof payload?.code === 'string' ? rooms.get(payload.code.toUpperCase()) : undefined;
      const m = room?.members.find((x) => x.id === payload?.playerId);
      if (!room || !m || typeof payload?.token !== 'string' || m.token !== payload.token) {
        return ack({ ok: false, error: 'That room has closed or your seat has expired.' });
      }
      if (m.left) return ack({ ok: false, error: 'You left this match.' });
      bind(socket, room, m);
      refreshTimers(room);
      room.runner?.connectionChanged();
      ack({ ok: true, session: session(room, m) });
      broadcastRoom(room);
      if (room.runner) socket.emit('game:view', { ...toPlayerView(room.runner.state, m.id), serverNow: Date.now() });
    });

    socket.on('room:leave', (ack) => {
      leaveCurrent(socket);
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('room:ready', (payload) => {
      const cur = current(socket);
      if (!cur || cur.room.status !== 'lobby') return;
      cur.member.ready = !!payload?.ready;
      broadcastRoom(cur.room);
    });

    socket.on('room:start', (payload: unknown, maybeAck?: unknown) => {
      const ack = typeof payload === 'function' ? payload : maybeAck;
      const timersOff = typeof payload === 'object' && payload !== null && (payload as { timers?: boolean }).timers === false;
      if (typeof ack !== 'function') return;
      const cur = current(socket);
      if (!cur) return ack({ ok: false, error: 'You are not in a room.' });
      const { room, member } = cur;
      if (room.hostId !== member.id) return ack({ ok: false, error: 'Only the host can start the match.' });
      if (room.status !== 'lobby') return ack({ ok: false, error: 'The match has already started.' });
      // Players who are still in their disconnect grace period are dropped at start.
      for (const m of room.members.filter((x) => !isConnected(x))) removeMember(room, m.id);
      if (!rooms.has(room.code)) return ack({ ok: false, error: 'Room closed.' });
      if (room.members.length < cfg.minPlayers) return ack({ ok: false, error: `At least ${cfg.minPlayers} players are needed.` });
      room.status = 'playing';
      room.runner = new GameRunner({
        players: room.members.map((m) => ({ id: m.id, name: m.name })),
        seed: randomInt(2 ** 31),
        config: timersOff ? { ...options.gameConfig, matchDurationMs: 0, turnDurationMs: 0 } : options.gameConfig,
        isConnected: (pid) => {
          const m = room.members.find((x) => x.id === pid);
          return !!m && !m.left && isConnected(m);
        },
        onUpdate: (state) => {
          sendViews(room, state);
          if (state.status === 'finished' && room.status === 'playing') {
            room.status = 'finished';
            broadcastRoom(room);
            void logMatch(room, state);
          }
        },
      });
      ack({ ok: true });
      broadcastRoom(room);
      sendViews(room, room.runner.state);
    });

    socket.on('room:toLobby', (ack) => {
      if (typeof ack !== 'function') return;
      const cur = current(socket);
      if (!cur) return ack({ ok: false, error: 'You are not in a room.' });
      const { room, member } = cur;
      if (room.hostId !== member.id) return ack({ ok: false, error: 'Only the host can do that.' });
      if (room.status !== 'finished') return ack({ ok: false, error: 'The match is still running.' });
      room.runner?.dispose();
      room.runner = null;
      room.status = 'lobby';
      for (const m of room.members.filter((x) => x.left)) removeMember(room, m.id);
      for (const m of room.members) m.ready = false;
      ack({ ok: true });
      broadcastRoom(room);
    });

    socket.on('game:action', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const now = Date.now();
      socket.data.actionTimes = socket.data.actionTimes.filter((t) => now - t < 1000);
      if (socket.data.actionTimes.length >= cfg.actionRateLimit) return ack({ ok: false, error: 'Too many actions — slow down.' });
      socket.data.actionTimes.push(now);
      const cur = current(socket);
      if (!cur) return ack({ ok: false, error: 'You are not in a room.' });
      if (!cur.room.runner || cur.room.status !== 'playing') return ack({ ok: false, error: 'No match is running.' });
      const parsed = actionPayloadSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'Malformed action.' });
      const r = cur.room.runner.dispatch(cur.member.id, parsed.data.action, parsed.data.version);
      ack(r.ok ? { ok: true } : { ok: false, error: r.error });
    });

    socket.on('disconnect', () => {
      const cur = current(socket);
      if (!cur) return;
      const { room, member } = cur;
      member.socketId = null;
      if (room.status === 'lobby') {
        member.removeTimer = setTimeout(() => {
          const r = rooms.get(room.code);
          const m = r?.members.find((x) => x.id === member.id);
          if (r && m && !isConnected(m) && r.status === 'lobby') removeMember(r, m.id);
        }, cfg.lobbySeatGraceMs);
      }
      room.runner?.connectionChanged();
      refreshTimers(room);
      broadcastRoom(room);
    });
  });

  return {
    io,
    rooms,
    close() {
      for (const code of [...rooms.keys()]) deleteRoom(code);
      io.close();
    },
  };
}
