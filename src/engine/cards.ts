import { getBoard } from './board';
import { edgeBlocked, keepsEveryoneConnected, nodeName, walkingDistances } from './graph';
import {
  CARD_CATEGORY,
  gemsOf,
  gemList,
  arrive,
  bankAtHome,
  charLabel,
  companionOf,
  dragonBlocks,
  dragonNode,
  drawDiscovery,
  enumerateMoves,
  isCompanion,
  isProtected,
  log,
  playerName,
  playerOf,
  relocate,
  resetLap,
  retreat,
  roll,
  structureName,
  walk,
  type Ctx,
} from './rules';
import type { BoardState, CardCategory, CardTarget, CardType, EdgeDef, GameState } from './types';

export interface CardDef {
  category: CardCategory;
  /** Lists every legal target right now (empty → the card cannot be played). */
  targets: (s: BoardState, playerId: string) => CardTarget[];
  apply: (ctx: Ctx, playerId: string, target: CardTarget, discardCardId?: string | null) => void;
}

export const cardCategory = (t: CardType) => CARD_CATEGORY[t];

export function targetKey(t: CardTarget): string {
  switch (t.kind) {
    case 'edge':
      return `e:${t.edgeId}`;
    case 'node':
      return `n:${t.node}`;
    case 'character':
      return `c:${t.characterId}`;
    case 'path':
      return `p:${t.characterId}:${t.path.join('>')}`;
    case 'swap':
      return `s:${t.characterId}:${t.targetId}`;
    case 'dragonTo':
      return `d:${t.node}`;
    case 'player':
      return `pl:${t.playerId}`;
  }
}

const own = (s: BoardState, pid: string) => Object.values(s.characters).filter((c) => c.owner === pid);
const lane = (s: BoardState, node: string) => getBoard(s.boardId).nodes[node].lane;
const onRoad = (s: BoardState, node: string) => lane(s, node) === 'circuit' || lane(s, node) === 'side';
const occupied = (s: BoardState, node: string) => Object.values(s.characters).some((c) => c.node === node);

/** One representative edge per structure gate. */
function gateEdges(s: BoardState, structure: EdgeDef['structure'], open: boolean): EdgeDef[] {
  const seen = new Set<string>();
  const out: EdgeDef[] = [];
  for (const e of getBoard(s.boardId).board.edges) {
    if (e.kind !== 'buildable' || e.structure !== structure || !e.gate || seen.has(e.gate)) continue;
    seen.add(e.gate);
    if (!!s.bridges[e.gate] === open) out.push(e);
  }
  return out;
}

const setGate = (s: BoardState, gate: string, open: boolean) => ({ ...s.bridges, [gate]: open });

function openGate(ctx: Ctx, edgeId: string, verb: string, by?: string, card?: CardType) {
  const s = ctx.state;
  const e = getBoard(s.boardId).edges[edgeId];
  s.bridges[e.gate!] = true;
  ctx.events.push({ type: 'edgeChanged', edgeId, change: 'opened', by, card });
  log(ctx, `The ${structureName(e)} is ${verb} — every house may use it.`, 'info');
}

const edgeTargets = (edges: EdgeDef[]): CardTarget[] => edges.map((e) => ({ kind: 'edge', edgeId: e.id }));

function terrainTargets(s: BoardState): CardTarget[] {
  return getBoard(s.boardId)
    .board.nodes.filter((n) => n.terrainSite && !s.transforms[n.id] && !occupied(s, n.id))
    .filter((n) => keepsEveryoneConnected(s, { transforms: { ...s.transforms, [n.id]: 'mountain' } }))
    .map((n) => ({ kind: 'node', node: n.id }));
}

function transform(kind: 'mountain' | 'river') {
  return (ctx: Ctx, pid: string, t: CardTarget) => {
    if (t.kind !== 'node') return;
    ctx.state.transforms[t.node] = kind;
    ctx.events.push({ type: 'terrainChanged', node: t.node, to: kind, by: pid });
    log(ctx, `${playerName(ctx.state, pid)} ${kind === 'mountain' ? 'raises a mountain' : 'floods a river'} at ${nodeName(ctx.state.boardId, t.node)} — the road there is closed.`, 'info', pid);
  };
}

