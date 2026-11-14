import type { GameConfig } from './config';

export type CharacterKind = 'king' | 'queen' | 'witch' | 'knight';
export const CHARACTER_KINDS: CharacterKind[] = ['king', 'queen', 'witch', 'knight'];

export type CardCategory = 'map' | 'power' | 'special';

export type CardType =
  | 'build_bridge'
  | 'break_bridge'
  | 'carve_tunnel'
  | 'raise_mountain'
  | 'dig_canal'
  | 'block_path'
  | 'portal'
  | 'trap'
  | 'speed_boost'
  | 'shield'
  | 'attack_boost'
  | 'boat'
  | 'glider'
  | 'teleport'
  | 'royal_guard'
  | 'swap'
  | 'immunity'
  | 'slow_down'
  | 'castle_attack'
  | 'repair';

// ---------------------------------------------------------------- Board data

export type SpaceType = 'castle' | 'treasure' | 'normal' | 'card' | 'portal' | 'portalSite';

/**
 * What a square is made of. Land terrains can be walked on and stood on.
 * Water (river, lake, ocean) needs a boat; mountains need a glider (or a tunnel).
 */
export type Terrain =
  | 'grass'
  | 'forest'
  | 'plateau'
  | 'mountain'
  | 'river'
  | 'lake'
  | 'ocean'
  | 'bridge'
  | 'tunnel'
  | 'harbor'
  | 'airfield';

export interface BoardSpace {
  id: string;
  type: SpaceType;
  x: number;
  y: number;
  /** For castles: seat index 0..3 that owns it. */
  seat?: number;
  /** Starting terrain. Defaults to grass. */
  terrain?: Terrain;
  /** King's road squares: map cards may never reshape them. */
  road?: boolean;
}

/** permanent: always open. bridge: buildable/breakable. blockable: can be blocked temporarily. */
export type ConnectionKind = 'permanent' | 'bridge' | 'blockable';

export interface BoardConnection {
  id: string;
  a: string;
  b: string;
  kind: ConnectionKind;
  /** Bridges only: open at match start. */
  initiallyOpen?: boolean;
}

export interface BoardDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  spaces: BoardSpace[];
  connections: BoardConnection[];
  /** Castle space id for each seat (index = seat). */
  castles: string[];
  /** Seats used for 2, 3 and 4 player games. */
  seatOrder: Record<number, number[]>;
  /** The two fixed portal spaces; the Witch may travel between them. */
  fixedPortals: [string, string];
}

// ---------------------------------------------------------------- Runtime state

export interface CardInstance {
  id: string;
  type: CardType;
}

export type PowerEffect = { type: 'shield' } | { type: 'attack_boost' } | { type: 'boat' } | { type: 'glider' };

export interface Character {
  id: string;
  owner: string;
  kind: CharacterKind;
  space: string;
  carrying: string | null;
  /** Single persistent character-power slot. */
  power: PowerEffect | null;
  /** Immune until the start of the owner's next turn. */
  immune: boolean;
  /** Captured: cannot be selected for movement during the owner's next turn. */
  recovering: boolean;
}

export interface Treasure {
  id: string;
  home: string;
  /** Space id when lying on the board; null while carried. */
  space: string | null;
  carriedBy: string | null;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  castle: string;
  isAI: boolean;
  score: number;
  slowDownPending: boolean;
}

export interface CastleState {
  owner: string;
  /** Player id who damaged the castle, or null. */
  damagedBy: string | null;
  royalGuard: boolean;
}

export interface Block {
  connectionId: string;
  owner: string;
}

export interface TempPortal {
  space: string;
  linkedTo: string;
  owner: string;
}

export interface Trap {
  space: string;
  owner: string;
  /** Owner turn starts remaining before the trap expires. */
  roundsLeft: number;
}

export type TurnPhase = 'roll' | 'move' | 'action' | 'drawChoice';

