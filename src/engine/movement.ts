import { movementTraits, NO_TRAITS, type MovementTraits } from './abilities';
import { getGraph, otherEnd } from './board';
import { isLand, isWater } from './terrain';
import type { BoardConnection, Character, PublicState, Terrain } from './types';

export function isConnectionOpen(state: PublicState, c: BoardConnection): boolean {
  if (c.kind === 'bridge') return !!state.bridges[c.id];
  if (c.kind === 'blockable') return !state.blocks.some((b) => b.connectionId === c.id);
  return true;
}

export function terrainOf(state: PublicState, spaceId: string): Terrain {
  return state.terrain?.[spaceId] ?? getGraph(state.boardId).space[spaceId]?.terrain ?? 'grass';
}

/** Can a character with these traits pass over this square (not necessarily stop on it)? */
export function canCross(t: Terrain, traits: Pick<MovementTraits, 'sail' | 'fly'>): boolean {
  if (isLand(t)) return true;
  if (isWater(t)) return traits.sail || traits.fly;
  return traits.fly;
}

export type StepVia = 'path' | 'witchPortal' | 'tempPortal' | 'flight';

export interface Step {
  to: string;
  via: StepVia;
}

const airfieldCache = new Map<string, string[]>();
function airfields(boardId: string): string[] {
  let list = airfieldCache.get(boardId);
  if (!list) {
    list = getGraph(boardId).board.spaces.filter((s) => s.terrain === 'airfield').map((s) => s.id);
    airfieldCache.set(boardId, list);
  }
  return list;
}

export function neighbors(state: PublicState, spaceId: string, traits: MovementTraits): Step[] {
  const graph = getGraph(state.boardId);
  const out: Step[] = [];
  for (const c of graph.adjacency[spaceId] ?? []) {
    if (isConnectionOpen(state, c)) out.push({ to: otherEnd(c, spaceId), via: 'path' });
  }
  const fields = airfields(state.boardId);
  if (fields.includes(spaceId) && terrainOf(state, spaceId) === 'airfield') {
    for (const f of fields) if (f !== spaceId && terrainOf(state, f) === 'airfield') out.push({ to: f, via: 'flight' });
  }
  const [p1, p2] = graph.board.fixedPortals;
  if (traits.useFixedPortalLink && (spaceId === p1 || spaceId === p2)) {
    out.push({ to: spaceId === p1 ? p2 : p1, via: 'witchPortal' });
  }
  for (const tp of state.tempPortals) {
    if (tp.space === spaceId) out.push({ to: tp.linkedTo, via: 'tempPortal' });
    else if (tp.linkedTo === spaceId) out.push({ to: tp.space, via: 'tempPortal' });
  }
  return out;
}

export function castleOwner(state: PublicState, spaceId: string): string | null {
  return state.castles[spaceId]?.owner ?? null;
}

/** Characters standing on a space (castles can hold several of the owner's characters). */
export function charactersAt(state: PublicState, spaceId: string): Character[] {
  return Object.values(state.characters).filter((c) => c.space === spaceId);
}

export function isSpaceFree(state: PublicState, spaceId: string, ignore?: string): boolean {
  return !Object.values(state.characters).some((c) => c.space === spaceId && c.id !== ignore);
}

export function treasuresAt(state: PublicState, spaceId: string) {
  return state.treasures.filter((t) => t.space === spaceId);
}

export interface MoveOption {
  characterId: string;
  /** Requested route: start space first, clicked destination last. */
  path: string[];
  /** The clicked destination (equals path[path.length-1]). */
  target: string;
  /** Where the mover actually ends (differs when a Shield bounces it back). */
  final: string;
  /** Route actually travelled (for animation). */
  travelled: string[];
  captures: string[];
  shieldBlocked: string | null;
  passedOpponents: string[];
  usesPortal: boolean;
  // Predicted outcome at the final space
  trapped: boolean;
  pickup: boolean;
  bank: boolean;
  drawsCard: boolean;
}

interface Frame {
  path: string[];
  captureUsed: boolean;
  captures: string[];
  passed: string[];
  usesPortal: boolean;
}

/**
 * Enumerate every legal movement of `characterId` using 1..maxSteps steps.
 * Paths are simple (no space visited twice). The server validates a client move
 * by checking that its path appears in this list, so UI and server share one rule set.
 */
