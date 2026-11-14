import { acceptsPower } from './abilities';
import { getGraph } from './board';
import { CARD_INFO } from './rulesText';
import { allCastlesReachTreasure, enumerateMoves, isSpaceFree } from './movement';
import { applyMoveOption, bankCarriersInCastle, charLabel, log, playerName, resolveArrival, type Ctx } from './resolve';
import type { CardCategory, CardTarget, CardType, Character, PublicState } from './types';

export interface CardDefinition {
  type: CardType;
  category: CardCategory;
  /** Every legal target for `playerId` in the current state. Empty = card cannot be played. */
  targets(state: PublicState, playerId: string): CardTarget[];
  apply(ctx: Ctx, playerId: string, target: CardTarget): void;
}

export function targetKey(t: CardTarget): string {
  switch (t.kind) {
    case 'connection':
      return `connection:${t.connectionId}`;
    case 'portal':
      return `portal:${t.space}>${t.linkedTo}`;
    case 'space':
      return `space:${t.space}`;
    case 'character':
      return `character:${t.characterId}`;
    case 'characterPath':
      return `characterPath:${t.characterId}:${t.path.join('>')}`;
    case 'characterSpace':
      return `characterSpace:${t.characterId}:${t.space}`;
    case 'swap':
      return `swap:${t.characterId}:${t.targetCharacterId}`;
    case 'player':
      return `player:${t.playerId}`;
    case 'none':
      return 'none';
  }
}

const own = (s: PublicState, pid: string) => Object.values(s.characters).filter((c) => c.owner === pid);
const opponentsOf = (s: PublicState, pid: string) => s.players.filter((p) => p.id !== pid);
const conns = (s: PublicState) => getGraph(s.boardId).board.connections;
const spaceType = (s: PublicState, id: string) => getGraph(s.boardId).space[id].type;

/** Map changes must leave every castle with a route to treasure. */
function keepsConnectivity(state: PublicState, mutate: (s: PublicState) => void): boolean {
  const copy: PublicState = { ...state, bridges: { ...state.bridges }, blocks: [...state.blocks] };
  mutate(copy);
  return allCastlesReachTreasure(copy);
}

const charTarget = (c: Character): CardTarget => ({ kind: 'character', characterId: c.id });
const getChar = (ctx: Ctx, t: CardTarget) => ctx.state.characters[(t as { characterId: string }).characterId];

