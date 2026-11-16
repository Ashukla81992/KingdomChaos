import { CIRCUIT_LENGTH, getBoard, other } from './board';
import { HAZARD_ROLL_MAX } from './crownLayout';
import { edgeOpen, nodeName } from './graph';
import { randomInt, shuffle } from './rng';
import {
  GEM_KINDS,
  type BoardState,
  type CardCategory,
  type CardType,
  type Character,
  type EdgeDef,
  type Gem,
  type GemKind,
  type GameEvent,
  type GameState,
  type HouseInfo,
  type LogKind,
  type MatchResult,
  type PlayerState,
  type TeleportReason,
} from './types';

export interface Ctx {
  state: GameState;
  events: GameEvent[];
  now: number;
}

const MAX_LOG = 60;

export function log(ctx: Ctx, text: string, kind: LogKind = 'info', playerId?: string) {
  const s = ctx.state;
  s.log.push({ id: ++s.logCounter, text, kind, playerId });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

export const playerName = (s: Pick<GameState, 'players'>, id: string) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
export const playerOf = (s: Pick<BoardState, 'players'>, id: string) => s.players.find((p) => p.id === id)!;

export const CHAR_NAMES = { king: 'King', queen: 'Queen', witch: 'Witch', knight: 'Knight' } as const;

export function charLabel(s: Pick<GameState, 'players' | 'characters'>, id: string) {
  const c = s.characters[id];
  return c ? `${playerName(s, c.owner)}'s ${CHAR_NAMES[c.kind]}` : 'a character';
}

export function roll(s: GameState): number {
  return s.forcedRolls.length ? s.forcedRolls.shift()! : randomInt(s, s.config.dieSides) + 1;
}

export function houseOf(s: Pick<BoardState, 'boardId' | 'players'>, playerId: string): HouseInfo {
  return getBoard(s.boardId).houseBySeat[playerOf(s, playerId).seat];
}

// ---------------------------------------------------------------- cards

export const CARD_CATEGORY: Record<CardType, CardCategory> = {
  build_bridge: 'map',
  collapse_bridge: 'map',
  dig_tunnel: 'map',
  build_road: 'map',
  raise_mountain: 'map',
  create_river: 'map',
  landslide: 'map',
  repair: 'map',
  shield: 'power',
  magic_boots: 'power',
  immunity: 'power',
  dragon_slayer: 'power',
  dragon_feast: 'power',
  swap: 'special',
  slow_down: 'special',
  dragon_roar: 'special',
  rescue: 'special',
  reveal_discovery: 'special',
};

export type DrawResult = 'drawn' | 'declined' | 'empty';

/**
 * Draw one card (of a category when asked, else the top card). Reshuffles the discard pile when the
 * deck runs out. With a full hand the player either discards `discardCardId` to keep the new card,
 * or declines it (it goes face down to the discard pile).
 */
export function drawCard(ctx: Ctx, playerId: string, opts: { category?: CardCategory; discardCardId?: string | null } = {}): DrawResult {
  const s = ctx.state;
  if (!s.deck.length && s.discard.length) {
    s.deck = shuffle(s, s.discard);
    s.discard = [];
    log(ctx, 'The discard pile was shuffled into a new deck.', 'system');
  }
  let idx = opts.category ? s.deck.findIndex((c) => CARD_CATEGORY[c.type] === opts.category) : 0;
  if (idx < 0) idx = 0;
  const card = s.deck[idx];
  if (!card) {
    log(ctx, 'The deck is empty — no card drawn.', 'system');
    return 'empty';
  }
  s.deck.splice(idx, 1);
  const hand = s.hands[playerId];
  if (hand.length >= s.config.handLimit) {
    const di = opts.discardCardId ? hand.findIndex((c) => c.id === opts.discardCardId) : -1;
    if (di < 0) {
      s.discard.push(card);
      log(ctx, `${playerName(s, playerId)}'s hand is full — they decline the new card.`, 'info', playerId);
      return 'declined';
    }
    s.discard.push(hand.splice(di, 1)[0]);
    log(ctx, `${playerName(s, playerId)} discards a card to make room.`, 'info', playerId);
  }
  hand.push(card);
  ctx.events.push({ type: 'cardDrawn', playerId });
  return 'drawn';
}

// ---------------------------------------------------------------- dragon

export function dragonNode(s: Pick<BoardState, 'dragon' | 'characters'>): string {
  const d = s.dragon;
  return d.state === 'companion' && d.companion ? s.characters[d.companion].node : d.node;
}

/** Wild and guarding dragons can share a space with characters but nobody can walk past them. */
export const dragonBlocks = (s: Pick<BoardState, 'dragon'>) => s.dragon.state === 'wild' || s.dragon.state === 'guarding';

export function companionOf(s: Pick<BoardState, 'dragon' | 'characters'>, playerId: string): Character | null {
  const id = s.dragon.state === 'companion' ? s.dragon.companion : null;
  const c = id ? s.characters[id] : null;
  return c && c.owner === playerId ? c : null;
}

export const isCompanion = (s: Pick<BoardState, 'dragon'>, characterId: string) => s.dragon.state === 'companion' && s.dragon.companion === characterId;

// ---------------------------------------------------------------- gems and the final path

export const GEM_NAMES: Record<GemKind, string> = { ruby: 'Ruby', sapphire: 'Sapphire', emerald: 'Emerald', diamond: 'Diamond' };

/** "a Ruby", "an Emerald". */
export const aGem = (kind: GemKind) => `${kind === 'emerald' ? 'an' : 'a'} ${GEM_NAMES[kind]}`;

export function gemsOf(s: Pick<BoardState, 'gems'>, ch: Pick<Character, 'carrying'>): Gem[] {
  return ch.carrying.map((id) => s.gems.find((g) => g.id === id)).filter((g): g is Gem => !!g);
}

export const handsFree = (s: Pick<BoardState, 'config'>, ch: Pick<Character, 'carrying'>) => ch.carrying.length < Math.max(1, s.config.carryLimit ?? 1);

/** "a Ruby", "a Ruby and an Emerald". */
export const gemList = (kinds: GemKind[]) => kinds.map(aGem).join(' and ');

export const requiredGems = (s: Pick<BoardState, 'config'>): GemKind[] => GEM_KINDS.slice(0, Math.max(1, Math.min(4, s.config.gemsRequired)));

/** Gem kinds the player still needs to bank and that none of their characters is carrying. */
export function neededGems(s: Pick<BoardState, 'players' | 'characters' | 'gems' | 'config'>, playerId: string): GemKind[] {
  const p = playerOf(s, playerId);
  const carried = new Set(
    Object.values(s.characters)
      .filter((c) => c.owner === playerId)
      .flatMap((c) => gemsOf(s, c).map((g) => g.kind)),
  );
  return requiredGems(s).filter((k) => !p.gems.includes(k) && !carried.has(k));
}

export function cutsMade(s: Pick<GameState, 'stats'> | { stats: Record<string, { cuts: number }> }, playerId: string) {
  return s.stats[playerId]?.cuts ?? 0;
}

/** The final path opens once the required gems are banked and the required cuts made. */
export function finalUnlocked(s: Pick<BoardState, 'players' | 'config'> & { stats: Record<string, { cuts: number }> }, playerId: string) {
  const p = playerOf(s, playerId);
  return requiredGems(s).every((k) => p.gems.includes(k)) && cutsMade(s, playerId) >= s.config.cutsRequired;
}

function announceUnlock(ctx: Ctx, playerId: string, was: boolean) {
  if (was || !finalUnlocked(ctx.state, playerId)) return;
  ctx.events.push({ type: 'finalUnlocked', playerId });
  log(ctx, `${playerName(ctx.state, playerId)}'s Royal Path is open! A character that has touched all four house plates may now turn in at its fork and race to the Crown Temple.`, 'system', playerId);
}

function giveGem(ctx: Ctx, ch: Character, gem: Gem, from: string | null) {
  gem.node = null;
  gem.carriedBy = ch.id;
  ch.carrying = [...ch.carrying, gem.id];
  ctx.events.push({ type: 'pickedUp', characterId: ch.id, gem: gem.kind, from });
}

export function newGem(ctx: Ctx, ch: Character, kind: GemKind, source: string) {
  const s = ctx.state;
  const gem: Gem = { id: `gem${++s.gemCounter}`, kind, node: null, carriedBy: null };
  s.gems.push(gem);
  giveGem(ctx, ch, gem, null);
  s.stats[ch.owner].gemsPicked++;
  log(ctx, `${charLabel(s, ch.id)} picks up ${aGem(kind)} at ${source}. Carry it to the ${houseOf(s, ch.owner).name} Gate to bank it.`, 'good', ch.owner);
}

/** Free hands pick up needed gems lying on the space, then the station's gem (if still needed). */
function pickUpAt(ctx: Ctx, ch: Character) {
  const s = ctx.state;
  const node = getBoard(s.boardId).nodes[ch.node];
  while (handsFree(s, ch)) {
    const need = neededGems(s, ch.owner);
    const lying = s.gems.find((g) => g.node === ch.node && !g.carriedBy && need.includes(g.kind));
    if (!lying) break;
    giveGem(ctx, ch, lying, null);
    s.stats[ch.owner].gemsPicked++;
    log(ctx, `${charLabel(s, ch.id)} picks up the ${GEM_NAMES[lying.kind]} lying at ${node.name}.`, 'good', ch.owner);
  }
  if (handsFree(s, ch) && node.station && neededGems(s, ch.owner).includes(node.station)) newGem(ctx, ch, node.station, node.name);
}

/** Bank automatically when a carrier arrives on its own house entry. */
function bankAt(ctx: Ctx, ch: Character, discardCardId?: string | null) {
  const s = ctx.state;
  if (ch.node !== houseOf(s, ch.owner).entry) return;
  for (const gem of gemsOf(s, ch)) bankGem(ctx, ch, gem, discardCardId);
}

function bankGem(ctx: Ctx, ch: Character, gem: Gem, discardCardId?: string | null) {
  const s = ctx.state;
  const player = playerOf(s, ch.owner);
  const was = finalUnlocked(s, player.id);
  ch.carrying = ch.carrying.filter((id) => id !== gem.id);
  s.gems = s.gems.filter((g) => g.id !== gem.id);
  const duplicate = player.gems.includes(gem.kind);
  if (!duplicate) {
    player.gems.push(gem.kind);
    s.stats[player.id].gemsBanked++;
  }
  ctx.events.push({ type: 'banked', playerId: player.id, characterId: ch.id, gem: gem.kind, duplicate });
  log(
    ctx,
    duplicate
      ? `${player.name} already has ${aGem(gem.kind)}; the spare goes back to its station.`
      : `${player.name} banks ${aGem(gem.kind)} (${player.gems.length}/${requiredGems(s).length} gems).`,
    duplicate ? 'info' : 'good',
    player.id,
  );
  if (!duplicate && ch.kind === 'king') {
    if (drawCard(ctx, player.id, { discardCardId }) === 'drawn') log(ctx, `Royal Treasury: ${player.name}'s King draws a card.`, 'good', player.id);
  }
  announceUnlock(ctx, player.id, was);
}

/** Rescue: bank whatever the character carries, wherever it is. */
export function bankAtHome(ctx: Ctx, ch: Character, discardCardId?: string | null) {
  for (const gem of gemsOf(ctx.state, ch)) bankGem(ctx, ch, gem, discardCardId);
}

/** Pickup and banking on any arrival (walking, teleporting, sailing…). */
export function arrive(ctx: Ctx, ch: Character, discardCardId?: string | null) {
  bankAt(ctx, ch, discardCardId);
  pickUpAt(ctx, ch);
}

// ---------------------------------------------------------------- laps: the four house plates

export const PLATE_COUNT = 4;

/** House seats whose plates this character still has to touch. */
export const missingPlates = (ch: Pick<Character, 'plates'>) => [0, 1, 2, 3].filter((seat) => !ch.plates.includes(seat));

/**
 * Touch the plate on the character's space, if any. Plates count in any order, whether the character
 * passes over one or stops on it; a lap is complete once the same character has touched all four.
 */
export function touchPlate(ctx: Ctx, ch: Character) {
  const s = ctx.state;
  const seat = getBoard(s.boardId).nodes[ch.node]?.plate;
  if (seat === undefined || ch.plates.includes(seat)) return;
  ch.plates = [...ch.plates, seat];
  ch.lap = ch.plates.length;
  ctx.events.push({ type: 'lap', characterId: ch.id, checkpoint: ch.lap, plate: seat });
  const house = getBoard(s.boardId).board.houses.find((h) => h.seat === seat)!;
  if (ch.lap < PLATE_COUNT) log(ctx, `${charLabel(s, ch.id)} visited the ${house.name} plate (${ch.lap} of ${PLATE_COUNT}).`, 'info', ch.owner);
  else {
    s.stats[ch.owner].laps++;
    log(
      ctx,
      `${charLabel(s, ch.id)} has touched all four house plates — lap complete!${finalUnlocked(s, ch.owner) ? ' Turn in at the fork for the Royal Path.' : ' The Royal Path opens once all gems are banked and a cut is made.'}`,
      'good',
      ch.owner,
    );
  }
}

/** Back to the castle: this character's plate progress starts over. */
export function resetLap(ch: Character) {
  ch.plates = [];
  ch.lap = 0;
}

// ---------------------------------------------------------------- occupancy helpers

export const isSafe = (boardId: string, node: string) => !!getBoard(boardId).nodes[node]?.safe;

export function othersAt(s: Pick<BoardState, 'characters'>, node: string, exceptId?: string) {
  return Object.values(s.characters).filter((c) => c.node === node && c.id !== exceptId);
}

export function opponentsAt(s: Pick<BoardState, 'characters'>, node: string, playerId: string) {
  return Object.values(s.characters).filter((c) => c.node === node && c.owner !== playerId);
}

export const isProtected = (c: Pick<Character, 'shield' | 'immune'>) => c.shield || c.immune;

/** Can `ch` be put on `node` without a move (vehicles, leaving the dungeon)? Needs a safe or empty space. */
export function canArrive(s: Pick<BoardState, 'boardId' | 'characters'>, node: string, characterId: string) {
  return isSafe(s.boardId, node) || othersAt(s, node, characterId).length === 0;
}

/** Teleport destinations step back along the circuit until they reach a safe or empty space. */
export function settle(s: GameState, node: string, characterId: string): string {
  const { nodes, board } = getBoard(s.boardId);
  let cur = node;
  for (let guard = 0; guard < CIRCUIT_LENGTH && !canArrive(s, cur, characterId); guard++) {
    const idx = nodes[cur].circuit;
    if (idx === undefined) break;
    cur = board.circuit[(idx - 1 + CIRCUIT_LENGTH) % CIRCUIT_LENGTH];
  }
  return cur;
}

/**
 * Move a character without walking. Plates between the two spaces do not count; a plate at the
 * destination does. Plate progress is kept (only going home resets it).
 */
export function relocate(ctx: Ctx, ch: Character, to: string, reason: TeleportReason, name?: string, discardCardId?: string | null) {
  const s = ctx.state;
  const from = ch.node;
  const { nodes } = getBoard(s.boardId);
  if (nodes[from].map !== nodes[to].map) ch.beatMonster = false;
  ch.node = to;
  ctx.events.push({ type: 'teleported', characterId: ch.id, from, to, reason, name });
  if (reason === 'trap' || reason === 'hazard') s.stats[ch.owner].traps++;
  if (reason === 'shortcut') s.stats[ch.owner].shortcuts++;
  if (nodes[to].type === 'castle') resetLap(ch);
  else touchPlate(ctx, ch);
  arrive(ctx, ch, discardCardId);
}

/** Send a character home: plate progress resets, the gem stays where it fell (or is handed over by the caller). */
export function sendHome(ctx: Ctx, ch: Character) {
  const s = ctx.state;
  if (isCompanion(s, ch.id)) {
    s.dragon = { ...s.dragon, state: 'wild', companion: null, node: ch.node, releasedBy: null };
    log(ctx, `The dragon breaks free and runs wild at ${nodeName(s.boardId, ch.node)}!`, 'dragon');
  }
  ch.node = playerOf(s, ch.owner).castle;
  resetLap(ch);
  ch.beatMonster = false;
  ch.shield = false;
  s.stats[ch.owner].defeated++;
}

function dropGems(ctx: Ctx, ch: Character): Gem[] {
  const gems = gemsOf(ctx.state, ch);
  for (const gem of gems) {
    gem.carriedBy = null;
    gem.node = ch.node;
  }
  ch.carrying = [];
  return gems;
}

/**
 * A movement cut: the victim goes home and its lap resets. The attacker takes the victim's gems
 * while its hands are free; the rest drop on the space.
 */
export function cutCharacter(ctx: Ctx, attackerId: string, targetId: string) {
  const s = ctx.state;
  const attacker = s.characters[attackerId];
  const target = s.characters[targetId];
  const node = target.node;
  const was = finalUnlocked(s, attacker.owner);
  const stole: GemKind[] = [];
  const dropped: GemKind[] = [];
  for (const gem of dropGems(ctx, target)) {
    if (handsFree(s, attacker)) {
      giveGem(ctx, attacker, gem, targetId);
      stole.push(gem.kind);
    } else dropped.push(gem.kind);
  }
  sendHome(ctx, target);
  s.stats[attacker.owner].cuts++;
  ctx.events.push({ type: 'cut', characterId: attackerId, targetId, node, stole, dropped });
  ctx.events.push({ type: 'defeated', characterId: targetId, by: attackerId, cause: 'cut' });
  log(
    ctx,
    `${charLabel(s, attackerId)} cuts ${charLabel(s, targetId)} at ${nodeName(s.boardId, node)}! They return home.${stole.length ? ` ${CHAR_NAMES[attacker.kind]} takes ${gemList(stole)}.` : ''}${dropped.length ? ` ${gemList(dropped)} ${dropped.length > 1 ? 'drop' : 'drops'} on the road.` : ''}`,
    'bad',
    attacker.owner,
  );
  announceUnlock(ctx, attacker.owner, was);
}

/** Dragon Fire: not a cut. The gem drops where the target stood and it goes home. */
export function burn(ctx: Ctx, attackerId: string, targetId: string) {
  const s = ctx.state;
  const target = s.characters[targetId];
  const node = target.node;
  const gems = dropGems(ctx, target);
  sendHome(ctx, target);
  ctx.events.push({ type: 'defeated', characterId: targetId, by: attackerId, cause: 'fire' });
  log(ctx, `${charLabel(s, targetId)} is scorched at ${nodeName(s.boardId, node)} and flees home.${gems.length ? ` ${gemList(gems.map((g) => g.kind))} ${gems.length > 1 ? 'drop' : 'drops'} there.` : ''}`, 'bad', target.owner);
}

/** Nearest space along open roads that passes `ok` (castles, Royal Paths and the temple excluded). */
function nearestWhere(s: GameState, from: string, ok: (node: string) => boolean): string | null {
  const { nodes, adj } = getBoard(s.boardId);
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const ed of adj[cur]) {
      const nx = other(ed, cur);
      if (seen.has(nx) || !edgeOpen(s, ed) || nodes[nx].type === 'castle' || nodes[nx].lane === 'final' || nodes[nx].lane === 'temple') continue;
      if (ok(nx)) return nx;
      seen.add(nx);
      queue.push(nx);
    }
  }
  return null;
}

