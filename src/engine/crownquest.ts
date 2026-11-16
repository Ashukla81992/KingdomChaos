import { CIRCUIT_ROUTES, SIDE_TRACES } from './crownRoutes';
import {
  CIRCUIT_ANCHORS,
  CIRCUIT_FEATURES,
  CIRCUIT_LENGTH,
  CIRCUIT_NAMES,
  DUNGEON_HALLS,
  DUNGEON_SPACES,
  FINAL_LENGTH,
  HOUSES,
  MAIN_ROAD,
  ROUTE_HUBS,
  SIDE_ROUTES,
  TEMPLE_AT,
  TRAILS,
  type Pt,
} from './crownLayout';
import type { BoardDef, EdgeDef, HouseInfo, NodeDef, TrailInfo } from './types';

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Distance from a point to a polyline. */
function polyDist(pts: Pt[], p: Pt) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

function length(pts: Pt[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

/** Split a polyline into `n` pieces of equal arc length. */
function splitEven(pts: Pt[], n: number): Pt[][] {
  const total = length(pts);
  const cuts = Array.from({ length: n - 1 }, (_, i) => ((i + 1) * total) / n);
  const pieces: Pt[][] = [];
  let current: Pt[] = [pts[0]];
  let walked = 0;
  let c = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (c < cuts.length && cuts[c] <= walked + seg) {
      const t = seg ? (cuts[c] - walked) / seg : 0;
      const p: Pt = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
      current.push(p);
      pieces.push(current);
      current = [p];
      c++;
    }
    walked += seg;
    current.push(b);
  }
  pieces.push(current);
  return pieces;
}

/** Corner-cutting smoothing for drawn trails. */
function smooth(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (i > 0) out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    if (i < pts.length - 2) out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export const circuitId = (i: number) => `c${((i % CIRCUIT_LENGTH) + CIRCUIT_LENGTH) % CIRCUIT_LENGTH}`;

function stretchName(i: number) {
  return CIRCUIT_NAMES.find(([a, b]) => i >= a && i <= b)?.[2] ?? 'Road';
}

/** Kingdom Chaos: Crown Quest. Builds the playable graph from crownLayout.ts. */
export function buildCrownQuest(): BoardDef {
  const nodes: NodeDef[] = [];
  const edges: EdgeDef[] = [];
  const byId = new Map<string, NodeDef>();
  const add = (n: NodeDef) => {
    if (byId.has(n.id)) throw new Error(`Duplicate node ${n.id}`);
    byId.set(n.id, n);
    nodes.push(n);
    return n;
  };
  const addEdge = (e: EdgeDef) => {
    if (edges.some((x) => x.id === e.id)) throw new Error(`Duplicate edge ${e.id}`);
    if (!byId.has(e.a) || !byId.has(e.b)) throw new Error(`Edge ${e.id} has a missing end`);
    edges.push(e);
  };

  // ---- the shared circuit
  const N = CIRCUIT_LENGTH;
  const circuitPieces: Pt[][] = new Array(N);
  CIRCUIT_ANCHORS.forEach((a, i) => {
    const b = CIRCUIT_ANCHORS[(i + 1) % CIRCUIT_ANCHORS.length];
    const steps = (b.idx - a.idx + N) % N || N;
    const traced = a.snap === false ? null : CIRCUIT_ROUTES[`c${a.idx}`];
    const route = traced ? [...traced] : smooth([a.at, ...(a.via ?? []), b.at]);
    route[0] = a.at;
    route[route.length - 1] = b.at;
    splitEven(route, steps).forEach((piece, k) => (circuitPieces[(a.idx + k) % N] = piece));
  });
  for (let i = 0; i < N; i++) {
    const [x, y] = circuitPieces[i][0];
    add({ id: circuitId(i), map: 'island', type: 'circuit', lane: 'circuit', name: stretchName(i), xy: [x, y], circuit: i, trail: 'main' });
  }
  const tunnels = new Map(CIRCUIT_ANCHORS.filter((a) => a.tunnel).map((a) => [a.idx, a.tunnel!]));
  for (let i = 0; i < N; i++) {
    const tunnel = tunnels.get(i);
    addEdge({ id: `${circuitId(i)}>${circuitId(i + 1)}`, a: circuitId(i), b: circuitId(i + 1), kind: 'permanent', lane: 'circuit', trail: 'main', route: circuitPieces[i], ...(tunnel && { structure: 'tunnel' as const, name: tunnel }) });
  }

  // ---- features on circuit spaces
  const docks: string[] = [];
  const airfields: string[] = [];
  let dungeonGate = '';
  for (const [idx, feats] of Object.entries(CIRCUIT_FEATURES)) {
    const n = byId.get(circuitId(Number(idx)))!;
    for (const f of feats) {
      if (f.kind === 'dock') docks.push(n.id);
      if (f.kind === 'airfield') airfields.push(n.id);
      if (f.kind === 'dungeon') dungeonGate = n.id;
      if (f.kind === 'station') Object.assign(n, { station: f.gem, name: f.name });
      else if (f.kind === 'name') n.name = f.name;
      else if (f.kind === 'safe') n.safe = true;
      else if (f.kind === 'dig') Object.assign(n, { dig: true, name: f.name });
      else if (f.kind === 'dungeon') Object.assign(n, { dungeonGate: true, name: f.name });
      else if (f.kind === 'dock') Object.assign(n, { dock: true, name: f.name });
      else if (f.kind === 'airfield') Object.assign(n, { airfield: true, name: f.name });
      else if (f.kind === 'portal') Object.assign(n, { portal: circuitId(f.pair), name: f.name });
      else if (f.kind === 'teleport') Object.assign(n, { name: f.name, teleport: { type: f.type, name: f.name, to: circuitId(f.to), text: f.text } });
    }
  }

  // ---- the temple, castles and final paths
  add({ id: 'temple', map: 'island', type: 'temple', lane: 'temple', name: 'Crown Temple', xy: TEMPLE_AT, safe: true });
  const houses: HouseInfo[] = HOUSES.map((h, seat) => {
    const entry = byId.get(circuitId(h.entry))!;
    Object.assign(entry, { safe: true, name: `${h.name} Gate`, plate: seat });
    const branch = byId.get(circuitId(h.entry + 1))!;
    branch.name = `${h.name} Fork`;
    const castle = add({ id: `home-${h.key}`, map: 'island', type: 'castle', lane: 'home', name: h.castleName, xy: h.castle, house: seat, safe: true });
    addEdge({ id: `${castle.id}>${entry.id}`, a: castle.id, b: entry.id, kind: 'permanent', lane: 'home', oneWay: true, route: [castle.xy, entry.xy] });
    const pieces = splitEven(smooth([branch.xy, ...h.finalVia, TEMPLE_AT]), FINAL_LENGTH + 1);
    const final: string[] = [];
    for (let k = 1; k <= FINAL_LENGTH; k++) {
      const [x, y] = pieces[k][0];
      final.push(add({ id: `f-${h.key}-${k}`, map: 'island', type: 'final', lane: 'final', name: `${h.name} Royal Path`, xy: [x, y], house: seat, safe: true }).id);
    }
    final.push('temple');
    // Royal Path edges run both ways so pieces can walk back onto the island.
    [branch.id, ...final].forEach((id, k, arr) => {
      if (k === arr.length - 1) return;
      addEdge({ id: `${id}>${arr[k + 1]}`, a: id, b: arr[k + 1], kind: 'permanent', lane: 'final', route: pieces[k] });
    });
    return { seat, key: h.key, name: h.name, castle: castle.id, entry: entry.id, plate: entry.id, branch: branch.id, final };
  });

  // ---- inner routes (two-way)
  const trails: TrailInfo[] = [{ id: 'main', name: 'Main road', kind: 'main', perk: MAIN_ROAD.perk, risk: MAIN_ROAD.risk }, ...TRAILS];
  for (const h of ROUTE_HUBS) add({ id: h.id, map: 'island', type: 'side', lane: 'side', name: h.name, xy: h.at, trail: h.trail });
  const endpoint = (id: number | string, route: string) => {
    const n = byId.get(typeof id === 'number' ? circuitId(id) : id);
    if (!n) throw new Error(`Side route ${route} meets unknown space ${id}`);
    return n;
  };
  for (const r of SIDE_ROUTES) {
    const start = endpoint(r.from, r.id);
    const end = endpoint(r.to, r.id);
    if (!trails.some((t) => t.id === r.trail)) throw new Error(`Side route ${r.id} has unknown trail ${r.trail}`);
    const traced = r.snap ? SIDE_TRACES[r.id] : undefined;
    const line = traced ? [...traced] : smooth([start.xy, ...r.via, end.xy]);
    line[0] = start.xy;
    line[line.length - 1] = end.xy;
    const pieces = splitEven(line, r.spaces + 1);
    const ids = [start.id];
    const made: NodeDef[] = [];
    for (let k = 1; k <= r.spaces; k++) {
      const [x, y] = pieces[k][0];
      const n = add({ id: `${r.id}-${k}`, map: 'island', type: 'side', lane: 'side', name: r.name, xy: [x, y], trail: r.trail });
      made.push(n);
      ids.push(n.id);
    }
    ids.push(end.id);
    const nearestNode = (p: Pt) => {
      if (!made.length) throw new Error(`Side route ${r.id} has no spaces for its features`);
      return made.reduce((best, n) => (dist(n.xy, p) < dist(best.xy, p) ? n : best));
    };
    for (const p of r.terrainSites ?? []) nearestNode(p).terrainSite = true;
    for (const d of r.digSites ?? []) Object.assign(nearestNode(d.at), { dig: true, name: d.name });
    for (const h of r.hazards ?? []) Object.assign(nearestNode(h.at), { hazard: true, name: h.name });
    const routeEdges: EdgeDef[] = [];
    for (let k = 0; k < ids.length - 1; k++) routeEdges.push({ id: `${ids[k]}~${ids[k + 1]}`, a: ids[k], b: ids[k + 1], kind: 'permanent', lane: 'side', name: r.name, trail: r.trail, route: pieces[k] });
    const nearestEdge = (p: Pt) => routeEdges.reduce((best, e) => (polyDist(e.route, p) < polyDist(best.route, p) ? e : best));
    for (const st of r.structures ?? []) {
      const e = nearestEdge(st.at);
      if (e.kind !== 'permanent') throw new Error(`Route ${r.id}: two features share edge ${e.id}`);
      Object.assign(e, { kind: 'buildable', structure: st.kind === 'plot' ? 'road' : st.kind, gate: st.gate, name: st.name, startsOpen: st.open });
    }
    for (const bl of r.blockable ?? []) {
      const e = nearestEdge(bl.at);
      if (e.kind !== 'permanent') throw new Error(`Route ${r.id}: two features share edge ${e.id}`);
      Object.assign(e, { kind: 'blockable', id: bl.id, name: bl.name });
    }
    routeEdges.forEach(addEdge);
  }

  // ---- dungeon (A3: encounters, safe rooms, halls)
  for (const d of DUNGEON_SPACES) {
    add({
      id: d.id,
      map: 'dungeon',
      type: d.type,
      lane: 'dungeon',
      name: d.name,
      xy: d.at,
      safe: d.type === 'dEntrance' || d.type === 'safeRoom' || undefined,
      dig: d.type === 'vault' || d.type === 'gemChamber' || undefined,
      encounter: d.encounter,
      teleport: d.type === 'trap' ? { type: 'trap', name: 'Dungeon Trapdoor', to: 'd-entrance', text: 'The floor gives way and the character slides back down to the Dungeon Entrance.' } : undefined,
    });
  }
  for (const [a, b, extra] of DUNGEON_HALLS) {
    addEdge({
      id: `${a}~${b}`,
      a,
      b,
      kind: 'permanent',
      lane: 'dungeon',
      name: extra?.name,
      guard: extra?.guard ? { type: 'monster', from: a } : undefined,
      route: [byId.get(a)!.xy, byId.get(b)!.xy],
    });
  }

  return {
    id: 'crownquest',
    name: 'Crown Quest Island',
    maps: [
      { id: 'island', name: 'Island', hub: circuitId(0) },
      { id: 'dungeon', name: 'Dungeon', hub: 'd-entrance' },
    ],
    nodes,
    edges,
    circuit: Array.from({ length: N }, (_, i) => circuitId(i)),
    houses,
    trails,
    temple: 'temple',
    transitions: [{ island: dungeonGate, dungeon: 'd-entrance' }],
    docks,
    airfields,
    dragonHome: 'd-lair',
    seatOrder: { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] },
  };
}