export const CARDS: Record<CardType, CardDefinition> = {
  build_bridge: {
    type: 'build_bridge',
    category: 'map',
    targets: (s) =>
      conns(s)
        .filter((c) => c.kind === 'bridge' && !s.bridges[c.id])
        .map((c) => ({ kind: 'connection', connectionId: c.id })),
    apply(ctx, pid, t) {
      if (t.kind !== 'connection') return;
      ctx.state.bridges[t.connectionId] = true;
      log(ctx, `${playerName(ctx.state, pid)} built a bridge.`, 'card', pid);
    },
  },
  break_bridge: {
    type: 'break_bridge',
    category: 'map',
    targets: (s) =>
      conns(s)
        .filter((c) => c.kind === 'bridge' && s.bridges[c.id])
        .filter((c) => keepsConnectivity(s, (x) => (x.bridges[c.id] = false)))
        .map((c) => ({ kind: 'connection', connectionId: c.id })),
    apply(ctx, pid, t) {
      if (t.kind !== 'connection') return;
      ctx.state.bridges[t.connectionId] = false;
      log(ctx, `${playerName(ctx.state, pid)} broke a bridge!`, 'card', pid);
    },
  },
  block_path: {
    type: 'block_path',
    category: 'map',
    targets: (s, pid) =>
      conns(s)
        .filter((c) => c.kind === 'blockable' && !s.blocks.some((b) => b.connectionId === c.id))
        .filter((c) => keepsConnectivity(s, (x) => x.blocks.push({ connectionId: c.id, owner: pid })))
        .map((c) => ({ kind: 'connection', connectionId: c.id })),
    apply(ctx, pid, t) {
      if (t.kind !== 'connection') return;
      ctx.state.blocks.push({ connectionId: t.connectionId, owner: pid });
      log(ctx, `${playerName(ctx.state, pid)} blocked a path until their next turn.`, 'card', pid);
    },
  },
  portal: {
    type: 'portal',
    category: 'map',
    targets(s) {
      const graph = getGraph(s.boardId);
      const sites = graph.board.spaces.filter(
        (sp) => sp.type === 'portalSite' && isSpaceFree(s, sp.id) && !s.tempPortals.some((p) => p.space === sp.id),
      );
      return sites.flatMap((sp) => graph.board.fixedPortals.map((fp) => ({ kind: 'portal' as const, space: sp.id, linkedTo: fp })));
    },
    apply(ctx, pid, t) {
      if (t.kind !== 'portal') return;
      ctx.state.tempPortals.push({ space: t.space, linkedTo: t.linkedTo, owner: pid });
      log(ctx, `${playerName(ctx.state, pid)} opened a temporary portal.`, 'card', pid);
    },
  },
  trap: {
    type: 'trap',
    category: 'map',
    targets: (s) =>
      getGraph(s.boardId)
        .board.spaces.filter(
          (sp) =>
            sp.type === 'normal' &&
            isSpaceFree(s, sp.id) &&
            !s.traps.some((t) => t.space === sp.id) &&
            !s.treasures.some((t) => t.space === sp.id),
        )
        .map((sp) => ({ kind: 'space', space: sp.id })),
    apply(ctx, pid, t) {
      if (t.kind !== 'space') return;
      ctx.state.traps.push({ space: t.space, owner: pid, roundsLeft: ctx.state.config.trapLifetimeRounds });
      log(ctx, `${playerName(ctx.state, pid)} set a trap.`, 'card', pid);
    },
  },
  speed_boost: {
    type: 'speed_boost',
    category: 'power',
    targets: (s, pid) =>
      own(s, pid)
        .filter((c) => !c.recovering)
        .flatMap((c) =>
          enumerateMoves(s, c.id, s.config.speedBoostSteps, false).map((m) => ({
            kind: 'characterPath' as const,
            characterId: c.id,
            path: m.path,
          })),
        ),
    apply(ctx, pid, t) {
      if (t.kind !== 'characterPath') return;
      const option = enumerateMoves(ctx.state, t.characterId, ctx.state.config.speedBoostSteps, false).find(
        (m) => m.path.join('>') === t.path.join('>'),
      );
      if (!option) return;
      log(ctx, `${charLabel(ctx.state, ctx.state.characters[t.characterId])} used Speed Boost.`, 'card', pid);
      applyMoveOption(ctx, option, false);
    },
  },
  shield: {
    type: 'shield',
    category: 'power',
    targets: (s, pid) => own(s, pid).filter((c) => c.power?.type !== 'shield').map(charTarget),
    apply(ctx, pid, t) {
      const c = getChar(ctx, t);
      c.power = { type: 'shield' };
      log(ctx, `${charLabel(ctx.state, c)} raised a Shield.`, 'card', pid);
    },
  },
  attack_boost: {
    type: 'attack_boost',
    category: 'power',
    targets: (s, pid) =>
      own(s, pid)
        .filter((c) => c.power?.type !== 'attack_boost' && acceptsPower(c.kind, 'attack_boost'))
        .map(charTarget),
    apply(ctx, pid, t) {
      const c = getChar(ctx, t);
      c.power = { type: 'attack_boost' };
      log(ctx, `${charLabel(ctx.state, c)} is ready to charge (Attack Boost).`, 'card', pid);
    },
  },
  teleport: {
    type: 'teleport',
    category: 'power',
    targets(s, pid) {
      const portals = getGraph(s.boardId).board.fixedPortals.filter((p) => isSpaceFree(s, p));
      return own(s, pid)
        .filter((c) => !c.recovering)
        .flatMap((c) => portals.map((p) => ({ kind: 'characterSpace' as const, characterId: c.id, space: p })));
    },
    apply(ctx, pid, t) {
      if (t.kind !== 'characterSpace') return;
      const c = ctx.state.characters[t.characterId];
      const from = c.space;
      c.space = t.space;
      ctx.events.push({ type: 'teleported', characterId: c.id, from, to: t.space });
      log(ctx, `${charLabel(ctx.state, c)} teleported to a portal.`, 'card', pid);
      resolveArrival(ctx, c, { regular: false });
    },
  },
  royal_guard: {
    type: 'royal_guard',
    category: 'power',
    targets(s, pid) {
      const castle = s.players.find((p) => p.id === pid)!.castle;
      return s.castles[castle].royalGuard ? [] : [{ kind: 'none' }];
    },
    apply(ctx, pid) {
      const castle = ctx.state.players.find((p) => p.id === pid)!.castle;
      ctx.state.castles[castle].royalGuard = true;
      log(ctx, `${playerName(ctx.state, pid)} posted a Royal Guard.`, 'card', pid);
    },
  },
  swap: {
    type: 'swap',
    category: 'special',
    targets(s, pid) {
      const swappable = (c: Character) => !c.immune && !['castle', 'treasure'].includes(spaceType(s, c.space));
      const mine = own(s, pid).filter(swappable);
      const theirs = Object.values(s.characters).filter((c) => c.owner !== pid && swappable(c));
      return mine.flatMap((a) => theirs.map((b) => ({ kind: 'swap' as const, characterId: a.id, targetCharacterId: b.id })));
    },
    apply(ctx, pid, t) {
      if (t.kind !== 'swap') return;
      const a = ctx.state.characters[t.characterId];
      const b = ctx.state.characters[t.targetCharacterId];
      [a.space, b.space] = [b.space, a.space];
      ctx.events.push({ type: 'swapped', a: a.id, b: b.id });
      log(ctx, `${charLabel(ctx.state, a)} swapped places with ${charLabel(ctx.state, b)}!`, 'card', pid);
    },
  },
  immunity: {
    type: 'immunity',
    category: 'special',
    targets: (s, pid) => own(s, pid).filter((c) => !c.immune).map(charTarget),
    apply(ctx, pid, t) {
      const c = getChar(ctx, t);
      c.immune = true;
      log(ctx, `${charLabel(ctx.state, c)} is Immune until their next turn.`, 'card', pid);
    },
  },
  slow_down: {
    type: 'slow_down',
    category: 'special',
    targets: (s, pid) =>
      opponentsOf(s, pid)
        .filter((p) => !p.slowDownPending)
        .map((p) => ({ kind: 'player', playerId: p.id })),
    apply(ctx, pid, t) {
      if (t.kind !== 'player') return;
      ctx.state.players.find((p) => p.id === t.playerId)!.slowDownPending = true;
      log(ctx, `${playerName(ctx.state, pid)} slowed ${playerName(ctx.state, t.playerId)} down!`, 'card', pid);
    },
  },
  castle_attack: {
    type: 'castle_attack',
    category: 'special',
    targets: (s, pid) =>
      opponentsOf(s, pid)
        .filter((p) => !s.castles[p.castle].damagedBy)
        .map((p) => ({ kind: 'player', playerId: p.id })),
    apply(ctx, pid, t) {
      if (t.kind !== 'player') return;
      const victim = ctx.state.players.find((p) => p.id === t.playerId)!;
      const castle = ctx.state.castles[victim.castle];
      if (castle.royalGuard) {
        castle.royalGuard = false;
        log(ctx, `${victim.name}'s Royal Guard repelled a Castle Attack!`, 'card', pid);
        return;
      }
      castle.damagedBy = pid;
      log(ctx, `${playerName(ctx.state, pid)} damaged ${victim.name}'s castle — no banking until repaired!`, 'card', pid);
    },
  },
  repair: {
    type: 'repair',
    category: 'special',
    targets(s, pid) {
      const castle = s.players.find((p) => p.id === pid)!.castle;
      const out: CardTarget[] = s.castles[castle].damagedBy ? [{ kind: 'none' }] : [];
      for (const b of s.blocks) out.push({ kind: 'connection', connectionId: b.connectionId });
      return out;
    },
    apply(ctx, pid, t) {
      if (t.kind === 'none') {
        const castle = ctx.state.players.find((p) => p.id === pid)!.castle;
        ctx.state.castles[castle].damagedBy = null;
        log(ctx, `${playerName(ctx.state, pid)} repaired their castle.`, 'card', pid);
        bankCarriersInCastle(ctx, castle);
      } else if (t.kind === 'connection') {
        ctx.state.blocks = ctx.state.blocks.filter((b) => b.connectionId !== t.connectionId);
        log(ctx, `${playerName(ctx.state, pid)} cleared a blocked path.`, 'card', pid);
      }
    },
  },
};

export function cardCategory(type: CardType): CardCategory {
  return CARD_INFO[type].category;
}

export function legalTargets(state: PublicState, playerId: string, type: CardType): CardTarget[] {
  return CARDS[type].targets(state, playerId);
}
