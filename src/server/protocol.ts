import { z } from 'zod';
import { ROOM_CONFIG, type MatchPace } from '../engine/config';
import { GEM_KINDS, type CardType, type GameAction, type PlayerView } from '../engine/types';

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
  'room:start': (p: { timers?: boolean; pace?: MatchPace } | ((r: Ack) => void), ack?: (r: Ack) => void) => void;
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
  z.object({ kind: z.literal('edge'), edgeId: id }),
  z.object({ kind: z.literal('node'), node: id }),
  z.object({ kind: z.literal('character'), characterId: id }),
  z.object({ kind: z.literal('path'), characterId: id, path: z.array(id).min(2).max(6) }),
  z.object({ kind: z.literal('swap'), characterId: id, targetId: id }),
  z.object({ kind: z.literal('dragonTo'), node: id }),
  z.object({ kind: z.literal('player'), playerId: id }),
]);

const discard = id.nullable().optional();

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('release') }),
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('move'), characterId: id, path: z.array(id).min(2).max(12), attack: z.array(id).min(1).max(6).optional(), discardCardId: discard }),
  z.object({ type: z.literal('royalGuard'), targetId: id }),
  z.object({ type: z.literal('alchemy'), characterId: id, gemId: id, to: z.enum(GEM_KINDS) }),
  z.object({
    type: z.literal('offerTrade'),
    to: id,
    give: z.enum(GEM_KINDS),
    want: z.discriminatedUnion('kind', [z.object({ kind: z.literal('gem'), gem: z.enum(GEM_KINDS) }), z.object({ kind: z.literal('card'), cardType: id.transform((v) => v as CardType) })]),
  }),
  z.object({ type: z.literal('respondTrade'), offerId: id, accept: z.boolean(), cardId: id.optional() }),
  z.object({ type: z.literal('cancelTrade'), offerId: id }),
  z.object({ type: z.literal('skipMove') }),
  z.object({ type: z.literal('skipAdventure') }),
  z.object({ type: z.literal('enterDungeon'), characterId: id }),
  z.object({ type: z.literal('leaveDungeon'), characterId: id }),
  z.object({ type: z.literal('dig'), characterId: id, gem: z.enum(GEM_KINDS).optional(), discardCardId: discard }),
  z.object({ type: z.literal('fightMonster'), characterId: id }),
  z.object({ type: z.literal('tame'), characterId: id }),
  z.object({ type: z.literal('dragonFire'), targetId: id }),
  z.object({ type: z.literal('sail'), characterId: id }),
  z.object({ type: z.literal('fly'), characterId: id, to: id }),
  z.object({ type: z.literal('playCard'), cardId: id, target, discardCardId: discard }),
]);

export const actionPayloadSchema = z.object({ action: actionSchema, version: z.number().int().nonnegative() });