export interface TurnState {
  playerId: string;
  number: number;
  phase: TurnPhase;
  roll: number | null;
  /** Effective movement allowance (roll, possibly capped by Slow Down). */
  steps: number | null;
  slowed: boolean;
  cardPlayed: boolean;
  /** Draws earned this turn (card spaces, King bonus) resolved at end of turn. */
  pendingDraws: number;
  startedAt: number;
  deadline: number | null;
}

export interface PlayerStats {
  captures: number;
  timesCaptured: number;
  cardsPlayed: number;
  banked: number;
  turns: number;
  timeouts: number;
}

export interface MatchResult {
  winners: string[];
  reason: 'treasures' | 'timer';
  tieBreak: 'none' | 'carried' | 'shared';
  finalScores: Record<string, { banked: number; carried: number }>;
  durationMs: number;
  turns: number;
}

export interface LogEntry {
  id: number;
  turn: number;
  text: string;
  kind: 'info' | 'move' | 'capture' | 'card' | 'bank' | 'system';
  playerId?: string;
}

export type GameEvent =
  | { type: 'rolled'; playerId: string; value: number; steps: number }
  | { type: 'moved'; characterId: string; path: string[]; via: 'regular' | 'card' }
  | { type: 'teleported'; characterId: string; from: string; to: string }
  | { type: 'swapped'; a: string; b: string }
  | { type: 'captured'; characterId: string; by: string; at: string }
  | { type: 'shieldBlocked'; characterId: string; attacker: string }
  | { type: 'trapped'; characterId: string; at: string }
  | { type: 'pickedUp'; characterId: string; treasureId: string }
  | { type: 'banked'; characterId: string; playerId: string; treasureId: string }
  | { type: 'cardPlayed'; playerId: string; card: CardType }
  | { type: 'terrainChanged'; space: string; from: Terrain; to: Terrain }
  | { type: 'cardDrawn'; playerId: string }
  | { type: 'turnStarted'; playerId: string; turn: number }
  | { type: 'gameOver'; result: MatchResult };

export interface PublicState {
  boardId: string;
  config: GameConfig;
  version: number;
  status: 'playing' | 'finished';
  players: PlayerState[];
  characters: Record<string, Character>;
  treasures: Treasure[];
  /** Open/closed state of every bridge connection. */
  bridges: Record<string, boolean>;
  /** Current terrain of every square; map cards reshape it. */
  terrain: Record<string, Terrain>;
  blocks: Block[];
  tempPortals: TempPortal[];
  traps: Trap[];
  castles: Record<string, CastleState>;
  turn: TurnState;
  startedAt: number;
  endsAt: number | null;
  result: MatchResult | null;
  log: LogEntry[];
  lastEvents: GameEvent[];
  stats: Record<string, PlayerStats>;
}

export interface GameState extends PublicState {
  hands: Record<string, CardInstance[]>;
  deck: CardInstance[];
  discard: CardInstance[];
  rngState: number;
  logCounter: number;
  cardCounter: number;
  /** Tutorial only: scripted die results consumed before random rolls. */
  forcedRolls: number[];
}

/** What one player is allowed to see. */
export interface PlayerView extends PublicState {
  viewerId: string | null;
  hand: CardInstance[];
  handCounts: Record<string, number>;
  deckCount: number;
  discardCount: number;
}

// ---------------------------------------------------------------- Actions

export type CardTarget =
  | { kind: 'connection'; connectionId: string }
  | { kind: 'portal'; space: string; linkedTo: string }
  | { kind: 'space'; space: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'characterPath'; characterId: string; path: string[] }
  | { kind: 'characterSpace'; characterId: string; space: string }
  | { kind: 'swap'; characterId: string; targetCharacterId: string }
  | { kind: 'player'; playerId: string }
  | { kind: 'none' };

export type GameAction =
  | { type: 'roll' }
  | { type: 'move'; characterId: string; path: string[] }
  | { type: 'playCard'; cardId: string; target: CardTarget }
  | { type: 'endTurn' }
  | { type: 'resolveDraw'; discardCardId: string | null };

export interface ActionEnvelope {
  playerId: string;
  action: GameAction;
  /** The state version the client acted on; mismatches are rejected as stale. */
  version?: number;
}

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