/** Retreat after a failed tame, slay or monster fight: the nearest safe space (dungeon: safe room). */
export function retreat(ctx: Ctx, ch: Character) {
  const s = ctx.state;
  const { nodes } = getBoard(s.boardId);
  const to = nearestWhere(s, ch.node, (n) => !!nodes[n].safe) ?? playerOf(s, ch.owner).castle;
  log(ctx, `${charLabel(s, ch.id)} retreats to ${nodeName(s.boardId, to)}.`, 'bad', ch.owner);
  relocate(ctx, ch, to, 'retreat');
}

// ---------------------------------------------------------------- movement

export interface MoveOption {
  /** Full route starting at the character's space. */
  path: string[];
  cost: number;
  /** The Witch used her free portal hop (path contains a portal pair with no edge). */
  witchPortal: boolean;
  /** Where the Knight cuts while passing. */
  knightCut: string | null;
  /** Opponents cut on landing. */
  landingCuts: string[];
  entersFinal: boolean;
}

export interface MoveRules {
  steps: number;
  /** Island moves must use every step. Dungeon moves may stop early. */
  allowCuts: boolean;
  portals: boolean;
}

/** Explains why the next step from `node` is not allowed, for the move planner. */
export type StepBlock = 'closed' | 'opponentCastle' | 'finalLocked' | 'notYourFinal' | 'dragon' | 'opponent' | 'protected' | 'friend' | 'visited';