export function enumerateMoves(
  state: PublicState,
  characterId: string,
  maxSteps: number,
  regular: boolean,
): MoveOption[] {
  const mover = state.characters[characterId];
  if (!mover || maxSteps <= 0) return [];
  const graph = getGraph(state.boardId);
  const base = movementTraits(mover, regular);
  const traits: MovementTraits = { ...base, sail: base.sail || terrainOf(state, mover.space) === 'harbor' };
  const terrain = (id: string) => terrainOf(state, id);
  const occupant: Record<string, Character> = {};
  for (const c of Object.values(state.characters)) {
    if (c.id !== mover.id && graph.space[c.space]?.type !== 'castle') occupant[c.space] = c;
  }
  const results: MoveOption[] = [];

  const finish = (f: Frame, final: string, shieldBlocked: string | null) => {
    const idx = f.path.lastIndexOf(final);
    const travelled = shieldBlocked ? f.path.slice(0, Math.max(idx, 0) + 1) : f.path;
    results.push({
      characterId,
      path: f.path,
      target: f.path[f.path.length - 1],
      final,
      travelled: travelled.length ? travelled : [f.path[0]],
      captures: f.captures,
      shieldBlocked,
      passedOpponents: f.passed,
      usesPortal: f.usesPortal,
      ...predictArrival(state, mover, final, f.captures, regular),
    });
  };

  /** Last free space before the shielded target, or the start space. */
  const bounceBack = (f: Frame): string => {
    const captured = new Set(f.captures);
    for (let k = f.path.length - 2; k >= 1; k--) {
      const s = f.path[k];
      if (!isLand(terrain(s))) continue;
      const o = occupant[s];
      if (!o || captured.has(o.id) || castleOwner(state, s) === mover.owner) return s;
    }
    return f.path[0];
  };

  const visit = (node: string, f: Frame) => {
    if (f.path.length - 1 >= maxSteps) return;
    for (const step of neighbors(state, node, traits)) {
      const v = step.to;
      if (f.path.includes(v)) continue;
      const vSpace = graph.space[v];
      if (!vSpace) continue;
      if (vSpace.type === 'castle' && castleOwner(state, v) !== mover.owner) continue;
      const t = terrain(v);
      if (!canCross(t, traits)) continue;
      const portal = step.via === 'witchPortal' || step.via === 'tempPortal';
      const next: Frame = { ...f, path: [...f.path, v], usesPortal: f.usesPortal || portal };
      if (!isLand(t)) {
        // Sailing or flying over: can never stop here.
        visit(v, next);
        continue;
      }
      const o = occupant[v];
      if (!o) {
        finish(next, v, null);
        visit(v, next);
        continue;
      }
      if (o.owner === mover.owner) {
        // Pass through friends, never end on them.
        visit(v, next);
        continue;
      }
      if (o.immune) {
        if (traits.passThroughOpponents) visit(v, { ...next, passed: [...f.passed, o.id] });
        continue;
      }
      const shielded = o.power?.type === 'shield';
      if (!f.captureUsed) {
        if (shielded) finish(next, bounceBack(next), o.id);
        else finish({ ...next, captures: [...f.captures, o.id] }, v, null);
      }
      if (traits.captureAndContinue && !f.captureUsed && !shielded) {
        visit(v, { ...next, captureUsed: true, captures: [...f.captures, o.id] });
      } else if (traits.passThroughOpponents) {
        visit(v, { ...next, passed: [...f.passed, o.id] });
      }
    }
  };

  visit(mover.space, { path: [mover.space], captureUsed: false, captures: [], passed: [], usesPortal: false });
  return results;
}

function predictArrival(
  state: PublicState,
  mover: Character,
  final: string,
  captures: string[],
  regular: boolean,
): Pick<MoveOption, 'trapped' | 'pickup' | 'bank' | 'drawsCard'> {
  const graph = getGraph(state.boardId);
  const moved = final !== mover.space;
  let carrying = !!mover.carrying;
  if (!carrying && captures.some((id) => state.characters[id]?.carrying)) carrying = true;
  const trap = state.traps.find((t) => t.space === final);
  const trapped = moved && !!trap && trap.owner !== mover.owner && !mover.immune;
  if (trapped) return { trapped, pickup: false, bank: false, drawsCard: false };
  const pickup = moved && !carrying && treasuresAt(state, final).length > 0;
  if (pickup) carrying = true;
  const ownCastle = castleOwner(state, final) === mover.owner;
  const bank = moved && carrying && ownCastle && !state.castles[final].damagedBy;
  const drawsCard = moved && regular && graph.space[final].type === 'card';
  return { trapped, pickup, bank, drawsCard };
}

/** Group options by clicked destination. */
export function groupByTarget(options: MoveOption[]): Record<string, MoveOption[]> {
  const out: Record<string, MoveOption[]> = {};
  for (const o of options) (out[o.target] ??= []).push(o);
  return out;
}

/** Collapse routes with identical outcomes and length, keeping distinct, meaningful choices. */
export function distinctRoutes(options: MoveOption[]): MoveOption[] {
  const seen = new Set<string>();
  const sorted = options.slice().sort((a, b) => a.path.length - b.path.length);
  const out: MoveOption[] = [];
  for (const o of sorted) {
    const key = [o.final, o.captures.join(','), o.shieldBlocked, o.usesPortal, o.trapped, o.pickup, o.bank, o.path.length].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

/** BFS distances on foot over currently open paths and land (ignoring occupancy). Used by AI and connectivity checks. */
export function distancesFrom(state: PublicState, from: string, opts: { allowCastles?: string[] } = {}): Record<string, number> {
  const graph = getGraph(state.boardId);
  const dist: Record<string, number> = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const u = queue.shift()!;
    for (const step of neighbors(state, u, NO_TRAITS)) {
      if (step.via !== 'path') continue;
      const v = step.to;
      if (dist[v] !== undefined) continue;
      if (!isLand(terrainOf(state, v))) continue;
      if (graph.space[v].type === 'castle' && !(opts.allowCastles ?? []).includes(v)) continue;
      dist[v] = dist[u] + 1;
      queue.push(v);
    }
  }
  return dist;
}

/** True if every castle in play can still reach at least one treasure spawn over open paths. */
export function allCastlesReachTreasure(state: PublicState): boolean {
  const homes = [...new Set(state.treasures.map((t) => t.home))];
  return state.players.every((p) => {
    const d = distancesFrom(state, p.castle);
    return homes.some((h) => d[h] !== undefined);
  });
}
