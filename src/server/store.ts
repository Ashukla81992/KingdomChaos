import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import type { GameState, MatchPace } from '../engine';
import { SCHEMA_SQL } from './schema';

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
  /** Find the account linked to this Google user, or create one with a free username based on `preferredName`. */
  findOrCreateGoogleAccount(googleSub: string, preferredName: string): Promise<Account>;

  createRoom(room: RoomRecord): Promise<RoomRecord>;
  getRoom(code: string): Promise<RoomRecord | null>;
  /** Atomic compare-and-set on version. Returns updated room or null if version mismatched / missing. */
  updateRoom(code: string, expectedVersion: number, patch: Partial<RoomRecord>): Promise<RoomRecord | null>;
  /** Unconditional save (lobby mutations, expiry stamps after end, etc.). */
  saveRoom(room: RoomRecord): Promise<RoomRecord>;
  /** Push expiry forward (never backward) without touching game state. Used as a presence heartbeat. */
  touchRoom(code: string, expiresAt: number): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  deleteExpired(now: number): Promise<number>;

  getAction(roomCode: string, clientActionId: string): Promise<StoredActionResult | null>;
  saveAction(roomCode: string, clientActionId: string, accountId: string, result: StoredActionResult): Promise<void>;
}

const TWO_H = 2 * 60 * 60 * 1000;

/** How long an open (lobby or playing) room survives once every seated player has stopped polling. */
export const ROOM_IDLE_TTL_MS = TWO_H;

export function defaultExpiresAt(now = Date.now()) {
  return now + ROOM_IDLE_TTL_MS;
}

export function resultExpiresAt(endedAt: number) {
  return endedAt + 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------- memory

/** Google-only accounts have no password; this marker never verifies (see verifyPassword). */
export const GOOGLE_ONLY_PASS_HASH = 'google$';

/** Usernames to try for a new Google account: the name itself, then with a short number. */
export function googleUsernameCandidates(preferredName: string): string[] {
  let base = preferredName.normalize('NFKD').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20);
  if (base.length < 3) base = `player${base}`.slice(0, 20);
  const out = [base];
  for (let i = 0; i < 20; i++) out.push(`${base}${Math.floor(1000 + Math.random() * 9000)}`);
  return out;
}

export class MemoryStore implements Store {
  private googleLinks = new Map<string, string>();
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

  async findOrCreateGoogleAccount(googleSub: string, preferredName: string): Promise<Account> {
    const linked = this.googleLinks.get(googleSub);
    if (linked) return { ...this.accounts.get(linked)! };
    for (const username of googleUsernameCandidates(preferredName)) {
      if (await this.findAccountByUsername(username)) continue;
      const account = await this.createAccount(username, GOOGLE_ONLY_PASS_HASH);
      this.googleLinks.set(googleSub, account.id);
      return account;
    }
    throw new Error('Could not find a free username for this Google account.');
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

  async touchRoom(code: string, expiresAt: number) {
    const cur = this.rooms.get(code.toUpperCase());
    if (cur && cur.expiresAt < expiresAt) cur.expiresAt = expiresAt;
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
    // prepare: false keeps queries working through Neon's / pgbouncer's transaction pooler.
    this.sql = postgres(databaseUrl, { max: 5, idle_timeout: 20, prepare: false });
  }

  private schemaReady: Promise<void> | null = null;

  /** Create the kc_ tables on first use (idempotent), so a fresh database never 500s on "relation does not exist". */
  private ensureSchema(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.sql
        .unsafe(SCHEMA_SQL)
        .simple()
        .then(() => undefined)
        .catch((err) => {
          this.schemaReady = null; // retry on the next request
          throw err;
        });
    }
    return this.schemaReady;
  }