/**
 * Every legal route for one character. Island routes use the whole roll on one-way roads (side
 * routes run both ways); dungeon routes may stop early. Opponents on unsafe spaces block passing,
 * except for the Queen (passes without cutting) and the Knight (cuts one he passes). Wild and
 * guarding dragons stop movement on their space. A landing is illegal on a friendly piece on an
 * unsafe space, on a protected opponent, and (without cuts) on any opponent on an unsafe space.
 */
export function enumerateMoves(s: BoardState, characterId: string, rules: MoveRules): MoveOption[] {
  const { out, nodes } = getBoard(s.boardId);
  const ch = s.characters[characterId];
  const house = houseOf(s, ch.owner);
  const unlocked = finalUnlocked(s as BoardState & { stats: Record<string, { cuts: number }> }, ch.owner);
  const dNode = dragonBlocks(s) ? s.dragon.node : null;
  const freeHop = rules.portals && ch.kind === 'witch' && !s.turn.witchPortalUsed && !isCompanion(s, ch.id);
  const dungeon = nodes[ch.node].map === 'dungeon';
  const result = new Map<string, MoveOption>();
  const visited = new Set<string>([ch.node]);
  const exactTemple = s.config.exactTemple;

  const landing = (node: string): { ok: boolean; cuts: string[] } => {
    if (nodes[node].safe) return { ok: true, cuts: [] };
    const here = othersAt(s, node, ch.id);
    if (here.some((c) => c.owner === ch.owner)) return { ok: false, cuts: [] };
    const opp = here.filter((c) => c.owner !== ch.owner);
    if (!opp.length) return { ok: true, cuts: [] };
    if (!rules.allowCuts || opp.some(isProtected)) return { ok: false, cuts: [] };
    return { ok: true, cuts: opp.map((c) => c.id) };
  };

  const record = (path: string[], cost: number, hop: boolean, knightCut: string | null, entersFinal: boolean) => {
    const end = path[path.length - 1];
    const land = landing(end);
    if (!land.ok) return;
    const key = path.join('>');
    if (!result.has(key)) result.set(key, { path, cost, witchPortal: hop, knightCut, landingCuts: land.cuts, entersFinal });
  };

  const dfs = (node: string, left: number, path: string[], hop: boolean, knightCut: string | null, entersFinal: boolean) => {
    const cost = rules.steps - left;
    if (left === 0 || (dungeon && cost > 0)) record(path, cost, hop, knightCut, entersFinal);
    if (node === 'temple' && left > 0 && !exactTemple) record(path, cost, hop, knightCut, entersFinal);
    if (path.length > 1 && node === dNode) return;
    const nexts: { to: string; cost: number; hop: boolean }[] = [];
    for (const ed of left > 0 ? out[node] : []) {
      if (!edgeOpen(s, ed)) continue;
      const to = other(ed, node);
      const target = nodes[to];
      if (target.type === 'castle') continue;
      if (ed.guard && ed.guard.from === node && !ch.beatMonster && playerOf(s, ch.owner).keys <= 0) continue;
      if (target.lane === 'final' && nodes[node].lane !== 'final') {
        if (target.house !== house.seat || ch.lap < 4 || !unlocked) continue;
      }
      nexts.push({ to, cost: 1, hop: false });
    }
    const portal = nodes[node].portal;
    if (freeHop && !hop && portal) nexts.push({ to: portal, cost: 0, hop: true });
    for (const n of nexts) {
      if (visited.has(n.to)) continue;
      const nextLeft = left - n.cost;
      // Can we continue past `n.to`? Checked when we arrive and still have steps (below).
      let kc = knightCut;
      if (nextLeft > 0 && !nodes[n.to].safe) {
        const opp = opponentsAt(s, n.to, ch.owner);
        if (opp.length) {
          if (ch.kind === 'queen') {
            /* passes freely */
          } else if (ch.kind === 'knight' && rules.allowCuts && !kc && !opp.some(isProtected)) kc = n.to;
          else {
            if (dungeon) record([...path, n.to], cost + n.cost, hop || n.hop, kc, entersFinal);
            continue;
          }
        }
      }
      visited.add(n.to);
      dfs(n.to, nextLeft, [...path, n.to], hop || n.hop, kc, entersFinal || (nodes[n.to].lane === 'final' && nodes[node].lane !== 'final'));
      visited.delete(n.to);
    }
  };
  dfs(ch.node, rules.steps, [ch.node], false, null, false);

  // In the dungeon a route may end on a blocked space early; dfs already records every prefix.
  return [...result.values()];
}

