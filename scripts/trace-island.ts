/**
 * Snap the island path model onto the painted roads.
 *
 *   NODE_OPTIONS=--max-old-space-size=512 npx tsx scripts/trace-island.ts
 *
 * Loads public/board/island.jpg with sharp, masks road-coloured pixels at 1024², then
 * downsamples to 512² before thinning and A*. Each segment is searched on its own small
 * window and scaled back to 1024. Jobs are the circuit stretches between anchors and the
 * inner routes marked `snap`. Writes src/engine/crownRoutes.ts. Re-run after editing
 * anchors or routes. Run twice when one inner route ends on a space another route places.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CROWN_QUEST, circuitId } from '../src/engine/board';
import { CIRCUIT_ANCHORS, SIDE_ROUTES } from '../src/engine/crownLayout';
import { CIRCUIT_ROUTES } from '../src/engine/crownRoutes';

type Pt = [number, number];

const root = resolve(import.meta.dirname, '..');
const SRC = 1024;
const GRID = 512;
const SCALE = SRC / GRID;

const circuitJobs = CIRCUIT_ANCHORS.flatMap((a, i) => {
  const b = CIRCUIT_ANCHORS[(i + 1) % CIRCUIT_ANCHORS.length];
  return a.snap === false ? [] : [{ id: `c${a.idx}`, via: [a.at, ...(a.via ?? []), b.at] as Pt[] }];
});
// Inner routes end on spaces placed by the builder (sometimes on another inner route), so their end
// points come from the current board. Run twice after moving a route that others join.
const xy = (id: string) => CROWN_QUEST.nodes.find((n) => n.id === id)!.xy;
const end = (id: number | string): Pt => xy(typeof id === 'number' ? circuitId(id) : id);
const sideJobs = SIDE_ROUTES.filter((r) => r.snap).map((r) => ({ id: `side:${r.id}`, via: [end(r.from), ...r.via, end(r.to)] as Pt[] }));
const jobs = [...circuitJobs, ...sideJobs];

const isRoad = (r: number, g: number, b: number) => r > 190 && g > 160 && b > 110 && r - b > 35 && r - b < 110 && r >= g && g - b > 15 && r - g < 45;

/** One 1024² mask, immediately reduced to 512². Nothing else keeps the full image. */
async function loadGrid(): Promise<Uint8Array> {
  const { data, info } = await sharp(resolve(root, 'public/board/island.jpg')).resize(SRC, SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== SRC || info.height !== SRC || info.channels !== 3) throw new Error(`unexpected image ${info.width}x${info.height}x${info.channels}`);
  let full = 0;
  for (let i = 0; i < SRC * SRC; i++) {
    const o = i * 3;
    if (isRoad(data[o], data[o + 1], data[o + 2])) full++;
  }
  const small = new Uint8Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    const sy = y * SCALE;
    for (let x = 0; x < GRID; x++) {
      const sx = x * SCALE;
      let v = 0;
      for (let dy = 0; dy < SCALE && !v; dy++) {
        const row = (sy + dy) * SRC + sx;
        for (let dx = 0; dx < SCALE; dx++) {
          const o = (row + dx) * 3;
          if (isRoad(data[o], data[o + 1], data[o + 2])) { v = 1; break; }
        }
      }
      small[y * GRID + x] = v;
    }
  }
  let kept = 0;
  for (let i = 0; i < small.length; i++) kept += small[i];
  console.log(`Road mask: ${full} px at ${SRC} (${((100 * full) / (SRC * SRC)).toFixed(1)}%), ${kept} cells at ${GRID} (${((100 * kept) / small.length).toFixed(1)}%).`);
  return small;
}

/** Square close on the small grid. Radius stays tiny so parallel roads do not merge. */
function close1(src: Uint8Array): Uint8Array {
  const dil = new Uint8Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= GRID) continue;
        const row = yy * GRID;
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(GRID - 1, x + 1);
        for (let xx = x0; xx <= x1; xx++) if (src[row + xx]) { v = 1; break; }
      }
      dil[y * GRID + x] = v;
    }
  }
  const out = new Uint8Array(GRID * GRID);
  for (let y = 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      let v = 1;
      for (let dy = -1; dy <= 1 && v; dy++) {
        const row = (y + dy) * GRID + x;
        if (!dil[row - 1] || !dil[row] || !dil[row + 1]) v = 0;
      }
      out[y * GRID + x] = v;
    }
  }
  return out;
}