  async createAccount(username: string, passHash: string): Promise<Account> {
    await this.ensureSchema();
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
    await this.ensureSchema();
    const [row] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
      SELECT id, username, pass_hash, created_at FROM kc_accounts WHERE lower(username) = lower(${username}) LIMIT 1
    `;
    return row ? { id: row.id, username: row.username, passHash: row.pass_hash, createdAt: row.created_at.getTime() } : null;
  }

  async findOrCreateGoogleAccount(googleSub: string, preferredName: string): Promise<Account> {
    await this.ensureSchema();
    const [linked] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
      SELECT id, username, pass_hash, created_at FROM kc_accounts WHERE google_sub = ${googleSub} LIMIT 1
    `;
    if (linked) return { id: linked.id, username: linked.username, passHash: linked.pass_hash, createdAt: linked.created_at.getTime() };
    for (const username of googleUsernameCandidates(preferredName)) {
      const id = `a_${randomUUID().slice(0, 12)}`;
      const [row] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
        INSERT INTO kc_accounts (id, username, pass_hash, google_sub)
        VALUES (${id}, ${username}, ${GOOGLE_ONLY_PASS_HASH}, ${googleSub})
        ON CONFLICT DO NOTHING
        RETURNING id, username, pass_hash, created_at
      `;
      if (row) return { id: row.id, username: row.username, passHash: row.pass_hash, createdAt: row.created_at.getTime() };
      // Either the username was taken or a parallel request just linked this Google user: check again.
      const [again] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
        SELECT id, username, pass_hash, created_at FROM kc_accounts WHERE google_sub = ${googleSub} LIMIT 1
      `;
      if (again) return { id: again.id, username: again.username, passHash: again.pass_hash, createdAt: again.created_at.getTime() };
    }
    throw new Error('Could not find a free username for this Google account.');
  }

  async findAccountById(id: string) {
    await this.ensureSchema();
    const [row] = await this.sql<{ id: string; username: string; pass_hash: string; created_at: Date }[]>`
      SELECT id, username, pass_hash, created_at FROM kc_accounts WHERE id = ${id} LIMIT 1
    `;
    return row ? { id: row.id, username: row.username, passHash: row.pass_hash, createdAt: row.created_at.getTime() } : null;
  }

  async createRoom(room: RoomRecord) {
    await this.ensureSchema();
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
    await this.ensureSchema();
    const [row] = await this.sql<PgRoom[]>`SELECT * FROM kc_rooms WHERE code = ${code.toUpperCase()} LIMIT 1`;
    return row ? fromPg(row) : null;
  }

  async updateRoom(code: string, expectedVersion: number, patch: Partial<RoomRecord>) {
    await this.ensureSchema();
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
    await this.ensureSchema();
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

  async touchRoom(code: string, expiresAt: number) {
    await this.ensureSchema();
    await this.sql`
      UPDATE kc_rooms SET expires_at = ${new Date(expiresAt)}
      WHERE code = ${code.toUpperCase()} AND expires_at < ${new Date(expiresAt)}
    `;
  }

  async deleteRoom(code: string) {
    await this.ensureSchema();
    await this.sql`DELETE FROM kc_rooms WHERE code = ${code.toUpperCase()}`;
  }

  async deleteExpired(now: number) {
    await this.ensureSchema();
    const rows = await this.sql<{ code: string }[]>`
      DELETE FROM kc_rooms WHERE expires_at <= ${new Date(now)} RETURNING code
    `;
    return rows.length;
  }

  async getAction(roomCode: string, clientActionId: string) {
    await this.ensureSchema();
    const [row] = await this.sql<{ result: StoredActionResult }[]>`
      SELECT result FROM kc_actions WHERE room_code = ${roomCode.toUpperCase()} AND client_action_id = ${clientActionId} LIMIT 1
    `;
    return row?.result ?? null;
  }

  async saveAction(roomCode: string, clientActionId: string, accountId: string, result: StoredActionResult) {
    await this.ensureSchema();
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
  if (!url && process.env.VERCEL) {
    // Each serverless instance would get its own memory, so rooms would vanish between requests.
    console.error('[kingdom-chaos] DATABASE_URL is not set on Vercel: online rooms will not survive between requests.');
  }
  shared = url ? new PostgresStore(url) : new MemoryStore();
  return shared;
}

export function setStore(store: Store | null) {
  shared = store;
}
