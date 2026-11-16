import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type { GameState, MatchPace } from '../engine';

export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'ended';

export interface Account {
  id: string;
  username: string;
  passHash: string;
  createdAt: number;
}

export interface Seat {
  /** Engine player id (p1, p2, … or AI ids). */
  playerId: string;
  accountId: string | null;
  username: string;
  isAI: boolean;
  ready: boolean;
}

export interface RoomRecord {
  code: string;
  hostAccount: string;
  status: RoomStatus;
  state: GameState | null;
  version: number;
  seats: Seat[];
  seatCount: number;
  pace: MatchPace;
  activityAt: number;
  endedAt: number | null;
  expiresAt: number;
  createdAt: number;
}

export interface StoredActionResult {
  status: number;
  body: unknown;
}

export interface Store {
  createAccount(username: string, passHash: string): Promise<Account>;
  findAccountByUsername(username: string): Promise<Account | null>;
  findAccountById(id: string): Promise<Account | null>;

  createRoom(room: RoomRecord): Promise<RoomRecord>;
  getRoom(code: string): Promise<RoomRecord | null>;
  /** Atomic compare-and-set on version. Returns updated room or null if version mismatched / missing. */
  updateRoom(code: string, expectedVersion: number, patch: Partial<RoomRecord>): Promise<RoomRecord | null>;
  /** Unconditional save (lobby mutations, expiry stamps after end, etc.). */
  saveRoom(room: RoomRecord): Promise<RoomRecord>;
  deleteRoom(code: string): Promise<void>;
  deleteExpired(now: number): Promise<number>;

  getAction(roomCode: string, clientActionId: string): Promise<StoredActionResult | null>;
  saveAction(roomCode: string, clientActionId: string, accountId: string, result: StoredActionResult): Promise<void>;
}

const TWO_H = 2 * 60 * 60 * 1000;

export function defaultExpiresAt(now = Date.now()) {
  return now + TWO_H;
}

