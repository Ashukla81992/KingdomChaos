import { z } from 'zod';
import { ROOM_CONFIG, type MatchPace } from '../engine/config';
import { GEM_KINDS, type CardType, type PlayerView } from '../engine/types';

/** Shared validation helpers for the HTTP API and clients. */

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RoomLobbyView {
  code: string;
  status: 'lobby' | 'playing' | 'finished' | 'ended';
  hostAccount: string;
  you: string | null;
  youPlayerId: string | null;
  isHost: boolean;
  minPlayers: number;
  maxPlayers: number;
  seatCount: number;
  pace: MatchPace;
  seats: Array<{
    playerId: string;
    username: string;
    accountId: string | null;
    isAI: boolean;
    ready: boolean;
    isHost: boolean;
    isYou: boolean;
  }>;
  activityAt: number;
  endedAt: number | null;
  expiresAt: number;
  serverNow: number;
}

/** One line of in-match chat. `id` grows with every message, so clients fetch "everything after id N". */
export interface ChatMessage {
  id: number;
  playerId: string;
  username: string;
  text: string;
  at: number;
}

/** A WebRTC connection message relayed between two players' browsers. Audio never goes through the server. */
export interface VoiceSignal {
  id: number;
  from: string;
  kind: 'hello' | 'offer' | 'answer' | 'bye';
  data: unknown;
  at: number;
}

export interface RoomGetResponse {
  lobby: RoomLobbyView;
  view: (PlayerView & { serverNow: number }) | null;
  /** New chat lines since the `chatAfter` the client sent (seated players only). */
  chat?: ChatMessage[];
  /** Voice connection messages waiting for you (seated players only, delivered once). */
  signals?: VoiceSignal[];
}

export const CHAT_MAX_LENGTH = 200;

/** Ready-made lines for a quick tap (handy on phones and TVs). */
export const QUICK_CHAT = ['Good luck!', 'Nice move!', 'Your turn!', 'Oops!', 'Want to trade?', 'Good game!'] as const;

export const chatTextSchema = z
  .string()
  // Control characters out, runs of spaces and new lines down to one space.
  .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(1, 'Type a message first.').max(CHAT_MAX_LENGTH, `Messages can be at most ${CHAT_MAX_LENGTH} characters.`));

export const chatPayloadSchema = z.object({ text: z.string().max(2000) });

const sdp = z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().min(1).max(20_000) });

export const signalPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hello'), to: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('bye'), to: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('offer'), to: z.string().min(1).max(64), data: sdp }),
  z.object({ kind: z.literal('answer'), to: z.string().min(1).max(64), data: sdp }),
]);

export const REPORT_REASONS = ['Abusive or hateful', 'Harassment or bullying', 'Sexual content', 'Spam', 'Seems underage', 'Something else'] as const;

export const reportPayloadSchema = z.object({
  playerId: z.string().min(1).max(64),
  reason: z.enum(REPORT_REASONS),
});

export const nameSchema = z
  .string()
  .transform((s) => s.replace(/[\u0000-\u001f<>]/g, '').trim())
  .pipe(z.string().min(1, 'Enter a display name.').max(ROOM_CONFIG.maxNameLength, `Names can be at most ${ROOM_CONFIG.maxNameLength} characters.`));

export const codeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().length(ROOM_CONFIG.roomCodeLength, 'Room codes have 5 characters.').regex(/^[A-Z0-9]+$/, 'Room codes use letters and digits only.'));

// ---------------------------------------------------------------- payload validation
// Manager owns the actionSchema entries — do not rewrite without Manager approval.

const id = z.string().min(1).max(64);

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
  z.object({ type: z.literal('dragonFire'), targetId: id.optional(), monster: z.enum(['golem', 'spider']).optional() }),
  z.object({ type: z.literal('attackMonster'), characterId: id, monster: z.enum(['golem', 'spider']) }),
  z.object({ type: z.literal('explore'), characterId: id }),
  z.object({ type: z.literal('battle'), choice: z.enum(['strike', 'guard', 'retreat']) }),
  z.object({ type: z.literal('sail'), characterId: id }),
  z.object({ type: z.literal('fly'), characterId: id, to: id, fuelCardId: id.optional() }),
  z.object({ type: z.literal('playCard'), cardId: id, target, discardCardId: discard }),
]);

export const actionPayloadSchema = z.object({
  action: actionSchema,
  version: z.number().int().nonnegative(),
  clientActionId: z.string().min(1).max(128).optional(),
});
