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
  /** [A3] A monster that forces one roll when a move ends here (Stone Golem, Cave Spider). */
  encounter?: EncounterDef;
}

/** [A3] One-roll encounter. Success needs `threshold`+ (Knight adds `knightBonus`); failure sends the piece to `safeRoom`. */
export interface EncounterDef {
  monster: 'golem' | 'spider';
  name: string;
  /** Golem: the shortcut exit a winner is carried to. Spider: unused (the prize is a power card). */
  shortcutTo?: string;
  /** Marked safe room a loser is sent to. */
  safeRoom: string;
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
  /** [A1] Entered the Crown Temple. A finished piece stays there and never moves again. */
  finished: boolean;
  /** [A2] Royal Guard: cannot be captured (landing, Knight attack or Dragon Fire) until its owner's next turn. */
  guarded: boolean;
  /** Caught in the Cave Spider's web: the next movement allowance is reduced by `webPenalty` (min 1). Never stacks. */
  webbed?: boolean;
  /** Attuned at the Crystal Niche: the next movement allowance is `crystalBoost` longer. Used on the next move. */
  boosted?: boolean;
  /** Dungeon rooms whose once-per-visit perk this piece used (cleared when it leaves the dungeon or goes home). */
  roomsUsed?: string[];
  /**
   * Opposing movement actions left on each temporary ward (see src/engine/protection.ts). The matching
   * boolean (`shield`, `immune`, `guarded`) is true exactly while its count is above 0.
   */
  wards?: Partial<Record<'shield' | 'immune' | 'guarded', number>>;
}

export type MonsterId = 'golem' | 'spider';

/** A roaming dungeon monster. It lives on its encounter space and returns there after every event. */
export interface MonsterState {
  id: MonsterId;
  name: string;
  /** Its encounter space. */
  home: string;
  /** Where it stands now (always `home` between events). */
  node: string;
  /** Beaten in an encounter: rests (no attacks, no encounter) until the event after this round. 0 = active. */
  restUntilRound: number;
  /** Hits left (`monsterHearts` at the start; older saves have none and count as full). */
  hp?: number;
  /** Out of hearts: gone for the rest of the match. No attacks, no fight at its space. */
  slain?: boolean;
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
  /** Distinct gem kinds banked. Always the kinds with `bank[kind] >= 1`; only gem helpers write it. */
  gems: GemKind[];
  /** [A2] Banked copies per kind, duplicates included. A copy beyond the first is a spare (Diplomacy, Alchemy). */
  bank: Record<GemKind, number>;
  /** Has captured an opponent's piece by movement (temple capture credit). Dragon Fire never sets it. */
  cut: boolean;
  /** [A2] The King's Royal Guard has been used this match. */
  royalGuardUsed: boolean;
  /** Slow Down played on this player: their next roll is capped. */
  slowed: boolean;
  /** Dungeon keys held (each opens the Vault Door once). */
  keys: number;
  /** Gem kinds the Witch has already transmuted (each kind only once per match). */
  alchemyUsed?: GemKind[];
  /** Took its one Diamond from the Crystal Mine Tunnel. */
  mined?: boolean;
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
  /**
   * [A1] Bonus roll earned by the current roll: a natural 6 or at least one movement capture. One at
   * most per roll (a 6 plus any number of captures is still one). Granted once the move resolves.
   */
  extra: 'six' | 'capture' | null;
  /** [A1] The current roll is a bonus roll (same turn; the Adventure action is still once per turn). */
  bonus: boolean;
  /** [A1] Rolls made this turn (1 + bonus rolls taken). */
  rolls: number;
  /** [A1] Characters that moved this turn, in order (Royal Guard and Diplomacy read it). */
  moved: string[];
  /** [A2] The Queen made a Diplomacy offer this turn. */
  diplomacyUsed: boolean;
  startedAt: number;
  deadline: number | null;
}

/** [A2] What a Diplomacy offer asks for in return. */
export type TradeWant = { kind: 'gem'; gem: GemKind } | { kind: 'card'; cardType: CardType };

/** [A2] An open Queen's Diplomacy offer. It expires when the offering player's turn ends. */
export interface TradeOffer {
  id: string;
  from: string;
  to: string;
  /** A spare banked gem of the offerer (they keep at least one copy). */
  give: GemKind;
  want: TradeWant;
  /** Turn number it was made on. */
  turn: number;
}

