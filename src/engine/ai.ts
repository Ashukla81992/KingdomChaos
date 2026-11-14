import { legalTargets } from './cards';
import { distancesFrom, enumerateMoves, type MoveOption } from './movement';
import { legalMovesForTurn } from './queries';
import type { CardInstance, CardTarget, Character, GameAction, PlayerView, PublicState } from './types';

type Dist = Record<string, number>;
const FAR = 30;

interface Ctx {
  state: PublicState;
  me: string;
  castle: string;
  castleDist: Dist;
  treasureDists: Dist[];
  opponentDists: { char: Character; dist: Dist }[];
}

function buildCtx(state: PublicState, me: string): Ctx {
  const castle = state.players.find((p) => p.id === me)!.castle;
  const lying = state.treasures.filter((t) => t.space);
  return {
    state,
    me,
    castle,
    castleDist: distancesFrom(state, castle, { allowCastles: [castle] }),
    treasureDists: lying.map((t) => distancesFrom(state, t.space!, { allowCastles: [castle] })),
    opponentDists: Object.values(state.characters)
      .filter((c) => c.owner !== me && state.castles[c.space] === undefined)
      .map((c) => ({ char: c, dist: distancesFrom(state, c.space) })),
  };
}

const d = (dist: Dist, s: string) => dist[s] ?? FAR;
const nearestTreasure = (ctx: Ctx, s: string) => Math.min(FAR, ...ctx.treasureDists.map((m) => d(m, s)));
const threatAt = (ctx: Ctx, s: string) => ctx.opponentDists.filter((o) => d(o.dist, s) <= 6).length;

/** Heuristic value of a movement option for its owner. */
export function scoreMove(state: PublicState, me: string, o: MoveOption, ctx: Ctx = buildCtx(state, me)): number {
  const mover = state.characters[o.characterId];
  let score = 0;
  if (o.bank) score += 100;
  if (o.pickup) score += 60;
  let loot = false;
  for (const id of o.captures) {
    const v = state.characters[id];
    score += 25;
    if (v.carrying) {
      score += 40;
      if (!mover.carrying) loot = true;
    }
  }
  if (o.trapped) score -= 60;
  if (o.shieldBlocked) score -= 5;
  if (o.drawsCard) score += 8;
  const carryingAfter = !o.trapped && (!!mover.carrying || o.pickup || loot);
  if (carryingAfter && !o.bank) {
    if (mover.carrying) score += (d(ctx.castleDist, mover.space) - d(ctx.castleDist, o.final)) * 9;
    else score -= d(ctx.castleDist, o.final) * 2;
    if (!mover.immune && mover.power?.type !== 'shield') score -= threatAt(ctx, o.final) * 6;
  } else if (!carryingAfter) {
    score += (nearestTreasure(ctx, mover.space) - nearestTreasure(ctx, o.final)) * 6;
  }
  return score;
}

/** Deterministic "best simple move" used for timeouts. */
export function chooseBasicMove(state: PublicState, playerId: string): MoveOption | null {
  const moves = legalMovesForTurn(state, playerId);
  if (!moves.length) return null;
  const ctx = buildCtx(state, playerId);
  let best = moves[0];
  let bestScore = -Infinity;
  for (const m of moves) {
    const s = scoreMove(state, playerId, m, ctx);
    if (s > bestScore) [best, bestScore] = [m, s];
  }
  return best;
}

interface CardChoice {
  card: CardInstance;
  target: CardTarget;
  score: number;
}

function leader(state: PublicState, me: string) {
  return state.players.filter((p) => p.id !== me).sort((a, b) => b.score - a.score)[0];
}

