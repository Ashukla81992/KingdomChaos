import type { BoardConnection, BoardDefinition, BoardSpace, SpaceType, Terrain } from './types';

/**
 * "Isle of Embers" — a hand-drawn 15×15 terrain map.
 *
 * Castles sit at the middle of each edge (north, east, south, west). The middle
 * row and column are the king's road: map cards can never reshape it, so every
 * castle always has a route to treasure. Off the road the island is broken up
 * by an ocean coast, a river that cuts across the north and runs south, a lake,
 * mountain ranges and plateaus. Some coves can only be reached by boat or glider.
 *
 * A few squares keep short ids (c0, g0, r0, m1, x, …) because rules tests and
 * the tutorial script those exact squares. They sit on and around the north road:
 *   c0 → g0 → r0 → r1 (bridge) → r2 → m1 (Moonwell) → i1 → x (Dragon Hoard)
 */

export const GRID = 15;
const CELL = 64;
const PAD = 96;

/**
 * Terrain legend: w ocean · o lake · ~ river · ^ mountain · P plateau · f forest
 * · . meadow · B bridge · T tunnel · h harbor · a airfield · C castle · x hoard.
 */
const MAP = [
  'ww.^^..C..oo.ww',
  'wf.^^a..f.ooo.w',
  'wh.^^.......o.w',
  'w~B~~~~B~~B~~~w',
  'w..ff......~^^w',
  'w.PPP......~^^w',
  'w.PPP......~^.w',
  'C......x...B..C',
  'w.ff.......~.aw',
  'woo.^^.....~f.w',
  'wooo^^...PP~..w',
  'woh.^T...PPB..w',
  'wa.........~..w',
  'ww.ff......~.ww',
  'www....C...~www',
];

const LEGEND: Record<string, Terrain> = {
  w: 'ocean',
  o: 'lake',
  '~': 'river',
  '^': 'mountain',
  P: 'plateau',
  f: 'forest',
  '.': 'grass',
  B: 'bridge',
  T: 'tunnel',
  h: 'harbor',
  a: 'airfield',
  C: 'grass',
  x: 'grass',
};

const SPECIAL: Record<string, { id: string; type: SpaceType; seat?: number }> = {
  '7,0': { id: 'c0', type: 'castle', seat: 0 },
  '7,1': { id: 'g0', type: 'normal' },
  '7,2': { id: 'r0', type: 'normal' },
  '7,3': { id: 'r1', type: 'portalSite' },
  '7,4': { id: 'r2', type: 'normal' },
  '7,5': { id: 'm1', type: 'treasure' },
  '7,6': { id: 'i1', type: 'normal' },
  '7,7': { id: 'x', type: 'treasure' },
  '14,7': { id: 'c1', type: 'castle', seat: 1 },
  '13,7': { id: 'g1', type: 'normal' },
  '0,7': { id: 'c3', type: 'castle', seat: 3 },
  '1,7': { id: 'g3', type: 'normal' },
  '7,14': { id: 'c2', type: 'castle', seat: 2 },
  '7,13': { id: 'g2', type: 'normal' },
  '8,13': { id: 'r8', type: 'normal' },
  '8,2': { id: 'm0', type: 'card' },
  '6,6': { id: 'i0', type: 'normal' },
  '6,2': { id: 'r15', type: 'normal' },
  '8,4': { id: 'r3', type: 'normal' },
  '9,4': { id: 'r4', type: 'normal' },
  '6,8': { id: 'r9', type: 'normal' },
  '3,11': { id: 'm5', type: 'treasure' },
  '12,7': { id: 'm3', type: 'portal' },
  '2,7': { id: 'm7', type: 'portal' },
};

const PORTAL_SITES = new Set(['2,2', '9,2', '2,12', '12,12']);

function cellId(c: number, r: number): string {
  return SPECIAL[`${c},${r}`]?.id ?? `p${c}-${r}`;
}

function terrainAt(c: number, r: number): Terrain {
  const t = LEGEND[MAP[r][c]];
  if (!t) throw new Error(`Unknown terrain '${MAP[r][c]}' at ${c},${r}`);
  return t;
}

const isRoad = (c: number, r: number) => c === 7 || r === 7;

function cellType(c: number, r: number, terrain: Terrain): SpaceType {
  const special = SPECIAL[`${c},${r}`];
  if (special) return special.type;
  const land = terrain !== 'ocean' && terrain !== 'lake' && terrain !== 'river' && terrain !== 'mountain';
  if (!land) return 'normal';
  if (PORTAL_SITES.has(`${c},${r}`)) return 'portalSite';
  if ((c * 3 + r * 5) % 9 === 0 && !isRoad(c, r)) return 'card';
  return 'normal';
}

