'use client';

import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_INFO,
  CHARACTER_KINDS,
  ISLAND_SIZE,
  gemList,
  gemsOf,
  dragonNode,
  edgeBlocked,
  edgeOpen,
  getBoard,
  nodeName,
  other,
  type Character,
  type EdgeDef,
  type MapId,
  type NodeDef,
  type PlayerView,
} from '@/engine';
import { readMapMarkers } from '@/lib/mapMarkers';
import { seatTheme } from '@/lib/seats';
import { GEM_NAMES, GEM_STYLE, GemShape } from '../art/gems';
import { PieceToken } from '../art/token';

export interface BoardTargets {
  nodes: Set<string>;
  edges: Set<string>;
  characters: Set<string>;
}

export interface BoardEffect {
  id: number;
  node: string;
  text: string;
  tone: 'cut' | 'blocked' | 'good' | 'bad';
}

export interface BoardPlan {
  characterId: string;
  /** Legal end spaces for this roll. */
  ends: string[];
  /** The previewed route (null until an end is picked). */
  choice: string[] | null;
  /** One-line summary shown beside the confirm button. */
  summary: string;
  /** Rival pieces that would be captured on the previewed route (red). */
  captures?: string[];
  /** Knight route-attack candidates currently selected. */
  attackSelected?: string[];
  /** Knight route-attack candidates available on this route. */
  attackChoices?: string[];
  /** Portal exit node after a Witch hop or paired portal end. */
  portalExits?: string[];
  /** Known hazard / teleport landing spaces along the preview. */
  hazards?: string[];
}

export interface GameBoardProps {
  view: PlayerView;
  map: MapId;
  me: string | null;
  /** Characters the viewer may move right now (they glow). */
  movable: Set<string>;
  plan: BoardPlan | null;
  targets: BoardTargets;
  coach: Set<string>;
  effects: BoardEffect[];
  /** Space flashed red after an invalid drop or tap. */
  invalid: { node: string; at: number } | null;
  reduced: boolean;
  fast: boolean;
  resetKey: number;
  onPiece: (id: string) => void;
  onNode: (id: string) => void;
  onEdge: (id: string) => void;
  onConfirm: () => void;
  /** Drag: pointer is over a space while carrying the selected piece. */
  onDragOver: (node: string) => void;
  /** Drag released over a space (or nowhere). */
  onDrop: (node: string | null) => void;
  onDragStart: (id: string) => void;
  /** Several pieces share a space: open a picker. */
  onCrowd: (node: string) => void;
  /** Explain a board feature that is not a space (a broken bridge, fallen rocks). */
  onExplain?: (text: string) => void;
  /**
   * Royal Path drawing. `playSeat` is the one house whose path is part of the
   * selected move. `inspect` draws every path as a muted guide, not a move.
   * `explainSeat` keeps that house's spaces clickable so a locked path can
   * explain itself, without drawing the line. `reachNodes` limits the live
   * overlay to spaces the selected piece can actually use this roll.
   */
  royal: { playSeat: number | null; inspect: boolean; explainSeat: number | null; reachNodes?: Set<string> | null };
  /** House plates the selected (or inspected) piece has already touched, ticked on the board. */
  platesDone?: number[] | null;
  /** Tap a map marker (A3) for its explanation. */
  onMarker?: (id: string, text: string) => void;
}

type Pt = [number, number];
const W = ISLAND_SIZE;
const H = ISLAND_SIZE;
const KIND_ORDER = Object.fromEntries(CHARACTER_KINDS.map((k, i) => [k, i]));
const toPoints = (pts: Pt[]) => pts.map((p) => `${p[0]},${p[1]}`).join(' ');

function midpoint(pts: Pt[]): Pt {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let half = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (half <= d) {
      const t = d ? half / d : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
    }
    half -= d;
  }
  return pts[0];
}

/** Edge polyline oriented from `a` (portal hops have no edge: a straight dashed line). */
function routeBetween(adj: Record<string, EdgeDef[]>, nodes: Record<string, NodeDef>, a: string, b: string): { pts: Pt[]; hop: boolean } {
  const e = adj[a]?.find((x) => other(x, a) === b);
  if (!e) return { pts: [nodes[a].xy, nodes[b].xy], hop: true };
  return { pts: e.a === a ? e.route : [...e.route].reverse(), hop: false };
}

