import { buildCrownQuest } from './crownquest';
import type { BoardDef, EdgeDef, HouseInfo, NodeDef } from './types';

export { ISLAND_SIZE, CIRCUIT_LENGTH, FINAL_LENGTH, HOUSES } from './crownLayout';
export { circuitId } from './crownquest';

/** Kingdom Chaos: Crown Quest. The layout lives in crownLayout.ts; this module indexes it. */
export const CROWN_QUEST: BoardDef = buildCrownQuest();

export const DUNGEON_ENTRANCE = 'd-entrance';
export const DUNGEON_GATE = CROWN_QUEST.transitions[0].island;
export const DRAGON_HOME = CROWN_QUEST.dragonHome;
export const TEMPLE = CROWN_QUEST.temple;

export const BOARDS: Record<string, BoardDef> = { [CROWN_QUEST.id]: CROWN_QUEST };

export interface BoardIndex {
  board: BoardDef;
  nodes: Record<string, NodeDef>;
  edges: Record<string, EdgeDef>;
  /** node -> incident edges (both directions). */
  adj: Record<string, EdgeDef[]>;
  /** node -> edges that may be walked out of it (respects one-way edges). */
  out: Record<string, EdgeDef[]>;
  houseBySeat: Record<number, HouseInfo>;
}

const cache = new Map<string, BoardIndex>();

export function getBoard(id: string): BoardIndex {
  const hit = cache.get(id);
  if (hit) return hit;
  const board = BOARDS[id];
  if (!board) throw new Error(`Unknown board ${id}`);
  const nodes = Object.fromEntries(board.nodes.map((x) => [x.id, x]));
  const edges = Object.fromEntries(board.edges.map((x) => [x.id, x]));
  const adj: Record<string, EdgeDef[]> = Object.fromEntries(board.nodes.map((x) => [x.id, []]));
  const out: Record<string, EdgeDef[]> = Object.fromEntries(board.nodes.map((x) => [x.id, []]));
  for (const ed of board.edges) {
    adj[ed.a].push(ed);
    adj[ed.b].push(ed);
    out[ed.a].push(ed);
    if (!ed.oneWay) out[ed.b].push(ed);
  }
  const houseBySeat = Object.fromEntries(board.houses.map((h) => [h.seat, h]));
  const index = { board, nodes, edges, adj, out, houseBySeat };
  cache.set(id, index);
  return index;
}

export const other = (edge: EdgeDef, node: string) => (edge.a === node ? edge.b : edge.a);

/** Label for a card target that points at an edge, a structure gate, or a space. */
export function describeTarget(boardId: string, id: string): string {
  const { edges, nodes, board } = getBoard(boardId);
  const edge = edges[id];
  if (edge?.name) return edge.name;
  if (edge) return `${nodes[edge.a]?.name ?? edge.a} – ${nodes[edge.b]?.name ?? edge.b}`;
  const gated = board.edges.find((e) => e.gate === id);
  if (gated?.name) return gated.name;
  const node = nodes[id];
  if (node) return node.name;
  return id;
}