function buildIsleOfEmbers(): BoardDefinition {
  if (MAP.length !== GRID || MAP.some((row) => row.length !== GRID)) throw new Error('Isle of Embers map must be 15×15');
  const spaces: BoardSpace[] = [];
  const connections: BoardConnection[] = [];

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const special = SPECIAL[`${c},${r}`];
      const terrain = terrainAt(c, r);
      spaces.push({
        id: cellId(c, r),
        type: cellType(c, r, terrain),
        x: PAD + c * CELL,
        y: PAD + r * CELL,
        terrain,
        ...(isRoad(c, r) ? { road: true } : {}),
        ...(special?.seat === undefined ? {} : { seat: special.seat }),
      });
    }
  }

  const walkable = new Set<Terrain>(['grass', 'forest', 'plateau', 'bridge', 'tunnel', 'harbor', 'airfield']);
  const isWalk = (t: Terrain) => walkable.has(t);
  const seen = new Set<string>();

  /** `foot` edges are the pale paths you walk. Other edges only let boats and gliders cross. */
  const add = (c: number, r: number, c2: number, r2: number, foot: boolean) => {
    if (c2 < c || (c2 === c && r2 < r)) return add(c2, r2, c, r, foot);
    const a = cellId(c, r);
    const b = cellId(c2, r2);
    const id = `${a}-${b}`;
    if (seen.has(id)) return;
    seen.add(id);
    const road = (c === 7 && c2 === 7) || (r === 7 && r2 === 7);
    const kind: BoardConnection['kind'] = road || !foot ? 'permanent' : 'blockable';
    connections.push({ id, a, b, kind });
  };

  const trail = (cells: [number, number][]) => {
    for (let i = 1; i < cells.length; i++) {
      const [c, r] = cells[i - 1];
      const [c2, r2] = cells[i];
      if (Math.abs(c - c2) + Math.abs(r - r2) !== 1) throw new Error(`Trail step ${c},${r} → ${c2},${r2} is not a neighbour`);
      if (!isWalk(terrainAt(c, r)) || !isWalk(terrainAt(c2, r2))) throw new Error(`Trail leaves land at ${c},${r} → ${c2},${r2}`);
      add(c, r, c2, r2, true);
    }
  };

  for (let i = 0; i < GRID - 1; i++) {
    add(7, i, 7, i + 1, true);
    add(i, 7, i + 1, 7, true);
  }

  // Winding side trails. Neighbouring land is not linked unless a trail says so,
  // so the island reads as paths rather than one open field.
  const TRAILS: [number, number][][] = [
    [[1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]],
    [[2, 4], [2, 5], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6]],
    [[1, 2], [2, 2], [2, 3], [2, 4]],
    [[2, 2], [2, 1], [1, 1]],
    [[2, 1], [2, 0]],
    [[5, 1], [5, 0]],
    [[5, 1], [6, 1], [7, 1], [8, 1], [8, 2], [9, 2], [10, 2], [11, 2]],
    [[6, 1], [6, 0]],
    [[6, 1], [6, 2], [7, 2]],
    [[5, 1], [5, 2]],
    [[9, 2], [9, 1], [9, 0]],
    [[7, 2], [8, 2]],
    [[8, 1], [8, 0]],
    [[7, 4], [8, 4], [9, 4], [9, 5], [9, 6], [8, 6]],
    [[9, 6], [9, 7]],
    [[13, 6], [13, 7], [13, 8], [12, 8], [12, 9], [12, 10], [13, 10], [13, 11], [12, 11], [12, 12], [12, 13]],
    [[12, 12], [13, 12]],
    [[9, 10], [10, 10], [10, 11], [10, 12], [10, 13], [10, 14]],
    [[10, 11], [11, 11], [12, 11]],
    [[9, 11], [8, 11], [7, 11]],
    [[8, 11], [8, 12], [8, 13], [7, 13]],
    [[9, 12], [9, 13], [9, 14]],
    [[10, 7], [10, 8], [10, 9], [9, 9], [8, 9], [8, 8], [7, 8]],
    [[1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8]],
    [[2, 8], [2, 7]],
    [[1, 8], [1, 7]],
    [[3, 8], [3, 9]],
    [[6, 9], [6, 10], [6, 11], [7, 11]],
    [[5, 11], [6, 11]],
    [[2, 11], [3, 11], [3, 12], [2, 12], [1, 12]],
    [[2, 11], [2, 12]],
    [[3, 12], [4, 12], [5, 12], [6, 12], [7, 12]],
    [[5, 12], [5, 13], [4, 13], [3, 13], [2, 13]],
    [[6, 13], [6, 14], [5, 14], [4, 14], [3, 14]],
    [[6, 14], [7, 14]],
  ];
  for (const cells of TRAILS) trail(cells);

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const t = terrainAt(c, r);
      if (c + 1 < GRID && (!isWalk(t) || !isWalk(terrainAt(c + 1, r)))) add(c, r, c + 1, r, false);
      if (r + 1 < GRID && (!isWalk(t) || !isWalk(terrainAt(c, r + 1)))) add(c, r, c, r + 1, false);
    }
  }

  const at = new Map<string, [number, number]>();
  for (const sp of spaces) at.set(sp.id, [Math.round((sp.x - PAD) / CELL), Math.round((sp.y - PAD) / CELL)]);
  const coordOf = (id: string): [number, number] => at.get(id)!;

  const spurTo = (c: number, r: number, reached: Set<string>): [number, number][] | null => {
    const start = `${c},${r}`;
    const prev = new Map<string, string | null>([[start, null]]);
    const queue = [start];
    let hit: string | null = null;
    while (queue.length && !hit) {
      const u = queue.shift()!;
      const [uc, ur] = u.split(',').map(Number);
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nc = uc + dc;
        const nr = ur + dr;
        if (nc < 0 || nr < 0 || nc >= GRID || nr >= GRID) continue;
        const key = `${nc},${nr}`;
        if (prev.has(key) || !isWalk(terrainAt(nc, nr))) continue;
        prev.set(key, u);
        if (reached.has(cellId(nc, nr))) {
          hit = key;
          break;
        }
        queue.push(key);
      }
    }
    if (!hit) return null;
    const path: [number, number][] = [];
    for (let k: string | null = hit; k; k = prev.get(k) ?? null) {
      const [pc, pr] = k.split(',').map(Number);
      path.push([pc, pr]);
    }
    return path.reverse();
  };

  // Any walkable square cut off from the trails gets one spur back to the path, never a full grid.
  const footNeighbours = () => {
    const map = new Map<string, string[]>();
    for (const sp of spaces) map.set(sp.id, []);
    for (const c of connections) {
      if (!isWalk(terrainAt(...coordOf(c.a))) || !isWalk(terrainAt(...coordOf(c.b)))) continue;
      map.get(c.a)!.push(c.b);
      map.get(c.b)!.push(c.a);
    }
    return map;
  };
  const reachedFromRoad = () => {
    const next = footNeighbours();
    const seenIds = new Set<string>(['c0']);
    const queue = ['c0'];
    while (queue.length) {
      const u = queue.shift()!;
      for (const v of next.get(u) ?? []) {
        if (seenIds.has(v)) continue;
        seenIds.add(v);
        queue.push(v);
      }
    }
    return seenIds;
  };
  for (let guard = 0; guard < GRID * GRID; guard++) {
    const reached = reachedFromRoad();
    let best: [number, number][] | null = null;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (!isWalk(terrainAt(c, r)) || reached.has(cellId(c, r))) continue;
        const path = spurTo(c, r, reached);
        if (path && (!best || path.length < best.length)) best = path;
      }
    }
    if (!best) break;
    for (let i = 1; i < best.length; i++) add(best[i - 1][0], best[i - 1][1], best[i][0], best[i][1], true);
  }

  return {
    id: 'isle-of-embers',
    name: 'Isle of Embers',
    width: PAD * 2 + (GRID - 1) * CELL,
    height: PAD * 2 + (GRID - 1) * CELL,
    spaces,
    connections,
    castles: ['c0', 'c1', 'c2', 'c3'],
    seatOrder: { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] },
    fixedPortals: ['m3', 'm7'],
  };
}