/** [A2] A trade as one viewer may see it. Third parties see only who is trading. */
export interface TradeView {
  id: string;
  from: string;
  to: string;
  give?: GemKind;
  want?: TradeWant;
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
  /** Hits landed on dungeon monsters. */
  monsterHits?: number;
  slayAttempts: number;
  slays: number;
}

export interface MatchResult {
  winners: string[];
  /** `ended`: the online host ended the match (no winner). */
  reason: 'temple' | 'timer' | 'rounds' | 'ended';
  tieBreak: null | 'cut' | 'shared';
  durationMs: number;
  turns: number;
  rounds: number;
  /** Distinct gem kinds banked per player. */
  finalGems: Record<string, number>;
}

export type TeleportReason = 'trap' | 'shortcut' | 'portal' | 'boat' | 'plane' | 'swap' | 'rescue' | 'dungeon' | 'retreat' | 'discovery' | 'hazard' | 'encounter' | 'monster';

/**
 * Events are facts, not prose: the UI (src/lib/explain.ts) turns them into "what happened, why, what
 * now" cards. Add fields rather than renaming; every consumer matches on `type`.
 */
export type GameEvent =
  | { type: 'turnStarted'; playerId: string; turn: number }
  /** `steps`: the movement allowance after the dragon penalty or Slow Down; `penalty` says which applied. */
  | { type: 'rolled'; playerId: string; value: number; steps?: number; penalty?: 'dragon' | 'slowed' | null; bonus?: boolean }
  | { type: 'moved'; characterId: string; path: string[] }
  /** A movement capture (landing, or one of the Knight's chosen route-attack targets) sent a piece home. */
  | { type: 'cut'; characterId: string; targetId: string; node: string; stole: GemKind[]; dropped: GemKind[] }
  /** [A1] The Knight's route attack, with the 2–3 targets the player chose. */
  | { type: 'routeAttack'; characterId: string; targets: string[] }
  | { type: 'teleported'; characterId: string; from: string; to: string; reason: TeleportReason; name?: string }
  | { type: 'pickedUp'; characterId: string; gem: GemKind; from: string | null }
  /** `duplicate`: the kingdom already had this kind; it is kept as a spare copy. */
  | { type: 'banked'; playerId: string; characterId: string; gem: GemKind; duplicate: boolean }
  /** A plate touched for the first time on this lap; `checkpoint` is how many it has now (4 = lap). */
  | { type: 'lap'; characterId: string; checkpoint: number; plate: number }
  /** [A1] A bonus roll was earned; it is granted when the current move resolves. */
  | { type: 'extraTurn'; playerId: string; reason: 'six' | 'capture' }
  /** [A1] No piece could use the full allowance; movement skipped. */
  | { type: 'noMove'; playerId: string; steps: number }
  | { type: 'hazard'; characterId: string; node: string; roll: number; sprung: boolean }
  /** The Royal Path opened: one of each gem kind banked. */
  | { type: 'finalUnlocked'; playerId: string }
  | { type: 'enteredFinal'; characterId: string }
  /** [A1] A piece entered the Crown Temple; `count` is how many of that kingdom are in. */
  | { type: 'finished'; characterId: string; playerId: string; count: number }
  | { type: 'defeated'; characterId: string; by: string; cause: 'cut' | 'fire' }
  | { type: 'shieldUsed'; characterId: string }
  /** A temporary ward ended: `expired` after its last opposing movement, `consumed` when it absorbed an attack. */
  | { type: 'protectionEnded'; characterId: string; ward: 'shield' | 'immune' | 'guarded'; reason: 'expired' | 'consumed' }
  /** A temporary ward was granted or refreshed; `moves` is how many opposing movements it lasts. */
  | { type: 'protectionGranted'; characterId: string; ward: 'shield' | 'immune' | 'guarded'; moves: number; refreshed: boolean }
  | { type: 'monster'; characterId: string; roll: number; total: number; success: boolean }
  /** [A3] Stone Golem or Cave Spider: one roll; `to` is where the piece ended up. */
  | { type: 'encounter'; characterId: string; monster: 'golem' | 'spider'; roll: number; total: number; success: boolean; to: string }
  /**
   * The round's monster event. `die`: the event die. `kind`: quiet (1–3), patrol (a monster found no target),
   * attack. `outside`: the monster climbed out to the Dragon Gate road (`at` is where it stood). Golem: `effect`
   * push from `from` to `to` (equal when there was nowhere to go). Spider: `effect` web.
   */
  | {
      type: 'monsterEvent';
      round: number;
      die: number;
      kind: 'quiet' | 'patrol' | 'attack';
      monster?: MonsterId;
      outside?: boolean;
      at?: string;
      characterId?: string;
      effect?: 'push' | 'web';
      from?: string;
      to?: string;
      /** A strike back after a missed Attack (not a round event). */
      counter?: boolean;
      /** Where the monster struck from (its space, or the Dragon Gate when it climbed out). */
      origin?: string;
      /** What actually happened to the target. `blocked`: a Shield absorbed it (and was used up). */
      outcome?: 'pushed' | 'stuck' | 'webbed' | 'alreadyWebbed' | 'blocked';
    }
  /** A beaten encounter monster has rested and is back on guard. */
  | { type: 'monsterRecovered'; monster: MonsterId }
  /** Fell into the Spike Pit and rolled for the treasure among the spikes. */
  | { type: 'spikeTreasure'; characterId: string; roll: number; success: boolean }
  /**
   * A piece struck a monster: by winning its fight (`encounter`), with the Attack action (`attack`) or with
   * Dragon Fire (`fire`). `hit` false only for attack/fire misses; `hp` is what is left; `slain` at 0.
   */
  | { type: 'monsterHit'; monster: MonsterId; characterId: string; how: 'encounter' | 'attack' | 'fire'; roll?: number; total?: number; hit: boolean; hp: number; slain: boolean }
  | { type: 'tame'; characterId: string; roll: number; success: boolean }
  /** `roll`: the separate attack die; `hit` on `dragonFireHit`+ (older events have neither and always hit). */
  | { type: 'dragonFire'; characterId: string; targetId: string; roll?: number; hit?: boolean; from?: string; at?: string }
  | { type: 'slay'; characterId: string; roll: number; success: boolean }
  | { type: 'dragonReleased'; playerId: string }
  | { type: 'dragonMoved'; to: string }
  | { type: 'dragonRecovered' }
  | { type: 'cardPlayed'; playerId: string; card: CardType }
  | { type: 'cardDrawn'; playerId: string }
  | { type: 'discovery'; characterId: string; found: DiscoveryType; gem?: GemKind }
  /** [A3] `change` and `by` let the UI say "Blue destroyed the bridge". */
  | { type: 'edgeChanged'; edgeId: string; change?: 'opened' | 'closed' | 'blocked' | 'cleared'; by?: string; card?: CardType }
  /** [A3] A space became a mountain or river, or was repaired. */
  | { type: 'terrainChanged'; node: string; to: 'mountain' | 'river' | null; by?: string }
  /** [A2] Powers and trades. */
  | { type: 'royalGuard'; characterId: string; targetId: string }
  | { type: 'alchemy'; characterId: string; from: GemKind; to: GemKind }
  | { type: 'tradeOffered'; offerId: string; from: string; to: string }
  | { type: 'tradeResolved'; offerId: string; from: string; to: string; outcome: 'accepted' | 'declined' | 'expired' | 'cancelled' }
  /** [Prototype] Golem battle events. */
  | { type: 'battleStarted'; battleId: number; monster: MonsterId; characterId: string; intent: BattleIntent; reward: string }
  | {
      type: 'battleExchange';
      battleId: number;
      monster: MonsterId;
      characterId: string;
      exchange: number;
      choice: 'strike' | 'guard';
      roll?: number;
      total?: number;
      hit?: boolean;
      damage: number;
      /** The monster's attack this exchange and what it did. */
      monsterAttack: BattleIntent | null;
      blocked: boolean;
      taken: number;
      exposed: boolean;
      monsterHp: number;
      stamina: number;
      nextIntent: BattleIntent | null;
    }
  | { type: 'battleEnded'; battleId: number; monster: MonsterId; characterId: string; outcome: 'won' | 'lost' | 'retreated'; to: string; reward?: string }
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
  /** [A2] Open Diplomacy offers. */
  trades: TradeOffer[];
  tradeCounter: number;
  rngState: number;
  logCounter: number;
  cardCounter: number;
  gemCounter: number;
  /** Test/tutorial hook: next die results. */
  forcedRolls: number[];
  /** Roaming dungeon monsters (absent in matches saved before they existed). */
  monsters?: MonsterState[];
  /** Last round whose monster event has resolved (each round's event resolves exactly once). */
  monsterRound?: number;
  /** Golem shortcuts unlocked per encounter space: the kingdoms (player ids) that beat it and may use it freely. */
  shortcutsOpen?: Record<string, string[]>;
  /**
   * Monotonic id of the last resolved event batch (`lastEvents`). Clients play sounds, effects and
   * notices only for a batch id they have not handled yet, so polls, retries and reconnects never
   * replay an old attack.
   */
  eventSeq?: number;
  /** [Prototype] Open Golem battle: a short Strike/Guard fight inside the current turn. */
  battle?: BattleState | null;
  /** [Prototype] Dungeon rewards already claimed, per reward id: the kingdoms (player ids) that claimed it. */
  rewardsClaimed?: Record<string, string[]>;
}