/**
 * Walk a validated route: checkpoints, pickups and banking on every step; the Knight's pass cut;
 * landing cuts; then a trap or shortcut on the final space; then the temple.
 */
export function walk(ctx: Ctx, ch: Character, option: MoveOption, discardCardId?: string | null) {
  const s = ctx.state;
  const { nodes } = getBoard(s.boardId);
  for (let i = 1; i < option.path.length; i++) {
    const prev = option.path[i - 1];
    const node = option.path[i];
    const isHop = nodes[prev].portal === node && !getBoard(s.boardId).out[prev].some((e) => other(e, prev) === node);
    const guarded = getBoard(s.boardId).out[prev].find((e) => other(e, prev) === node && e.guard?.from === prev);
    if (guarded && !ch.beatMonster) {
      playerOf(s, ch.owner).keys--;
      log(ctx, `${charLabel(s, ch.id)} unlocks the ${guarded.name ?? 'door'} with a dungeon key.`, 'info', ch.owner);
    }
    ch.node = node;
    if (isHop) ctx.events.push({ type: 'teleported', characterId: ch.id, from: prev, to: node, reason: 'portal', name: nodes[prev].name });
    else touchPlate(ctx, ch);
    if (option.knightCut === node) for (const o of opponentsAt(s, node, ch.owner)) cutCharacter(ctx, ch.id, o.id);
    if (option.entersFinal && nodes[node].lane === 'final' && nodes[prev].lane !== 'final') {
      ctx.events.push({ type: 'enteredFinal', characterId: ch.id });
      log(ctx, `${charLabel(s, ch.id)} turns onto the Royal Path!`, 'good', ch.owner);
    }
    arrive(ctx, ch, discardCardId);
  }
  for (const id of option.landingCuts) cutCharacter(ctx, ch.id, id);
  pickUpAt(ctx, ch);
  if (nodes[ch.node].hazard) springHazard(ctx, ch, discardCardId);
  const tp = nodes[ch.node].teleport;
  if (tp) {
    const dest = settle(s, tp.to, ch.id);
    log(ctx, `${tp.name}! ${tp.text}`, tp.type === 'trap' ? 'bad' : 'good', ch.owner);
    relocate(ctx, ch, dest, tp.type, tp.name, discardCardId);
  }
  if (ch.node === getBoard(s.boardId).board.temple && s.status === 'playing') {
    log(ctx, `${charLabel(s, ch.id)} reaches the Crown Temple!`, 'system', ch.owner);
    finishGame(ctx, 'temple', [ch.owner]);
  }
}