function evaluateCard(view: PlayerView, ctx: Ctx, card: CardInstance, rand: () => number): CardChoice | null {
  const state = view;
  const me = view.viewerId!;
  const targets = legalTargets(state, me, card.type);
  if (!targets.length) return null;
  const mine = Object.values(state.characters).filter((c) => c.owner === me);
  const myCarriers = mine.filter((c) => c.carrying && c.space !== ctx.castle);
  const lead = leader(state, me);
  const leadCarriers = Object.values(state.characters).filter((c) => c.owner === lead?.id && c.carrying);
  const best = (scored: { target: CardTarget; score: number }[]) =>
    scored.sort((a, b) => b.score - a.score)[0] ?? null;
  const pick = (target: CardTarget | undefined, score: number) => (target ? { card, target, score } : null);

  switch (card.type) {
    case 'speed_boost': {
      const scored = targets.map((t) => {
        if (t.kind !== 'characterPath') return { target: t, score: -1 };
        const opt = enumerateMoves(state, t.characterId, state.config.speedBoostSteps, false).find(
          (m) => m.path.join('>') === t.path.join('>'),
        );
        return { target: t, score: opt ? scoreMove(state, me, opt, ctx) : -1 };
      });
      const b = best(scored);
      return b && b.score >= 18 ? { card, ...b } : null;
    }
    case 'shield':
    case 'immunity': {
      const threatened = myCarriers.filter((c) => threatAt(ctx, c.space) > 0 && !c.immune && c.power?.type !== 'shield');
      const t = targets.find((x) => x.kind === 'character' && threatened.some((c) => c.id === x.characterId));
      return pick(t, card.type === 'immunity' ? 42 : 38);
    }
    case 'teleport': {
      const t = targets.find(
        (x) => x.kind === 'characterSpace' && !state.characters[x.characterId].carrying && state.treasures.some((tr) => tr.space === x.space),
      );
      return pick(t, 50);
    }
    case 'royal_guard':
      return myCarriers.length ? pick(targets[0], 14) : null;
    case 'repair': {
      const castleT = targets.find((t) => t.kind === 'none');
      if (castleT && mine.some((c) => c.carrying && d(ctx.castleDist, c.space) <= 4)) return pick(castleT, 55);
      return castleT ? pick(castleT, 12) : null;
    }
    case 'castle_attack': {
      if (!lead) return null;
      const near = leadCarriers.some((c) => {
        const dist = distancesFrom(state, lead.castle, { allowCastles: [lead.castle] });
        return d(dist, c.space) <= 6;
      });
      const t = targets.find((x) => x.kind === 'player' && x.playerId === lead.id);
      return near ? pick(t, 36) : null;
    }
    case 'slow_down': {
      const myScore = state.players.find((p) => p.id === me)!.score;
      const t = targets.find((x) => x.kind === 'player' && x.playerId === lead?.id);
      return lead && (lead.score >= myScore || leadCarriers.length) ? pick(t, 16 + rand() * 6) : null;
    }
    case 'attack_boost': {
      const t = targets.find(
        (x) =>
          x.kind === 'character' &&
          ctx.opponentDists.some((o) => o.char.carrying && d(o.dist, state.characters[x.characterId].space) <= 6),
      );
      return pick(t, 15);
    }
    case 'build_bridge':
    case 'break_bridge':
    case 'block_path': {
      const value = (s: PublicState) => {
        const c = buildCtx(s, me);
        let v = 0;
        for (const ch of mine) v -= ch.carrying ? d(c.castleDist, ch.space) * 2 : nearestTreasure(c, ch.space) * 0.5;
        if (lead) {
          const ld = distancesFrom(s, lead.castle, { allowCastles: [lead.castle] });
          for (const ch of leadCarriers) v += d(ld, ch.space) * 2;
        }
        return v;
      };
      const base = value(state);
      const scored = targets.map((t) => {
        if (t.kind !== 'connection') return { target: t, score: -1 };
        const s: PublicState = { ...state, bridges: { ...state.bridges }, blocks: [...state.blocks] };
        if (card.type === 'build_bridge') s.bridges[t.connectionId] = true;
        else if (card.type === 'break_bridge') s.bridges[t.connectionId] = false;
        else s.blocks.push({ connectionId: t.connectionId, owner: me });
        return { target: t, score: (value(s) - base) * 6 };
      });
      const b = best(scored);
      return b && b.score >= 10 ? { card, ...b } : null;
    }
    case 'trap': {
      if (!lead || !leadCarriers.length) return null;
      const ld = distancesFrom(state, lead.castle, { allowCastles: [lead.castle] });
      const carrier = leadCarriers[0];
      const cd = distancesFrom(state, carrier.space);
      const scored = targets.map((t) => {
        if (t.kind !== 'space') return { target: t, score: -1 };
        const between = d(ld, t.space) < d(ld, carrier.space);
        return { target: t, score: between ? 24 - d(cd, t.space) * 3 : -1 };
      });
      const b = best(scored);
      return b && b.score > 8 ? { card, ...b } : null;
    }
    case 'swap': {
      const scored = targets.map((t) => {
        if (t.kind !== 'swap') return { target: t, score: -1 };
        const a = state.characters[t.characterId];
        const b = state.characters[t.targetCharacterId];
        let s = 0;
        if (a.carrying) s += (d(ctx.castleDist, a.space) - d(ctx.castleDist, b.space)) * 7;
        if (b.carrying) {
          const owner = state.players.find((p) => p.id === b.owner)!;
          const od = distancesFrom(state, owner.castle, { allowCastles: [owner.castle] });
          s += (d(od, a.space) - d(od, b.space)) * 5;
        }
        return { target: t, score: s };
      });
      const b = best(scored);
      return b && b.score >= 14 ? { card, ...b } : null;
    }
    case 'portal':
      return rand() < 0.15 ? pick(targets[Math.floor(rand() * targets.length)], 6) : null;
  }
}

function cardValue(view: PlayerView, card: CardInstance): number {
  return legalTargets(view, view.viewerId!, card.type).length ? 1 : 0;
}

/**
 * Decide the AI's next action from its own redacted view. Never sees other hands.
 * `rand` is injected so tests can be deterministic.
 */
export function chooseAiAction(view: PlayerView, rand: () => number = Math.random): GameAction | null {
  const me = view.viewerId;
  if (!me || view.status !== 'playing' || view.turn.playerId !== me) return null;
  const phase = view.turn.phase;
  if (phase === 'roll') return { type: 'roll' };
  if (phase === 'move') {
    const moves = legalMovesForTurn(view, me);
    if (!moves.length) return { type: 'endTurn' };
    const ctx = buildCtx(view, me);
    let best = moves[0];
    let bestScore = -Infinity;
    for (const m of moves) {
      const s = scoreMove(view, me, m, ctx) + rand() * 4;
      if (s > bestScore) [best, bestScore] = [m, s];
    }
    return { type: 'move', characterId: best.characterId, path: best.path };
  }
  if (phase === 'action') {
    if (!view.turn.cardPlayed) {
      const ctx = buildCtx(view, me);
      const choices = view.hand
        .map((c) => evaluateCard(view, ctx, c, rand))
        .filter((c): c is CardChoice => !!c)
        .sort((a, b) => b.score - a.score);
      if (choices.length && rand() < 0.85) return { type: 'playCard', cardId: choices[0].card.id, target: choices[0].target };
    }
    return { type: 'endTurn' };
  }
  if (phase === 'drawChoice') {
    const useless = view.hand.find((c) => cardValue(view, c) === 0);
    return { type: 'resolveDraw', discardCardId: useless ? useless.id : null };
  }
  return null;
}