/** [Prototype] The monster's announced next move. */
export type BattleIntent = 'light' | 'heavy';

/** [Prototype] A Strike/Guard battle against a dungeon monster, resolved within one turn. */
export interface BattleState {
  id: number;
  monster: MonsterId;
  characterId: string;
  playerId: string;
  /** Where the fight happens (the monster's space). */
  node: string;
  monsterHp: number;
  /** The visiting piece's temporary stamina (restored when the battle ends). */
  stamina: number;
  /** What the monster will do after the player's next choice. */
  intent: BattleIntent;
  /** Exchanges fought so far. */
  exchange: number;
  /** The last Guard read a heavy attack: the next Strike that hits deals 2. */
  exposed: boolean;
}

export type GameAction =
  | { type: 'release' }
  | { type: 'roll' }
  /**
   * The full route, starting at the character's current location. `attack` (Knight only): the 2–3
   * rivals on this route the player chose for a route attack; omit for a normal move.
   */
  | { type: 'move'; characterId: string; path: string[]; attack?: string[]; discardCardId?: string | null }
  /** [A2] Free actions: they never use the Move or the Adventure action. */
  | { type: 'royalGuard'; targetId: string }
  | { type: 'alchemy'; characterId: string; gemId: string; to: GemKind }
  | { type: 'offerTrade'; to: string; give: GemKind; want: TradeWant }
  /** Off-turn: the recipient answers. `cardId` picks which copy to hand over for a card request. */
  | { type: 'respondTrade'; offerId: string; accept: boolean; cardId?: string }
  | { type: 'cancelTrade'; offerId: string }
  | { type: 'skipMove' }
  | { type: 'skipAdventure' }
  | { type: 'enterDungeon'; characterId: string }
  | { type: 'leaveDungeon'; characterId: string }
  /** Dig at a discovery site (or take a gem in the Crystal Shrine; `gem` picks the kind there). */
  | { type: 'dig'; characterId: string; gem?: GemKind; discardCardId?: string | null }
  | { type: 'fightMonster'; characterId: string }
  /** [Prototype] Golem battle: one exchange (Strike or Guard), or Retreat before an exchange. */
  | { type: 'battle'; choice: 'strike' | 'guard' | 'retreat' }
  /** Use a dungeon room's perk: search the Fallen Ruins (map card) or attune at the Crystal Niche (+2 next move). */
  | { type: 'explore'; characterId: string }
  | { type: 'tame'; characterId: string }
  /** `targetId` a rival piece, or `monster` a dungeon monster in range. */
  | { type: 'dragonFire'; targetId?: string; monster?: MonsterId }
  /** Adventure action: strike a monster within `monsterAttackRange` steps. */
  | { type: 'attackMonster'; characterId: string; monster: MonsterId }
  | { type: 'sail'; characterId: string }
  /** `fuelCardId`: the card burned as fuel (default: the first card in hand). */
  | { type: 'fly'; characterId: string; to: string; fuelCardId?: string }
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
  /** [A2] Open offers, redacted for this viewer. */
  trades: TradeView[];
  monsters?: MonsterState[];
  monsterRound?: number;
  shortcutsOpen?: Record<string, string[]>;
  eventSeq?: number;
  battle?: BattleState | null;
  rewardsClaimed?: Record<string, string[]>;
}

/** The parts of state shared by GameState and PlayerView (what rule queries need). */
export type BoardState = Pick<
  GameState,
  'boardId' | 'config' | 'players' | 'characters' | 'gems' | 'dragon' | 'bridges' | 'transforms' | 'blocks' | 'vehicles' | 'turn' | 'status'
> &
  Partial<Pick<GameState, 'monsters' | 'monsterRound' | 'shortcutsOpen' | 'battle' | 'rewardsClaimed'>>;