/** The nearest main-road space, for snares and buried traps off the coast road. */
function nearestMainRoad(s: GameState, ch: Character): string {
  const { nodes } = getBoard(s.boardId);
  if (nodes[ch.node].circuit !== undefined) return ch.node;
  return nearestWhere(s, ch.node, (n) => nodes[n].circuit !== undefined) ?? houseOf(s, ch.owner).entry;
}

/**
 * Trap risk: a character that stops on a marked stone rolls the die. On 1–HAZARD_ROLL_MAX a hidden
 * snare drags it back to the main road where the trail began (plates and gems are kept).
 */
function springHazard(ctx: Ctx, ch: Character, discardCardId?: string | null) {
  const s = ctx.state;
  const node = ch.node;
  const value = roll(s);
  const sprung = value <= HAZARD_ROLL_MAX;
  ctx.events.push({ type: 'hazard', characterId: ch.id, node, roll: value, sprung });
  const name = nodeName(s.boardId, node);
  if (!sprung) {
    log(ctx, `${charLabel(s, ch.id)} rolls ${value} and slips past the ${name}.`, 'info', ch.owner);
    return;
  }
  const to = settle(s, nearestMainRoad(s, ch), ch.id);
  log(ctx, `${charLabel(s, ch.id)} rolls ${value} — the ${name} springs and drags them back to ${nodeName(s.boardId, to)}.`, 'bad', ch.owner);
  relocate(ctx, ch, to, 'hazard', name, discardCardId);
}

