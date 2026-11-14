import type { CardType } from './types';

/**
 * Central balance values. Everything a playtester may want to tweak lives here.
 * Values are snapshotted into each GameState when a match is created.
 */
export interface GameConfig {
  /** Match length in ms. 0 disables the match timer (tutorial). */
  matchDurationMs: number;
  /** Turn length in ms. 0 disables the turn timer (tutorial). */
  turnDurationMs: number;
  /** Shorter turn timer used while the current player is disconnected. */
  disconnectedTurnMs: number;
  treasuresToWin: number;
  handLimit: number;
  dieSides: number;
  /** Max regular movement for a player affected by Slow Down. */
  slowDownMaxSteps: number;
  speedBoostSteps: number;
  /** Number of the trap owner's turn starts after which an unused trap expires. */
  trapLifetimeRounds: number;
  /** Delay before each AI action, so humans can follow along. */
  aiActionDelayMs: number;
  deck: Record<CardType, number>;
}

/**
 * Initial deck: 40 cards. Movement and map cards are favoured over disruptive cards.
 * Map 15 · Character power 15 · Special move 10.
 */
export const DEFAULT_DECK: Record<CardType, number> = {
  // Map cards
  build_bridge: 4,
  break_bridge: 3,
  block_path: 3,
  portal: 3,
  trap: 2,
  // Character power cards
  speed_boost: 5,
  shield: 3,
  attack_boost: 2,
  teleport: 3,
  royal_guard: 2,
  // Special move cards
  swap: 2,
  immunity: 2,
  slow_down: 2,
  castle_attack: 2,
  repair: 2,
};

export const DEFAULT_CONFIG: GameConfig = {
  matchDurationMs: 12 * 60 * 1000,
  turnDurationMs: 30 * 1000,
  disconnectedTurnMs: 8 * 1000,
  treasuresToWin: 3,
  handLimit: 4,
  dieSides: 6,
  slowDownMaxSteps: 2,
  speedBoostSteps: 2,
  trapLifetimeRounds: 2,
  aiActionDelayMs: 900,
  deck: DEFAULT_DECK,
};

/** Server-side room settings (not part of game rules). */
export const ROOM_CONFIG = {
  minPlayers: 2,
  maxPlayers: 4,
  /** How long a disconnected player keeps their lobby seat. In-match seats are kept for the whole match. */
  lobbySeatGraceMs: 60 * 1000,
  /** Host privileges move to another player after the host is disconnected this long. */
  hostTransferGraceMs: 10 * 1000,
  /** Rooms with nobody connected are deleted after this long. */
  emptyRoomTtlMs: 5 * 60 * 1000,
  roomCodeLength: 5,
  maxNameLength: 16,
  /** Max actions per socket per second. */
  actionRateLimit: 15,
};