export function GameBoard(props: GameBoardProps) {
  const { view, map, me, movable, plan, targets, coach, effects, invalid, reduced, fast, resetKey, royal, platesDone } = props;
  const [fadingSeat, setFadingSeat] = useState<number | null>(null);
  const playedSeat = useRef<number | null>(null);
  useEffect(() => {
    if (royal.playSeat != null) {
      playedSeat.current = royal.playSeat;
      // The highlight is back: drop any fade-out still running.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFadingSeat(null);
      return;
    }
    const seat = playedSeat.current;
    if (seat == null) return;
    playedSeat.current = null;
    setFadingSeat(seat);
    const t = setTimeout(() => setFadingSeat(null), 380);
    return () => clearTimeout(t);
  }, [royal.playSeat]);
  const { board, nodes, adj } = getBoard(view.boardId);
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const [px, setPx] = useState(0.6);
  const [zoom, setZoom] = useState({ k: 1, x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setPx(Math.min(r.width / W, r.height / H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Reset view and map switches are explicit user commands that reset the camera.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setZoom({ k: 1, x: 0, y: 0 });
  }, [resetKey, map]);

  const scale = px * zoom.k;
  const ui = 1 / scale;
  const dungeon = map === 'dungeon';
  /** Pieces keep a usable on-screen size (about 26px across) at any board size. */
  const pieceScale = Math.max(dungeon ? 1.5 : 1, 13 / (13 * scale));
  const stoneR = Math.max(dungeon ? 14 : 8, 6 / scale);
  const hitR = Math.min(40, Math.max(dungeon ? 34 : 15, 20 / scale));

  const clamp = useCallback((z: { k: number; x: number; y: number }) => {
    const k = Math.min(4, Math.max(1, z.k));
    return { k, x: Math.min(0, Math.max(W - W * k, z.x)), y: Math.min(0, Math.max(H - H * k, z.y)) };
  }, []);
  const zoomAt = (factor: number, cx = W / 2, cy = H / 2) =>
    setZoom((z) => {
      const k = Math.min(4, Math.max(1, z.k * factor));
      const mx = (cx - z.x) / z.k;
      const my = (cy - z.y) / z.k;
      return clamp({ k, x: cx - mx * k, y: cy - my * k });
    });

  const toBoard = useCallback((clientX: number, clientY: number): Pt | null => {
    const m = layerRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }, []);
  const toView = useCallback((clientX: number, clientY: number): Pt | null => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  }, []);

  // ---------------------------------------------------------------- move animation
  const [anim, setAnim] = useState<{ characterId: string; path: string[]; i: number } | null>(null);
  const lastVersion = useRef(view.version);
  useEffect(() => {
    if (view.version === lastVersion.current) return;
    lastVersion.current = view.version;
    if (reduced) return;
    const moved = [...view.lastEvents].reverse().find((e) => e.type === 'moved');
    if (!moved || moved.type !== 'moved') return;
    const tp = view.lastEvents.find((e) => e.type === 'teleported' && e.characterId === moved.characterId && e.reason !== 'portal');
    const path = tp && tp.type === 'teleported' ? [...moved.path, tp.to] : moved.path;
    // Animating events is a reaction to a new server state, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnim({ characterId: moved.characterId, path, i: 0 });
  }, [view.version, view.lastEvents, reduced]);
  useEffect(() => {
    if (!anim) return;
    const t = setTimeout(() => setAnim((a) => (a && a.i < a.path.length - 1 ? { ...a, i: a.i + 1 } : null)), fast ? 110 : 200);
    return () => clearTimeout(t);
  }, [anim, fast]);

  const nodeFor = useCallback((c: Character) => (anim?.characterId === c.id ? anim.path[anim.i] : c.node), [anim]);
  const seatOf = useCallback((owner: string) => view.players.find((p) => p.id === owner)?.seat ?? 0, [view.players]);
  const mySeat = view.players.find((p) => p.id === me)?.seat ?? -1;

  // ---------------------------------------------------------------- piece layout
  const gateNode = board.transitions[0].island;
  const pieces = (() => {
    const groups = new Map<string, Character[]>();
    for (const c of Object.values(view.characters)) {
      const n = nodeFor(c);
      if (nodes[n]?.map !== map) continue;
      groups.set(n, [...(groups.get(n) ?? []), c]);
    }
    const out: { c: Character; node: string; x: number; y: number; crowd: number }[] = [];
    for (const [node, list] of groups) {
      list.sort((a, b) => seatOf(a.owner) - seatOf(b.owner) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
      const [x, y] = nodes[node].xy;
      const castle = nodes[node].type === 'castle';
      list.forEach((c, i) => {
        let off: Pt = [0, 0];
        if (castle) off = [((i % 2) - 0.5) * 46, (Math.floor(i / 2) - 0.5) * 52];
        else if (list.length > 1) {
          const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
          const r = list.length === 2 ? 12 : 15;
          off = [Math.cos(a) * r, Math.sin(a) * r];
        }
        const pad = 15 * pieceScale;
        out.push({ c, node, crowd: list.length, x: Math.min(W - pad, Math.max(pad, x + off[0] * pieceScale)), y: Math.min(H - pad, Math.max(pad * 1.4, y + off[1] * pieceScale)) });
      });
    }
    return out;
  })();
  const crowds = [...new Set(pieces.filter((p) => p.crowd > 2 && nodes[p.node].type !== 'castle').map((p) => p.node))];

  // ---------------------------------------------------------------- pointer: tap, drag a piece, pan, pinch
  const gesture = useRef<
    null | { kind: 'piece'; id: string; pointer: number; sx: number; sy: number; dragging: boolean } | { kind: 'pan'; pointer: number; sx: number; sy: number; z: { k: number; x: number; y: number }; moved: boolean }
  >(null);
  const pointers = useRef(new Map<number, Pt>());
  const pinch = useRef<null | { d: number; k: number; mid: Pt }>(null);
  const [ghost, setGhost] = useState<null | { id: string; at: Pt }>(null);
  const suppressAt = useRef<{ x: number; y: number; t: number } | null>(null);
  // Touch browsers can deliver the click a few hundred ms after pointerup, onto whatever was drawn under the finger meanwhile.
  const suppressClick = (e: React.PointerEvent) => {
    suppressAt.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  };

  const nodeAtPoint = (clientX: number, clientY: number) => {
    const p = toBoard(clientX, clientY);
    if (!p) return null;
    let best: string | null = null;
    let bestD = Math.max(hitR, 26 / scale);
    for (const n of board.nodes) {
      if (n.map !== map) continue;
      const d = Math.hypot(n.xy[0] - p[0], n.xy[1] - p[1]);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: zoom.k, mid: toView((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) ?? [W / 2, H / 2] };
      gesture.current = null;
      setGhost(null);
      return;
    }
    const piece = (e.target as Element).closest('[data-piece]')?.getAttribute('data-piece');
    if (piece && movable.has(piece)) {
      gesture.current = { kind: 'piece', id: piece, pointer: e.pointerId, sx: e.clientX, sy: e.clientY, dragging: false };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (!(e.target as Element).closest('[data-node],[data-piece],[data-edge],[role="button"]')) gesture.current = { kind: 'pan', pointer: e.pointerId, sx: e.clientX, sy: e.clientY, z: zoom, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const { k, mid } = pinch.current;
      setZoom((z) => {
        const nk = Math.min(4, Math.max(1, (k * d) / (pinch.current?.d || d)));
        const mx = (mid[0] - z.x) / z.k;
        const my = (mid[1] - z.y) / z.k;
        return clamp({ k: nk, x: mid[0] - mx * nk, y: mid[1] - my * nk });
      });
      return;
    }
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    if (g.kind === 'pan') {
      const m = svgRef.current?.getScreenCTM();
      if (!m) return;
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 4) g.moved = true;
      if (g.z.k > 1) setZoom(clamp({ ...g.z, x: g.z.x + (e.clientX - g.sx) / m.a, y: g.z.y + (e.clientY - g.sy) / m.d }));
      return;
    }
    if (!g.dragging && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 8) {
      g.dragging = true;
      props.onDragStart(g.id);
    }
    if (!g.dragging) return;
    const at = toBoard(e.clientX, e.clientY);
    if (at) setGhost({ id: g.id, at });
    const over = nodeAtPoint(e.clientX, e.clientY);
    if (over) props.onDragOver(over);
  };

  const endPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) pinch.current = null;
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.pointer !== e.pointerId) return;
    if (g.kind === 'pan') {
      if (g.moved) suppressClick(e);
      return;
    }
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    suppressClick(e);
    if (g.dragging) {
      setGhost(null);
      props.onDrop(e.type === 'pointercancel' ? null : nodeAtPoint(e.clientX, e.clientY));
    } else props.onPiece(g.id);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    const at = suppressAt.current;
    if (at && e.timeStamp - at.t < 400 && Math.hypot(e.clientX - at.x, e.clientY - at.y) < 12) {
      suppressAt.current = null;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey && !e.altKey && zoom.k === 1 && e.deltaY > 0) return;
    const p = toView(e.clientX, e.clientY);
    if (p) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p[0], p[1]);
  };
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => {
      if (zoom.k > 1 || e.deltaY < 0) e.preventDefault();
    };
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, [zoom.k]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === '+' || e.key === '=') zoomAt(1.25);
    else if (e.key === '-' || e.key === '_') zoomAt(1 / 1.25);
    else if (e.key === '0') setZoom({ k: 1, x: 0, y: 0 });
    else return;
    e.preventDefault();
  };

  // ---------------------------------------------------------------- derived drawing data
  const mapNodes = board.nodes.filter((n) => n.map === map);
  const mapEdges = board.edges.filter((e) => nodes[e.a].map === map);
  const ends = useMemo(() => new Set(plan?.ends ?? []), [plan]);
  const chosenEnd = plan?.choice ? plan.choice[plan.choice.length - 1] : null;
  const planChar = plan ? view.characters[plan.characterId] : null;
  const planTheme = planChar ? seatTheme(seatOf(planChar.owner)) : null;
  const choiceRoute = plan?.choice ? plan.choice.slice(1).map((n, i) => routeBetween(adj, nodes, plan.choice![i], n)) : [];
  const captureSet = useMemo(() => new Set(plan?.captures ?? []), [plan]);
  const attackChoiceSet = useMemo(() => new Set(plan?.attackChoices ?? []), [plan]);
  const attackSelectedSet = useMemo(() => new Set(plan?.attackSelected ?? []), [plan]);
  const hazardSet = useMemo(() => new Set(plan?.hazards ?? []), [plan]);
  const portalSet = useMemo(() => new Set(plan?.portalExits ?? []), [plan]);
  const dNode = dragonNode(view);
  const gemsHere = view.gems.filter((g) => g.node && nodes[g.node]?.map === map);
  const inDungeon = Object.values(view.characters).filter((c) => nodes[c.node]?.map === 'dungeon');

  const pieceLabel = (c: Character) => {
    const owner = view.players.find((p) => p.id === c.owner);
    return `${c.owner === me ? 'Your' : `${owner?.name ?? 'Someone'}'s`} ${CHARACTER_INFO[c.kind].name}`;
  };

  const explainProps = (text: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    style: { cursor: 'help' },
    onClick: () => props.onExplain?.(text),
    onKeyDown: (k: React.KeyboardEvent) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onExplain?.(text)),
  });

  const glyph = (key: string, at: Pt, icon: string, label: string, text: string, size = 30) => (
    <g key={key} transform={`translate(${at[0]} ${at[1]}) scale(${Math.max(1, ui * 0.75)})`} aria-label={label} data-glyph={key} {...explainProps(text)}>
      <circle r={size / 2} fill="transparent" />
      <image href={icon} x={-size / 2} y={-size / 2} width={size} height={size} />
    </g>
  );

  // A live highlight follows the selected move. Inspection draws every path, muted.
  const liveSeat = royal.playSeat;
  const shownSeat = liveSeat ?? fadingSeat;
  const fading = liveSeat == null && fadingSeat != null;
  const royalMode = (seat: number | undefined): 'play' | 'fading' | 'inspect' | null => {
    if (seat === undefined) return null;
    if (shownSeat === seat) return fading ? 'fading' : 'play';
    if (royal.inspect) return 'inspect';
    return null;
  };

  // Overlays: side routes, structures, landslides. Royal Paths are added after, only when shown.
  const overlays: React.ReactNode[] = [];
  const glyphs: React.ReactNode[] = [];
  const marked = new Set<string>();
  for (const e of mapEdges) {
    const open = edgeOpen(view, e);
    const blocked = edgeBlocked(view, e);
    const pts = e.route;
    const targeted = targets.edges.has(e.id) || (!!e.gate && [...targets.edges].some((t) => board.edges.find((x) => x.id === t)?.gate === e.gate));
    if (e.lane === 'final') continue;
    if (e.lane === 'side') {
      const tone = !open ? '#b1462b' : e.structure === 'tunnel' ? '#3b2a1a' : '#f6e7c1';
      overlays.push(
        <polyline key={e.id} points={toPoints(pts)} fill="none" stroke={tone} strokeWidth={open ? 6 : 4} strokeLinecap="round" strokeDasharray={open ? (e.structure === 'tunnel' ? '2 6' : undefined) : '3 7'} opacity={open ? 0.85 : 0.7} pointerEvents="none" />,
      );
    } else if (e.lane === 'dungeon') {
      overlays.push(<polyline key={e.id} points={toPoints(pts)} fill="none" stroke="#f3e2b8" strokeWidth={5} strokeLinecap="round" strokeDasharray="2 10" opacity={0.6} pointerEvents="none" />);
    }
    const mid = midpoint(pts);
    if (blocked)
      glyphs.push(glyph(`${e.id}-rocks`, mid, '/art/icon-mountain.png', `${e.name ?? 'Path'} blocked by a landslide`, `Landslide: ${e.name ?? 'this pass'} is blocked. Nobody can walk through, and Dragon Fire cannot pass. A Repair card clears it.`));
    else if (e.structure === 'bridge')
      glyphs.push(
        open
          ? glyph(`${e.id}-bridge`, mid, '/art/icon-bridge.png', `${e.name} (open)`, `${e.name}: open. Collapse Bridge can knock it down if nobody would be stranded.`, 26)
          : glyph(`${e.id}-bridge`, mid, '/art/icon-broken-bridge.png', `${e.name} (broken)`, `${e.name}: broken. Build Bridge or Repair rebuilds it.`),
      );
    else if (e.structure === 'tunnel' && e.gate && !marked.has(e.gate)) {
      marked.add(e.gate);
      const name = e.name ?? 'Tunnel';
      glyphs.push(glyph(`${e.id}-tunnel`, mid, '/art/icon-tunnel.png', `${name} (${open ? 'open' : 'not dug'})`, open ? `${name}: open. A two-way shortcut for every house.` : `${name}: not dug yet. Dig Tunnel opens it, or a lucky dig may uncover it.`));
    } else if (e.structure === 'road' && !open) {
      const name = (e.name ?? 'Road').replace(/ \(unbuilt\)$/, '');
      glyphs.push(glyph(`${e.id}-plot`, mid, '/art/icon-dig.png', `${name}: unbuilt road plot`, `${name}: an unbuilt road plot. Build Road paves it, or a lucky dig may uncover it.`, 26));
    }
    if (targeted)
      overlays.push(
        <g key={`${e.id}-target`}>
          <polyline points={toPoints(pts)} fill="none" stroke="#2f7bf5" strokeWidth={10} strokeLinecap="round" opacity={0.8} className="kc-pulse" pointerEvents="none" />
          <polyline
            points={toPoints(pts)}
            fill="none"
            stroke="transparent"
            strokeWidth={30}
            data-edge={e.id}
            role="button"
            tabIndex={0}
            aria-label={`Target ${e.name ?? 'this path'}`}
            style={{ cursor: 'pointer' }}
            onClick={() => props.onEdge(e.id)}
            onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onEdge(e.id))}
          />
        </g>,
      );
  }

  const reach = royal.reachNodes;
  for (const e of mapEdges) {
    if (e.lane !== 'final') continue;
    const seat = nodes[e.a].house ?? nodes[e.b].house;
    const mode = royalMode(seat);
    if (!mode || seat === undefined) continue;
    // Live overlay: only the selected piece's reachable portion of its own path.
    if ((mode === 'play' || mode === 'fading') && reach && reach.size > 0 && !(reach.has(e.a) && reach.has(e.b))) continue;
    const th = seatTheme(seat);
    const play = mode === 'play' || mode === 'fading';
    overlays.push(
      <g key={e.id} pointerEvents="none" data-royal-path={mode} data-royal-house={seat} data-royal-playable={play && mode !== 'fading' ? 'true' : 'false'} style={{ opacity: mode === 'fading' ? 0 : 1, transition: 'opacity 0.35s ease' }}>
        {play ? (
          <>
            <polyline points={toPoints(e.route)} fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
            <polyline points={toPoints(e.route)} fill="none" stroke={th.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <polyline points={toPoints(e.route)} fill="none" stroke={th.color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 8" opacity={0.45} />
        )}
      </g>,
    );
  }

  // A3 map markers (distinct color + icon + label). Hidden effects stay off the map.
  const markers = readMapMarkers(view).filter((m) => {
    if (m.node) return nodes[m.node]?.map === map;
    if (m.edgeId) {
      const e = board.edges.find((x) => x.id === m.edgeId);
      return !!e && nodes[e.a]?.map === map;
    }
    return false;
  });
  for (const m of markers) {
    let at: Pt | null = null;
    if (m.node && nodes[m.node]) at = nodes[m.node].xy;
    else if (m.edgeId) {
      const e = board.edges.find((x) => x.id === m.edgeId);
      if (e) at = midpoint(e.route);
    }
    if (!at) continue;
    const onExplain = () => (props.onMarker ? props.onMarker(m.id, m.explain) : props.onExplain?.(m.explain));
    glyphs.push(
      <g
        key={`marker-${m.id}`}
        transform={`translate(${at[0]} ${at[1]}) scale(${Math.max(1, ui * 0.75)})`}
        role="button"
        tabIndex={0}
        aria-label={m.label}
        data-map-marker={m.kind}
        data-marker-id={m.id}
        style={{ cursor: 'help' }}
        onClick={() => onExplain()}
        onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), onExplain())}
      >
        <circle r={16} fill={m.color} fillOpacity={0.92} stroke="#fff" strokeWidth={2} filter="url(#kc-soft)" />
        {m.icon ? <image href={m.icon} x={-11} y={-11} width={22} height={22} /> : <circle r={5} fill="#fff" />}
        <text y={26} textAnchor="middle" fontSize={9} fontWeight={800} fill={m.color} stroke="#fffaf0" strokeWidth={3} paintOrder="stroke">
          {m.label}
        </text>
      </g>,
    );
  }

  // ---------------------------------------------------------------- spaces
  const renderNode = (n: NodeDef, top = false) => {
    const isEnd = ends.has(n.id);
    const chosen = chosenEnd === n.id;
    const target = targets.nodes.has(n.id);
    const coached = coach.has(n.id);
    const flash = invalid?.node === n.id;
    const interactive = isEnd || target;
    const entrance = royal.explainSeat == null ? null : board.houses.find((h) => h.seat === royal.explainSeat)?.final[0];
    const royalLook = n.lane === 'final' ? (royalMode(n.house) ?? (ends.has(n.id) ? 'play' : n.id === entrance ? 'locked' : null)) : null;
    if (n.lane === 'final' && !royalLook) return null;
    if (n.lane === 'final' && (royalLook === 'play' || royalLook === 'fading') && reach && reach.size > 0 && !reach.has(n.id) && !ends.has(n.id)) return null;
    const house = n.house !== undefined ? seatTheme(n.house) : null;
    const entryOf = board.houses.find((h) => h.entry === n.id);
    const forkOf = board.houses.find((h) => h.branch === n.id);
    const transformed = view.transforms[n.id];
    const r = n.type === 'castle' ? 30 : n.type === 'temple' ? 26 : n.lane === 'final' ? stoneR * 1.05 : stoneR;
    const label = isEnd ? `Move to ${n.name}` : target ? `Target ${n.name}` : n.name;
    let body: React.ReactNode;
    if (n.type === 'castle') body = <circle r={r} fill={house!.color} fillOpacity={n.house === mySeat ? 0.28 : 0.16} stroke={house!.color} strokeWidth={n.house === mySeat ? 4 : 2.5} />;
    else if (n.type === 'temple') body = <circle r={r} fill="rgba(255,215,90,0.25)" stroke="#ffcf33" strokeWidth={3} />;
    else if (entryOf) {
      const th = seatTheme(entryOf.seat);
      body = (
        <g data-plate={entryOf.seat} data-plate-done={platesDone ? String(platesDone.includes(entryOf.seat)) : undefined}>
          <circle r={r * 1.7} fill={th.color} fillOpacity={0.16} stroke={th.color} strokeWidth={2} />
          {platesDone?.includes(entryOf.seat) && (
            <g transform={`translate(${r * 1.45} ${-r * 1.45})`}>
              <circle r={r * 0.75} fill="#2e9e62" stroke="#fff" strokeWidth={1.8} />
              <path d="M-3 0 L-1 2.2 L3 -2.4" stroke="#fff" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`scale(${r / 8})`} />
            </g>
          )}
        </g>
      );
    } else if (n.lane === 'final' && (royalLook === 'locked' || royalLook === 'inspect'))
      body =
        royalLook === 'inspect' ? <circle r={r} fill="none" stroke={house?.color ?? '#8a6a3b'} strokeWidth={1.6} strokeDasharray="2 3" opacity={0.8} /> : null;
    else if (house) body = <circle r={r} fill={house.light} stroke={house.dark} strokeWidth={1.6} />;
    else if (n.teleport) {
      const trap = n.teleport.type === 'trap';
      body = (
        <g>
          <circle r={r * 1.15} fill={trap ? '#d64532' : '#18a38a'} stroke="#fff" strokeWidth={1.8} filter="url(#kc-soft)" />
          <path d={trap ? 'M-3.5 -3.5 L3.5 3.5 M3.5 -1 L3.5 3.5 L-1 3.5' : 'M-3.5 3.5 L3.5 -3.5 M-1 -3.5 L3.5 -3.5 L3.5 1'} stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" transform={`scale(${r / 7})`} />
        </g>
      );
    } else if (transformed) body = <image href={transformed === 'river' ? '/art/icon-river.png' : '/art/icon-mountain.png'} x={-r * 2} y={-r * 2} width={r * 4} height={r * 4} />;
    else
      body = (
        <g>
          <circle r={r} fill={n.lane === 'side' ? '#f8eed6' : 'url(#kc-stone)'} stroke={n.safe ? '#c58b00' : '#6b5232'} strokeWidth={n.safe ? 2.4 : 1.2} />
          {n.safe && <path d="M0 -4.5 L1.3 -1.4 L4.6 -1.4 L1.9 0.6 L2.9 3.9 L0 2 L-2.9 3.9 L-1.9 0.6 L-4.6 -1.4 L-1.3 -1.4 Z" fill="#c58b00" transform={`scale(${r / 7})`} />}
        </g>
      );
    const deco: React.ReactNode[] = [];
    const icon = (href: string, dx: number, dy: number, size: number) => <image key={href} href={href} x={dx - size / 2} y={dy - size / 2} width={size} height={size} pointerEvents="none" />;
    const iconSize = Math.max(26, 22 / scale);
    if (n.station) deco.push(icon(`/art/gem-${n.station}.png`, 0, -iconSize * 0.75, iconSize));
    if (n.dig && n.map === 'island') deco.push(icon('/art/icon-dig.png', 0, -iconSize * 0.7, iconSize));
    if (n.type === 'vault') deco.push(icon('/art/icon-chest.png', 0, -iconSize, iconSize * 1.3));
    if (n.dock && view.vehicles.boat === n.id) deco.push(icon('/art/icon-boat.png', iconSize * 0.7, -iconSize * 0.4, iconSize * 1.1));
    if (n.airfield && view.vehicles.plane === n.id) deco.push(icon('/art/icon-plane.png', -iconSize * 0.7, -iconSize * 0.4, iconSize * 1.1));
    if (n.dungeonGate) deco.push(icon('/art/icon-trapdoor.png', 0, -iconSize * 0.75, iconSize));
    if (n.type === 'trap') deco.push(icon('/art/icon-trapdoor.png', 0, -iconSize, iconSize * 1.2));
    if (n.hazard)
      deco.push(
        <g key="hazard" transform={`translate(0 ${-r - 7})`} data-hazard pointerEvents="none">
          <path d="M0 -7 L7 5 L-7 5 Z" fill="#f2a11a" stroke="#6b3b00" strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M0 -3 L0 1.2 M0 3 L0 3.2" stroke="#3b2100" strokeWidth={1.7} strokeLinecap="round" />
        </g>,
      );
    if (n.portal) deco.push(<circle key="portal" r={r + 4} fill="none" stroke="#9b6cf0" strokeWidth={2.5} strokeDasharray="3 3" />);
    if (forkOf) {
      const th = seatTheme(forkOf.seat);
      deco.push(<circle key="fork" r={r + 3.5} fill="none" stroke={th.color} strokeWidth={3} />);
    }
    return (
      <g
        key={n.id}
        transform={`translate(${n.xy[0]} ${n.xy[1]})`}
        data-node={n.id}
        data-royal-path={royalLook ?? undefined}
        data-royal-house={n.lane === 'final' ? n.house : undefined}
        data-royal-playable={n.lane === 'final' ? (royalLook === 'play' ? 'true' : 'false') : undefined}
        data-end={isEnd ? 'true' : undefined}
        data-chosen={chosen ? 'true' : undefined}
        data-target={target ? 'true' : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : undefined}
        style={{ cursor: interactive ? 'pointer' : 'help' }}
        onClick={() => props.onNode(n.id)}
        onKeyDown={(k) => {
          if (interactive && (k.key === 'Enter' || k.key === ' ')) {
            k.preventDefault();
            props.onNode(n.id);
          }
        }}
      >
        <title>{entryOf ? `${n.name} — the ${entryOf.name} plate` : n.hazard ? `${n.name} — trap risk` : n.name}</title>
        <circle r={top ? r + 8 : Math.max(hitR, r + 4)} fill="transparent" />
        {body}
        {deco}
        {isEnd && <circle r={r + 7} fill={chosen ? 'rgba(255,255,255,0.35)' : 'rgba(255,224,102,0.35)'} stroke={chosen ? '#fff' : '#ffcf33'} strokeWidth={chosen ? 4.5 : 3.5} className={chosen ? undefined : 'kc-pulse'} />}
        {(target || coached) && <circle r={r + 9} fill="rgba(47,123,245,0.18)" stroke="#2f7bf5" strokeWidth={3.5} className="kc-pulse" />}
        {hazardSet.has(n.id) && <circle r={r + 10} fill="none" stroke="#f2a11a" strokeWidth={3} strokeDasharray="4 3" data-preview-hazard />}
        {portalSet.has(n.id) && <circle r={r + 11} fill="none" stroke="#9b6cf0" strokeWidth={3} strokeDasharray="3 4" data-preview-portal />}
        {flash && <circle key={invalid!.at} r={r + 11} fill="none" stroke="#e0302d" strokeWidth={4} className="kc-flash" />}
      </g>
    );
  };

  const endXY = chosenEnd && nodes[chosenEnd].map === map ? nodes[chosenEnd].xy : null;
  const tpDest = chosenEnd ? nodes[chosenEnd].teleport?.to : undefined;
  // The confirm chip is a fixed screen size, so on a small board it can cover the next stone.
  // Sit it on the side farthest from the other spaces.
  const confirmAt = (() => {
    if (!endXY) return [0, 0] as [number, number];
    const gap = 78 * ui;
    const spots: [number, number][] = [
      [0, -gap],
      [0, gap],
      [gap, 0],
      [-gap, 0],
    ].map(([dx, dy]) => [Math.min(W - 90 * ui, Math.max(90 * ui, endXY[0] + dx)), Math.min(H - 40 * ui, Math.max(40 * ui, endXY[1] + dy))]);
    return spots.reduce((best, spot) => {
      const clearance = Math.min(...mapNodes.filter((n) => n.id !== chosenEnd).map((n) => Math.hypot(n.xy[0] - spot[0], n.xy[1] - spot[1])));
      return clearance > best.clearance ? { spot, clearance } : best;
    }, { spot: spots[0], clearance: -1 }).spot;
  })();

  return (
    <div className="relative h-full w-full" onKeyDown={onKeyDown}>
      <svg
        ref={svgRef}
        className="board-svg h-full w-full select-none"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={dungeon ? 'Dungeon board' : 'Island board'}
        data-board={map}
        data-zoom={zoom.k.toFixed(2)}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClickCapture={onClickCapture}
        onWheel={onWheel}
      >
        <defs>
          <filter id="kc-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1d2440" floodOpacity="0.45" />
          </filter>
          <radialGradient id="kc-stone" cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="70%" stopColor="#efe0bd" />
            <stop offset="100%" stopColor="#cdb48a" />
          </radialGradient>
        </defs>

        <g ref={layerRef} transform={`translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`} data-layer>
          <image href={dungeon ? '/board/dungeon.jpg' : '/board/island.jpg'} x={0} y={0} width={W} height={H} preserveAspectRatio="none" data-art={map} />

          {overlays}

          {/* Previewed route and every reachable end. */}
          {planTheme && plan && (
            <g pointerEvents="none" data-preview-route>
              {choiceRoute.map((s, i) =>
                nodes[plan.choice![i]].map === map ? (
                  <g key={i}>
                    <polyline points={toPoints(s.pts)} fill="none" stroke="#fff" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} strokeDasharray={s.hop ? '4 8' : undefined} />
                    <polyline points={toPoints(s.pts)} fill="none" stroke={planTheme.color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.hop ? '4 8' : undefined} />
                  </g>
                ) : null,
              )}
              {tpDest && endXY && nodes[tpDest].map === map && (
                <line x1={endXY[0]} y1={endXY[1]} x2={nodes[tpDest].xy[0]} y2={nodes[tpDest].xy[1]} stroke={nodes[chosenEnd!].teleport!.type === 'trap' ? '#d64532' : '#18a38a'} strokeWidth={4} strokeDasharray="6 8" className="kc-flow" />
              )}
            </g>
          )}

          {mapNodes.filter((n) => !ends.has(n.id)).map((n) => renderNode(n))}
          {glyphs}

          {/* Dungeon indicator at the gate: who is underground. */}
          {!dungeon && inDungeon.length > 0 && (
            <g transform={`translate(${nodes[gateNode].xy[0] + 26 * pieceScale} ${nodes[gateNode].xy[1] - 34 * pieceScale}) scale(${pieceScale})`} pointerEvents="none" data-dungeon-indicator={inDungeon.length}>
              <rect x={-4} y={-11} width={22 + inDungeon.length * 16} height={22} rx={11} fill="#2b1d14" opacity={0.9} />
              <text x={8} y={4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill="#ffe9c2">
                ⤓
              </text>
              {inDungeon.map((c, i) => (
                <circle key={c.id} cx={24 + i * 16} cy={0} r={6.5} fill={seatTheme(seatOf(c.owner)).color} stroke="#fff" strokeWidth={1.5} />
              ))}
            </g>
          )}

          {/* Dropped gems and the dragon. */}
          {gemsHere.map((g) => {
            const [x, y] = nodes[g.node!].xy;
            return (
              <g key={g.id} transform={`translate(${x + 14 * pieceScale} ${y - 14 * pieceScale}) scale(${pieceScale})`} pointerEvents="none" role="img" aria-label={`A dropped ${GEM_NAMES[g.kind]} at ${nodeName(view.boardId, g.node!)}`} data-gem={g.kind}>
                <circle r={9} fill="#fffaf0" stroke={GEM_STYLE[g.kind].dark} strokeWidth={2} filter="url(#kc-soft)" />
                <GemShape kind={g.kind} size={13} />
              </g>
            );
          })}
          {view.dragon.state !== 'companion' && nodes[dNode]?.map === map && (
            <g
              transform={`translate(${nodes[dNode].xy[0]} ${nodes[dNode].xy[1]}) scale(${pieceScale})`}
              aria-label={`Dragon (${view.dragon.state}) at ${nodeName(view.boardId, dNode)}`}
              data-dragon={view.dragon.state}
              {...explainProps(
                view.dragon.state === 'recovering'
                  ? 'The dragon is recovering in its lair. It cannot be tamed until it recovers.'
                  : `The dragon is ${view.dragon.state} here. Nobody can walk past it, but you may end your move on its space and try to tame it (roll 5–6).`,
              )}
            >
              <image href="/art/dragon.png" x={-26} y={-46} width={52} height={48} style={view.dragon.state === 'recovering' ? { filter: 'grayscale(0.85)' } : undefined} />
            </g>
          )}

          {/* Pieces. */}
          {pieces.map(({ c, node, x, y }) => {
            const theme = seatTheme(seatOf(c.owner));
            const canMove = movable.has(c.id) && !c.finished;
            const selected = plan?.characterId === c.id;
            const targeted = targets.characters.has(c.id);
            const capture = captureSet.has(c.id);
            const attackPick = attackChoiceSet.has(c.id);
            const attackOn = attackSelectedSet.has(c.id);
            const companion = view.dragon.state === 'companion' && view.dragon.companion === c.id;
            const carried = gemsOf(view, c);
            const label = `${pieceLabel(c)} at ${nodeName(view.boardId, c.node)}${carried.length ? `, carrying ${gemList(carried.map((g) => g.kind))}` : ''}, ${c.lap} of 4 plates${c.shield ? ', Shield' : ''}${c.immune ? ', Immune' : ''}${c.guarded ? ', Guarded' : ''}${companion ? ', with the dragon' : ''}${canMove ? ', can move' : ''}${selected ? ', selected' : ''}${capture ? ', capture target' : ''}${attackPick ? ', route attack choice' : ''}`;
            return (
              <g
                key={c.id}
                data-piece={c.id}
                data-node={node}
                data-owner={c.owner === me ? 'you' : c.owner}
                data-movable={canMove ? 'true' : undefined}
                data-selected={selected ? 'true' : undefined}
                data-capture={capture ? 'true' : undefined}
                data-attack-choice={attackPick ? 'true' : undefined}
                data-attack-selected={attackOn ? 'true' : undefined}
                role="button"
                tabIndex={canMove || targeted || attackPick || c.owner === me ? 0 : -1}
                aria-label={label}
                aria-pressed={canMove ? selected : attackPick ? attackOn : undefined}
                onKeyDown={(k) => {
                  if (k.key === 'Enter' || k.key === ' ') {
                    k.preventDefault();
                    props.onPiece(c.id);
                  }
                }}
                onClick={(e) => {
                  if (e.detail === 0 || !canMove || attackPick) props.onPiece(c.id);
                }}
                style={{
                  transform: `translate(${x}px, ${y}px)`,
                  transition: reduced ? undefined : `transform ${fast ? 110 : 190}ms ease-out`,
                  cursor: canMove || attackPick ? 'grab' : 'pointer',
                  opacity: ghost?.id === c.id || c.finished ? 0.35 : 1,
                }}
              >
                <g transform={`scale(${pieceScale})`}>
                  <ellipse cx={0} cy={-22} rx={20} ry={30} fill="transparent" />
                  {(canMove || selected) && <ellipse cx={0} cy={-24} rx={18} ry={28} fill="none" stroke={selected ? '#fff' : '#ffe066'} strokeWidth={selected ? 3.5 : 2.6} strokeDasharray={selected ? undefined : '5 4'} className={selected ? undefined : 'kc-spin'} />}
                  {targeted && !capture && <ellipse cx={0} cy={-24} rx={20} ry={30} fill="rgba(47,123,245,0.16)" stroke="#2f7bf5" strokeWidth={3} className="kc-pulse" />}
                  {(capture || attackPick) && (
                    <ellipse cx={0} cy={-24} rx={21} ry={31} fill="rgba(200,40,30,0.18)" stroke={attackOn ? '#fff' : '#c8281e'} strokeWidth={attackOn ? 4 : 3.2} className="kc-pulse" />
                  )}
                  <PieceToken kind={c.kind} theme={theme} />
                  {carried.map((g, i) => (
                    <g key={g.id} transform={`translate(11 ${9 - i * 12})`} data-carrying={g.kind}>
                      <circle r={6.5} fill="#fffaf0" stroke={GEM_STYLE[g.kind].dark} strokeWidth={1.4} />
                      <GemShape kind={g.kind} size={9.5} />
                    </g>
                  ))}
                  {(c.shield || c.immune || c.guarded) && (
                    <g transform="translate(-11 9)">
                      <circle r={6} fill={c.immune ? '#ffd166' : c.guarded ? '#6a3fd0' : '#2f7bf5'} stroke="#fff" strokeWidth={1.4} />
                      <text y={2.6} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={c.immune ? '#5a3d00' : '#fff'}>
                        {c.immune ? 'I' : c.guarded ? 'G' : 'S'}
                      </text>
                    </g>
                  )}
                  {companion && <image href="/art/dragon.png" x={6} y={-24} width={16} height={15} />}
                </g>
              </g>
            );
          })}

          {/* Crowded spaces: a count badge that opens a picker. */}
          {crowds.map((node) => {
            const [x, y] = nodes[node].xy;
            const n = pieces.filter((p) => p.node === node).length;
            return (
              <g
                key={`crowd-${node}`}
                transform={`translate(${x + 20 * pieceScale} ${y + 18 * pieceScale}) scale(${pieceScale})`}
                role="button"
                tabIndex={0}
                aria-label={`${n} pieces at ${nodes[node].name}: choose one`}
                data-crowd={node}
                style={{ cursor: 'pointer' }}
                onClick={() => props.onCrowd(node)}
                onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onCrowd(node))}
              >
                <circle r={8} fill="#1d2440" stroke="#fff" strokeWidth={1.6} />
                <text y={3.5} textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#fff">
                  ×{n}
                </text>
              </g>
            );
          })}

          {mapNodes.filter((n) => ends.has(n.id)).map((n) => renderNode(n, true))}

          {ghost && (
            <g transform={`translate(${ghost.at[0]} ${ghost.at[1]}) scale(${pieceScale * 1.15})`} pointerEvents="none" data-ghost>
              <PieceToken kind={view.characters[ghost.id].kind} theme={seatTheme(seatOf(view.characters[ghost.id].owner))} />
            </g>
          )}

          {/* Confirm chip beside the previewed end. */}
          {plan?.choice && endXY && !anim && (
            <g transform={`translate(${confirmAt[0]} ${confirmAt[1]}) scale(${ui})`}>
              <g
                role="button"
                tabIndex={0}
                aria-label={`Move here: ${nodes[chosenEnd!].name}`}
                data-confirm-move
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onConfirm();
                }}
                onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onConfirm())}
              >
                <rect x={-58} y={-17} width={116} height={34} rx={17} fill="#2e9e62" stroke="#fff" strokeWidth={2.5} filter="url(#kc-soft)" />
                <text y={5} textAnchor="middle" fontSize={14} fontWeight={800} fill="#fff">
                  Move here ✓
                </text>
              </g>
            </g>
          )}

          {/* Short-lived outcome labels. */}
          {effects
            .filter((fx) => nodes[fx.node]?.map === map)
            .map((fx) => {
              const [x, y] = nodes[fx.node].xy;
              const fill = fx.tone === 'cut' ? '#c8281e' : fx.tone === 'blocked' ? '#2f7bf5' : fx.tone === 'good' ? '#2e9e62' : '#5b6676';
              return (
                <g key={fx.id} transform={`translate(${x} ${y - 30 * pieceScale}) scale(${ui})`} pointerEvents="none" data-effect={fx.tone}>
                  <g className={reduced ? undefined : 'kc-rise'}>
                    <rect x={-66} y={-14} width={132} height={26} rx={13} fill={fill} stroke="#fff" strokeWidth={2} />
                    <text y={4.5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
                      {fx.text}
                    </text>
                  </g>
                </g>
              );
            })}
        </g>
      </svg>

      <div className="absolute right-2 bottom-2 z-10 flex flex-col gap-1.5">
        <button type="button" className="btn btn-ghost icon-btn bg-white/90!" aria-label="Zoom in" onClick={() => zoomAt(1.3)}>
          <Plus size={18} />
        </button>
        <button type="button" className="btn btn-ghost icon-btn bg-white/90!" aria-label="Zoom out" disabled={zoom.k <= 1} onClick={() => zoomAt(1 / 1.3)}>
          <Minus size={18} />
        </button>
        <button type="button" className="btn btn-ghost icon-btn bg-white/90!" aria-label="Reset zoom" disabled={zoom.k === 1} onClick={() => setZoom({ k: 1, x: 0, y: 0 })}>
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