/** "Camp Road (unbuilt)" reads as "Camp Road" once it is being opened. */
export const structureName = (e: Pick<EdgeDef, 'name'>) => (e.name ?? 'road').replace(/ \(unbuilt\)$/, '');

/** Closed structure gates, nearest to `from` first (by straight-line distance on the painting). */
export function closedGatesNear(s: Pick<BoardState, 'boardId' | 'bridges'>, from: string): { gate: string; edgeId: string }[] {
  const { nodes, board } = getBoard(s.boardId);
  const at = nodes[from].xy;
  const seen = new Map<string, { gate: string; edgeId: string; d: number }>();
  for (const e of board.edges) {
    if (e.kind !== 'buildable' || !e.gate || s.bridges[e.gate]) continue;
    const mid = e.route[Math.floor(e.route.length / 2)];
    const d = nodes[from].map === nodes[e.a].map ? Math.hypot(mid[0] - at[0], mid[1] - at[1]) : 1e6;
    const cur = seen.get(e.gate);
    if (!cur || d < cur.d) seen.set(e.gate, { gate: e.gate, edgeId: e.id, d });
  }
  return [...seen.values()].sort((a, b) => a.d - b.d).map(({ gate, edgeId }) => ({ gate, edgeId }));
}

// ---------------------------------------------------------------- discoveries

