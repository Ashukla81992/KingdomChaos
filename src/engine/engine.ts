import { bestMove } from './ai';
import { getBoard } from './board';
import { CARDS, attemptTame, canTameHere, cardTargets, targetKey } from './cards';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { nodeName } from './graph';
import { adventureOptions, dragonFireTargets, hasAdventure, legalMoves, movableCharacters, noMoveReason } from './queries';
import { CARD_INFO } from './rulesText';
import { initialMonsters, monsterPhase } from './dungeon';
import { applyPower, clearGuards, expireTrades, OFF_TURN_ACTIONS, POWER_ACTIONS, type PowerAction } from './powers';
import {
  CARD_CATEGORY,
  handsFree,
  burn,
  canArrive,
  charLabel,
  companionOf,
  drawDiscovery,
  finishGame,
  isCompanion,
  log,
  newGem,
  neededGems,
  playerName,
  playerOf,
  relocate,
  retreat,
  roll,
  walk,
  type Ctx,
} from './rules';
import { randomInt, shuffle } from './rng';
import {
  CHARACTER_KINDS,
  GEM_KINDS,
  type ActionEnvelope,
  type ActionResult,
  type BoardDef,
  type CardInstance,
  type CardType,
  type Character,
  type Discovery,
  type DiscoveryType,
  type GameState,
  type PlayerState,
  type PlayerStats,
} from './types';

export interface NewPlayer {
  id: string;
  name: string;
  isAI?: boolean;
}

export interface CreateGameOptions {
  players: NewPlayer[];
  seed: number;
  now: number;
  config?: Partial<GameConfig>;
  boardId?: string;
  /** Index of the first player; random when omitted. */
  firstPlayer?: number;
}

function structureTokens(board: BoardDef): Record<string, boolean> {
  const gates: Record<string, boolean> = {};
  for (const ed of board.edges) if (ed.kind === 'buildable' && ed.gate && !(ed.gate in gates)) gates[ed.gate] = !!ed.startsOpen;
  return gates;
}

export const emptyStats = (): PlayerStats => ({
  turns: 0,
  timeouts: 0,
  cardsPlayed: 0,
  defeated: 0,
  gemsBanked: 0,
  gemsPicked: 0,
  cuts: 0,
  laps: 0,
  traps: 0,
  shortcuts: 0,
  vehicleTrips: 0,
  discoveries: 0,
  dungeonVisits: 0,
  tameAttempts: 0,
  tames: 0,
  dragonFires: 0,
  slayAttempts: 0,
  slays: 0,
});

