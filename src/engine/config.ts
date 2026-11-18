import type { CardType, DiscoveryType, GemKind } from './types';

/** Every balance number lives here so playtests can tune without touching rules code. */
export interface GameConfig {
  /** Different gem kinds a player must bank (1–4; the first N of Ruby, Sapphire, Emerald, Diamond). */
  gemsRequired: number;
  /** Movement cuts a player must make before their final path opens. */
  cutsRequired: number;
  /** A character must land exactly on the Crown Temple (overshooting moves are not allowed). */
  exactTemple: boolean;
  dieSides: number;
  /** Characters with a dragon companion move max(min, roll - penalty). */
  dragonMovePenalty: number;
  dragonMinMove: number;
  /** Tame succeeds on this roll or higher. Dragon Feast lowers it. */
  tameThreshold: number;
  feastTameThreshold: number;
  /** Dragon Slayer succeeds on this roll or higher. */
  slayThreshold: number;
  /** Monster defeated on this total or higher. */
  monsterThreshold: number;
  dragonFireRange: number;
  /** Dragon Fire (an Adventure action) rolls its own attack die: this or more hits. */
  dragonFireHit: number;
  knightBonus: number;
  slowDownMaxSteps: number;
  magicBootsSteps: number;
  handLimit: number;
  /** Gems one character can carry at once. */
  carryLimit: number;
  /** 0 disables the match clock. */
  matchDurationMs: number;
  /** 0 disables the turn clock. */
  turnDurationMs: number;
  /** Physical-prototype style round limit. 0 disables it. */
  roundLimit: number;
  /** AI think time between actions. */
  aiActionDelayMs: number;
  /** A disconnected player's turn is auto-resolved after this long. */
  disconnectedTurnMs: number;
  deck: Record<CardType, number>;
  /** Discovery deck: how many of each find (gems name their kind). */
  discoveries: Partial<Record<Exclude<DiscoveryType, 'gem'>, number>> & { gems: Partial<Record<GemKind, number>> };
  /** Spaces a discovered trap sends a character back along the road. */
  discoveryTrapSteps: number;
  /** A natural roll of this value earns one bonus roll (0 disables). */
  extraTurnRoll: number;
  /** At least one movement capture during a move earns one bonus roll. */
  extraTurnOnCut: boolean;
  /** [A1] Knight route attack: how many rivals the player must choose (inclusive). */
  knightAttackMin: number;
  knightAttackMax: number;
  /** [A1] Pieces a kingdom must get into the Crown Temple to win. */
  finishersToWin: number;
  /** [A2] Royal Guard uses per match. */
  royalGuardPerMatch: number;
  /** [A3] Stone Golem and Cave Spider succeed on this roll or higher (Knight adds `knightBonus`). */
  encounterThreshold: number;
  /** Roaming dungeon monsters (Stone Golem, Cave Spider) act once after every full round. False turns them off. */
  monsterEvents: boolean;
  /** Connected steps a monster reaches, inside the dungeon or out along the Dragon Gate road. */
  monsterRange: number;
  /** Round event die: this or lower and nothing attacks. */
  monsterQuietMax: number;
  /** Round event die: exactly this and a monster climbs out to the Dragon Gate road; between the two, it attacks inside. */
  monsterOutsideRoll: number;
  /** Spaces the Stone Golem pushes its target back. */
  golemPush: number;
  /** Cave Spider web: the webbed piece's next movement allowance is reduced by this (minimum 1). */
  webPenalty: number;
  /** A beaten encounter monster rests for this many full rounds after the round it was beaten in. */
  monsterRestRounds: number;
}

export const DEFAULT_DECK: Record<CardType, number> = {
  build_bridge: 2,
  collapse_bridge: 1,
  dig_tunnel: 2,
  build_road: 2,
  raise_mountain: 1,
  create_river: 1,
  landslide: 2,
  repair: 2,
  shield: 3,
  magic_boots: 3,
  immunity: 2,
  dragon_slayer: 2,
  dragon_feast: 2,
  swap: 2,
  slow_down: 2,
  dragon_roar: 2,
  rescue: 2,
  reveal_discovery: 2,
};

export const DEFAULT_CONFIG: GameConfig = {
  gemsRequired: 4,
  cutsRequired: 1,
  exactTemple: true,
  dieSides: 6,
  dragonMovePenalty: 2,
  dragonMinMove: 1,
  tameThreshold: 5,
  feastTameThreshold: 3,
  slayThreshold: 4,
  monsterThreshold: 4,
  dragonFireRange: 3,
  dragonFireHit: 4,
  knightBonus: 1,
  slowDownMaxSteps: 2,
  magicBootsSteps: 2,
  handLimit: 4,
  carryLimit: 2,
  matchDurationMs: 15 * 60_000,
  turnDurationMs: 45_000,
  roundLimit: 0,
  aiActionDelayMs: 900,
  disconnectedTurnMs: 10_000,
  deck: DEFAULT_DECK,
  discoveries: { gems: { ruby: 1, sapphire: 1, emerald: 1, diamond: 1 }, map_card: 2, power_card: 2, special_card: 2, key: 2, trap: 2, route: 3 },
  discoveryTrapSteps: 5,
  extraTurnRoll: 6,
  extraTurnOnCut: true,
  knightAttackMin: 2,
  knightAttackMax: 3,
  finishersToWin: 4,
  royalGuardPerMatch: 1,
  encounterThreshold: 4,
  monsterEvents: true,
  monsterRange: 3,
  monsterQuietMax: 3,
  monsterOutsideRoll: 6,
  golemPush: 2,
  webPenalty: 2,
  monsterRestRounds: 1,
};

/** Round limit used by the physical prototype (and offered digitally). */
export const PHYSICAL_ROUNDS = 12;

export type MatchPace = 'untimed' | 'clock' | 'rounds';

/** Config overrides for a chosen match length. */
export function paceConfig(pace: MatchPace): Partial<GameConfig> {
  if (pace === 'clock') return {};
  return { matchDurationMs: 0, turnDurationMs: 0, roundLimit: pace === 'rounds' ? PHYSICAL_ROUNDS : 0 };
}

export const ROOM_CONFIG = {
  minPlayers: 2,
  maxPlayers: 4,
  roomCodeLength: 5,
  maxNameLength: 16,
  lobbySeatGraceMs: 60_000,
  hostTransferGraceMs: 8_000,
  emptyRoomTtlMs: 10 * 60_000,
  actionRateLimit: 12,
};