export function drawDiscovery(ctx: Ctx, ch: Character, discardCardId?: string | null) {
  const s = ctx.state;
  const { nodes, board } = getBoard(s.boardId);
  if (!s.discoveries.length && s.discoveryDiscard.length) {
    s.discoveries = shuffle(s, s.discoveryDiscard);
    s.discoveryDiscard = [];
  }
  const d = s.discoveries.shift();
  if (!d) {
    log(ctx, 'Nothing left to discover.', 'info', ch.owner);
    return;
  }
  s.discoveryDiscard.push(d);
  s.stats[ch.owner].discoveries++;
  ctx.events.push({ type: 'discovery', characterId: ch.id, found: d.type, gem: d.gem });
  const who = charLabel(s, ch.id);
  switch (d.type) {
    case 'gem': {
      const kind = d.gem!;
      if (handsFree(s, ch) && neededGems(s, ch.owner).includes(kind)) newGem(ctx, ch, kind, 'the dig');
      else log(ctx, `${who} unearths ${aGem(kind)} but cannot use it, so it is reburied.`, 'info', ch.owner);
      break;
    }
    case 'map_card':
    case 'power_card':
    case 'special_card': {
      const category = d.type.replace('_card', '') as CardCategory;
      log(ctx, `${who} finds a hidden ${category} card.`, 'good', ch.owner);
      drawCard(ctx, ch.owner, { category, discardCardId });
      break;
    }
    case 'key':
      playerOf(s, ch.owner).keys++;
      log(ctx, `${who} finds a dungeon key! It opens the Vault Door once.`, 'good', ch.owner);
      break;
    case 'trap': {
      log(ctx, `${who} triggers a buried trap!`, 'bad', ch.owner);
      let to = 'd-entrance';
      if (nodes[ch.node].map === 'island') {
        const road = nodes[nearestMainRoad(s, ch)].circuit!;
        to = settle(s, board.circuit[(road - s.config.discoveryTrapSteps + CIRCUIT_LENGTH) % CIRCUIT_LENGTH], ch.id);
      }
      relocate(ctx, ch, to, 'discovery', 'Buried trap');
      break;
    }
    case 'route': {
      const gate = closedGatesNear(s, ch.node)[0];
      if (!gate) {
        log(ctx, `${who} finds an old map of roads that are already open, and trades it for a map card.`, 'good', ch.owner);
        drawCard(ctx, ch.owner, { category: 'map', discardCardId });
        break;
      }
      s.bridges[gate.gate] = true;
      ctx.events.push({ type: 'edgeChanged', edgeId: gate.edgeId });
      log(ctx, `${who} uncovers a hidden way: the ${structureName(getBoard(s.boardId).edges[gate.edgeId])} is open — for every house.`, 'good', ch.owner);
      break;
    }
  }
}