export function resultExpiresAt(endedAt: number) {
  return endedAt + 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------- memory

export class MemoryStore implements Store {
  accounts = new Map<string, Account>();
  accountsByName = new Map<string, string>();
  rooms = new Map<string, RoomRecord>();
  actions = new Map<string, { accountId: string; result: StoredActionResult }>();

  async createAccount(username: string, passHash: string): Promise<Account> {
    const key = username.toLowerCase();
    if (this.accountsByName.has(key)) throw Object.assign(new Error('That username is taken.'), { code: 'USERNAME_TAKEN' });
    const account: Account = { id: `a_${randomUUID().slice(0, 12)}`, username, passHash, createdAt: Date.now() };
    this.accounts.set(account.id, account);
    this.accountsByName.set(key, account.id);
    return account;
  }

  async findAccountByUsername(username: string) {
    const id = this.accountsByName.get(username.toLowerCase());
    return id ? (this.accounts.get(id) ?? null) : null;
  }

  async findAccountById(id: string) {
    return this.accounts.get(id) ?? null;
  }

  async createRoom(room: RoomRecord) {
    if (this.rooms.has(room.code)) throw new Error('Room code collision.');
    const copy = cloneRoom(room);
    this.rooms.set(room.code, copy);
    return cloneRoom(copy);
  }

  async getRoom(code: string) {
    const r = this.rooms.get(code.toUpperCase());
    return r ? cloneRoom(r) : null;
  }

  async updateRoom(code: string, expectedVersion: number, patch: Partial<RoomRecord>) {
    const cur = this.rooms.get(code.toUpperCase());
    if (!cur || cur.version !== expectedVersion) return null;
    Object.assign(cur, patch);
    return cloneRoom(cur);
  }

  async saveRoom(room: RoomRecord) {
    const copy = cloneRoom(room);
    this.rooms.set(room.code, copy);
    return cloneRoom(copy);
  }

  async deleteRoom(code: string) {
    const c = code.toUpperCase();
    this.rooms.delete(c);
    for (const key of [...this.actions.keys()]) if (key.startsWith(`${c}:`)) this.actions.delete(key);
  }

  async deleteExpired(now: number) {
    let n = 0;
    for (const [code, room] of [...this.rooms.entries()]) {
      if (room.expiresAt <= now) {
        await this.deleteRoom(code);
        n++;
      }
    }
    return n;
  }

  async getAction(roomCode: string, clientActionId: string) {
    return this.actions.get(`${roomCode.toUpperCase()}:${clientActionId}`)?.result ?? null;
  }

  async saveAction(roomCode: string, clientActionId: string, accountId: string, result: StoredActionResult) {
    this.actions.set(`${roomCode.toUpperCase()}:${clientActionId}`, { accountId, result });
  }
}

function cloneRoom(r: RoomRecord): RoomRecord {
  return {
    ...r,
    seats: r.seats.map((s) => ({ ...s })),
    state: r.state ? (structuredClone(r.state) as GameState) : null,
  };
}

// ---------------------------------------------------------------- postgres

export class PostgresStore implements Store {
  private sql: postgres.Sql;

  constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, { max: 5, idle_timeout: 20 });
  }

  async createAccount(username: string, passHash: string): Promise<Account> {
    const id = `a_${randomUUID().slice(0, 12)}`;
    try {
      const [row] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
        INSERT INTO kc_accounts (id, username, pass_hash)
        VALUES (${id}, ${username}, ${passHash})
        RETURNING id, username, pass_hash, created_at
      `;
      return { id: row.id, username: row.username, passHash: row.pass_hash, createdAt: row.created_at.getTime() };
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') throw Object.assign(new Error('That username is taken.'), { code: 'USERNAME_TAKEN' });
      throw err;
    }
  }

  async findAccountByUsername(username: string) {
    const [row] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
      SELECT id, username, pass_hash, created_at FROM kc_accounts WHERE lower(username) = lower(${username}) LIMIT 1
    `;
    return row ? { id: row.id, username: row.username, passHash: row.pass_hash, createdAt: row.created_at.getTime() } : null;
  }

  async findAccountById(id: string) {
    const [row] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
      SELECT id, username, pass_hash, created_at FROM kc_accounts WHERE id = ${id} LIMIT 1
    `;
    return row ? { id: row.id, username: row.username, passHash: row.pass_hash, createdAt: row.created_at.getTime() } : null;
  }

  async createRoom(room: RoomRecord) {
    await this.sql`
      INSERT INTO kc_rooms (code, host_account, status, state, version, seats, activity_at, ended_at, expires_at, created_at)
      VALUES (
        ${room.code},
        ${room.hostAccount},
        ${room.status},
        ${room.state ? this.sql.json(room.state as never) : null},
        ${room.version},
        ${this.sql.json({ seats: room.seats, seatCount: room.seatCount, pace: room.pace } as never)},
        ${new Date(room.activityAt)},
        ${room.endedAt ? new Date(room.endedAt) : null},
        ${new Date(room.expiresAt)},
        ${new Date(room.createdAt)}
      )
    `;
    return room;
  }

  async getRoom(code: string) {
    const [row] = await this.sql<PgRoom[]>`SELECT * FROM kc_rooms WHERE code = ${code.toUpperCase()} LIMIT 1`;
    return row ? fromPg(row) : null;
  }

  async updateRoom(code: string, expectedVersion: number, patch: Partial<RoomRecord>) {
    const cur = await this.getRoom(code);
    if (!cur || cur.version !== expectedVersion) return null;
    const next = { ...cur, ...patch, seats: patch.seats ?? cur.seats };
    const [row] = await this.sql<PgRoom[]>`
      UPDATE kc_rooms SET
        host_account = ${next.hostAccount},
        status = ${next.status},
        state = ${next.state ? this.sql.json(next.state as never) : null},
        version = ${next.version},
        seats = ${this.sql.json({ seats: next.seats, seatCount: next.seatCount, pace: next.pace } as never)},
        activity_at = ${new Date(next.activityAt)},
        ended_at = ${next.endedAt ? new Date(next.endedAt) : null},
        expires_at = ${new Date(next.expiresAt)}
      WHERE code = ${code.toUpperCase()} AND version = ${expectedVersion}
      RETURNING *
    `;
    return row ? fromPg(row) : null;
  }

  async saveRoom(room: RoomRecord) {
    await this.sql`
      UPDATE kc_rooms SET
        host_account = ${room.hostAccount},
        status = ${room.status},
        state = ${room.state ? this.sql.json(room.state as never) : null},
        version = ${room.version},
        seats = ${this.sql.json({ seats: room.seats, seatCount: room.seatCount, pace: room.pace } as never)},
        activity_at = ${new Date(room.activityAt)},
        ended_at = ${room.endedAt ? new Date(room.endedAt) : null},
        expires_at = ${new Date(room.expiresAt)}
      WHERE code = ${room.code}
    `;
    return room;
  }

  async deleteRoom(code: string) {
    await this.sql`DELETE FROM kc_rooms WHERE code = ${code.toUpperCase()}`;
  }

  async deleteExpired(now: number) {
    const rows = await this.sql<{ code: string }[]>`
      DELETE FROM kc_rooms WHERE expires_at <= ${new Date(now)} RETURNING code
    `;
    return rows.length;
  }

  async getAction(roomCode: string, clientActionId: string) {
    const [row] = await this.sql<{ result: StoredActionResult }[]>`
      SELECT result FROM kc_actions WHERE room_code = ${roomCode.toUpperCase()} AND client_action_id = ${clientActionId} LIMIT 1
    `;
    return row?.result ?? null;
  }

  async saveAction(roomCode: string, clientActionId: string, accountId: string, result: StoredActionResult) {
    await this.sql`
      INSERT INTO kc_actions (room_code, client_action_id, account_id, result)
      VALUES (${roomCode.toUpperCase()}, ${clientActionId}, ${accountId}, ${this.sql.json(result as never)})
      ON CONFLICT (room_code, client_action_id) DO NOTHING
    `;
  }
}

interface PgRoom {
  code: string;
  host_account: string;
  status: RoomStatus;
  state: GameState | null;
  version: number;
  seats: { seats: Seat[]; seatCount: number; pace: MatchPace };
  activity_at: Date;
  ended_at: Date | null;
  expires_at: Date;
  created_at: Date;
}

function fromPg(row: PgRoom): RoomRecord {
  const meta = row.seats ?? { seats: [], seatCount: 2, pace: 'untimed' as MatchPace };
  return {
    code: row.code,
    hostAccount: row.host_account,
    status: row.status,
    state: row.state,
    version: row.version,
    seats: meta.seats ?? [],
    seatCount: meta.seatCount ?? (meta.seats?.length || 2),
    pace: meta.pace ?? 'untimed',
    activityAt: row.activity_at.getTime(),
    endedAt: row.ended_at ? row.ended_at.getTime() : null,
    expiresAt: row.expires_at.getTime(),
    createdAt: row.created_at.getTime(),
  };
}

// ---------------------------------------------------------------- singleton

let shared: Store | null = null;

/** In-memory when DATABASE_URL is unset; Postgres otherwise. Tests may call `setStore`. */
export function getStore(): Store {
  if (shared) return shared;
  const url = process.env.DATABASE_URL;
  shared = url ? new PostgresStore(url) : new MemoryStore();
  return shared;
}

export function setStore(store: Store | null) {
  shared = store;
}