export const ISLE_OF_EMBERS = buildIsleOfEmbers();

export const SPACE_LABELS: Record<string, string> = {
  m1: 'Moonwell',
  m5: 'Old Mine',
  x: 'Dragon Hoard',
  m3: 'Sunrise Portal',
  m7: 'Moonrise Portal',
};

const BOARDS: Record<string, BoardDefinition> = { [ISLE_OF_EMBERS.id]: ISLE_OF_EMBERS };

export function registerBoard(board: BoardDefinition): void {
  BOARDS[board.id] = board;
  graphCache.delete(board.id);
}

export function getBoard(id: string): BoardDefinition {
  const board = BOARDS[id];
  if (!board) throw new Error(`Unknown board ${id}`);
  return board;
}

export interface BoardGraph {
  board: BoardDefinition;
  space: Record<string, BoardSpace>;
  connection: Record<string, BoardConnection>;
  /** space id → connections touching it */
  adjacency: Record<string, BoardConnection[]>;
  treasureSpaces: string[];
}

const graphCache = new Map<string, BoardGraph>();

export function getGraph(boardId: string): BoardGraph {
  const cached = graphCache.get(boardId);
  if (cached) return cached;
  const board = getBoard(boardId);
  const space: Record<string, BoardSpace> = {};
  const connection: Record<string, BoardConnection> = {};
  const adjacency: Record<string, BoardConnection[]> = {};
  for (const s of board.spaces) {
    space[s.id] = s;
    adjacency[s.id] = [];
  }
  for (const c of board.connections) {
    connection[c.id] = c;
    adjacency[c.a].push(c);
    adjacency[c.b].push(c);
  }
  const graph: BoardGraph = {
    board,
    space,
    connection,
    adjacency,
    treasureSpaces: board.spaces.filter((s) => s.type === 'treasure').map((s) => s.id),
  };
  graphCache.set(boardId, graph);
  return graph;
}

export function otherEnd(c: BoardConnection, from: string): string {
  return c.a === from ? c.b : c.a;
}