// ---------------------------------------------------------------- victory

export function carriedGems(s: Pick<GameState, 'characters'>, playerId: string) {
  return Object.values(s.characters).reduce((n, c) => n + (c.owner === playerId ? c.carrying.length : 0), 0);
}

/** Most gems banked; tie → a cut made; tie → shared victory. */
export function rankWinners(s: GameState): { winners: string[]; tieBreak: MatchResult['tieBreak'] } {
  let pool: PlayerState[] = s.players;
  const top = (vals: (id: string) => number) => {
    const best = Math.max(...pool.map((p) => vals(p.id)));
    pool = pool.filter((p) => vals(p.id) === best);
  };
  top((id) => playerOf(s, id).gems.length);
  if (pool.length === 1) return { winners: [pool[0].id], tieBreak: null };
  top((id) => Number(cutsMade(s, id) > 0));
  if (pool.length === 1) return { winners: [pool[0].id], tieBreak: 'cut' };
  return { winners: pool.map((p) => p.id), tieBreak: 'shared' };
}

export function finishGame(ctx: Ctx, reason: MatchResult['reason'], forced?: string[]) {
  const s = ctx.state;
  const ranked = forced ? { winners: forced, tieBreak: null } : rankWinners(s);
  s.status = 'finished';
  s.turn.deadline = null;
  s.result = {
    winners: ranked.winners,
    reason,
    tieBreak: ranked.tieBreak,
    durationMs: ctx.now - s.startedAt,
    turns: s.turn.number,
    rounds: s.turn.round,
    finalGems: Object.fromEntries(s.players.map((p) => [p.id, p.gems.length])),
  };
  ctx.events.push({ type: 'gameOver', winners: ranked.winners });
  const names = ranked.winners.map((id) => playerName(s, id)).join(' & ');
  log(ctx, ranked.winners.length > 1 ? `Shared victory: ${names}!` : `${names} wins Kingdom Chaos: Crown Quest!`, 'system');
}