/** Zhang–Suen on the 512² mask. Live pixels only, so empty sea is never scanned. */
function thin(src: Uint8Array): Uint8Array {
  const m = src.slice();
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= GRID || y >= GRID ? 0 : m[y * GRID + x]);
  let live = 0;
  const ids = new Int32Array(GRID * GRID);
  for (let i = 0; i < m.length; i++) if (m[i]) ids[live++] = i;
  const del = new Int32Array(ids.length);
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 64) {
    changed = false;
    for (const step of [0, 1]) {
      let dn = 0;
      for (let i = 0; i < live; i++) {
        const k = ids[i];
        if (!m[k]) continue;
        const x = k % GRID;
        const y = (k / GRID) | 0;
        if (x < 1 || y < 1 || x >= GRID - 1 || y >= GRID - 1) continue;
        const p0 = at(x, y - 1), p1 = at(x + 1, y - 1), p2 = at(x + 1, y), p3 = at(x + 1, y + 1);
        const p4 = at(x, y + 1), p5 = at(x - 1, y + 1), p6 = at(x - 1, y), p7 = at(x - 1, y - 1);
        const b = p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7;
        if (b < 2 || b > 6) continue;
        let a = 0;
        if (!p0 && p1) a++;
        if (!p1 && p2) a++;
        if (!p2 && p3) a++;
        if (!p3 && p4) a++;
        if (!p4 && p5) a++;
        if (!p5 && p6) a++;
        if (!p6 && p7) a++;
        if (!p7 && p0) a++;
        if (a !== 1) continue;
        if (step === 0 ? p0 * p2 * p4 || p2 * p4 * p6 : p0 * p2 * p6 || p0 * p4 * p6) continue;
        del[dn++] = k;
      }
      for (let i = 0; i < dn; i++) m[del[i]] = 0;
      if (dn) {
        changed = true;
        let w = 0;
        for (let i = 0; i < live; i++) if (m[ids[i]]) ids[w++] = ids[i];
        live = w;
      }
    }
  }
  if (guard >= 64) console.warn('Thinning stopped at the iteration cap.');
  return m;
}

function dilate1(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(GRID - 1, y + 1);
    for (let x = 0; x < GRID; x++) {
      const x0 = Math.max(0, x - 1);
      const x1 = Math.min(GRID - 1, x + 1);
      let v = 0;
      for (let yy = y0; yy <= y1 && !v; yy++) {
        const row = yy * GRID;
        for (let xx = x0; xx <= x1; xx++) if (src[row + xx]) { v = 1; break; }
      }
      out[y * GRID + x] = v;
    }
  }
  return out;
}

const segDist = (x: number, y: number, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};

function nearest(p: Pt, mask: Uint8Array, rad: number): Pt {
  const x = p[0], y = p[1];
  if (mask[y * GRID + x]) return p;
  let best: Pt | null = null;
  let bestD = rad * rad + 1;
  for (let dy = -rad; dy <= rad; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= GRID) continue;
    const row = yy * GRID;
    for (let dx = -rad; dx <= rad; dx++) {
      const d = dx * dx + dy * dy;
      if (d >= bestD) continue;
      const xx = x + dx;
      if (xx < 0 || xx >= GRID) continue;
      if (mask[row + xx]) { bestD = d; best = [xx, yy]; }
    }
  }
  return best ?? p;
}

const simplify = (pts: Pt[], tol: number): Pt[] => {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const denom = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let best = -1, bestD = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = Math.abs((b[1] - a[1]) * x - (b[0] - a[0]) * y + b[0] * a[1] - b[1] * a[0]) / denom;
    if (d > bestD) { bestD = d; best = i; }
  }
  if (bestD <= tol) return [a, b];
  return [...simplify(pts.slice(0, best + 1), tol).slice(0, -1), ...simplify(pts.slice(best), tol)];
};