export const CARDS: Record<CardType, CardDef> = {
  // ------------------------------------------------------------ map
  build_bridge: {
    category: 'map',
    targets: (s) => edgeTargets(gateEdges(s, 'bridge', false)),
    apply: (ctx, pid, t) => t.kind === 'edge' && openGate(ctx, t.edgeId, 'rebuilt and open', pid, 'build_bridge'),
  },
  collapse_bridge: {
    category: 'map',
    targets: (s) => edgeTargets(gateEdges(s, 'bridge', true).filter((e) => !occupied(s, e.a) && !occupied(s, e.b) && keepsEveryoneConnected(s, { bridges: setGate(s, e.gate!, false) }))),
    apply: (ctx, pid, t) => {
      if (t.kind !== 'edge') return;
      const e = getBoard(ctx.state.boardId).edges[t.edgeId];
      ctx.state.bridges[e.gate!] = false;
      ctx.events.push({ type: 'edgeChanged', edgeId: t.edgeId, change: 'closed', by: pid, card: 'collapse_bridge' });
      log(ctx, `The ${e.name ?? 'bridge'} collapses!`, 'bad');
    },
  },
  dig_tunnel: {
    category: 'map',
    targets: (s) => edgeTargets(gateEdges(s, 'tunnel', false)),
    apply: (ctx, pid, t) => t.kind === 'edge' && openGate(ctx, t.edgeId, 'dug through and open', pid, 'dig_tunnel'),
  },
  build_road: {
    category: 'map',
    targets: (s) => edgeTargets(gateEdges(s, 'road', false)),
    apply: (ctx, pid, t) => t.kind === 'edge' && openGate(ctx, t.edgeId, 'paved and open', pid, 'build_road'),
  },
  raise_mountain: { category: 'map', targets: terrainTargets, apply: transform('mountain') },
  create_river: { category: 'map', targets: terrainTargets, apply: transform('river') },
  landslide: {
    category: 'map',
    targets: (s, pid) =>
      edgeTargets(
        getBoard(s.boardId)
          .board.edges.filter((e) => e.kind === 'blockable' && !edgeBlocked(s, e))
          .filter((e) => keepsEveryoneConnected(s, { blocks: [...s.blocks.filter((b) => b.owner !== pid), { edgeId: e.id, owner: pid }] })),
      ),
    apply: (ctx, pid, t) => {
      if (t.kind !== 'edge') return;
      const s = ctx.state;
      const moved = s.blocks.find((b) => b.owner === pid);
      s.blocks = [...s.blocks.filter((b) => b.owner !== pid), { edgeId: t.edgeId, owner: pid }];
      ctx.events.push({ type: 'edgeChanged', edgeId: t.edgeId, change: 'blocked', by: pid, card: 'landslide' });
      log(ctx, `${playerName(s, pid)} triggers a landslide on ${getBoard(s.boardId).edges[t.edgeId].name ?? 'a pass'}${moved ? ' (their earlier landslide clears)' : ''}.`, 'info', pid);
    },
  },
  repair: {
    category: 'map',
    targets: (s) => [
      ...s.blocks.map((b): CardTarget => ({ kind: 'edge', edgeId: b.edgeId })),
      ...edgeTargets(gateEdges(s, 'bridge', false)),
      ...Object.keys(s.transforms).map((node): CardTarget => ({ kind: 'node', node })),
    ],
    apply: (ctx, pid, t) => {
      const s = ctx.state;
      if (t.kind === 'node') {
        delete s.transforms[t.node];
        ctx.events.push({ type: 'terrainChanged', node: t.node, to: null, by: pid });
        log(ctx, `${playerName(s, pid)} restores the road at ${nodeName(s.boardId, t.node)}.`, 'info', pid);
      } else if (t.kind === 'edge') {
        if (s.blocks.some((b) => b.edgeId === t.edgeId)) {
          s.blocks = s.blocks.filter((b) => b.edgeId !== t.edgeId);
          ctx.events.push({ type: 'edgeChanged', edgeId: t.edgeId, change: 'cleared', by: pid, card: 'repair' });
          log(ctx, `${playerName(s, pid)} clears the landslide.`, 'info', pid);
        } else openGate(ctx, t.edgeId, 'repaired and open', pid, 'repair');
      }
    },
  },

  // ------------------------------------------------------------ power
  shield: {
    category: 'power',
    targets: (s, pid) => own(s, pid).filter((c) => !c.shield && lane(s, c.node) !== 'temple').map((c) => ({ kind: 'character', characterId: c.id })),
    apply: (ctx, _pid, t) => {
      if (t.kind !== 'character') return;
      ctx.state.characters[t.characterId].shield = true;
      log(ctx, `${charLabel(ctx.state, t.characterId)} raises a Shield: no cuts and no Dragon Fire until their next turn.`, 'good');
    },
  },
  magic_boots: {
    category: 'power',
    targets: (s, pid) =>
      own(s, pid).flatMap((c) =>
        enumerateMoves(s, c.id, { steps: s.config.magicBootsSteps, allowCuts: false, portals: false })
          .filter((m) => m.cost === s.config.magicBootsSteps)
          .map((m): CardTarget => ({ kind: 'path', characterId: c.id, path: m.path })),
      ),
    apply: (ctx, _pid, t, discardCardId) => {
      if (t.kind !== 'path') return;
      const s = ctx.state;
      const ch = s.characters[t.characterId];
      const option = enumerateMoves(s, ch.id, { steps: s.config.magicBootsSteps, allowCuts: false, portals: false }).find((m) => m.path.join('>') === t.path.join('>'))!;
      log(ctx, `${charLabel(s, ch.id)} pulls on Magic Boots.`, 'good', ch.owner);
      ctx.events.push({ type: 'moved', characterId: ch.id, path: t.path });
      walk(ctx, ch, option, discardCardId);
    },
  },
  immunity: {
    category: 'power',
    targets: (s, pid) => own(s, pid).filter((c) => !c.immune && lane(s, c.node) !== 'temple').map((c) => ({ kind: 'character', characterId: c.id })),
    apply: (ctx, _pid, t) => {
      if (t.kind !== 'character') return;
      ctx.state.characters[t.characterId].immune = true;
      log(ctx, `${charLabel(ctx.state, t.characterId)} is Immune until their next turn: no cuts, no Dragon Fire, no opposing cards.`, 'good');
    },
  },
  dragon_slayer: {
    category: 'power',
    targets: (s, pid) => {
      if (s.dragon.state === 'recovering' || companionOf(s, pid)) return [];
      const dn = dragonNode(s);
      const { nodes } = getBoard(s.boardId);
      return own(s, pid)
        .filter((c) => c.kind === 'queen' && nodes[c.node].map === nodes[dn].map)
        .filter((c) => (walkingDistances(s, c.node, 1)[dn] ?? 99) <= 1)
        .map((c) => ({ kind: 'character', characterId: c.id }));
    },
    apply: (ctx, pid, t) => {
      if (t.kind !== 'character') return;
      const s = ctx.state;
      const queen = s.characters[t.characterId];
      const value = roll(s);
      const success = value >= s.config.slayThreshold;
      s.stats[pid].slayAttempts++;
      ctx.events.push({ type: 'slay', characterId: queen.id, roll: value, success });
      if (success) {
        s.stats[pid].slays++;
        s.dragon = { state: 'recovering', node: getBoard(s.boardId).board.dragonHome, companion: null, recoverUntilTurn: s.turn.number + s.players.length - 1, releasedBy: null };
        log(ctx, `${charLabel(s, queen.id)} rolls ${value} and drives the dragon back to its lair to recover for a round!`, 'dragon', pid);
      } else {
        log(ctx, `${charLabel(s, queen.id)} rolls ${value} — the dragon swats her away.`, 'bad', pid);
        retreat(ctx, queen);
      }
    },
  },
  dragon_feast: {
    category: 'power',
    targets: (s, pid) => (canTameHere(s, pid) ? own(s, pid).filter((c) => c.node === s.dragon.node).map((c) => ({ kind: 'character', characterId: c.id })) : []),
    apply: (ctx, pid, t) => t.kind === 'character' && attemptTame(ctx, pid, t.characterId, ctx.state.config.feastTameThreshold),
  },

  // ------------------------------------------------------------ special
  swap: {
    category: 'special',
    targets: (s, pid) => {
      const mine = own(s, pid).filter((c) => onRoad(s, c.node) && !isCompanion(s, c.id));
      const theirs = Object.values(s.characters).filter((c) => c.owner !== pid && onRoad(s, c.node) && !isProtected(c) && !isCompanion(s, c.id));
      return mine.flatMap((a) => theirs.filter((b) => b.node !== a.node).map((b): CardTarget => ({ kind: 'swap', characterId: a.id, targetId: b.id })));
    },
    apply: (ctx, pid, t) => {
      if (t.kind !== 'swap') return;
      const s = ctx.state;
      const a = s.characters[t.characterId];
      const b = s.characters[t.targetId];
      const [an, bn] = [a.node, b.node];
      log(ctx, `${playerName(s, pid)} swaps ${charLabel(s, a.id)} and ${charLabel(s, b.id)}.`, 'info', pid);
      relocate(ctx, a, bn, 'swap');
      relocate(ctx, b, an, 'swap');
    },
  },
  slow_down: {
    category: 'special',
    targets: (s, pid) => s.players.filter((p) => p.id !== pid && !p.slowed).map((p) => ({ kind: 'player', playerId: p.id })),
    apply: (ctx, pid, t) => {
      if (t.kind !== 'player') return;
      playerOf(ctx.state, t.playerId).slowed = true;
      log(ctx, `${playerName(ctx.state, pid)} slows ${playerName(ctx.state, t.playerId)}: their next move is at most ${ctx.state.config.slowDownMaxSteps} spaces.`, 'info', pid);
    },
  },
  dragon_roar: {
    category: 'special',
    targets: (s) => {
      if (!dragonBlocks(s)) return [];
      const { nodes } = getBoard(s.boardId);
      const dist = walkingDistances(s, s.dragon.node, 3);
      return Object.entries(dist)
        .filter(([n, d]) => d > 0 && (nodes[n].lane === 'circuit' || nodes[n].lane === 'side' || nodes[n].lane === 'dungeon'))
        .map(([n]): CardTarget => ({ kind: 'dragonTo', node: n }));
    },
    apply: (ctx, pid, t) => {
      if (t.kind !== 'dragonTo') return;
      const s = ctx.state;
      s.dragon = { ...s.dragon, state: 'wild', node: t.node };
      ctx.events.push({ type: 'dragonMoved', to: t.node });
      log(ctx, `${playerName(s, pid)}'s Dragon Roar drives the dragon to ${nodeName(s.boardId, t.node)}. It runs wild there.`, 'dragon', pid);
    },
  },
  rescue: {
    category: 'special',
    targets: (s, pid) =>
      own(s, pid)
        .filter((c) => !['home', 'final', 'temple'].includes(lane(s, c.node)))
        .map((c) => ({ kind: 'character', characterId: c.id })),
    apply: (ctx, pid, t, discardCardId) => {
      if (t.kind !== 'character') return;
      const s = ctx.state;
      const ch = s.characters[t.characterId];
      const gems = gemsOf(s, ch);
      log(ctx, `${charLabel(s, ch.id)} is rescued and carried home${gems.length ? ` with ${gemList(gems.map((g) => g.kind))}` : ''}. Their plates start over.`, 'good', pid);
      if (isCompanion(s, ch.id)) s.dragon = { ...s.dragon, state: 'wild', companion: null, node: ch.node, releasedBy: null };
      relocate(ctx, ch, playerOf(s, pid).castle, 'rescue');
      resetLap(ch);
      ch.beatMonster = false;
      bankAtHome(ctx, ch, discardCardId);
    },
  },
  reveal_discovery: {
    category: 'special',
    targets: (s, pid) => own(s, pid).filter((c) => !['home', 'final', 'temple'].includes(lane(s, c.node))).map((c) => ({ kind: 'character', characterId: c.id })),
    apply: (ctx, _pid, t, discardCardId) => {
      if (t.kind !== 'character') return;
      const ch = ctx.state.characters[t.characterId];
      log(ctx, `${charLabel(ctx.state, ch.id)} reads a treasure map…`, 'info', ch.owner);
      drawDiscovery(ctx, ch, discardCardId);
      arrive(ctx, ch, discardCardId);
    },
  },
};

