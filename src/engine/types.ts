import type { GameConfig } from './config';

export const CHARACTER_KINDS = ['king', 'queen', 'witch', 'knight'] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export type MapId = 'island' | 'dungeon';

/** The four gems a player must bank before their final path opens. */
export const GEM_KINDS = ['ruby', 'sapphire', 'emerald', 'diamond'] as const;
export type GemKind = (typeof GEM_KINDS)[number];

export type NodeType =
  | 'castle'
  | 'circuit'
  | 'final'
  | 'temple'
  | 'side'
  | 'dEntrance'
  | 'path'
  | 'monster'
  | 'dragonChamber'
  | 'gemChamber'
  | 'trap'
  | 'vault'
  | 'safeRoom';

/** Which part of the board a space belongs to. */
export type Lane = 'home' | 'circuit' | 'final' | 'temple' | 'side' | 'dungeon';

export interface Teleport {
  type: 'trap' | 'shortcut';
  name: string;
  to: string;
  text: string;
}

export interface NodeDef {
  id: string;
  map: MapId;
  type: NodeType;
  lane: Lane;
  name: string;
  /** Position in artwork pixels (both maps are 1024 × 1024 paintings). */
  xy: [number, number];
  /** Index on the shared circuit (circuit spaces only). */
  circuit?: number;
  /** Seat that owns this castle or final-path space. */
  house?: number;
  /** Characters here cannot be cut, and several (even opponents) may share it. */
  safe?: boolean;
  /** Gem station: passing or landing picks up this gem. */
  station?: GemKind;
  /** Discovery site: the Dig action draws a discovery here. */
  dig?: boolean;
  dungeonGate?: boolean;
  dock?: boolean;
  airfield?: boolean;
  /** The Witch may hop to this paired portal space for free once per turn. */
  portal?: string;
  /** Ending a move here sends the character to `to`. */
  teleport?: Teleport;
  /** A Raise Mountain or Create River card may replace this space (closing its paths). */
  terrainSite?: boolean;
  /** Public house plate (the seat it belongs to). Touching all four completes a character's lap. */
  plate?: number;
  /** Inner route this space belongs to. */
  trail?: string;
  /** Trap risk: stopping here may spring a hidden snare. */
  hazard?: boolean;
}

export interface TrailInfo {
  id: string;
  name: string;
  kind: 'main' | 'mountain' | 'forest' | 'river' | 'ruins';
  perk: string;
  risk: string;
}

/**
 * permanent: always open. buildable: a bridge, tunnel or road that a card opens or closes.
 * blockable: a marked pass a Landslide card can close.
 */
export type EdgeKind = 'permanent' | 'buildable' | 'blockable';

export interface EdgeDef {
  id: string;
  a: string;
  b: string;
  kind: EdgeKind;
  lane: Lane;
  /** Movement only goes from a to b (final paths and castle exits). */
  oneWay?: boolean;
  /** Route this edge belongs to ('main' for the coast road). */
  trail?: string;
  /** Moving from `from` across this edge needs the monster beaten this visit (or a dungeon key). */
  guard?: { type: 'monster'; from: string };
  name?: string;
  structure?: 'bridge' | 'tunnel' | 'road';
  /** Structure token id (several edges may share one). */
  gate?: string;
  /** Whether the structure is open at the start of a match. */
  startsOpen?: boolean;
  /** Polyline from a to b in map pixels, following the road. */
  route: [number, number][];
}

export interface MapDef {
  id: MapId;
  name: string;
  /** Every character must be able to walk to this space; map cards may not cut anyone off. */
  hub: string;
}

export interface HouseInfo {
  seat: number;
  key: 'red' | 'blue' | 'purple' | 'green';
  name: string;
  castle: string;
  /** Circuit space where characters enter and bank gems. */
  entry: string;
  /** This house's public plate (its gate). */
  plate: string;
  /** Circuit space where the final path leaves the circuit. */
  branch: string;
  /** Final-path spaces in order, ending with the temple. */
  final: string[];
}

export interface BoardDef {
  id: string;
  name: string;
  maps: MapDef[];
  nodes: NodeDef[];
  edges: EdgeDef[];
  /** Circuit spaces in clockwise order. */
  circuit: string[];
  houses: HouseInfo[];
  /** The main road and every inner route, with their trade-offs. */
  trails: TrailInfo[];
  temple: string;
  /** Adventure-action transitions between maps. */
  transitions: { island: string; dungeon: string }[];
  docks: string[];
  airfields: string[];
  dragonHome: string;
  /** Seats used for 2, 3 and 4 players. */
  seatOrder: Record<number, number[]>;
}

export type DragonState = 'guarding' | 'companion' | 'wild' | 'recovering';

export interface Character {
  id: string;
  owner: string;
  kind: CharacterKind;
  node: string;
  /** Seats whose plates this character has touched since it last left its castle, in visit order. */
  plates: number[];
  /** Plates touched (0–4): `plates.length`. Four means the lap is complete. */
  lap: number;
  /** Ids of the gems this character carries (up to `config.carryLimit`). */
  carrying: string[];
  shield: boolean;
  /** Immunity lasts until the start of the owner's next turn. */
  immune: boolean;
  /** Beat the monster during the current dungeon visit. */
  beatMonster: boolean;
}

