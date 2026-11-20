import { getBoard, other } from './board';
import type { BoardState, EdgeDef } from './types';

export type EdgeView = Pick<BoardState, 'boardId' | 'bridges' | 'blocks' | 'transforms'>;

/** Is this edge walkable right now (structure built, no landslide, no terrain change at either end)? */
export function edgeOpen(s: Omit<EdgeView, 'boardId'>, edge: EdgeDef): boolean {
  if (s.transforms[edge.a] || s.transforms[edge.b]) return false;
  if (edge.kind === 'buildable') return !!s.bridges[edge.gate ?? edge.id];
  if (edge.kind === 'blockable') return !s.blocks.some((b) => b.edgeId === edge.id);
  return true;
}

export function edgeBlocked(s: Pick<BoardState, 'blocks'>, edge: EdgeDef): boolean {
  return edge.kind === 'blockable' && s.blocks.some((b) => b.edgeId === edge.id);
}

/** Open edges at a node, ignoring direction (used for distances, Dragon Fire range and connectivity). */
export function openEdges(s: EdgeView, node: string): EdgeDef[] {
  return getBoard(s.boardId).adj[node].filter((e) => edgeOpen(s, e));
}

/** BFS distance along open paths, ignoring one-way direction. */
export function walkingDistances(s: EdgeView, from: string, limit = Infinity): Record<string, number> {
  const dist: Record<string, number> = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (dist[cur] >= limit) continue;
    for (const ed of openEdges(s, cur)) {
      const nx = other(ed, cur);
      if (dist[nx] === undefined) {
        dist[nx] = dist[cur] + 1;
        queue.push(nx);
      }
    }
  }
  return dist;
}

/**
 * Directed travel distance (respects one-way edges) plus the dungeon transitions, each costing one
 * step. Used by the AI to rank routes.
 */
export function travelDistances(s: EdgeView, from: string, passable: (node: string) => boolean = () => true): Record<string, number> {
  const { out, board } = getBoard(s.boardId);
  const dist: Record<string, number> = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    const next: string[] = out[cur].filter((ed) => edgeOpen(s, ed)).map((ed) => other(ed, cur));
    for (const t of board.transitions) {
      if (t.island === cur) next.push(t.dungeon);
      if (t.dungeon === cur) next.push(t.island);
    }
    for (const nx of next) {
      if (dist[nx] !== undefined || !passable(nx)) continue;
      dist[nx] = dist[cur] + 1;
      queue.push(nx);
    }
  }
  return dist;
}

/**
 * Anti-trapping for map cards: every castle and character must still reach its map hub, and every
 * active kingdom must still reach its castle, all four house plates, and its Royal Path entry
 * (fork). Returns false when a change would cut any of those off.
 */
export function keepsEveryoneConnected(s: BoardState, change: Partial<Pick<BoardState, 'bridges' | 'blocks' | 'transforms'>>): boolean {
  return connectionBreakReason(s, change) === null;
}

/** Why a proposed map change is refused, or null when it is safe. */
export function connectionBreakReason(
  s: BoardState,
  change: Partial<Pick<BoardState, 'bridges' | 'blocks' | 'transforms'>>,
): string | null {
  const next: EdgeView = {
    boardId: s.boardId,
    bridges: change.bridges ?? s.bridges,
    blocks: change.blocks ?? s.blocks,
    transforms: change.transforms ?? s.transforms,
  };
  const { board, nodes } = getBoard(s.boardId);
  const hubs = Object.fromEntries(board.maps.map((m) => [m.id, m.hub]));
  const reach = Object.fromEntries(board.maps.map((m) => [m.id, walkingDistances(next, m.hub)]));
  const reachable = (node: string) => {
    const map = nodes[node]?.map;
    if (!map) return false;
    return node === hubs[map] || reach[map][node] !== undefined;
  };

  for (const p of s.players) {
    if (!reachable(p.castle)) return `That change would cut ${p.name} off from their castle.`;
  }
  for (const c of Object.values(s.characters)) {
    if (!reachable(c.node)) return `That change would strand a piece at ${nodes[c.node]?.name ?? c.node}.`;
  }

  const islandHub = hubs.island;
  if (islandHub) {
    const islandReach = reach.island;
    const plates = board.houses.map((h) => h.plate);
    for (const plate of plates) {
      if (plate !== islandHub && islandReach[plate] === undefined) {
        return 'That change would cut a house plate off from the island.';
      }
    }
    for (const h of board.houses) {
      const active = s.players.some((p) => p.seat === h.seat);
      if (!active) continue;
      if (h.castle !== islandHub && islandReach[h.castle] === undefined) {
        return `That change would cut ${h.name} off from their castle.`;
      }
      if (h.branch !== islandHub && islandReach[h.branch] === undefined) {
        return `That change would cut ${h.name} off from their Royal Path entry.`;
      }
      for (const plate of plates) {
        if (plate !== islandHub && islandReach[plate] === undefined) {
          return `That change would cut ${h.name} off from a house plate.`;
        }
      }
    }
  }
  return null;
}

export const mapOf = (boardId: string, node: string) => getBoard(boardId).nodes[node].map;

const stepCache = new Map<string, number>();
/** Typical length of one step on a map, in artwork pixels (median road length between neighbouring spaces). */
export function mapStepLength(boardId: string, map: string): number {
  const key = `${boardId}:${map}`;
  const hit = stepCache.get(key);
  if (hit) return hit;
  const { nodes, edges } = getBoard(boardId);
  const lens = Object.values(edges)
    .filter((e) => nodes[e.a].map === map && nodes[e.b].map === map)
    .map((e) => Math.hypot(nodes[e.a].xy[0] - nodes[e.b].xy[0], nodes[e.a].xy[1] - nodes[e.b].xy[1]))
    .sort((a, b) => a - b);
  const len = lens.length ? lens[lens.length >> 1] : 80;
  stepCache.set(key, len);
  return len;
}

/** Dragon Fire's circular reach: its radius in artwork pixels on `node`'s map (range × one typical step). */
export function fireRadius(boardId: string, node: string, range: number): number {
  return range * mapStepLength(boardId, mapOf(boardId, node));
}

/**
 * Straight-line distance between two spaces, measured in typical steps of their map ("as the dragon
 * flies": roads, walls and closed paths do not matter). Infinity when they are on different maps.
 */
export function flyingSteps(boardId: string, from: string, to: string): number {
  const { nodes } = getBoard(boardId);
  const a = nodes[from], b = nodes[to];
  if (!a || !b || a.map !== b.map) return Infinity;
  return Math.hypot(a.xy[0] - b.xy[0], a.xy[1] - b.xy[1]) / mapStepLength(boardId, a.map);
}
export const nodeName = (boardId: string, node: string) => getBoard(boardId).nodes[node]?.name ?? node;

export { mapMarkers, type MapMarker, type MapMarkerKind } from './markers';