export function createGame(opts: CreateGameOptions): GameState {
  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    ...opts.config,
    deck: { ...DEFAULT_CONFIG.deck, ...opts.config?.deck },
    discoveries: { ...DEFAULT_CONFIG.discoveries, ...opts.config?.discoveries },
  };
  const boardId = opts.boardId ?? 'crownquest';
  const { board } = getBoard(boardId);
  const seats = board.seatOrder[opts.players.length];
  if (!seats) throw new Error(`Unsupported player count ${opts.players.length}`);

  const players: PlayerState[] = opts.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    seat: seats[i],
    castle: board.houses[seats[i]].castle,
    isAI: !!p.isAI,
    gems: [],
    bank: { ruby: 0, sapphire: 0, emerald: 0, diamond: 0 },
    cut: false,
    royalGuardUsed: false,
    slowed: false,
    keys: 0,
  }));

  const characters: Record<string, Character> = {};
  for (const p of players) {
    for (const kind of CHARACTER_KINDS) {
      const id = `${p.id}-${kind}`;
      characters[id] = { id, owner: p.id, kind, node: p.castle, plates: [], lap: 0, carrying: [], shield: false, immune: false, beatMonster: false, finished: false, guarded: false };
    }
  }

  const state: GameState = {
    boardId,
    config,
    version: 0,
    status: 'playing',
    players,
    characters,
    gems: [],
    dragon: { state: 'guarding', node: board.dragonHome, companion: null, recoverUntilTurn: 0, releasedBy: null },
    bridges: structureTokens(board),
    transforms: {},
    blocks: [],
    vehicles: { boat: board.docks[0], plane: board.airfields[0] },
    turn: { playerId: players[0].id, number: 0, round: 0, moveDone: false, adventureDone: false, move: null, witchPortalUsed: false, acted: false, extra: null, bonus: false, rolls: 0, moved: [], diplomacyUsed: false, startedAt: opts.now, deadline: null },
    startedAt: opts.now,
    endsAt: config.matchDurationMs > 0 ? opts.now + config.matchDurationMs : null,
    result: null,
    log: [],
    lastEvents: [],
    stats: Object.fromEntries(players.map((p) => [p.id, emptyStats()])),
    hands: Object.fromEntries(players.map((p) => [p.id, [] as CardInstance[]])),
    deck: [],
    discard: [],
    discoveries: [],
    discoveryDiscard: [],
    trades: [],
    tradeCounter: 0,
    rngState: opts.seed | 0,
    logCounter: 0,
    cardCounter: 0,
    gemCounter: 0,
    forcedRolls: [],
    monsters: initialMonsters(boardId),
    monsterRound: 0,
    shortcutsOpen: {},
  };

  const deck: CardInstance[] = [];
  for (const [type, count] of Object.entries(config.deck) as [CardType, number][]) for (let i = 0; i < count; i++) deck.push({ id: `k${++state.cardCounter}`, type });
  state.deck = shuffle(state, deck);
  // Opening hands: one card from each category (never Dragon Slayer, which needs a specific setup).
  for (const p of players) {
    for (const cat of ['map', 'power', 'special'] as const) {
      const idx = state.deck.findIndex((c) => CARD_CATEGORY[c.type] === cat && c.type !== 'dragon_slayer');
      if (idx >= 0) state.hands[p.id].push(state.deck.splice(idx, 1)[0]);
    }
  }

  const finds: Discovery[] = [];
  let n = 0;
  for (const [kind, count] of Object.entries(config.discoveries.gems)) for (let i = 0; i < (count ?? 0); i++) finds.push({ id: `x${++n}`, type: 'gem', gem: kind as Discovery['gem'] });
  for (const [type, count] of Object.entries(config.discoveries)) {
    if (type === 'gems') continue;
    for (let i = 0; i < (count as number); i++) finds.push({ id: `x${++n}`, type: type as DiscoveryType });
  }
  state.discoveries = shuffle(state, finds);

  const ctx: Ctx = { state, events: [], now: opts.now };
  const first = opts.firstPlayer ?? randomInt(state, players.length);
  // Seats ascend clockwise around the island, so rotating keeps turn order clockwise.
  state.players = [...players.slice(first), ...players.slice(0, first)];
  log(ctx, `${['Two', 'Three', 'Four'][players.length - 2] ?? 'The'} houses race for the Crown. Bank four different gems, make a cut, touch all four house plates with one piece, then take your Royal Path to the Crown Temple!`, 'system');
  startTurn(ctx, state.players[0].id, false);
  state.lastEvents = ctx.events;
  return state;
}

