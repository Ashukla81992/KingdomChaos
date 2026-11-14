import type { BoardConnection, BoardDefinition, BoardSpace, SpaceType } from './types';

/**
 * "Isle of Embers" — a 15×15 grid.
 *
 * Castles sit at the middle of each edge (north, east, south, west). The middle
 * row and the middle column are the king's road: permanent, so map cards can
 * never cut a castle off from treasure. Two rivers cross the island; their
 * fords are bridges (some start unbuilt). Everything else can be blocked.
 *
 * A few spaces keep short ids (c0, g0, r0, m1, x, …) because the rules tests
 * and the tutorial script those exact squares. They sit on the north road:
 *   c0 → g0 → r0 → r1 → r2 → m1 (Moonwell) → i1 → x (Dragon Hoard)
 * The last step, i1–x, is an unbuilt bridge, so the hoard is a real journey.
 */

export const GRID = 15;
const CELL = 64;
const PAD = 96;

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

const PORTAL_SITES = new Set(['2,2', '12,2', '2,12', '12,12']);

function cellId(c: number, r: number): string {
  return SPECIAL[`${c},${r}`]?.id ?? `p${c}-${r}`;
}

function cellType(c: number, r: number): SpaceType {
  const special = SPECIAL[`${c},${r}`];
  if (special) return special.type;
  if (PORTAL_SITES.has(`${c},${r}`)) return 'portalSite';
  if ((c + r) % 5 === 0) return 'card';
  return 'normal';
}

function isRiver(c: number, r: number, c2: number, r2: number): boolean {
  const vertical = r === r2 && ((c === 3 && c2 === 4) || (c === 10 && c2 === 11));
  const horizontal = c === c2 && ((r === 3 && r2 === 4) || (r === 10 && r2 === 11));
  return vertical || horizontal;
}

/** Permanent ford from the Old Mine (m5) back to the king's road. */
function isMineSpur(c: number, r: number, c2: number, r2: number): boolean {
  return r === 11 && r2 === 11 && c >= 3 && c2 <= 7;
}

function buildIsleOfEmbers(): BoardDefinition {
  const spaces: BoardSpace[] = [];
  const connections: BoardConnection[] = [];

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const special = SPECIAL[`${c},${r}`];
      spaces.push({
        id: cellId(c, r),
        type: cellType(c, r),
        x: PAD + c * CELL,
        y: PAD + r * CELL,
        ...(special?.seat === undefined ? {} : { seat: special.seat }),
      });
    }
  }

  const link = (c: number, r: number, c2: number, r2: number) => {
    const a = cellId(c, r);
    const b = cellId(c2, r2);
    let kind: BoardConnection['kind'] = 'blockable';
    let initiallyOpen: boolean | undefined;
    if ((a === 'i1' && b === 'x') || (a === 'r3' && b === 'r4')) {
      kind = 'bridge';
      initiallyOpen = a === 'r3';
    } else if ((c === 7 && c2 === 7) || (r === 7 && r2 === 7) || isMineSpur(c, r, c2, r2)) {
      kind = 'permanent';
    } else if (isRiver(c, r, c2, r2)) {
      kind = 'bridge';
      initiallyOpen = (c + r) % 2 === 0;
    }
    connections.push({ id: `${a}-${b}`, a, b, kind, ...(kind === 'bridge' ? { initiallyOpen: !!initiallyOpen } : {}) });
  };

  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (c + 1 < GRID) link(c, r, c + 1, r);
      if (r + 1 < GRID) link(c, r, c, r + 1);
    }
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
