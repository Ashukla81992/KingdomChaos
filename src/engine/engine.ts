import { chooseBasicMove } from './ai';
import { getGraph, ISLE_OF_EMBERS } from './board';
import { CARDS, cardCategory, legalTargets, targetKey } from './cards';
import { DEFAULT_CONFIG, type GameConfig } from './config';
import { enumerateMoves } from './movement';
import { legalMovesWithSteps } from './queries';
import { applyMoveOption, bankCarriersInCastle, drawCard, finishGame, log, playerName, type Ctx } from './resolve';
import { randomInt, shuffle } from './rng';
import { CARD_INFO } from './rulesText';
import {
  CHARACTER_KINDS,
  type ActionEnvelope,
  type ActionResult,
  type CardCategory,
  type CardInstance,
  type CardType,
  type Character,
  type GameState,
  type PlayerState,
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

export function createGame(opts: CreateGameOptions): GameState {
  const config: GameConfig = { ...DEFAULT_CONFIG, ...opts.config, deck: { ...DEFAULT_CONFIG.deck, ...opts.config?.deck } };
  const boardId = opts.boardId ?? ISLE_OF_EMBERS.id;
  const graph = getGraph(boardId);
  const board = graph.board;
  const count = opts.players.length;
  const seats = board.seatOrder[count];
  if (!seats) throw new Error(`Unsupported player count ${count}`);

  const players: PlayerState[] = opts.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    seat: seats[i],
    castle: board.castles[seats[i]],
    isAI: !!p.isAI,
    score: 0,
    slowDownPending: false,
  }));

  const characters: Record<string, Character> = {};
  for (const p of players) {
    for (const kind of CHARACTER_KINDS) {
      const id = `${p.id}-${kind}`;
      characters[id] = { id, owner: p.id, kind, space: p.castle, carrying: null, power: null, immune: false, recovering: false };
    }
  }

  const bridges: Record<string, boolean> = {};
  for (const c of board.connections) if (c.kind === 'bridge') bridges[c.id] = !!c.initiallyOpen;

  const castles: GameState['castles'] = {};
  for (const p of players) castles[p.castle] = { owner: p.id, damagedBy: null, royalGuard: false };

  const state: GameState = {
    boardId,
    config,
    version: 0,
    status: 'playing',
    players,
    characters,
    treasures: graph.treasureSpaces.map((s) => ({ id: `t-${s}`, home: s, space: s, carriedBy: null })),
    bridges,
    terrain: Object.fromEntries(board.spaces.map((s) => [s.id, s.terrain ?? 'grass'])),
    blocks: [],
    tempPortals: [],
    traps: [],
    castles,
    turn: {
      playerId: players[0].id,
      number: 0,
      phase: 'roll',
      roll: null,
      steps: null,
      slowed: false,
      cardPlayed: false,
      pendingDraws: 0,
      startedAt: opts.now,
      deadline: null,
    },
    startedAt: opts.now,
    endsAt: config.matchDurationMs > 0 ? opts.now + config.matchDurationMs : null,
    result: null,
    log: [],
    lastEvents: [],
    stats: Object.fromEntries(
      players.map((p) => [p.id, { captures: 0, timesCaptured: 0, cardsPlayed: 0, banked: 0, turns: 0, timeouts: 0 }]),
    ),
    hands: Object.fromEntries(players.map((p) => [p.id, [] as CardInstance[]])),
    deck: [],
    discard: [],
    rngState: opts.seed | 0,
    logCounter: 0,
    cardCounter: 0,
    forcedRolls: [],
  };

  const deck: CardInstance[] = [];
  for (const [type, n] of Object.entries(config.deck) as [CardType, number][]) {
    for (let i = 0; i < n; i++) deck.push({ id: `k${++state.cardCounter}`, type });
  }
  state.deck = shuffle(state, deck);
  const categories: CardCategory[] = ['map', 'power', 'special'];
  for (const p of players) {
    for (const cat of categories) {
      const idx = state.deck.findIndex((c) => cardCategory(c.type) === cat);
      if (idx >= 0) state.hands[p.id].push(state.deck.splice(idx, 1)[0]);
    }
  }

  const ctx: Ctx = { state, events: [], now: opts.now };
  const first = opts.firstPlayer ?? randomInt(state, players.length);
  log(ctx, 'The race for treasure begins!', 'system');
  startTurn(ctx, players[first].id);
  state.lastEvents = ctx.events;
  return state;
}

