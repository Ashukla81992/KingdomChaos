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
 * The anti-trapping guarantee for map cards: every castle and every character must still reach
 * the hub of its map. The main circuit is never changeable, so this only guards side routes.
 */
export function keepsEveryoneConnected(s: BoardState, change: Partial<Pick<BoardState, 'bridges' | 'blocks' | 'transforms'>>): boolean {
  const next: EdgeView = {
    boardId: s.boardId,
    bridges: change.bridges ?? s.bridges,
    blocks: change.blocks ?? s.blocks,
    transforms: change.transforms ?? s.transforms,
  };
  const { board, nodes } = getBoard(s.boardId);
  const hubs = Object.fromEntries(board.maps.map((m) => [m.id, m.hub]));
  const reach = Object.fromEntries(board.maps.map((m) => [m.id, walkingDistances(next, m.hub)]));
  const mustReach = new Set<string>(s.players.map((p) => p.castle));
  for (const c of Object.values(s.characters)) mustReach.add(c.node);
  for (const node of mustReach) {
    const map = nodes[node].map;
    if (node !== hubs[map] && reach[map][node] === undefined) return false;
  }
  return true;
}

export const mapOf = (boardId: string, node: string) => getBoard(boardId).nodes[node].map;
export const nodeName = (boardId: string, node: string) => getBoard(boardId).nodes[node]?.name ?? node;