function startTurn(ctx: Ctx, playerId: string, _bonus = false) {
  const s = ctx.state;
  const number = s.turn.number + 1;
  const round = playerId === s.players[0].id ? s.turn.round + 1 : s.turn.round;
  s.turn = {
    playerId,
    number,
    round,
    moveDone: false,
    adventureDone: false,
    move: null,
    witchPortalUsed: false,
    acted: false,
    extra: null,
    bonus: false,
    rolls: 0,
    moved: [],
    diplomacyUsed: false,
    startedAt: ctx.now,
    deadline: s.config.turnDurationMs > 0 ? ctx.now + s.config.turnDurationMs : null,
  };
  if (s.config.roundLimit > 0 && s.turn.round > s.config.roundLimit) {
    log(ctx, `Round ${s.config.roundLimit} is complete.`, 'system');
    finishGame(ctx, 'rounds');
    return;
  }
  s.stats[playerId].turns++;
  clearGuards(ctx, playerId);
  for (const c of Object.values(s.characters)) {
    if (c.owner !== playerId) continue;
    c.immune = false;
    c.shield = false;
  }
  if (s.dragon.releasedBy === playerId) s.dragon.releasedBy = null;
  if (s.dragon.state === 'recovering' && number > s.dragon.recoverUntilTurn) {
    s.dragon = { state: 'guarding', node: getBoard(s.boardId).board.dragonHome, companion: null, recoverUntilTurn: 0, releasedBy: null };
    ctx.events.push({ type: 'dragonRecovered' });
    log(ctx, 'The dragon has recovered and guards its lair again.', 'dragon');
  }
  ctx.events.push({ type: 'turnStarted', playerId, turn: number });
}

/** End the turn, or grant a same-turn bonus roll when one is pending. */
function finishTurn(ctx: Ctx) {
  const s = ctx.state;
  if (s.status !== 'playing') return;
  if (s.turn.extra) {
    log(ctx, `${playerName(s, s.turn.playerId)} takes a bonus roll.`, 'good', s.turn.playerId);
    s.turn.moveDone = false;
    s.turn.move = null;
    s.turn.bonus = true;
    s.turn.extra = null;
    return;
  }
  const prev = s.turn.playerId;
  expireTrades(ctx, prev);
  const idx = s.players.findIndex((p) => p.id === prev);
  // The last seat ends a full round (bonus rolls never reach here): the dungeon's monsters act once.
  if ((idx + 1) % s.players.length === 0) monsterPhase(ctx, s.turn.round);
  if (s.status !== 'playing') return;
  startTurn(ctx, s.players[(idx + 1) % s.players.length].id, false);
}

/** Grant at most one bonus roll for this roll (a 6 plus any number of captures is still one). */
function earnExtra(ctx: Ctx, reason: 'six' | 'capture') {
  const t = ctx.state.turn;
  if (t.extra) return;
  t.extra = reason;
  ctx.events.push({ type: 'extraTurn', playerId: t.playerId, reason });
  log(ctx, `${playerName(ctx.state, t.playerId)} earns a bonus roll (${reason === 'six' ? 'rolled a 6' : 'made a cut'}).`, 'good', t.playerId);
}