function startTurn(ctx: Ctx, playerId: string) {
  const s = ctx.state;
  const cfg = s.config;
  s.turn = {
    playerId,
    number: s.turn.number + 1,
    phase: 'roll',
    roll: null,
    steps: null,
    slowed: false,
    cardPlayed: false,
    pendingDraws: 0,
    startedAt: ctx.now,
    deadline: cfg.turnDurationMs > 0 ? ctx.now + cfg.turnDurationMs : null,
  };
  s.stats[playerId].turns++;

  // Effects that last "until the start of the owner's next turn".
  const expiredBlocks = s.blocks.filter((b) => b.owner === playerId).length;
  s.blocks = s.blocks.filter((b) => b.owner !== playerId);
  const expiredPortals = s.tempPortals.filter((p) => p.owner === playerId).length;
  s.tempPortals = s.tempPortals.filter((p) => p.owner !== playerId);
  if (expiredBlocks) log(ctx, `${playerName(s, playerId)}'s blocked path reopened.`, 'system');
  if (expiredPortals) log(ctx, `${playerName(s, playerId)}'s temporary portal faded.`, 'system');
  for (const c of Object.values(s.characters)) if (c.owner === playerId) c.immune = false;
  s.traps = s.traps
    .map((t) => (t.owner === playerId ? { ...t, roundsLeft: t.roundsLeft - 1 } : t))
    .filter((t) => {
      if (t.roundsLeft > 0) return true;
      log(ctx, `${playerName(s, t.owner)}'s unused trap crumbled away.`, 'system');
      return false;
    });
  for (const [castleId, castle] of Object.entries(s.castles)) {
    if (castle.damagedBy === playerId) {
      castle.damagedBy = null;
      log(ctx, `${playerName(s, castle.owner)}'s castle is repaired.`, 'system');
      bankCarriersInCastle(ctx, castleId);
    }
  }
  const player = s.players.find((p) => p.id === playerId)!;
  if (player.slowDownPending) {
    player.slowDownPending = false;
    s.turn.slowed = true;
    log(ctx, `${player.name} is slowed: max ${cfg.slowDownMaxSteps} steps this turn.`, 'info', playerId);
  }
  ctx.events.push({ type: 'turnStarted', playerId, turn: s.turn.number });
}

function doRoll(ctx: Ctx) {
  const s = ctx.state;
  const value = s.forcedRolls.length ? s.forcedRolls.shift()! : randomInt(s, s.config.dieSides) + 1;
  const steps = s.turn.slowed ? Math.min(value, s.config.slowDownMaxSteps) : value;
  s.turn.roll = value;
  s.turn.steps = steps;
  ctx.events.push({ type: 'rolled', playerId: s.turn.playerId, value, steps });
  log(ctx, `${playerName(s, s.turn.playerId)} rolled a ${value}${steps !== value ? ` (slowed to ${steps})` : ''}.`, 'info', s.turn.playerId);
  if (legalMovesWithSteps(s, s.turn.playerId, steps).length === 0) {
    s.turn.phase = 'action';
    log(ctx, 'No legal move — movement skipped.', 'info', s.turn.playerId);
  } else {
    s.turn.phase = 'move';
  }
}

