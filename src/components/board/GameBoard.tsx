'use client';

import { Expand, Minus, Plus, RotateCcw, Shrink } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CHARACTER_INFO,
  CHARACTER_KINDS,
  DUNGEON_GUIDE,
  DUNGEON_LANDMARKS,
  landmarkText,
  BOARD_CONTENT,
  BOARD_H,
  BOARD_W,
  gemList,
  gemsOf,
  dragonNode,
  edgeBlocked,
  edgeOpen,
  getBoard,
  nodeName,
  other,
  royalPathOpen,
  type Character,
  type EdgeDef,
  type MapId,
  type MonsterId,
  type NodeDef,
  type PlayerView,
} from '@/engine';
import { monsterReach, monsterResting, monstersOf, monsterTargets } from '@/engine/dungeon';
import { activeWard, protectionLabel } from '@/engine/protection';
import type { Strike } from '@/lib/eventFeed';
import { readMapMarkers } from '@/lib/mapMarkers';
import { seatTheme } from '@/lib/seats';
import type { MarkerStyle } from '@/lib/settings';
import { GEM_NAMES, GEM_STYLE, GemShape } from '../art/gems';
import { PieceToken } from '../art/token';
import { GolemArt, SpiderArt } from '../art/monsters';

export interface BoardTargets {
  nodes: Set<string>;
  edges: Set<string>;
  characters: Set<string>;
}

export interface BoardEffect {
  id: number;
  node: string;
  /** Exact spot (a road's midpoint) when the label belongs beside a road rather than a space. */
  at?: [number, number];
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
  /** Tap a board label to close it before it fades on its own. */
  onEffectDismiss?: (id: number) => void;
  /** Short attack animations driven by resolved events (Dragon Fire, monster attacks, shield blocks). */
  strikes?: Strike[];
  /** Space flashed red after an invalid drop or tap. */
  invalid: { node: string; at: number } | null;
  reduced: boolean;
  fast: boolean;
  resetKey: number;
  onPiece: (id: string) => void;
  onNode: (id: string) => void;
  /** A path segment was tapped (`explain`: what it is, for when no card can change it). */
  onEdge: (id: string, explain?: string) => void;
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
  /** A tapped road segment waiting for confirmation: drawn as the change it would make. */
  edgePreview?: { edgeId: string; change: 'open' | 'close'; label: string } | null;
  onConfirmEdge?: () => void;
  onCancelEdge?: () => void;
  /** The dragon companion's chosen Dragon Fire target (before the attack die). */
  fireTarget?: string | null;
  /** Spaces where one of the viewer's pieces can take an Adventure action right now (landmarks glow green). */
  actionNodes?: Set<string>;
  /** Landmark look: small icons with names on hover (default), framed icons, or framed icons with names. */
  markerStyle?: MarkerStyle;
  /** Hover text for a space (shown in a translucent box when a mouse rests on it). */
  describeNode?: (id: string) => string;
}

/** Size and caption rules for each landmark style. Names show on hover or focus unless `labels` is set. */
const MARKER_LOOK: Record<MarkerStyle, { glyph: number; frame: boolean; labels: boolean; dig: number; gate: number }> = {
  minimal: { glyph: 0.85, frame: false, labels: false, dig: 26, gate: 46 },
  medallion: { glyph: 1.05, frame: true, labels: false, dig: 30, gate: 54 },
  labelled: { glyph: 1, frame: true, labels: true, dig: 28, gate: 52 },
};

/** Distinct colours for the dungeon's special spaces (also used by the legend). */
export const DUNGEON_TONE: Record<string, string> = {
  dEntrance: '#c58b00',
  safeRoom: '#0369a1',
  encounter: '#be123c',
  monster: '#7c2d12',
  vault: '#a16207',
  gemChamber: '#7c3aed',
  dragonChamber: '#c2410c',
  trap: '#9f1239',
};
const GUIDE = new Map(DUNGEON_GUIDE.map((g) => [g.node, g]));

type Pt = [number, number];
const W = BOARD_W;
const H = BOARD_H;

/**
 * The view box around the W × H painting for a board area of the given size: the same shape as the
 * area, with the painting fitted and centred. The extra room shows the painting's mirrored bleed.
 */
type Cam = { k: number; x: number; y: number };

/**
 * The opening camera: the playable part of the painting (BOARD_CONTENT) as large as the screen allows,
 * never smaller than the whole painting. On a wide screen that is the whole painting; on a phone held
 * upright it trims the open sea at the sides.
 */
export function homeView(vw: number, vh: number): Cam {
  const c = BOARD_CONTENT;
  const k = Math.max(1, Math.min(vw / c.w, vh / c.h));
  if (k === 1) return { k: 1, x: 0, y: 0 };
  const lo = (size: number, frame: number) => (size - frame) / 2;
  const fit = (v: number, size: number, frame: number) => {
    const a = lo(size, frame);
    const b = a + frame - size * k;
    return Math.min(Math.max(a, b), Math.max(Math.min(a, b), v));
  };
  return { k, x: fit(W / 2 - (c.x + c.w / 2) * k, W, vw), y: fit(H / 2 - (c.y + c.h / 2) * k, H, vh) };
}

