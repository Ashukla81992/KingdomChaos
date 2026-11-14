import { z } from 'zod';
import { ROOM_CONFIG } from '../engine/config';
import type { GameAction, PlayerView } from '../engine/types';

/** Shared between the Socket.IO server and the browser client. */

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface LobbyPlayer {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  /** Player has left the match permanently (their turns are auto-played). */
  left: boolean;
}

export interface RoomSnapshot {
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  hostId: string;
  players: LobbyPlayer[];
  you: string;
  minPlayers: number;
  maxPlayers: number;
}

export interface SessionInfo {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ServerToClient {
  'room:update': (room: RoomSnapshot) => void;
  /** `serverNow` lets clients correct countdowns for clock skew. */
  'game:view': (view: PlayerView & { serverNow?: number }) => void;
  'room:closed': (reason: string) => void;
}

export interface ClientToServer {
  'room:create': (p: { name: string }, ack: (r: Ack<{ session: SessionInfo }>) => void) => void;
  'room:join': (p: { code: string; name: string }, ack: (r: Ack<{ session: SessionInfo }>) => void) => void;
  'room:resume': (p: { code: string; playerId: string; token: string }, ack: (r: Ack<{ session: SessionInfo }>) => void) => void;
  'room:leave': (ack?: (r: Ack) => void) => void;
  'room:ready': (p: { ready: boolean }) => void;
  'room:start': (ack: (r: Ack) => void) => void;
  'room:toLobby': (ack: (r: Ack) => void) => void;
  'game:action': (p: { action: GameAction; version: number }, ack: (r: Ack) => void) => void;
}

// ---------------------------------------------------------------- payload validation

const id = z.string().min(1).max(64);
export const nameSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f<>]/g, '').trim())
  .pipe(z.string().min(1, 'Enter a display name.').max(ROOM_CONFIG.maxNameLength, `Names can be at most ${ROOM_CONFIG.maxNameLength} characters.`));

export const codeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().length(ROOM_CONFIG.roomCodeLength, 'Room codes have 5 characters.').regex(/^[A-Z0-9]+$/, 'Room codes use letters and digits only.'));

const target = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('connection'), connectionId: id }),
  z.object({ kind: z.literal('portal'), space: id, linkedTo: id }),
  z.object({ kind: z.literal('space'), space: id }),
  z.object({ kind: z.literal('character'), characterId: id }),
  z.object({ kind: z.literal('characterPath'), characterId: id, path: z.array(id).min(2).max(8) }),
  z.object({ kind: z.literal('characterSpace'), characterId: id, space: id }),
  z.object({ kind: z.literal('swap'), characterId: id, targetCharacterId: id }),
  z.object({ kind: z.literal('player'), playerId: id }),
  z.object({ kind: z.literal('none') }),
]);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('move'), characterId: id, path: z.array(id).min(2).max(12) }),
  z.object({ type: z.literal('playCard'), cardId: id, target }),
  z.object({ type: z.literal('endTurn') }),
  z.object({ type: z.literal('resolveDraw'), discardCardId: id.nullable() }),
]);

export const actionPayloadSchema = z.object({ action: actionSchema, version: z.number().int().nonnegative() });