/** Resolve queued draws, then pass the turn. In auto mode full-hand draws are declined. */
function finishTurn(ctx: Ctx, auto: boolean) {
  const s = ctx.state;
  const pid = s.turn.playerId;
  while (s.turn.pendingDraws > 0 && s.status === 'playing') {
    if (s.deck.length === 0 && s.discard.length === 0) {
      log(ctx, 'The deck and discard pile are empty — no card drawn.', 'system');
      s.turn.pendingDraws = 0;
      break;
    }
    if (s.hands[pid].length < s.config.handLimit) {
      drawCard(ctx, pid);
      s.turn.pendingDraws--;
      continue;
    }
    if (auto) {
      log(ctx, `${playerName(s, pid)}'s hand is full — draw declined.`, 'info', pid);
      s.turn.pendingDraws--;
      continue;
    }
    s.turn.phase = 'drawChoice';
    return;
  }
  if (s.status !== 'playing') return;
  for (const c of Object.values(s.characters)) if (c.owner === pid) c.recovering = false;
  const idx = s.players.findIndex((p) => p.id === pid);
  startTurn(ctx, s.players[(idx + 1) % s.players.length].id);
}

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Validate and apply one player action. Never mutates the input state. */
export function applyAction(state: GameState, envelope: ActionEnvelope, now: number): ActionResult {
  if (state.status !== 'playing') return fail('The match is over.');
  if (state.endsAt !== null && now >= state.endsAt) return fail('The match timer has expired.');
  if (envelope.version !== undefined && envelope.version !== state.version) return fail('That action is out of date — the game has moved on.');
  const { playerId, action } = envelope;
  if (!state.players.some((p) => p.id === playerId)) return fail('You are not part of this match.');
  if (state.turn.playerId !== playerId) return fail('It is not your turn.');

  const s = structuredClone(state);
  const ctx: Ctx = { state: s, events: [], now };
  const phase = s.turn.phase;

  switch (action.type) {
    case 'roll': {
      if (phase !== 'roll') return fail('You have already rolled this turn.');
      doRoll(ctx);
      break;
    }
    case 'move': {
      if (phase !== 'move') return fail(phase === 'roll' ? 'Roll the die first.' : 'You have already moved this turn.');
      const ch = s.characters[action.characterId];
      if (!ch || ch.owner !== playerId) return fail('That is not your character.');
      if (ch.recovering) return fail('That character is recovering from a capture and cannot move this turn.');
      if (!Array.isArray(action.path) || action.path[0] !== ch.space) return fail('Invalid route.');
      const key = action.path.join('>');
      const option = enumerateMoves(s, ch.id, s.turn.steps ?? 0, true).find((m) => m.path.join('>') === key);
      if (!option) return fail('That move is not allowed.');
      applyMoveOption(ctx, option, true);
      if (s.status === 'playing') s.turn.phase = 'action';
      break;
    }
    case 'playCard': {
      if (phase === 'roll' || phase === 'move') return fail('Cards are played after your regular move.');
      if (phase !== 'action') return fail('Finish drawing first.');
      if (s.turn.cardPlayed) return fail('You can only play one card per turn.');
      const hand = s.hands[playerId];
      const idx = hand.findIndex((c) => c.id === action.cardId);
      if (idx < 0) return fail('That card is not in your hand.');
      const card = hand[idx];
      const key = targetKey(action.target);
      if (!legalTargets(s, playerId, card.type).some((t) => targetKey(t) === key)) return fail(`${CARD_INFO[card.type].name}: invalid target.`);
      hand.splice(idx, 1);
      s.discard.push(card);
      s.turn.cardPlayed = true;
      s.stats[playerId].cardsPlayed++;
      ctx.events.push({ type: 'cardPlayed', playerId, card: card.type });
      CARDS[card.type].apply(ctx, playerId, action.target);
      break;
    }
    case 'endTurn': {
      if (phase === 'roll') return fail('Roll the die first.');
      if (phase === 'move') return fail('Move a character first.');
      if (phase === 'drawChoice') return fail('Choose a card to discard or decline the draw.');
      finishTurn(ctx, false);
      break;
    }
    case 'resolveDraw': {
      if (phase !== 'drawChoice') return fail('There is no draw to resolve.');
      if (action.discardCardId === null) {
        s.turn.pendingDraws--;
        log(ctx, `${playerName(s, playerId)} declined a card.`, 'info', playerId);
      } else {
        const hand = s.hands[playerId];
        const idx = hand.findIndex((c) => c.id === action.discardCardId);
        if (idx < 0) return fail('That card is not in your hand.');
        s.discard.push(hand.splice(idx, 1)[0]);
        drawCard(ctx, playerId);
        s.turn.pendingDraws--;
      }
      s.turn.phase = 'action';
      finishTurn(ctx, false);
      break;
    }
    default:
      return fail('Unknown action.');
  }

  s.version++;
  s.lastEvents = ctx.events;
  return { ok: true, state: s, events: ctx.events };
}

/** Auto-play the current turn: roll and basic move if needed, never plays a card, then ends the turn. */
export function forceTimeout(state: GameState, now: number): ActionResult {
  if (state.status !== 'playing') return fail('The match is over.');
  const s = structuredClone(state);
  const ctx: Ctx = { state: s, events: [], now };
  const pid = s.turn.playerId;
  s.stats[pid].timeouts++;
  log(ctx, `${playerName(s, pid)} ran out of time.`, 'system', pid);
  if (s.turn.phase === 'roll') doRoll(ctx);
  if (s.turn.phase === 'move') {
    const move = chooseBasicMove(s, pid);
    if (move) applyMoveOption(ctx, move, true);
    if (s.status === 'playing') s.turn.phase = 'action';
  }
  if (s.turn.phase === 'drawChoice') s.turn.phase = 'action';
  if (s.status === 'playing') finishTurn(ctx, true);
  s.version++;
  s.lastEvents = ctx.events;
  return { ok: true, state: s, events: ctx.events };
}

/** Check the match and turn clocks. Returns a new state when something happened, else null. */
export function tick(state: GameState, now: number): ActionResult | null {
  if (state.status !== 'playing') return null;
  if (state.endsAt !== null && now >= state.endsAt) {
    const s = structuredClone(state);
    const ctx: Ctx = { state: s, events: [], now };
    log(ctx, 'Time is up!', 'system');
    finishGame(ctx, 'timer');
    s.version++;
    s.lastEvents = ctx.events;
    return { ok: true, state: s, events: ctx.events };
  }
  if (state.turn.deadline !== null && now >= state.turn.deadline) return forceTimeout(state, now);
  return null;
}