export function viewFrame(width: number, height: number): { vw: number; vh: number } {
  const a = width > 0 && height > 0 ? width / height : W / H;
  return a >= W / H ? { vw: H * a, vh: H } : { vw: W, vh: W / a };
}
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
  const strikes = props.strikes ?? [];
  /** Monster whose danger zone is shown (tapped, or near the selected piece). */
  const [zoneFor, setZoneFor] = useState<MonsterId | null>(null);
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
  const wrapRef = useRef<HTMLDivElement>(null);
  /** The translucent hover box: what the thing under the mouse is and does. */
  const [hover, setHover] = useState<{ text: string; x: number; y: number; w: number; h: number } | null>(null);
  const hoverOn = (text: string | (() => string)) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse' || !wrapRef.current) return;
      const t = typeof text === 'function' ? text() : text;
      if (!t) return;
      const r = wrapRef.current.getBoundingClientRect();
      setHover({ text: t, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height });
    },
    onPointerLeave: () => setHover(null),
  });
  const layerRef = useRef<SVGGElement>(null);
  /** On-screen size of the board area. The view box takes its shape, so the board fills any screen. */
  const [box, setBox] = useState({ w: W * 0.6, h: H * 0.6 });
  const { vw: VW, vh: VH } = viewFrame(box.w, box.h);
  const px = box.w / VW;
  /** null: the home view, which follows the screen shape (the island framed, the open sea trimmed). */
  const [cam, setCam] = useState<Cam | null>(null);
  const zoom = cam ?? homeView(VW, VH);
  const setZoom = useCallback((u: Cam | null | ((z: Cam) => Cam)) => setCam((prev) => (typeof u === 'function' ? u(prev ?? homeView(VW, VH)) : u)), [VW, VH]);

  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) setBox((b) => (Math.abs(b.w - r.width) < 0.5 && Math.abs(b.h - r.height) < 0.5 ? b : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Reset view and map switches are explicit user commands that reset the camera.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCam(null);
  }, [resetKey, map]);

  const scale = px * zoom.k;
  const ui = 1 / scale;
  const dungeon = map === 'dungeon';
  /** Pieces keep a usable on-screen size (about 26px across) at any board size. */
  const pieceScale = Math.max(dungeon ? 1.5 : 1, 13 / (13 * scale));
  const stoneR = Math.max(dungeon ? 14 : 8, 6 / scale);
  // Every space keeps a touch target of at least 44 CSS px across.
  const hitR = Math.min(64, Math.max(dungeon ? 34 : 15, 22 / scale));
  const pulse = reduced ? undefined : 'kc-pulse';
  const look = MARKER_LOOK[props.markerStyle ?? 'minimal'];
  /** Caption class: hidden until the landmark is hovered or focused, unless the style shows names. */
  const capClass = look.labels ? undefined : 'kc-hover-cap';

  /** Zoom that makes the painting cover the whole board area (cropping its long side). */
  const fillK = Math.max(VW / W, VH / H);
  const maxK = Math.max(4, fillK * 2);
  const clamp = useCallback(
    (z: { k: number; x: number; y: number }) => {
      const k = Math.min(maxK, Math.max(1, z.k));
      // Keep the painting covering the view on an axis where it is larger, and inside it where it is smaller.
      const axis = (v: number, size: number, frame: number) => {
        const lo = (size - frame) / 2;
        const a = lo;
        const b = lo + frame - size * k;
        return Math.min(Math.max(a, b), Math.max(Math.min(a, b), v));
      };
      return { k, x: axis(z.x, W, VW), y: axis(z.y, H, VH) };
    },
    [VW, VH, maxK],
  );
  // A resize (rotating a phone, leaving full screen) can leave the camera off the board.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCam((z) => {
      if (!z) return z;
      const c = clamp(z);
      return c.k === z.k && c.x === z.x && c.y === z.y ? z : c;
    });
  }, [clamp]);
  const zoomAt = (factor: number, cx = W / 2, cy = H / 2) =>
    setZoom((z) => {
      const k = Math.min(maxK, Math.max(1, z.k * factor));
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
        const nk = Math.min(maxK, Math.max(1, (k * d) / (pinch.current?.d || d)));
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
    if (!e.ctrlKey && !e.metaKey && !e.altKey && zoom.k <= 1 && e.deltaY > 0) return;
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
    else if (e.key === '0') setZoom(null);
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
    ...hoverOn(text),
    role: 'button' as const,
    tabIndex: 0,
    style: { cursor: 'help' },
    onClick: () => props.onExplain?.(text),
    onKeyDown: (k: React.KeyboardEvent) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onExplain?.(text)),
  });

  /** Landmark glyph: big enough to read on a phone, with its name underneath. Tapping a path's glyph acts on the path. */
  const glyph = (key: string, at: Pt, icon: string, label: string, text: string, size = 30, opts: { caption?: string; edgeId?: string; tone?: string } = {}) => {
    const big = size * look.glyph;
    const tap = opts.edgeId
      ? {
          role: 'button' as const,
          tabIndex: 0,
          style: { cursor: 'pointer' },
          'data-edge': opts.edgeId,
          ...hoverOn(text),
          onClick: () => props.onEdge(opts.edgeId!, text),
          onKeyDown: (k: React.KeyboardEvent) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onEdge(opts.edgeId!, text)),
        }
      : explainProps(text);
    const gs = Math.max(1, ui * 0.75);
    return (
      <g key={key} transform={`translate(${at[0]} ${at[1]}) scale(${gs})`} aria-label={label} data-glyph={key} {...tap}>
        <circle r={Math.max(big / 2 + 3, 22 / (scale * gs))} fill="transparent" />
        {look.frame ? (
          <circle r={big / 2 + 2} fill="#fffaf0" fillOpacity={0.78} stroke={opts.tone ?? '#6b5232'} strokeWidth={1.8} filter="url(#kc-soft)" />
        ) : (
          <circle r={big / 2 + 1} fill="none" stroke={opts.tone ?? '#6b5232'} strokeWidth={1.6} opacity={0.85} />
        )}
        <image href={icon} x={-big / 2} y={-big / 2} width={big} height={big} filter={look.frame ? undefined : 'url(#kc-soft)'} />
        {opts.caption && (
          <text className={capClass} y={big / 2 + (look.labels ? 11 : 14)} textAnchor="middle" fontSize={look.labels ? 9.5 : 12} fontWeight={800} fill="#2b1d14" stroke="#fffaf0" strokeWidth={3.5} paintOrder="stroke" pointerEvents="none">
            {opts.caption}
          </text>
        )}
      </g>
    );
  };

  // A live highlight follows the selected move. Inspection draws every path, muted.
  const liveSeat = royal.playSeat;
  const shownSeat = liveSeat ?? fadingSeat;
  const fading = liveSeat == null && fadingSeat != null;
  const royalMode = (seat: number | undefined): 'play' | 'fading' | 'inspect' | null => {
    if (seat === undefined) return null;
    if (shownSeat === seat) return fading ? 'fading' : 'play';
    // Every house's Royal Path is always drawn (muted) so players can plan toward it.
    return 'inspect';
  };

  // Overlays: side routes, structures, landslides, road touch targets. Royal Paths (always drawn) follow.
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
    // Segments a map card can build or break: tap the path (or its glyph) to act on it.
    const changeable = e.kind === 'buildable' || e.kind === 'blockable';
    const tapText = blocked
      ? `Landslide: ${e.name ?? 'this pass'} is blocked. Nobody can walk through, and Dragon Fire cannot pass. A Repair card clears it.`
      : e.structure === 'bridge'
        ? open
          ? `${e.name}: open. Collapse Bridge can knock it down if nobody would be stranded.`
          : `${e.name}: broken. Build Bridge or Repair rebuilds it.`
        : e.structure === 'tunnel'
          ? open
            ? `${e.name ?? 'Tunnel'}: open. A two-way shortcut for every house. Collapse it with a map card.`
            : `${e.name ?? 'Tunnel'}: not dug yet. Dig Tunnel opens it, or a lucky dig may uncover it.`
          : e.structure === 'road'
            ? open
              ? `${(e.name ?? 'Road').replace(/ \(unbuilt\)$/, '')}: paved and open for every house.`
              : `${(e.name ?? 'Road').replace(/ \(unbuilt\)$/, '')}: an unbuilt road plot. Build Road paves it, or a lucky dig may uncover it.`
            : `${e.name ?? 'This pass'}: open. A Landslide card can block it; Repair clears it.`;
    if (changeable && !targeted)
      overlays.push(
        <polyline
          key={`${e.id}-hit`}
          points={toPoints(pts)}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(26, 18 / scale)}
          strokeLinecap="round"
          data-edge={e.id}
          data-edge-tap
          role="button"
          tabIndex={-1}
          aria-label={`${e.name ?? 'Path'}: tap to build or break it`}
          style={{ cursor: 'pointer' }}
          onClick={() => props.onEdge(e.id, tapText)}
        />,
      );
    if (blocked)
      glyphs.push(glyph(`${e.id}-rocks`, mid, '/art/icon-mountain.png', `${e.name ?? 'Path'} blocked by a landslide`, tapText, 30, { caption: e.name ?? 'Landslide', edgeId: e.id, tone: '#b45309' }));
    else if (e.structure === 'bridge')
      glyphs.push(
        open
          ? glyph(`${e.id}-bridge`, mid, '/art/icon-bridge.png', `${e.name} (open)`, tapText, 30, { caption: e.name, edgeId: e.id, tone: '#2e9e62' })
          : glyph(`${e.id}-bridge`, mid, '/art/icon-broken-bridge.png', `${e.name} (broken)`, tapText, 30, { caption: `${e.name} (broken)`, edgeId: e.id, tone: '#c8281e' }),
      );
    else if (e.structure === 'tunnel' && e.gate && !marked.has(e.gate)) {
      marked.add(e.gate);
      const name = e.name ?? 'Tunnel';
      glyphs.push(glyph(`${e.id}-tunnel`, mid, '/art/icon-tunnel.png', `${name} (${open ? 'open' : 'not dug'})`, tapText, 30, { caption: open ? name : `${name} (sealed)`, edgeId: e.id, tone: open ? '#2e9e62' : '#c8281e' }));
    } else if (e.structure === 'road' && !open) {
      const name = (e.name ?? 'Road').replace(/ \(unbuilt\)$/, '');
      glyphs.push(glyph(`${e.id}-plot`, mid, '/art/icon-dig.png', `${name}: unbuilt road plot`, tapText, 22, { caption: `${name} (unbuilt)`, edgeId: e.id, tone: '#c8281e' }));
    }
    if (targeted)
      overlays.push(
        <g key={`${e.id}-target`}>
          <polyline points={toPoints(pts)} fill="none" stroke="#2f7bf5" strokeWidth={10} strokeLinecap="round" opacity={0.8} className={pulse} pointerEvents="none" />
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
            onClick={() => props.onEdge(e.id, tapText)}
            onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onEdge(e.id, tapText))}
          />
        </g>,
      );
  }

  const reach = royal.reachNodes;
  /** A house's Royal Path is open once that kingdom has banked one of each gem. Unused seats stay locked. */
  const seatOpen = (seat: number) => {
    const p = view.players.find((x) => x.seat === seat);
    return !!p && royalPathOpen(view, p.id);
  };
  for (const h of board.houses) {
    if (nodes[h.final[0]]?.map !== map) continue;
    const mid = nodes[h.final[Math.floor((h.final.length - 1) / 2)]].xy;
    const th = seatTheme(h.seat);
    const owner = view.players.find((x) => x.seat === h.seat);
    const open = seatOpen(h.seat);
    const text = owner
      ? open
        ? `${h.name} Royal Path: open. ${owner.name} banked all four gems. A piece enters at its fork; the temple gate still needs that piece's four checkpoints and the kingdom's capture.`
        : `${h.name} Royal Path: locked. ${owner.name} must bank one of each gem (${owner.gems.length} of 4 so far) to open it.`
      : `${h.name} Royal Path: no player in this seat.`;
    glyphs.push(
      <g key={`royal-${h.seat}`} transform={`translate(${mid[0]} ${mid[1]}) scale(${Math.max(1, ui * 0.7)})`} data-royal-badge={h.seat} data-royal-open={open ? 'true' : 'false'} aria-label={open ? `${h.name} Royal Path open` : `${h.name} Royal Path locked`} {...explainProps(text)}>
        <circle r={22} fill="transparent" />
        <circle r={11} fill={open ? th.color : '#fffaf0'} stroke={th.color} strokeWidth={2} opacity={open ? 1 : 0.92} filter="url(#kc-soft)" />
        {open ? (
          <path d="M-4.5 0.5 L-1.2 3.8 L4.8 -3" stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <g fill="none" stroke={th.dark} strokeWidth={1.8} strokeLinecap="round">
            <rect x={-4.5} y={-1} width={9} height={7} rx={1.5} fill={th.dark} stroke="none" />
            <path d="M-2.8 -1 V-3.5 a2.8 2.8 0 0 1 5.6 0 V-1" />
          </g>
        )}
      </g>,
    );
  }
  for (const e of mapEdges) {
    if (e.lane !== 'final') continue;
    const seat = nodes[e.a].house ?? nodes[e.b].house;
    let mode = royalMode(seat);
    if (!mode || seat === undefined) continue;
    // Live overlay: only the selected piece's reachable portion of its own path; the rest stays muted.
    if ((mode === 'play' || mode === 'fading') && reach && reach.size > 0 && !(reach.has(e.a) && reach.has(e.b))) mode = 'inspect';
    const th = seatTheme(seat);
    const play = mode === 'play' || mode === 'fading';
    const open = seatOpen(seat);
    overlays.push(
      <g key={e.id} pointerEvents="none" data-royal-path={mode} data-royal-house={seat} data-royal-playable={play && mode !== 'fading' ? 'true' : 'false'} style={{ opacity: mode === 'fading' ? 0 : 1, transition: 'opacity 0.35s ease' }}>
        {play ? (
          <>
            <polyline points={toPoints(e.route)} fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
            <polyline points={toPoints(e.route)} fill="none" stroke={th.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <g data-royal-open={open ? 'true' : 'false'}>
            <polyline points={toPoints(e.route)} fill="none" stroke="#fffaf0" strokeWidth={open ? 7 : 5} strokeLinecap="round" strokeLinejoin="round" opacity={open ? 0.6 : 0.4} />
            <polyline points={toPoints(e.route)} fill="none" stroke={th.color} strokeWidth={open ? 4 : 3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={open ? undefined : '6 7'} opacity={open ? 0.9 : 0.5} />
          </g>
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

  // ---------------------------------------------------------------- monsters
  const lastMonster = view.lastEvents.find((e) => e.type === 'monsterEvent');
  const mReach = monsterReach(view);
  // The danger zone: tapped monster, else the monster whose reach holds the selected piece.
  const selNode = plan ? view.characters[plan.characterId]?.node : null;
  const zoneMonster = zoneFor ?? (selNode ? (monstersOf(view).find((m) => !m.slain && mReach.inside[m.id]?.has(selNode))?.id ?? null) : null);
  const zoneNodes = zoneMonster ? [...mReach.inside[zoneMonster]].filter((n) => nodes[n]?.map === map) : [];
  const zoneOutside = zoneFor ? [...mReach.outside].filter((n) => nodes[n]?.map === map) : [];
  const monsterSprites = monstersOf(view).filter((m) => !m.slain).flatMap((m) => {
    const ev = lastMonster && lastMonster.type === 'monsterEvent' && lastMonster.monster === m.id ? lastMonster : null;
    const resting = monsterResting(view, m);
    // Only a resolved attack with a real target shows the attack pose; an idle event never does.
    const attacking = !!ev && ev.kind === 'attack' && !!ev.characterId;
    const outsideAt = attacking && ev?.outside && ev.at ? ev.at : null;
    const warning = !resting && monsterTargets(view, m.id).length > 0;
    const state = resting ? 'defeated' : attacking ? 'attack' : warning ? 'warning' : 'idle';
    const guide = GUIDE.get(m.home);
    const stateText =
      state === 'defeated'
        ? `beaten and resting until the end of round ${m.restUntilRound}: no fight, no attacks.`
        : state === 'attack'
          ? `it just attacked${ev?.outside ? ' out on the Dragon Gate road' : ''}.`
          : state === 'warning'
            ? `a piece is within ${view.config.monsterRange ?? 3} steps: it may attack after this round.`
            : `idle. Nobody is within ${view.config.monsterRange ?? 3} steps.`;
    const text = `${m.name}: ${stateText} ${guide?.rule ?? ''}`;
    const spots = [m.node];
    if (outsideAt && outsideAt !== m.node) spots.push(outsideAt);
    return spots
      .filter((node) => nodes[node]?.map === map)
      .map((node) => {
        const [x, y] = nodes[node].xy;
        const w = 84;
        return (
          <g
            key={`monster-${m.id}-${node}`}
            transform={`translate(${x + 30 * pieceScale} ${y - 30 * pieceScale}) scale(${pieceScale})`}
            data-monster={m.id}
            data-monster-state={state}
            aria-label={`${m.name}, ${state}. Tap to show its attack range.`}
            {...explainProps(text)}
            onClick={() => {
              setZoneFor((z) => (z === m.id ? null : m.id));
              props.onExplain?.(`${text} Its danger zone (${view.config.monsterRange ?? 3} connected steps${m.id === 'golem' || m.id === 'spider' ? ', plus the Dragon Gate road when it climbs out on a 6' : ''}) is shaded on the board.`);
            }}
          >
            <circle r={36} fill="transparent" />
            {state !== 'idle' && state !== 'defeated' && (
              <circle r={38} fill={state === 'attack' ? 'rgba(200,40,30,0.25)' : 'rgba(242,161,26,0.22)'} stroke={state === 'attack' ? '#c8281e' : '#f2a11a'} strokeWidth={2.5} className={pulse} />
            )}
            {m.id === 'golem' ? (
              <GolemArt state={state === 'warning' ? 'alert' : state} size={w} reduced={reduced} />
            ) : (
              <SpiderArt state={state === 'warning' ? 'alert' : state} size={w} reduced={reduced} />
            )}
            {state === 'warning' && (
              <g transform="translate(30 -30)">
                <circle r={8} fill="#f2a11a" stroke="#fff" strokeWidth={1.5} />
                <text y={4} textAnchor="middle" fontSize={12} fontWeight={900} fill="#3b2100">
                  !
                </text>
              </g>
            )}
            <g transform="translate(0 40)" data-monster-hearts={m.hp ?? view.config.monsterHearts ?? 2} pointerEvents="none">
              {Array.from({ length: view.config.monsterHearts ?? 2 }, (_, i) => (
                <path key={i} transform={`translate(${(i - ((view.config.monsterHearts ?? 2) - 1) / 2) * 13} 0) scale(0.55)`} d="M0 6 C-12 -4 -6 -14 0 -7 C6 -14 12 -4 0 6 Z" fill={i < (m.hp ?? view.config.monsterHearts ?? 2) ? '#d63a4a' : '#5b4a3a'} stroke="#fff" strokeWidth={2} />
              ))}
            </g>
            {state === 'defeated' && (
              <text y={56} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff" stroke="#2b1d14" strokeWidth={3} paintOrder="stroke">
                resting
              </text>
            )}
          </g>
        );
      });
  });

  // ---------------------------------------------------------------- road change preview
  const preview = props.edgePreview ? board.edges.find((x) => x.id === props.edgePreview!.edgeId) : null;
  const previewEdges = preview ? board.edges.filter((x) => x.id === preview.id || (!!preview.gate && x.gate === preview.gate)).filter((x) => nodes[x.a].map === map) : [];
  const previewMid = preview && nodes[preview.a].map === map ? midpoint(preview.route) : null;

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
    const royalMuted = n.lane === 'final' && (royalLook === 'play' || royalLook === 'fading') && reach && reach.size > 0 && !reach.has(n.id) && !ends.has(n.id);
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
          {/* The gate is a safe space like the starred ones: no captures here. */}
          <circle r={r} fill="url(#kc-stone)" stroke="#c58b00" strokeWidth={2.4} />
          <path d="M0 -4.5 L1.3 -1.4 L4.6 -1.4 L1.9 0.6 L2.9 3.9 L0 2 L-2.9 3.9 L-1.9 0.6 L-4.6 -1.4 L-1.3 -1.4 Z" fill="#c58b00" transform={`scale(${r / 7})`} data-safe-star />
          {platesDone?.includes(entryOf.seat) && (
            <g transform={`translate(${r * 1.45} ${-r * 1.45})`}>
              <circle r={r * 0.75} fill="#2e9e62" stroke="#fff" strokeWidth={1.8} />
              <path d="M-3 0 L-1 2.2 L3 -2.4" stroke="#fff" strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" transform={`scale(${r / 8})`} />
            </g>
          )}
        </g>
      );
    } else if (n.lane === 'final' && (royalLook === 'locked' || royalLook === 'inspect' || royalMuted)) {
      // Royal Path dots are always on the board: subdued while locked, in full colour once open.
      const open = n.house !== undefined && seatOpen(n.house);
      body = <circle r={r * 0.85} fill={open ? house?.light : '#f6efe0'} stroke={house?.color ?? '#8a6a3b'} strokeWidth={open ? 2.4 : 1.6} opacity={open ? 1 : 0.7} />;
    }
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
    /** Landmarks (dig sites, the Dragon Gate) read at about 36 CSS px whatever the board size. */
    const landmark = Math.max(look.dig + 4, look.dig / scale);
    const cs = Math.max(1, ui * 0.9);
    const caption = (key: string, text: string, dy: number, tone = '#2b1d14') => (
      <g key={key} className={capClass} transform={`translate(0 ${dy}) scale(${cs * (look.labels ? 0.7 : 0.9)})`} pointerEvents="none" data-caption={text}>
        <rect x={-(text.length * 3.7 + 8)} y={-8.5} width={text.length * 7.4 + 16} height={17} rx={8.5} fill={tone} stroke="#fffaf0" strokeWidth={1.5} opacity={0.94} />
        <text y={4} textAnchor="middle" fontSize={11} fontWeight={800} fill="#fff">
          {text}
        </text>
      </g>
    );
    const ready = props.actionNodes?.has(n.id);
    if (n.station) deco.push(icon(`/art/gem-${n.station}.png`, 0, -iconSize * 0.75, iconSize));
    if (n.dig && n.map === 'island') {
      if (look.frame || ready) deco.push(<circle key="dig-ring" cy={-landmark * 0.6} r={landmark * 0.56} fill={look.frame ? '#fffaf0' : 'none'} fillOpacity={0.8} stroke={ready ? '#2e9e62' : '#8a5a1f'} strokeWidth={ready ? 3.5 : 1.8} className={ready ? pulse : undefined} pointerEvents="none" />);
      deco.push(<image key="dig-icon" href="/art/icon-dig.png" x={-landmark / 2} y={-landmark * 1.1} width={landmark} height={landmark} data-landmark="dig" />);
      deco.push(caption('dig-cap', n.name, r + 9 * cs, '#8a5a1f'));
    }
    const entranceArt = n.dungeonGate || n.type === 'dEntrance';
    if (entranceArt) {
      // The way into (and out of) the dungeon: the gate's dragon head, cut out, perched over the space.
      const w = Math.max(look.gate * (dungeon ? 1.5 : 1), (look.gate * 0.9) / scale);
      const h = w * (194 / 240);
      const cy = -h * 0.55 - r;
      deco.push(
        <g key="entrance" data-entrance={n.dungeonGate ? 'gate' : 'start'}>
          {look.frame && <ellipse cy={cy + h * 0.05} rx={w * 0.52} ry={h * 0.55} fill="#2b1d14" fillOpacity={0.55} stroke={ready ? '#2e9e62' : '#ffcf33'} strokeWidth={2} />}
          <image href="/art/dungeon-dragon-face.png" x={-w / 2} y={cy - h / 2} width={w} height={h} filter="url(#kc-soft)" />
        </g>,
      );
      deco.push(caption('entrance-cap', n.dungeonGate ? 'Enter Dungeon' : 'Start · Exit', r + 10 * cs, '#7a1d0b'));
      deco.push(<circle key="entrance-ring" r={r + 4} fill="none" stroke={ready ? '#2e9e62' : '#ffcf33'} strokeWidth={3} className={ready ? pulse : undefined} pointerEvents="none" />);
    }
    const guide = n.map === 'dungeon' ? GUIDE.get(n.id) : undefined;
    if (guide && n.type !== 'dEntrance') {
      const tone = n.encounter ? DUNGEON_TONE.encounter : (DUNGEON_TONE[n.type] ?? '#5b6676');
      deco.push(<circle key="guide-ring" r={r + 4} fill="none" stroke={ready ? '#2e9e62' : tone} strokeWidth={ready ? 4 : 2.5} className={ready ? pulse : undefined} pointerEvents="none" />);
      deco.push(caption('guide-cap', `${guide.name} · ${guide.tag}`, r + 14 * cs, tone));
    }
    if (n.type === 'vault') deco.push(icon('/art/icon-chest.png', 0, -iconSize, iconSize * 1.3));
    if (n.dock && view.vehicles.boat === n.id) deco.push(icon('/art/icon-boat.png', iconSize * 0.7, -iconSize * 0.4, iconSize * 1.1));
    if (n.airfield && view.vehicles.plane === n.id) deco.push(icon('/art/icon-plane.png', -iconSize * 0.7, -iconSize * 0.4, iconSize * 1.1));
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
        data-royal-path={royalMuted ? 'inspect' : (royalLook ?? undefined)}
        data-royal-house={n.lane === 'final' ? n.house : undefined}
        data-royal-playable={n.lane === 'final' ? (royalLook === 'play' && !royalMuted ? 'true' : 'false') : undefined}
        data-end={isEnd ? 'true' : undefined}
        data-chosen={chosen ? 'true' : undefined}
        data-target={target ? 'true' : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : undefined}
        style={{ cursor: interactive ? 'pointer' : 'help' }}
        {...hoverOn(() => props.describeNode?.(n.id) ?? '')}
        onClick={() => props.onNode(n.id)}
        onKeyDown={(k) => {
          if (interactive && (k.key === 'Enter' || k.key === ' ')) {
            k.preventDefault();
            props.onNode(n.id);
          }
        }}
      >
        {!props.describeNode && <title>{entryOf ? `${n.name} — the ${entryOf.name} plate` : n.hazard ? `${n.name} — trap risk` : guide ? `${guide.name}: ${guide.rule}` : n.dungeonGate ? `${n.name}: Enter Dungeon here (Adventure action).` : n.name}</title>}
        <circle r={top ? r + 8 : Math.max(hitR, r + 4)} fill="transparent" />
        {body}
        {deco}
        {isEnd && <circle r={r + 7} fill={chosen ? 'rgba(255,255,255,0.35)' : 'rgba(255,224,102,0.35)'} stroke={chosen ? '#fff' : '#ffcf33'} strokeWidth={chosen ? 4.5 : 3.5} className={chosen ? undefined : pulse} />}
        {(target || coached) && <circle r={r + 9} fill="rgba(47,123,245,0.18)" stroke="#2f7bf5" strokeWidth={3.5} className={pulse} />}
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
    <div ref={wrapRef} className="relative h-full w-full" onKeyDown={onKeyDown} onPointerLeave={() => setHover(null)}>
      {hover && (
        <div
          className="pointer-events-none absolute z-30 max-w-[19rem] rounded-xl border border-white/70 bg-[#fffaf0]/75 px-3 py-2 text-xs leading-snug text-[#2b1d14] shadow-lg backdrop-blur-sm"
          style={{
            left: hover.x + 16 + 304 > hover.w ? undefined : hover.x + 16,
            right: hover.x + 16 + 304 > hover.w ? Math.max(8, hover.w - hover.x + 16) : undefined,
            top: hover.y + 16 + 140 > hover.h ? undefined : hover.y + 16,
            bottom: hover.y + 16 + 140 > hover.h ? Math.max(8, hover.h - hover.y + 16) : undefined,
          }}
          role="tooltip"
          data-hover-tip
        >
          {hover.text}
        </div>
      )}
      <svg
        ref={svgRef}
        className="board-svg h-full w-full select-none"
        viewBox={`${(W - VW) / 2} ${(H - VH) / 2} ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={dungeon ? 'Dungeon board' : 'Island board'}
        data-board={map}
        data-zoom={zoom.k.toFixed(2)}
        data-marker-style={props.markerStyle ?? 'minimal'}
        data-show-captions={zoom.k >= 2.2 ? 'true' : undefined}
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
          {/* The painting mirrored and softened past its edges, so any screen shape is filled without empty margins. */}
          <image href={dungeon ? '/board/dungeon-bleed.jpg' : '/board/island-bleed.jpg'} x={-W} y={-H} width={W * 3} height={H * 3} preserveAspectRatio="none" pointerEvents="none" aria-hidden="true" data-bleed={map} />
          <image href={dungeon ? '/board/dungeon.jpg' : '/board/island.jpg'} x={0} y={0} width={W} height={H} preserveAspectRatio="none" data-art={map} />

          {/* Dungeon landmarks: drawn under the spaces and paths so every dot stays visible. Tap one to learn what it is for. */}
          {dungeon && (
            <g data-dungeon-landmarks>
              {DUNGEON_LANDMARKS.map((l) => {
                const at = nodes[l.node]?.xy;
                if (!at) return null;
                const [x, y] = at;
                const text = landmarkText(l);
                const lit = !reduced;
                return (
                  <g key={l.id} data-landmark={l.id} {...explainProps(text)} aria-label={`${l.name}: tap for details`}>
                    {l.id === 'entrance' && (
                      <g>
                        {[-62, 62].map((dx) => (
                          <g key={dx} transform={`translate(${x + dx} ${y + 18})`}>
                            <rect x={-6} y={0} width={12} height={22} fill="#4a3a2c" stroke="#1d150e" strokeWidth={2} />
                            <path d="M-11 0 h22 l-4 -6 h-14 Z" fill="#6a5440" stroke="#1d150e" strokeWidth={2} />
                            <path d="M0 -26 C-9 -16 -8 -8 0 -6 C8 -8 9 -16 0 -26 Z" fill="#ff9a1f" className={lit ? 'kc-glow' : undefined} />
                            <path d="M0 -18 C-4 -12 -4 -8 0 -7 C4 -8 4 -12 0 -18 Z" fill="#ffe066" />
                          </g>
                        ))}
                        <g transform={`translate(${x} ${y - 70})`}>
                          <circle cx={-14} cy={0} r={4} fill="#ff4d2e" className={lit ? 'kc-glow' : undefined} />
                          <circle cx={14} cy={0} r={4} fill="#ff4d2e" className={lit ? 'kc-glow' : undefined} />
                        </g>
                        <g transform={`translate(${x} ${y + 58})`}>
                          <rect x={-46} y={-11} width={92} height={22} rx={11} fill="#2e9e62" stroke="#fff" strokeWidth={2} />
                          <text y={4.5} textAnchor="middle" fontSize={12} fontWeight={900} fill="#fff">
                            ★ SAFE · EXIT
                          </text>
                        </g>
                      </g>
                    )}
                    {l.id === 'lair' && (
                      <g transform={`translate(${x} ${y + 46})`}>
                        {[-58, -44, 48].map((dx, i) => (
                          <ellipse key={dx} cx={dx} cy={i === 2 ? 4 : 8} rx={7} ry={9} fill={['#f4e3c1', '#d8e9c9', '#e6d0f0'][i]} stroke="#5b3d20" strokeWidth={1.6} />
                        ))}
                        {[62, 70, 78, 66, -70].map((dx, i) => (
                          <circle key={i} cx={dx} cy={14 - (i % 2) * 5} r={4} fill="#ffcf33" stroke="#8a5a00" strokeWidth={1.2} />
                        ))}

                      </g>
                    )}
                    {l.id === 'golem' && (
                      <g>
                        {[
                          [-58, -34, 0],
                          [54, 44, 12],
                        ].map(([dx, dy, tilt], i) => (
                          <g key={i} transform={`translate(${x + dx} ${y + dy}) rotate(${tilt})`}>
                            <rect x={-8} y={-30} width={16} height={34} fill="#8f8577" stroke="#3a332b" strokeWidth={2} />
                            <path d="M-8 -30 l5 -6 l4 4 l7 -5 v7 Z" fill="#8f8577" stroke="#3a332b" strokeWidth={2} />
                          </g>
                        ))}
                        {(() => {
                          const open = !!me && !!view.shortcutsOpen?.[l.node]?.includes(me);
                          const slain = monstersOf(view).find((mm) => mm.id === 'golem')?.slain;
                          return (
                            <g transform={`translate(${x + 78} ${y + 34})`} data-shortcut-gate={open || slain ? 'open' : 'sealed'}>
                              <path d="M-16 14 V-8 Q0 -22 16 -8 V14 Z" fill={open || slain ? '#2b1d14' : '#7a6d5e'} stroke="#2b241d" strokeWidth={2.5} />
                              {!(open || slain) && <path d="M-10 -2 h20 M-10 6 h20 M0 -12 v24" stroke="#5d5348" strokeWidth={2} />}
                              <text y={28} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff" stroke="#2b1d14" strokeWidth={3} paintOrder="stroke">
                                {open || slain ? 'Shortcut open' : 'Sealed shortcut'}
                              </text>
                            </g>
                          );
                        })()}
                      </g>
                    )}
                    {l.id === 'spider' && (
                      <g stroke="#eef3ff" strokeWidth={1.3} fill="none" opacity={0.85}>
                        {[
                          [-46, -40],
                          [50, -34],
                        ].map(([dx, dy], i) => (
                          <g key={i} transform={`translate(${x + dx} ${y + dy})`}>
                            {[0, 45, 90, 135].map((a) => (
                              <line key={a} x1={-18} x2={18} transform={`rotate(${a})`} />
                            ))}
                            <circle r={7} />
                            <circle r={13} />
                          </g>
                        ))}
                        <g transform={`translate(${x + 34} ${y + 40})`} stroke="#5b3d20" strokeWidth={2}>
                          <rect x={-14} y={-10} width={28} height={20} rx={3} fill="#a86b32" />
                          <path d="M-14 -2 h28" />
                          <rect x={-3} y={-4} width={6} height={7} fill="#ffcf33" />
                        </g>
                      </g>
                    )}
                    {(l.id === 'ruins' || l.id === 'niche') && (
                      <g transform={`translate(${x} ${y + 40})`}>
                        <rect x={-38} y={-10} width={76} height={20} rx={10} fill="#2e9e62" stroke="#fff" strokeWidth={2} />
                        <text y={4} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff">
                          ★ SAFE ROOM
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          )}

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

          {previewEdges.map((x) => (
            <g key={`preview-${x.id}`} pointerEvents="none" data-edge-preview={props.edgePreview!.change}>
              <polyline points={toPoints(x.route)} fill="none" stroke="#fff" strokeWidth={14} strokeLinecap="round" opacity={0.9} />
              <polyline
                points={toPoints(x.route)}
                fill="none"
                stroke={props.edgePreview!.change === 'open' ? '#2e9e62' : '#c8281e'}
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={props.edgePreview!.change === 'open' ? undefined : '6 8'}
              />
            </g>
          ))}

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

          {/* Roaming monsters: idle, warning (someone in reach), attack (this round's event), defeated (resting). */}
          {monsterSprites}

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
            const label = `${pieceLabel(c)} at ${nodeName(view.boardId, c.node)}${carried.length ? `, carrying ${gemList(carried.map((g) => g.kind))}` : ''}, ${c.lap} of 4 plates${protectionLabel(view, c) ? `, ${protectionLabel(view, c)}` : ''}${companion ? ', with the dragon' : ''}${canMove ? ', can move' : ''}${selected ? ', selected' : ''}${capture ? ', capture target' : ''}${attackPick ? ', route attack choice' : ''}`;
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
                  {(canMove || selected) && <ellipse cx={0} cy={-24} rx={18} ry={28} fill="none" stroke={selected ? '#fff' : '#ffe066'} strokeWidth={selected ? 3.5 : 2.6} strokeDasharray={selected ? undefined : '5 4'} className={selected || reduced ? undefined : 'kc-spin'} />}
                  {props.fireTarget === c.id && <ellipse cx={0} cy={-24} rx={23} ry={33} fill="rgba(242,110,26,0.22)" stroke="#f26e1a" strokeWidth={4} data-fire-target />}
                  {targeted && !capture && <ellipse cx={0} cy={-24} rx={20} ry={30} fill="rgba(47,123,245,0.16)" stroke="#2f7bf5" strokeWidth={3} className={pulse} />}
                  {(capture || attackPick) && (
                    <ellipse cx={0} cy={-24} rx={21} ry={31} fill="rgba(200,40,30,0.18)" stroke={attackOn ? '#fff' : '#c8281e'} strokeWidth={attackOn ? 4 : 3.2} className={pulse} />
                  )}
                  <PieceToken kind={c.kind} theme={theme} />
                  {carried.map((g, i) => (
                    <g key={g.id} transform={`translate(11 ${9 - i * 12})`} data-carrying={g.kind}>
                      <circle r={6.5} fill="#fffaf0" stroke={GEM_STYLE[g.kind].dark} strokeWidth={1.4} />
                      <GemShape kind={g.kind} size={9.5} />
                    </g>
                  ))}
                  {(() => {
                    const w = activeWard(view, c);
                    if (!w) return null;
                    const fill = w.kind === 'immune' ? '#ffd166' : w.kind === 'guarded' ? '#6a3fd0' : '#2f7bf5';
                    const ink = w.kind === 'immune' ? '#5a3d00' : '#fff';
                    return (
                      <g transform="translate(-13 9)" data-protection={w.kind} data-protection-left={w.left}>
                        <title>{protectionLabel(view, c)}</title>
                        <rect x={-8} y={-6.5} width={16} height={13} rx={6.5} fill={fill} stroke="#fff" strokeWidth={1.4} />
                        <text x={-3} y={2.6} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={ink}>
                          {w.kind === 'immune' ? 'I' : w.kind === 'guarded' ? 'G' : 'S'}
                        </text>
                        <text x={3.6} y={2.6} textAnchor="middle" fontSize={7} fontWeight={900} fill={ink}>
                          {w.left}
                        </text>
                      </g>
                    );
                  })()}
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

          {/* Confirm or cancel a road change beside the road itself. */}
          {previewMid && props.edgePreview && (
            <g transform={`translate(${Math.min(W - 100 * ui, Math.max(100 * ui, previewMid[0]))} ${Math.max(60 * ui, previewMid[1] - 54 * ui)}) scale(${ui})`} data-edge-confirm>
              <g
                role="button"
                tabIndex={0}
                aria-label={`Confirm: ${props.edgePreview.label}`}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onConfirmEdge?.();
                }}
                onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onConfirmEdge?.())}
              >
                <rect x={-96} y={-22} width={150} height={44} rx={22} fill={props.edgePreview.change === 'open' ? '#2e9e62' : '#c8281e'} stroke="#fff" strokeWidth={2.5} filter="url(#kc-soft)" />
                <text x={-21} y={5} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff">
                  {props.edgePreview.label} ✓
                </text>
              </g>
              <g
                role="button"
                tabIndex={0}
                aria-label="Cancel the road change"
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation();
                  props.onCancelEdge?.();
                }}
                onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), props.onCancelEdge?.())}
              >
                <circle cx={78} r={22} fill="#fffaf0" stroke="#1d2440" strokeWidth={2} filter="url(#kc-soft)" />
                <text x={78} y={6} textAnchor="middle" fontSize={17} fontWeight={800} fill="#1d2440">
                  ✕
                </text>
              </g>
            </g>
          )}

          {/* Monster danger zone: where it can attack (shown on tap, or when a nearby piece is selected). */}
          {(zoneNodes.length > 0 || zoneOutside.length > 0) && (
            <g pointerEvents="none" data-danger-zone={zoneMonster ?? ''}>
              {zoneNodes.map((n) => (
                <circle key={`zone-${n}`} cx={nodes[n].xy[0]} cy={nodes[n].xy[1]} r={22} fill="rgba(200,40,30,0.16)" stroke="#c8281e" strokeWidth={2} strokeDasharray="5 4" />
              ))}
              {zoneOutside.map((n) => (
                <circle key={`zone-out-${n}`} cx={nodes[n].xy[0]} cy={nodes[n].xy[1]} r={20} fill="rgba(242,161,26,0.14)" stroke="#f2a11a" strokeWidth={2} strokeDasharray="3 4" />
              ))}
            </g>
          )}

          {/* Attack animations from resolved events: telegraph (source and target), then the hit. */}
          {strikes
            .filter((st) => nodes[st.to]?.map === map)
            .map((st) => {
              const [tx, ty] = nodes[st.to].xy;
              const src = nodes[st.from]?.map === map ? nodes[st.from].xy : nodes[st.to].xy;
              const [fx, fy] = src;
              const color = st.kind === 'fire' ? '#f26e1a' : st.kind === 'fireMiss' ? '#8a8f9e' : st.kind === 'web' ? '#d9e6ff' : st.kind === 'blocked' ? '#2f7bf5' : '#8a5a2b';
              const line = `M${fx} ${fy} L${tx} ${ty}`;
              return (
                <g key={st.id} pointerEvents="none" data-strike={st.kind} data-strike-from={st.from} data-strike-to={st.to}>
                  {/* Telegraph: who acts and who is targeted. */}
                  <circle cx={fx} cy={fy} r={30} fill="none" stroke={color} strokeWidth={4} className={reduced ? undefined : 'kc-telegraph'} />
                  <circle cx={tx} cy={ty} r={26} fill="none" stroke="#c8281e" strokeWidth={3} strokeDasharray="6 4" className={reduced ? undefined : 'kc-telegraph'} />
                  {(st.kind === 'fire' || st.kind === 'fireMiss') && (
                    <path d={line} stroke={color} strokeWidth={st.kind === 'fire' ? 12 : 6} strokeLinecap="round" fill="none" opacity={0.85} className={reduced ? undefined : 'kc-beam'} pathLength={1} />
                  )}
                  {st.kind === 'web' && !reduced && (
                    <circle r={7} fill="#f4f7ff" stroke="#9fb3d9" strokeWidth={2}>
                      <animateMotion dur="0.45s" begin="0.5s" path={line} fill="freeze" />
                    </circle>
                  )}
                  {st.kind === 'web' && (
                    <g transform={`translate(${tx} ${ty})`} className={reduced ? undefined : 'kc-land'} stroke="#e8eefc" strokeWidth={1.6} fill="none">
                      {[0, 45, 90, 135].map((a) => (
                        <line key={a} x1={-20} x2={20} transform={`rotate(${a})`} />
                      ))}
                      <circle r={9} />
                      <circle r={16} />
                    </g>
                  )}
                  {st.kind === 'slam' && <circle cx={tx} cy={ty} r={30} fill="none" stroke="#8a5a2b" strokeWidth={6} className={reduced ? undefined : 'kc-shock'} />}
                  {st.kind === 'blocked' && <path d={`M${tx - 22} ${ty - 30} Q${tx} ${ty - 50} ${tx + 22} ${ty - 30}`} stroke="#2f7bf5" strokeWidth={6} fill="none" strokeLinecap="round" className={reduced ? undefined : 'kc-land'} />}
                  {st.caption && (
                    <g transform={`translate(${tx} ${ty + 34}) scale(${ui})`} className={reduced ? undefined : 'kc-land'}>
                      <rect x={-st.caption.length * 3.6 - 10} y={-11} width={st.caption.length * 7.2 + 20} height={22} rx={11} fill="#1d2440" stroke="#fff" strokeWidth={1.5} />
                      <text y={4} textAnchor="middle" fontSize={11.5} fontWeight={800} fill="#fff">
                        {st.caption}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

          {/* Short-lived outcome labels. */}
          {effects
            .filter((fx) => nodes[fx.node]?.map === map)
            .map((fx) => {
              const [x, y] = fx.at ?? nodes[fx.node].xy;
              const fill = fx.tone === 'cut' ? '#c8281e' : fx.tone === 'blocked' ? '#2f7bf5' : fx.tone === 'good' ? '#2e9e62' : '#5b6676';
              const fw = Math.max(132, fx.text.length * 7 + 20);
              return (
                <g key={fx.id} transform={`translate(${Math.min(W - (fw / 2) * ui, Math.max((fw / 2) * ui, x))} ${y - 30 * pieceScale}) scale(${ui})`}
                  pointerEvents={props.onEffectDismiss ? undefined : 'none'}
                  style={props.onEffectDismiss ? { cursor: 'pointer' } : undefined}
                  role={props.onEffectDismiss ? 'button' : undefined}
                  aria-label={props.onEffectDismiss ? `${fx.text} (tap to close)` : undefined}
                  onClick={props.onEffectDismiss ? (ev) => (ev.stopPropagation(), props.onEffectDismiss!(fx.id)) : undefined}
                  data-effect={fx.tone}
                >
                  <g className={reduced ? undefined : 'kc-rise'}>
                    <rect x={-fw / 2} y={-14} width={fw} height={26} rx={13} fill={fill} stroke="#fff" strokeWidth={2} />
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
        {fillK > 1.02 && (
          <button
            type="button"
            className="btn btn-ghost icon-btn bg-white/90!"
            aria-label={zoom.k >= fillK - 0.01 ? 'Show the whole map' : 'Fill the screen with the map'}
            title={zoom.k >= fillK - 0.01 ? 'Show the whole map' : 'Fill the screen with the map'}
            data-fill-board={zoom.k >= fillK - 0.01 ? 'on' : 'off'}
            onClick={() => (zoom.k >= fillK - 0.01 ? setZoom(null) : setZoom(clamp({ k: fillK, x: (W / 2) * (1 - fillK), y: (H / 2) * (1 - fillK) })))}
          >
            {zoom.k >= fillK - 0.01 ? <Shrink size={16} /> : <Expand size={16} />}
          </button>
        )}
        <button type="button" className="btn btn-ghost icon-btn bg-white/90!" aria-label="Zoom in" onClick={() => zoomAt(1.3)}>
          <Plus size={18} />
        </button>
        <button type="button" className="btn btn-ghost icon-btn bg-white/90!" aria-label="Zoom out" disabled={zoom.k <= 1} onClick={() => zoomAt(1 / 1.3)}>
          <Minus size={18} />
        </button>
        <button type="button" className="btn btn-ghost icon-btn bg-white/90!" aria-label="Reset zoom" disabled={cam === null} onClick={() => setZoom(null)}>
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
