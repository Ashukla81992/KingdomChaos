import { BOARD_CONTENT, getBoard, type BoardIndex, type EdgeDef, type MapId, type NodeDef } from '@/engine';
import { SIMPLE_NODES, SIMPLE_ROUTES } from './simpleLayout';

/**
 * How the board is painted. Both modes are the same board: the same spaces, roads and rules. Only the
 * painting and where each space sits on it change, so a player can switch at any time (each device
 * keeps its own choice; an online room is never affected).
 *
 * - simple: the cleaner paintings (public/board/*-simple.jpg), spaces from simpleLayout.ts.
 * - complex: the detailed paintings, spaces from crownLayout.ts.
 */
export type MapMode = 'simple' | 'complex';
export const DEFAULT_MAP_MODE: MapMode = 'simple';

export const MAP_MODES: { id: MapMode; name: string; hint: string }[] = [
  { id: 'simple', name: 'Simple', hint: 'Clean map, easy to read' },
  { id: 'complex', name: 'Detailed', hint: 'Richly painted map' },
];

type Pt = [number, number];

/** The painting (and its soft bleed) for a map in a mode. */
export function mapArt(mode: MapMode, map: MapId): { art: string; bleed: string } {
  const base = mode === 'simple' ? `${map}-simple` : map;
  return { art: `/board/${base}.jpg`, bleed: `/board/${base}-bleed.jpg` };
}

/** The playable middle of the painting: what the opening camera frames on a narrow screen. */
export function mapContent(mode: MapMode): typeof BOARD_CONTENT {
  return mode === 'simple' ? SIMPLE_CONTENT : BOARD_CONTENT;
}
/** The simple island fills more of its painting, so a phone keeps a little more of the sides. */
const SIMPLE_CONTENT = { x: 165, y: 0, w: 1210, h: 1024 };

const cache = new Map<string, BoardIndex>();

/**
 * The board index with positions and road shapes for the chosen painting. Ids, links and every rule
 * field are untouched, so anything keyed by node or edge id works in both modes.
 */
export function viewBoard(boardId: string, mode: MapMode): BoardIndex {
  const base = getBoard(boardId);
  if (mode === 'complex') return base;
  const key = `${boardId}:${mode}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const nodes: Record<string, NodeDef> = {};
  for (const n of base.board.nodes) nodes[n.id] = { ...n, xy: SIMPLE_NODES[n.id] ?? n.xy };
  const edges: Record<string, EdgeDef> = {};
  for (const e of base.board.edges) {
    const route = SIMPLE_ROUTES[e.id] ?? [nodes[e.a].xy, nodes[e.b].xy];
    edges[e.id] = { ...e, route };
  }
  const list = <T extends { id: string }>(xs: T[], by: Record<string, T>) => xs.map((x) => by[x.id]);
  const board = { ...base.board, nodes: list(base.board.nodes, nodes), edges: list(base.board.edges, edges) };
  const remap = (xs: EdgeDef[]) => xs.map((x) => edges[x.id]);
  const adj = Object.fromEntries(Object.entries(base.adj).map(([k, v]) => [k, remap(v)]));
  const out = Object.fromEntries(Object.entries(base.out).map(([k, v]) => [k, remap(v)]));
  const index: BoardIndex = { board, nodes, edges, adj, out, houseBySeat: base.houseBySeat };
  cache.set(key, index);
  return index;
}

/**
 * Move a point given in detailed-painting pixels (a road midpoint from the rules, say) onto the chosen
 * painting: it keeps its offset from the nearest space on that map.
 */
export function viewPoint(boardId: string, mode: MapMode, map: MapId, p: Pt): Pt {
  if (mode === 'complex') return p;
  const base = getBoard(boardId);
  let best: NodeDef | null = null;
  let bestD = Infinity;
  for (const n of base.board.nodes) {
    if (n.map !== map) continue;
    const d = Math.hypot(n.xy[0] - p[0], n.xy[1] - p[1]);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (!best) return p;
  const to = viewBoard(boardId, mode).nodes[best.id].xy;
  return [to[0] + p[0] - best.xy[0], to[1] + p[1] - best.xy[1]];
}

/** Median length of one step on a map in this painting (scales Dragon Fire's drawn circle). */
export function viewStepLength(boardId: string, mode: MapMode, map: MapId): number {
  const { nodes, edges } = viewBoard(boardId, mode);
  const lens = Object.values(edges)
    .filter((e) => nodes[e.a].map === map && nodes[e.b].map === map)
    .map((e) => Math.hypot(nodes[e.a].xy[0] - nodes[e.b].xy[0], nodes[e.a].xy[1] - nodes[e.b].xy[1]))
    .sort((a, b) => a - b);
  return lens.length ? lens[lens.length >> 1] : 80;
}
