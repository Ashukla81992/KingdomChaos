import { bankBonusDraws } from './abilities';
import { getGraph } from './board';
import { CHARACTER_INFO } from './rulesText';
import { castleOwner, treasuresAt, type MoveOption } from './movement';
import { shuffle } from './rng';
import type { Character, GameEvent, GameState, LogEntry, MatchResult } from './types';

export interface Ctx {
  state: GameState;
  events: GameEvent[];
  now: number;
}

const MAX_LOG = 80;

export function log(ctx: Ctx, text: string, kind: LogEntry['kind'] = 'info', playerId?: string) {
  const s = ctx.state;
  s.log.push({ id: ++s.logCounter, turn: s.turn.number, text, kind, playerId });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

export function playerName(state: GameState, id: string): string {
  return state.players.find((p) => p.id === id)?.name ?? 'Someone';
}

export function charLabel(state: GameState, c: Character): string {
  return `${playerName(state, c.owner)}'s ${CHARACTER_INFO[c.kind].name}`;
}

export function castleOf(state: GameState, playerId: string): string {
  return state.players.find((p) => p.id === playerId)!.castle;
}

function dropTreasure(state: GameState, c: Character, at: string) {
  if (!c.carrying) return null;
  const t = state.treasures.find((x) => x.id === c.carrying)!;
  t.carriedBy = null;
  t.space = at;
  c.carrying = null;
  return t;
}

function pickUp(ctx: Ctx, c: Character, treasureId: string) {
  const t = ctx.state.treasures.find((x) => x.id === treasureId)!;
  t.carriedBy = c.id;
  t.space = null;
  c.carrying = t.id;
  ctx.events.push({ type: 'pickedUp', characterId: c.id, treasureId: t.id });
  log(ctx, `${charLabel(ctx.state, c)} picked up treasure.`, 'move', c.owner);
}

/** Return a character to its castle, dropping treasure where it stood. */
export function sendHome(ctx: Ctx, c: Character) {
  const at = c.space;
  const dropped = dropTreasure(ctx.state, c, at);
  c.space = castleOf(ctx.state, c.owner);
  return dropped;
}

export function capture(ctx: Ctx, attacker: Character, victim: Character) {
  const s = ctx.state;
  const at = victim.space;
  const dropped = sendHome(ctx, victim);
  victim.recovering = true;
  s.stats[attacker.owner].captures++;
  s.stats[victim.owner].timesCaptured++;
  ctx.events.push({ type: 'captured', characterId: victim.id, by: attacker.id, at });
  log(ctx, `${charLabel(s, attacker)} captured ${charLabel(s, victim)}!`, 'capture', attacker.owner);
  if (dropped && !attacker.carrying) pickUp(ctx, attacker, dropped.id);
}

/** Apply a validated movement option. */
export function applyMoveOption(ctx: Ctx, option: MoveOption, regular: boolean) {
  const s = ctx.state;
  const mover = s.characters[option.characterId];
  for (const id of option.captures) capture(ctx, mover, s.characters[id]);
  if (option.shieldBlocked) {
    const target = s.characters[option.shieldBlocked];
    target.power = null;
    ctx.events.push({ type: 'shieldBlocked', characterId: target.id, attacker: mover.id });
    log(ctx, `${charLabel(s, target)}'s Shield blocked ${charLabel(s, mover)}!`, 'capture', target.owner);
  }
  const start = mover.space;
  mover.space = option.final;
  if (regular && mover.power?.type === 'attack_boost') mover.power = null;
  ctx.events.push({ type: 'moved', characterId: mover.id, path: option.travelled, via: regular ? 'regular' : 'card' });
  if (option.final !== start) resolveArrival(ctx, mover, { regular });
}

/** End-of-movement effects: trap, treasure pickup, banking, card-space draw. */
export function resolveArrival(ctx: Ctx, c: Character, opts: { regular: boolean; trapsApply?: boolean }) {
  const s = ctx.state;
  const graph = getGraph(s.boardId);
  const trap = s.traps.find((t) => t.space === c.space);
  if ((opts.trapsApply ?? true) && trap && trap.owner !== c.owner && !c.immune) {
    s.traps = s.traps.filter((t) => t !== trap);
    const at = c.space;
    sendHome(ctx, c);
    ctx.events.push({ type: 'trapped', characterId: c.id, at });
    log(ctx, `${charLabel(s, c)} sprang a trap and fled home!`, 'capture', c.owner);
    return;
  }
  if (!c.carrying) {
    const t = treasuresAt(s, c.space)[0];
    if (t) pickUp(ctx, c, t.id);
  }
  if (c.carrying && castleOwner(s, c.space) === c.owner) {
    if (s.castles[c.space].damagedBy) log(ctx, `${playerName(s, c.owner)}'s castle is damaged — treasure cannot be banked yet.`, 'info', c.owner);
    else bank(ctx, c);
  }
  if (opts.regular && graph.space[c.space].type === 'card' && s.status === 'playing') {
    s.turn.pendingDraws++;
    log(ctx, `${charLabel(s, c)} found a card space — draw at end of turn.`, 'info', c.owner);
  }
}

export function bank(ctx: Ctx, c: Character) {
  const s = ctx.state;
  const t = s.treasures.find((x) => x.id === c.carrying)!;
  c.carrying = null;
  t.carriedBy = null;
  t.space = t.home;
  const player = s.players.find((p) => p.id === c.owner)!;
  player.score++;
  s.stats[player.id].banked++;
  ctx.events.push({ type: 'banked', characterId: c.id, playerId: player.id, treasureId: t.id });
  log(ctx, `${player.name} banked a treasure! (${player.score}/${s.config.treasuresToWin})`, 'bank', player.id);
  const bonus = bankBonusDraws(c.kind);
  if (bonus > 0) {
    if (s.turn.playerId === player.id) {
      s.turn.pendingDraws += bonus;
      log(ctx, `Royal Treasury: ${player.name} will draw ${bonus} bonus card.`, 'info', player.id);
    } else {
      for (let i = 0; i < bonus; i++) if (s.hands[player.id].length < s.config.handLimit) drawCard(ctx, player.id);
    }
  }
  if (player.score >= s.config.treasuresToWin) finishGame(ctx, 'treasures');
}

/** Bank every carrier sitting inside a (now undamaged) castle. */
export function bankCarriersInCastle(ctx: Ctx, castleId: string) {
  const s = ctx.state;
  for (const c of Object.values(s.characters)) {
    if (s.status !== 'playing') return;
    if (c.space === castleId && c.carrying && c.owner === s.castles[castleId].owner) bank(ctx, c);
  }
}

export function drawCard(ctx: Ctx, playerId: string): boolean {
  const s = ctx.state;
  if (s.deck.length === 0 && s.discard.length > 0) {
    s.deck = shuffleInto(s, s.discard);
    s.discard = [];
    log(ctx, 'The discard pile was shuffled into a new deck.', 'system');
  }
  const card = s.deck.pop();
  if (!card) {
    log(ctx, 'No cards left to draw.', 'system');
    return false;
  }
  s.hands[playerId].push(card);
  ctx.events.push({ type: 'cardDrawn', playerId });
  return true;
}

function shuffleInto(s: GameState, cards: GameState['discard']) {
  return shuffle(s, cards);
}

export function computeResult(state: GameState, reason: MatchResult['reason'], now: number): MatchResult {
  const finalScores: MatchResult['finalScores'] = {};
  for (const p of state.players) {
    const carried = Object.values(state.characters).filter((c) => c.owner === p.id && c.carrying).length;
    finalScores[p.id] = { banked: p.score, carried };
  }
  const best = Math.max(...state.players.map((p) => p.score));
  let winners = state.players.filter((p) => p.score === best).map((p) => p.id);
  let tieBreak: MatchResult['tieBreak'] = 'none';
  if (winners.length > 1) {
    const bestCarried = Math.max(...winners.map((id) => finalScores[id].carried));
    const byCarried = winners.filter((id) => finalScores[id].carried === bestCarried);
    if (byCarried.length < winners.length) tieBreak = 'carried';
    winners = byCarried;
    if (winners.length > 1) tieBreak = 'shared';
  }
  return { winners, reason, tieBreak, finalScores, durationMs: Math.max(0, now - state.startedAt), turns: state.turn.number };
}

export function finishGame(ctx: Ctx, reason: MatchResult['reason']) {
  const s = ctx.state;
  if (s.status === 'finished') return;
  s.status = 'finished';
  s.turn.deadline = null;
  s.result = computeResult(s, reason, ctx.now);
  const names = s.result.winners.map((id) => playerName(s, id)).join(' & ');
  log(ctx, s.result.winners.length > 1 ? `Shared victory: ${names}!` : `${names} wins the match!`, 'system');
  ctx.events.push({ type: 'gameOver', result: s.result });
}