/** A gem token. It exists only while carried or lying on the board; banked gems become the player's. */
export interface Gem {
  id: string;
  kind: GemKind;
  /** Null while carried. */
  node: string | null;
  carriedBy: string | null;
}

export interface DragonInfo {
  state: DragonState;
  /** Where it is when not a companion (companions follow their character). */
  node: string;
  companion: string | null;
  /** Recovering until the turn number exceeds this. */
  recoverUntilTurn: number;
  /** Player who released it; they cannot attack it until their next turn. */
  releasedBy: string | null;
}

export interface PlayerState {
  id: string;
  name: string;
  seat: number;
  castle: string;
  isAI: boolean;
  /** Gem kinds banked (each counts once). */
  gems: GemKind[];
  /** Has cut an opponent's character through normal movement. */
  cut: boolean;
  /** Slow Down played on this player: their next roll is capped. */
  slowed: boolean;
  /** Dungeon keys held (each opens the Vault Door once). */
  keys: number;
}

export type CardCategory = 'map' | 'power' | 'special';
export type CardType =
  | 'build_bridge'
  | 'collapse_bridge'
  | 'dig_tunnel'
  | 'build_road'
  | 'raise_mountain'
  | 'create_river'
  | 'landslide'
  | 'repair'
  | 'shield'
  | 'magic_boots'
  | 'immunity'
  | 'dragon_slayer'
  | 'dragon_feast'
  | 'swap'
  | 'slow_down'
  | 'dragon_roar'
  | 'rescue'
  | 'reveal_discovery';

export interface CardInstance {
  id: string;
  type: CardType;
}

/** `route`: a hidden road — the closed bridge, tunnel or road nearest the dig opens for everyone. */
export type DiscoveryType = 'gem' | 'map_card' | 'power_card' | 'special_card' | 'key' | 'trap' | 'route';

export interface Discovery {
  id: string;
  type: DiscoveryType;
  gem?: GemKind;
}

export type CardTarget =
  | { kind: 'edge'; edgeId: string }
  | { kind: 'node'; node: string }
  | { kind: 'character'; characterId: string }
  | { kind: 'path'; characterId: string; path: string[] }
  | { kind: 'swap'; characterId: string; targetId: string }
  | { kind: 'dragonTo'; node: string }
  | { kind: 'player'; playerId: string };

export interface TurnState {
  playerId: string;
  number: number;
  round: number;
  moveDone: boolean;
  adventureDone: boolean;
  /**
   * Set once the die is rolled. The roll belongs to the turn, not to a character: the player then
   * picks any of their characters, and changing that choice before committing never rerolls.
   */
  move: { roll: number; slowed: boolean } | null;
  witchPortalUsed: boolean;
  /** Releasing the dragon is only allowed before any other action this turn. */
  acted: boolean;
  /** An extra turn earned this turn (a natural 6 or a movement cut); one at most. */
  extra: 'six' | 'cut' | null;
  /** This turn is itself an extra turn. */
  bonus: boolean;
  startedAt: number;
  deadline: number | null;
}

export type LogKind = 'info' | 'good' | 'bad' | 'system' | 'dragon';

export interface LogEntry {
  id: number;
  text: string;
  kind: LogKind;
  playerId?: string;
}

export interface PlayerStats {
  turns: number;
  timeouts: number;
  cardsPlayed: number;
  defeated: number;
  gemsBanked: number;
  gemsPicked: number;
  cuts: number;
  laps: number;
  traps: number;
  shortcuts: number;
  vehicleTrips: number;
  discoveries: number;
  dungeonVisits: number;
  tameAttempts: number;
  tames: number;
  dragonFires: number;
  slayAttempts: number;
  slays: number;
}

export interface MatchResult {
  winners: string[];
  reason: 'temple' | 'timer' | 'rounds';
  tieBreak: null | 'cut' | 'shared';
  durationMs: number;
  turns: number;
  rounds: number;
  /** Distinct gem kinds banked per player. */
  finalGems: Record<string, number>;
}

export type TeleportReason = 'trap' | 'shortcut' | 'portal' | 'boat' | 'plane' | 'swap' | 'rescue' | 'dungeon' | 'retreat' | 'discovery' | 'hazard';