/** One A* on a corridor around `via` (512² coordinates). The distance grids die with the call. */
function astar(via: Pt[], cost: Float32Array): Pt[] | null {
  const a = via[0], b = via[via.length - 1];
  const pad = 26;
  const hard = 24;
  let x0 = GRID, x1 = 0, y0 = GRID, y1 = 0;
  for (const [x, y] of via) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(GRID - 1, x1 + pad);
  y1 = Math.min(GRID - 1, y1 + pad);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const n = bw * bh;
  const corr = new Uint8Array(n);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let d = Infinity;
      for (let i = 0; i < via.length - 1; i++) d = Math.min(d, segDist(x, y, via[i], via[i + 1]));
      corr[(y - y0) * bw + (x - x0)] = d <= 10 ? 1 : d <= 16 ? 3 : d <= hard ? 8 : 0;
    }
  }
  const dist = new Float32Array(n);
  dist.fill(Infinity);
  const from = new Int32Array(n);
  from.fill(-1);
  const hF = new Float32Array(n);
  const hK = new Int32Array(n);
  const pos = new Int32Array(n);
  pos.fill(-1);
  const closed = new Uint8Array(n);
  let hn = 0;
  const idx = (x: number, y: number) => (y - y0) * bw + (x - x0);
  const start = idx(a[0], a[1]);
  const goal = idx(b[0], b[1]);
  corr[start] = corr[start] || 1;
  corr[goal] = corr[goal] || 1;

  const swap = (i: number, j: number) => {
    const tf = hF[i]; hF[i] = hF[j]; hF[j] = tf;
    const tk = hK[i]; hK[i] = hK[j]; hK[j] = tk;
    pos[hK[i]] = i;
    pos[hK[j]] = j;
  };
  const bubbleUp = (i0: number) => {
    let i = i0;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hF[p] <= hF[i]) break;
      swap(p, i);
      i = p;
    }
  };
  const push = (f: number, k: number) => {
    const at = pos[k];
    if (at >= 0) {
      if (f >= hF[at]) return;
      hF[at] = f;
      bubbleUp(at);
      return;
    }
    const j = hn++;
    hF[j] = f;
    hK[j] = k;
    pos[k] = j;
    bubbleUp(j);
  };
  const pop = () => {
    const k = hK[0];
    pos[k] = -1;
    hn--;
    if (hn > 0) {
      hF[0] = hF[hn];
      hK[0] = hK[hn];
      pos[hK[0]] = 0;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < hn && hF[l] < hF[s]) s = l;
        if (r < hn && hF[r] < hF[s]) s = r;
        if (s === i) break;
        swap(s, i);
        i = s;
      }
    }
    return k;
  };

  dist[start] = 0;
  push(Math.hypot(b[0] - a[0], b[1] - a[1]), start);
  let found = false;
  while (hn) {
    const k = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === goal) { found = true; break; }
    const x = (k % bw) + x0;
    const y = ((k / bw) | 0) + y0;
    const base = dist[k];
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < y0 || yy > y1) continue;
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx;
        if (xx < x0 || xx > x1) continue;
        const q = idx(xx, yy);
        if (closed[q] || !corr[q]) continue;
        const nd = base + cost[yy * GRID + xx] * corr[q] * (dx && dy ? Math.SQRT2 : 1);
        if (nd < dist[q]) {
          dist[q] = nd;
          from[q] = k;
          push(nd + Math.hypot(b[0] - xx, b[1] - yy), q);
        }
      }
    }
  }
  if (!found) return null;
  const out: Pt[] = [];
  for (let k = goal, guard = 0; k >= 0 && guard <= n; guard++) {
    out.push([(k % bw) + x0, ((k / bw) | 0) + y0]);
    if (k === start) return out.reverse();
    k = from[k];
  }
  return null;
}

function traceAll(cost: Float32Array, centre: Uint8Array, road: Uint8Array) {
  const on = (p: Pt): Pt => {
    if (centre[p[1] * GRID + p[0]]) return p;
    const hit = nearest(p, centre, 14);
    return hit !== p ? hit : nearest(p, road, 14);
  };
  const out: Record<string, Pt[]> = {};
  for (const job of jobs) {
    const t0 = Date.now();
    const via = job.via.map(([x, y]): Pt => [Math.max(0, Math.min(GRID - 1, Math.round(x / SCALE))), Math.max(0, Math.min(GRID - 1, Math.round(y / SCALE)))]);
    via[0] = on(via[0]);
    via[via.length - 1] = on(via[via.length - 1]);
    const path = astar(via, cost);
    const scaled = path ? simplify(path.map(([x, y]): Pt => [x * SCALE, y * SCALE]), 2) : job.via.map(([x, y]): Pt => [Math.round(x), Math.round(y)]);
    if (scaled.length < 2) scaled.push(scaled[0]);
    out[job.id] = scaled;
    console.log(`${path ? 'ok  ' : 'MISS'} ${job.id} ${scaled.length} pts ${Date.now() - t0}ms  heap ${(process.memoryUsage().heapUsed / 1048576).toFixed(0)}MB`);
  }
  return out;
}

const grid = close1(await loadGrid());
const centre = dilate1(thin(grid));
const cost = new Float32Array(GRID * GRID);
let centreCount = 0;
for (let i = 0; i < GRID * GRID; i++) {
  cost[i] = centre[i] ? 1 : grid[i] ? 5 : 28;
  centreCount += centre[i];
}
console.log(`Centerline ribbon: ${centreCount} px. Tracing ${jobs.length} segments.`);
const routes = traceAll(cost, centre, grid);

const line = ([id, pts]: [string, Pt[]]) => `  '${id}': [${pts.map(([x, y]) => `[${x}, ${y}]`).join(', ')}],`;
const anchored = new Set(CIRCUIT_ANCHORS.filter((a) => a.snap !== false).map((a) => `c${a.idx}`));
const circuit = Object.entries({ ...CIRCUIT_ROUTES, ...routes }).filter(([id]) => !id.startsWith('side:') && anchored.has(id));
const side = Object.entries(routes).filter(([id]) => id.startsWith('side:')).map(([id, pts]) => [id.slice(5), pts] as [string, Pt[]]);
writeFileSync(
  resolve(root, 'src/engine/crownRoutes.ts'),
  `// Generated by scripts/trace-island.ts from public/board/island.jpg. Do not edit by hand.\nexport const CIRCUIT_ROUTES: Record<string, [number, number][]> = {\n${circuit.map(line).join('\n')}\n};\n\nexport const SIDE_TRACES: Record<string, [number, number][]> = {\n${side.map(line).join('\n')}\n};\n`,
);
console.log(`Traced ${Object.keys(routes).length} segments.`);