export function cardTargets(s: BoardState, playerId: string, type: CardType): CardTarget[] {
  return CARDS[type].targets(s, playerId);
}

// ---------------------------------------------------------------- taming (shared by the action and Dragon Feast)

export function canTameHere(s: BoardState, playerId: string, characterId?: string): boolean {
  if (!dragonBlocks(s) || companionOf(s, playerId) || s.dragon.releasedBy === playerId) return false;
  return Object.values(s.characters).some((c) => c.owner === playerId && c.node === s.dragon.node && (!characterId || c.id === characterId));
}

export function attemptTame(ctx: Ctx, playerId: string, characterId: string, threshold: number) {
  const s = ctx.state as GameState;
  const ch = s.characters[characterId];
  const value = roll(s);
  const success = value >= threshold;
  s.stats[playerId].tameAttempts++;
  ctx.events.push({ type: 'tame', characterId, roll: value, success });
  if (success) {
    s.stats[playerId].tames++;
    s.dragon = { state: 'companion', node: ch.node, companion: ch.id, recoverUntilTurn: 0, releasedBy: null };
    log(ctx, `${charLabel(s, ch.id)} rolls ${value} and tames the dragon! It now travels with them (moves are 2 shorter) and can breathe fire.`, 'dragon', playerId);
  } else {
    log(ctx, `${charLabel(s, ch.id)} rolls ${value} (needs ${threshold}+) — the dragon roars them away.`, 'bad', playerId);
    retreat(ctx, ch);
  }
}