export type GameEvent =
  | { type: 'turnStarted'; playerId: string; turn: number }
  | { type: 'rolled'; playerId: string; value: number }
  | { type: 'moved'; characterId: string; path: string[] }
  /** A move ended on (or the Knight passed through) an opponent and sent them home. */
  | { type: 'cut'; characterId: string; targetId: string; node: string; stole: GemKind[]; dropped: GemKind[] }
  | { type: 'teleported'; characterId: string; from: string; to: string; reason: TeleportReason; name?: string }
  | { type: 'pickedUp'; characterId: string; gem: GemKind; from: string | null }
  /** `duplicate`: the player already had this gem, so it went back to the supply. */
  | { type: 'banked'; playerId: string; characterId: string; gem: GemKind; duplicate: boolean }
  /** A plate touched for the first time on this lap; `checkpoint` is how many it has now (4 = lap). */
  | { type: 'lap'; characterId: string; checkpoint: number; plate: number }
  | { type: 'extraTurn'; playerId: string; reason: 'six' | 'cut' }
  | { type: 'hazard'; characterId: string; node: string; roll: number; sprung: boolean }
  | { type: 'finalUnlocked'; playerId: string }
  | { type: 'enteredFinal'; characterId: string }
  | { type: 'defeated'; characterId: string; by: string; cause: 'cut' | 'fire' }
  | { type: 'shieldUsed'; characterId: string }
  | { type: 'monster'; characterId: string; roll: number; total: number; success: boolean }
  | { type: 'tame'; characterId: string; roll: number; success: boolean }
  | { type: 'dragonFire'; characterId: string; targetId: string }
  | { type: 'slay'; characterId: string; roll: number; success: boolean }
  | { type: 'dragonReleased'; playerId: string }
  | { type: 'dragonMoved'; to: string }
  | { type: 'dragonRecovered' }
  | { type: 'cardPlayed'; playerId: string; card: CardType }
  | { type: 'cardDrawn'; playerId: string }
  | { type: 'discovery'; characterId: string; found: DiscoveryType; gem?: GemKind }
  | { type: 'edgeChanged'; edgeId: string }
  | { type: 'gameOver'; winners: string[] };

export interface GameState {
  boardId: string;
  config: GameConfig;
  version: number;
  status: 'playing' | 'finished';
  players: PlayerState[];
  characters: Record<string, Character>;
  gems: Gem[];
  dragon: DragonInfo;
  /** Structure tokens (bridges, tunnels, roads), keyed by gate id: open or closed. */
  bridges: Record<string, boolean>;
  /** Terrain replacement on a marked space; paths through it close. */
  transforms: Record<string, 'mountain' | 'river'>;
  /** Blockable edges currently closed by a landslide, with who placed it. */
  blocks: { edgeId: string; owner: string }[];
  /** Where the boat and the plane are parked. */
  vehicles: { boat: string; plane: string };
  turn: TurnState;
  startedAt: number;
  endsAt: number | null;
  result: MatchResult | null;
  log: LogEntry[];
  lastEvents: GameEvent[];
  stats: Record<string, PlayerStats>;
  hands: Record<string, CardInstance[]>;
  deck: CardInstance[];
  discard: CardInstance[];
  discoveries: Discovery[];
  discoveryDiscard: Discovery[];
  rngState: number;
  logCounter: number;
  cardCounter: number;
  gemCounter: number;
  /** Test/tutorial hook: next die results. */
  forcedRolls: number[];
}

export type GameAction =
  | { type: 'release' }
  | { type: 'roll' }
  /** The full route, starting at the character's current location. */
  | { type: 'move'; characterId: string; path: string[]; discardCardId?: string | null }
  | { type: 'skipMove' }
  | { type: 'skipAdventure' }
  | { type: 'enterDungeon'; characterId: string }
  | { type: 'leaveDungeon'; characterId: string }
  /** Dig at a discovery site (or take a gem in the Crystal Shrine; `gem` picks the kind there). */
  | { type: 'dig'; characterId: string; gem?: GemKind; discardCardId?: string | null }
  | { type: 'fightMonster'; characterId: string }
  | { type: 'tame'; characterId: string }
  | { type: 'dragonFire'; targetId: string }
  | { type: 'sail'; characterId: string }
  | { type: 'fly'; characterId: string; to: string }
  | { type: 'playCard'; cardId: string; target: CardTarget; discardCardId?: string | null };

export interface ActionEnvelope {
  playerId: string;
  action: GameAction;
  version?: number;
}

export type ActionResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };

export interface PlayerView {
  viewerId: string | null;
  boardId: string;
  config: GameConfig;
  version: number;
  status: GameState['status'];
  players: PlayerState[];
  characters: Record<string, Character>;
  gems: Gem[];
  dragon: DragonInfo;
  bridges: Record<string, boolean>;
  transforms: GameState['transforms'];
  blocks: GameState['blocks'];
  vehicles: GameState['vehicles'];
  turn: TurnState;
  startedAt: number;
  endsAt: number | null;
  result: MatchResult | null;
  log: LogEntry[];
  lastEvents: GameEvent[];
  stats: Record<string, PlayerStats>;
  hand: CardInstance[];
  handCounts: Record<string, number>;
  deckCount: number;
  discardTop: CardType | null;
  discardCount: number;
  discoveryCount: number;
}

/** The parts of state shared by GameState and PlayerView (what rule queries need). */
export type BoardState = Pick<
  GameState,
  'boardId' | 'config' | 'players' | 'characters' | 'gems' | 'dragon' | 'bridges' | 'transforms' | 'blocks' | 'vehicles' | 'turn' | 'status'
>;