/** End the turn once both actions are used; skip an Adventure action that has no legal option. */
function autoAdvance(ctx: Ctx) {
  const s = ctx.state;
  if (s.status !== 'playing') return;
  const pid = s.turn.playerId;
  if (s.turn.moveDone && !s.turn.adventureDone && !hasAdventure(s, pid, s.hands[pid])) {
    s.turn.adventureDone = true;
    log(ctx, 'No adventure action is available.', 'info', pid);
  }
  if (s.turn.moveDone && s.turn.adventureDone) finishTurn(ctx);
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Validate and apply one player action. Never mutates the input state. */
export function applyAction(state: GameState, envelope: ActionEnvelope, now: number): ActionResult {
  if (state.status !== 'playing') return fail('The match is over.');
  if (state.endsAt !== null && now >= state.endsAt) return fail('The match timer has expired.');
  if (envelope.version !== undefined && envelope.version !== state.version) return fail('That action is out of date — the board changed. Try again.');
  const { playerId, action } = envelope;
  if (!state.players.some((p) => p.id === playerId)) return fail('You are not part of this match.');
  const offTurn = (OFF_TURN_ACTIONS as string[]).includes(action.type);
  if (state.turn.playerId !== playerId && !offTurn) return fail('It is not your turn.');

  const s = structuredClone(state);
  const ctx: Ctx = { state: s, events: [], now };
  const t = s.turn;
  const cfg = s.config;
  const { nodes, board } = getBoard(s.boardId);
  const mine = (id: string | undefined) => {
    const c = id ? s.characters[id] : undefined;
    return c && c.owner === playerId ? c : null;
  };
  const adventure = () => {
    t.adventureDone = true;
    t.acted = true;
  };
  if ((POWER_ACTIONS as string[]).includes(action.type)) {
    const error = applyPower(ctx, playerId, action as PowerAction);
    if (error) return fail(error);
    if (!offTurn) autoAdvance(ctx);
    return done(s, ctx);
  }
  if (action.type !== 'release' && action.type !== 'roll' && action.type !== 'move' && action.type !== 'skipMove' && action.type !== 'skipAdventure' && t.adventureDone)
    return fail('You already used your adventure action this turn.');

  switch (action.type) {
    case 'release': {
      if (t.acted) return fail('Release your dragon at the start of your turn, before any other action.');
      const comp = companionOf(s, playerId);
      if (!comp) return fail('You do not have a dragon companion.');
      s.dragon = { ...s.dragon, state: 'wild', node: comp.node, companion: null, releasedBy: playerId };
      ctx.events.push({ type: 'dragonReleased', playerId });
      log(ctx, `${playerName(s, playerId)} releases the dragon — it runs wild at ${nodeName(s.boardId, comp.node)}.`, 'dragon', playerId);
      return done(s, ctx);
    }
    case 'roll': {
      if (t.moveDone) return fail('You already moved this turn.');
      if (t.move) return fail('You already rolled — choose a glowing piece.');
      const value = roll(s);
      const player = playerOf(s, playerId);
      t.move = { roll: value, slowed: player.slowed };
      player.slowed = false;
      t.acted = true;
      t.rolls++;
      let steps = value;
      let penalty: 'dragon' | 'slowed' | null = null;
      if (t.move.slowed && steps > cfg.slowDownMaxSteps) {
        steps = cfg.slowDownMaxSteps;
        penalty = 'slowed';
      }
      ctx.events.push({ type: 'rolled', playerId, value, steps, penalty, bonus: t.bonus });
      log(ctx, `${playerName(s, playerId)} rolled ${value}${t.move.slowed ? ` (slowed: at most ${cfg.slowDownMaxSteps})` : ''}${t.bonus ? ' (bonus)' : ''}.`, 'info', playerId);
      if (cfg.extraTurnRoll > 0 && value === cfg.extraTurnRoll) earnExtra(ctx, 'six');
      if (movableCharacters(s).length === 0) {
        t.moveDone = true;
        ctx.events.push({ type: 'noMove', playerId, steps });
        log(ctx, `${noMoveReason(s, playerId)} Movement skipped.`, 'info', playerId);
      }
      break;
    }
    case 'move': {
      if (t.moveDone) return fail('You already moved this turn.');
      if (!t.move) return fail('Roll the die first.');
      const ch = mine(action.characterId);
      if (!ch || ch.finished) return fail('Choose one of your own pieces.');
      if (!Array.isArray(action.path) || action.path.length < 2 || action.path[0] !== ch.node) return fail('That route does not start where the piece stands.');
      const key = action.path.join('>');
      const option = legalMoves(s, ch.id).find((m) => m.path.join('>') === key);
      if (!option) return fail('That route is not legal any more (a piece, the dragon or a road changed). Pick a glowing space.');
      const attack = action.attack;
      if (option.routeTargets.length >= cfg.knightAttackMin) {
        if (!attack || attack.length < cfg.knightAttackMin || attack.length > Math.min(cfg.knightAttackMax, option.routeTargets.length))
          return fail(`Choose ${cfg.knightAttackMin}–${cfg.knightAttackMax} rivals for the route attack.`);
        if (attack.some((id) => !option.routeTargets.includes(id))) return fail('Those targets are not eligible on this route.');
        if (new Set(attack).size !== attack.length) return fail('Pick each rival only once.');
        const end = option.path[option.path.length - 1];
        const endMust = option.routeTargets.filter((id) => s.characters[id]?.node === end);
        if (endMust.some((id) => !attack.includes(id))) return fail('An eligible rival on the final space must be included.');
      } else if (attack?.length) {
        return fail('This route has no route attack.');
      }
      if (option.witchPortal) t.witchPortalUsed = true;
      t.moveDone = true;
      t.acted = true;
      t.moved = [...t.moved, ch.id];
      ctx.events.push({ type: 'moved', characterId: ch.id, path: option.path });
      log(ctx, `${charLabel(s, ch.id)} moves to ${nodeName(s.boardId, option.path[option.path.length - 1])}${option.witchPortal ? ' (free portal hop)' : ''}.`, 'info', playerId);
      ch.webbed = false;
      walk(ctx, ch, option, action.discardCardId, attack);
      if (cfg.extraTurnOnCut && ctx.events.some((e) => e.type === 'cut' && e.characterId === ch.id)) earnExtra(ctx, 'capture');
      break;
    }
    case 'skipMove': {
      if (t.moveDone) return fail('You already moved this turn.');
      if (t.move && movableCharacters(s).length > 0) return fail('You have a legal move — every roll must be used when possible.');
      t.moveDone = true;
      t.acted = true;
      if (t.move) {
        const steps = t.move.slowed ? Math.min(t.move.roll, cfg.slowDownMaxSteps) : t.move.roll;
        ctx.events.push({ type: 'noMove', playerId, steps });
      }
      log(ctx, `${playerName(s, playerId)} skips their move.`, 'info', playerId);
      break;
    }
    case 'skipAdventure': {
      if (t.adventureDone) return fail('You already used your adventure action this turn.');
      adventure();
      log(ctx, `${playerName(s, playerId)} ends their adventure for this turn.`, 'info', playerId);
      break;
    }
    case 'enterDungeon':
    case 'leaveDungeon': {
      const ch = mine(action.characterId);
      const enter = action.type === 'enterDungeon';
      const tr = board.transitions.find((x) => (enter ? x.island : x.dungeon) === ch?.node);
      if (!ch || !tr) return fail(enter ? 'Stand on the Dragon Gate to enter the dungeon.' : 'Stand at the Dungeon Entrance to leave.');
      const to = enter ? tr.dungeon : tr.island;
      if (!canArrive(s, to, ch.id)) return fail(`${nodeName(s.boardId, to)} is occupied.`);
      adventure();
      if (enter) s.stats[playerId].dungeonVisits++;
      log(ctx, `${charLabel(s, ch.id)} ${enter ? 'descends into the dungeon' : 'climbs back out to the island'}.`, 'info', playerId);
      relocate(ctx, ch, to, 'dungeon');
      break;
    }
    case 'dig': {
      const ch = mine(action.characterId);
      const node = ch ? nodes[ch.node] : undefined;
      if (!ch || !node?.dig) return fail('Stand on a dig site to dig.');
      if (node.type === 'gemChamber') {
        if (!handsFree(s, ch)) return fail('Hands full — bank the gems you carry first.');
        const kind = action.gem;
        if (!kind || !GEM_KINDS.includes(kind) || !neededGems(s, playerId).includes(kind)) return fail('Choose a gem your kingdom still needs.');
        adventure();
        newGem(ctx, ch, kind, node.name);
        break;
      }
      adventure();
      log(ctx, `${charLabel(s, ch.id)} digs at ${node.name}…`, 'info', playerId);
      drawDiscovery(ctx, ch, action.discardCardId);
      break;
    }
    case 'fightMonster': {
      const ch = mine(action.characterId);
      if (!ch || nodes[ch.node].type !== 'monster') return fail('Fight the monster in the Monster Den.');
      if (ch.beatMonster) return fail('You already beat the monster on this visit.');
      adventure();
      const value = roll(s);
      const total = value + (ch.kind === 'knight' ? cfg.knightBonus : 0);
      const success = total >= cfg.monsterThreshold;
      ctx.events.push({ type: 'monster', characterId: ch.id, roll: value, total, success });
      if (success) {
        ch.beatMonster = true;
        log(ctx, `${charLabel(s, ch.id)} rolls ${total} and beats the monster! The Vault Door opens for this visit.`, 'good', playerId);
      } else {
        log(ctx, `${charLabel(s, ch.id)} rolls ${total} — the monster drives them back.`, 'bad', playerId);
        retreat(ctx, ch);
      }
      break;
    }
    case 'tame': {
      const ch = mine(action.characterId);
      if (!ch || !canTameHere(s, playerId, ch.id)) return fail('Stand with a guarding or wild dragon (and have no dragon already) to tame it.');
      adventure();
      attemptTame(ctx, playerId, ch.id, cfg.tameThreshold);
      break;
    }
    case 'dragonFire': {
      // The dragon's own power: no card. It spends the Adventure action, then a separate attack die decides it.
      const comp = companionOf(s, playerId);
      if (!comp) return fail('You need a dragon companion.');
      if (!dragonFireTargets(s, playerId).some((c) => c.id === action.targetId)) return fail('That target is out of range, protected, or in a castle or Royal Path.');
      adventure();
      const need = cfg.dragonFireHit ?? 4;
      const value = roll(s);
      const hit = value >= need;
      s.stats[playerId].dragonFires++;
      ctx.events.push({ type: 'dragonFire', characterId: comp.id, targetId: action.targetId, roll: value, hit });
      if (!hit) {
        log(ctx, `${charLabel(s, comp.id)}'s dragon breathes fire at ${charLabel(s, action.targetId)}: attack die ${value} (needed ${need}+) — it misses.`, 'dragon', playerId);
        break;
      }
      log(ctx, `${charLabel(s, comp.id)}'s dragon breathes fire at ${charLabel(s, action.targetId)}: attack die ${value} — a hit!`, 'dragon', playerId);
      burn(ctx, comp.id, action.targetId);
      break;
    }
    case 'sail':
    case 'fly': {
      const ch = mine(action.characterId);
      if (!ch) return fail('Choose one of your pieces.');
      if (isCompanion(s, ch.id)) return fail('The dragon will not ride a boat or a plane.');
      const boat = action.type === 'sail';
      const stops = boat ? board.docks : board.airfields;
      const at = boat ? s.vehicles.boat : s.vehicles.plane;
      if (ch.node !== at) return fail(boat ? 'The boat is not at your dock.' : 'The plane is not at your airfield.');
      const to = boat ? stops.find((d) => d !== at)! : action.type === 'fly' ? action.to : '';
      if (!stops.includes(to) || to === at) return fail('Choose another airfield.');
      if (!canArrive(s, to, ch.id)) return fail(`${nodeName(s.boardId, to)} is occupied.`);
      adventure();
      s.vehicles = boat ? { ...s.vehicles, boat: to } : { ...s.vehicles, plane: to };
      s.stats[playerId].vehicleTrips++;
      log(ctx, `${charLabel(s, ch.id)} ${boat ? 'sails' : 'flies'} to ${nodeName(s.boardId, to)}.`, 'info', playerId);
      relocate(ctx, ch, to, boat ? 'boat' : 'plane');
      break;
    }
    case 'playCard': {
      const hand = s.hands[playerId];
      const idx = hand.findIndex((c) => c.id === action.cardId);
      if (idx < 0) return fail('That card is not in your hand.');
      const card = hand[idx];
      const key = targetKey(action.target);
      if (!cardTargets(s, playerId, card.type).some((x) => targetKey(x) === key)) return fail(`${CARD_INFO[card.type].name}: that target is not allowed (it may have just changed).`);
      hand.splice(idx, 1);
      s.discard.push(card);
      s.stats[playerId].cardsPlayed++;
      adventure();
      ctx.events.push({ type: 'cardPlayed', playerId, card: card.type });
      log(ctx, `${playerName(s, playerId)} plays ${CARD_INFO[card.type].name}.`, 'info', playerId);
      CARDS[card.type].apply(ctx, playerId, action.target, action.discardCardId);
      break;
    }
    default:
      return fail('Unknown action.');
  }
  autoAdvance(ctx);
  return done(s, ctx);
}

function done(s: GameState, ctx: Ctx): ActionResult {
  s.version++;
  s.lastEvents = ctx.events;
  return { ok: true, state: s, events: ctx.events };
}

/** End the current player's turn explicitly (the "End turn" button): skips what is left. */
export function endTurn(state: GameState, playerId: string, now: number): ActionResult {
  return applyAction(state, { playerId, action: { type: 'skipAdventure' } }, now);
}

/**
 * Turn timer ran out (or a disconnected player's turn is auto-resolved): an unrolled die is rolled,
 * a rolled move is completed with the AI's choice, and the adventure action is skipped.
 */
export function forceTimeout(state: GameState, now: number): ActionResult {
  if (state.status !== 'playing') return fail('The match is over.');
  const s = structuredClone(state);
  const ctx: Ctx = { state: s, events: [], now };
  const pid = s.turn.playerId;
  s.stats[pid].timeouts++;
  log(ctx, `${playerName(s, pid)} ran out of time.`, 'system', pid);
  if (!s.turn.moveDone) {
    if (!s.turn.move) {
      const value = roll(s);
      s.turn.move = { roll: value, slowed: playerOf(s, pid).slowed };
      playerOf(s, pid).slowed = false;
      ctx.events.push({ type: 'rolled', playerId: pid, value });
      log(ctx, `${playerName(s, pid)} rolled ${value}.`, 'info', pid);
    }
    const pick = bestMove(s, movableCharacters(s));
    if (pick) {
      const ch = s.characters[pick.characterId];
      if (pick.option.witchPortal) s.turn.witchPortalUsed = true;
      s.turn.moveDone = true;
      s.turn.moved = [...s.turn.moved, ch.id];
      ctx.events.push({ type: 'moved', characterId: ch.id, path: pick.option.path });
      ch.webbed = false;
      const autoAttack =
        pick.option.routeTargets.length >= s.config.knightAttackMin
          ? pick.option.routeTargets.slice(0, Math.min(s.config.knightAttackMax, pick.option.routeTargets.length))
          : undefined;
      walk(ctx, ch, pick.option, undefined, autoAttack);
    }
  }
  if (s.status === 'playing') {
    s.turn.moveDone = true;
    s.turn.adventureDone = true;
    if (s.turn.extra) log(ctx, `The extra turn is lost to the clock.`, 'info', pid);
    s.turn.extra = null;
    finishTurn(ctx);
  }
  return done(s, ctx);
}

/** Check clocks. Returns a new state when something happened, else null. */
export function tick(state: GameState, now: number): ActionResult | null {
  if (state.status !== 'playing') return null;
  if (state.endsAt !== null && now >= state.endsAt) {
    const s = structuredClone(state);
    const ctx: Ctx = { state: s, events: [], now };
    log(ctx, 'Time is up!', 'system');
    finishGame(ctx, 'timer');
    return done(s, ctx);
  }
  if (state.turn.deadline !== null && now >= state.turn.deadline) return forceTimeout(state, now);
  return null;
}

/** Everything the current player can do right now (for prompts and the AI). */
export function availableAdventure(state: GameState) {
  return adventureOptions(state, state.turn.playerId, state.hands[state.turn.playerId]);
}
