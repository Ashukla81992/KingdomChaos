'use client';

import { motion } from 'framer-motion';
import { memo, useMemo } from 'react';
import { CHARACTER_INFO, getGraph, SPACE_LABELS, type BoardConnection, type Character, type PublicState } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { BoardDefs, CastleArt, CharacterFigure, GemArt, PortalArt, ScrollIcon, TrapArt } from '../art/art';

export type SpaceHighlight = 'move' | 'capture' | 'bank' | 'pickup' | 'target' | 'blocked';

export interface BoardHighlights {
  spaces?: Record<string, SpaceHighlight>;
  connections?: Record<string, true>;
  characters?: Record<string, 'select' | 'target'>;
  route?: string[] | null;
  /** Tutorial coach marks: space ids or `char:<id>` / `conn:<id>`. */
  coach?: string[];
}

interface BoardProps {
  state: PublicState;
  highlights: BoardHighlights;
  selectedCharacter: string | null;
  viewerId: string | null;
  reducedMotion: boolean;
  onSpace?: (id: string) => void;
  onConnection?: (id: string) => void;
  onCharacter?: (id: string) => void;
}

const SPACE_R = 15;
const STEP_SECONDS = 0.17;
const KIND_ORDER = ['king', 'queen', 'witch', 'knight'] as const;

const HL_COLOR: Record<SpaceHighlight, string> = {
  move: '#ffcf3f',
  capture: '#ff4d4d',
  bank: '#2fd17a',
  pickup: '#38d6ff',
  target: '#22d3ee',
  blocked: '#9aa3b5',
};

/** Rounded island that fills the board, with a slightly uneven shore. */
function islandPath(w: number, h: number): string {
  const m = 34;
  const left = m;
  const top = m;
  const right = w - m;
  const bottom = h - m;
  const rad = 78;
  const bump = (t: number) => 8 * Math.sin(t * 3.1) + 4 * Math.cos(t * 5.3);
  const pts: [number, number][] = [];
  const steps = 10;
  const edge = (x1: number, y1: number, x2: number, y2: number, nx: number, ny: number) => {
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      pts.push([x1 + (x2 - x1) * t + nx * bump(t * 6), y1 + (y2 - y1) * t + ny * bump(t * 6 + 1)]);
    }
  };
  edge(left + rad, top, right - rad, top, 0, -1);
  edge(right, top + rad, right, bottom - rad, 1, 0);
  edge(right - rad, bottom, left + rad, bottom, 0, 1);
  edge(left, bottom - rad, left, top + rad, -1, 0);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const p3 = pts[(i + 2) % pts.length];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function Decoration({ kind }: { kind: 'tree' | 'rock' | 'mountain' }) {
  if (kind === 'tree')
    return (
      <g>
        <ellipse cy={14} rx={14} ry={5} fill="rgba(20,40,20,0.25)" />
        <rect x={-2.5} y={2} width={5} height={12} rx={2} fill="#7a4f28" />
        <circle cy={-4} r={12} fill="#3f9c4c" />
        <circle cx={-7} cy={2} r={8} fill="#4bb058" />
        <circle cx={7} cy={1} r={8} fill="#3a8f46" />
        <circle cx={-3} cy={-9} r={5} fill="#7fd36f" opacity={0.7} />
      </g>
    );
  if (kind === 'rock')
    return (
      <g>
        <ellipse cy={8} rx={14} ry={4} fill="rgba(20,40,20,0.22)" />
        <path d="M-12 8 L-8 -4 L0 -9 L9 -3 L12 8 Z" fill="#b9b2a5" stroke="#7d766a" strokeWidth={1.4} />
        <path d="M-8 -4 L0 -9 L-1 2 Z" fill="#d8d2c6" />
      </g>
    );
  return (
    <g>
      <ellipse cy={16} rx={34} ry={8} fill="rgba(20,40,20,0.22)" />
      <path d="M-32 16 L-8 -26 L4 -10 L12 -20 L32 16 Z" fill="#9c8f7b" stroke="#6e6352" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M-8 -26 L-14 -15 L-8 -17 L-3 -12 L4 -10 Z" fill="white" />
      <path d="M12 -20 L8 -13 L12 -14 L16 -11 Z" fill="white" />
    </g>
  );
}

interface Anim {
  xs: number[];
  ys: number[];
  duration: number;
  delay: number;
}

function BoardImpl({ state, highlights, selectedCharacter, viewerId, reducedMotion, onSpace, onConnection, onCharacter }: BoardProps) {
  const graph = getGraph(state.boardId);
  const board = graph.board;
  const island = islandPath(board.width, board.height);
  const seatOf = Object.fromEntries(state.players.map((p) => [p.id, p.seat]));
  const castleSeat = Object.fromEntries(board.castles.map((c, i) => [c, i]));

  const pieceAt = (c: Character, space = c.space): { x: number; y: number; scale: number } => {
    const sp = graph.space[space];
    if (sp.type === 'castle') {
      const i = KIND_ORDER.indexOf(c.kind);
      return { x: sp.x - 18 + i * 12, y: sp.y + 8, scale: 0.4 };
    }
    return { x: sp.x, y: sp.y + 4, scale: 0.52 };
  };

  // Path keyframes for the latest events, so pieces walk their route instead of teleporting.
  const anims = useMemo(() => {
    const out: Record<string, Anim> = {};
    let t = 0;
    for (const e of state.lastEvents) {
      if (e.type === 'moved') {
        const c = state.characters[e.characterId];
        if (!c || e.path.length < 2) continue;
        const pts = e.path.map((s, i) => (i === e.path.length - 1 ? pieceAt(c) : pieceAt(c, s)));
        const duration = reducedMotion ? 0 : STEP_SECONDS * (e.path.length - 1);
        out[c.id] = { xs: pts.map((p) => p.x), ys: pts.map((p) => p.y), duration, delay: t };
        t += duration;
      } else if (e.type === 'captured' || e.type === 'trapped') {
        const c = state.characters[e.characterId];
        if (!c) continue;
        const from = pieceAt(c, e.at);
        const to = pieceAt(c);
        out[c.id] = { xs: [from.x, from.x, to.x], ys: [from.y, from.y - 40, to.y], duration: reducedMotion ? 0 : 0.6, delay: t };
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.version, reducedMotion]);

  const spaceHl = highlights.spaces ?? {};
  const connHl = highlights.connections ?? {};
  const charHl = highlights.characters ?? {};
  const coach = new Set(highlights.coach ?? []);

  const connectionStyle = (c: BoardConnection) => {
    const blocked = state.blocks.some((b) => b.connectionId === c.id);
    if (c.kind === 'bridge') return state.bridges[c.id] ? 'bridge-open' : 'bridge-closed';
    if (c.kind === 'blockable') return blocked ? 'blocked' : 'blockable';
    return 'road';
  };

  const characters = Object.values(state.characters)
    .map((c) => ({ c, p: pieceAt(c) }))
    .sort((a, b) => a.p.y - b.p.y);

  const keyActivate = (fn?: () => void) => (e: React.KeyboardEvent) => {
    if (fn && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      fn();
    }
  };

  const route = highlights.route;

  return (
    <svg
      viewBox={`0 0 ${board.width} ${board.height}`}
      className="h-full w-full select-none"
      role="group"
      aria-label={`${board.name} game board`}
      style={{ touchAction: 'manipulation' }}
    >
      <BoardDefs />
      {/* Sea + island. The grid fills the island so the map reads large. */}
      <rect width={board.width} height={board.height} fill="url(#kc-sea)" />
      <path d={island} transform="translate(0,18)" fill="#6d5236" />
      <path d={island} transform="translate(0,9)" fill="#93704a" />
      <path d={island} fill="#f3dfa6" />
      <path d={island} fill="url(#kc-grass)" />
      {board.connections
        .filter((c) => c.kind === 'bridge')
        .map((c) => {
          const a = graph.space[c.a];
          const b = graph.space[c.b];
          return <line key={`river-${c.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#5cc3f2" strokeWidth={26} strokeLinecap="round" opacity={0.85} />;
        })}
      {board.connections
        .filter((c) => c.kind === 'permanent')
        .map((c) => {
          const a = graph.space[c.a];
          const b = graph.space[c.b];
          return <line key={`roadbed-${c.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e7c56a" strokeWidth={18} strokeLinecap="round" opacity={0.55} />;
        })}
      {[
        [52, 58, 'mountain'],
        [board.width - 52, 70, 'tree'],
        [48, board.height - 48, 'tree'],
        [board.width - 60, board.height - 52, 'mountain'],
      ].map(([x, y, kind], i) => (
        <g key={i} transform={`translate(${x},${y}) scale(0.7)`}>
          <Decoration kind={kind as 'tree' | 'rock' | 'mountain'} />
        </g>
      ))}

      {/* Connections: outline pass, then surface pass */}
      <g>
        {board.connections.map((c) => {
          const a = graph.space[c.a];
          const b = graph.space[c.b];
          const style = connectionStyle(c);
          if (style === 'bridge-closed') return null;
          return (
            <line key={`o-${c.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={style === 'bridge-open' ? '#5a3a1c' : '#b39a6c'} strokeWidth={style === 'bridge-open' ? 10 : 8} strokeLinecap="round" />
          );
        })}
        {board.connections.map((c) => {
          const a = graph.space[c.a];
          const b = graph.space[c.b];
          const style = connectionStyle(c);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          return (
            <g key={c.id}>
              {style === 'road' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f6e7b4" strokeWidth={6} strokeLinecap="round" />}
              {style === 'blockable' && (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f2e3bd" strokeWidth={5} strokeLinecap="round" />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e7a04d" strokeWidth={2.5} strokeDasharray="3 5" />
                </>
              )}
              {style === 'blocked' && (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e9d2c8" strokeWidth={6} strokeLinecap="round" />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e5484d" strokeWidth={2.5} strokeDasharray="6 4" />
                  <g transform={`translate(${mx},${my}) rotate(${angle}) scale(0.65)`}>
                    <rect x={-6} y={-17} width={12} height={34} rx={3} fill="white" stroke="#8e1f24" strokeWidth={2} />
                    <path d="M-6 -11 L6 -17 M-6 -1 L6 -7 M-6 9 L6 3 M-6 17 L6 13" stroke="#e5484d" strokeWidth={4} />
                  </g>
                  <title>Blocked path</title>
                </>
              )}
              {style === 'bridge-open' && (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c58d55" strokeWidth={8} />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#7a4f28" strokeWidth={8} strokeDasharray="2 4" />
                  <title>Bridge (open)</title>
                </>
              )}
              {style === 'bridge-closed' && (
                <>
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#c58d55" strokeWidth={6} opacity={0.25} />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#8a5a2b" strokeWidth={2} strokeDasharray="6 5" opacity={0.85} />
                  <g transform={`translate(${mx},${my})`} opacity={0.9}>
                    <circle r={9} fill="#fff4d6" stroke="#8a5a2b" strokeWidth={1.5} />
                    <path d="M-4 3 L3 -4 M1 -6 L5 -2" stroke="#8a5a2b" strokeWidth={2} strokeLinecap="round" />
                  </g>
                  <title>Unbuilt bridge — use Build Bridge</title>
                </>
              )}
            </g>
          );
        })}
      </g>

      {/* Temporary portal links */}
      {state.tempPortals.map((tp) => {
        const a = graph.space[tp.space];
        const b = graph.space[tp.linkedTo];
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.15;
        const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.15;
        return (
          <path key={tp.space} d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`} stroke="#d63fb0" strokeWidth={5} fill="none" strokeDasharray="10 10" className="kc-dash" opacity={0.85}>
            <title>Temporary portal link (1 step)</title>
          </path>
        );
      })}

      {/* Targetable connections */}
      {board.connections.map((c) => {
        if (!connHl[c.id]) return null;
        const a = graph.space[c.a];
        const b = graph.space[c.b];
        const label = `Path between ${c.a} and ${c.b}`;
        return (
          <g
            key={`t-${c.id}`}
            role="button"
            tabIndex={0}
            aria-label={label}
            className="cursor-pointer"
            onClick={() => onConnection?.(c.id)}
            onKeyDown={keyActivate(() => onConnection?.(c.id))}
          >
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#22d3ee" strokeWidth={14} strokeLinecap="round" opacity={0.55} className="kc-pulse" />
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={34} strokeLinecap="round" />
          </g>
        );
      })}

      {board.connections.map((c) => {
        if (!coach.has(`conn:${c.id}`)) return null;
        const a = graph.space[c.a];
        const b = graph.space[c.b];
        return <line key={`coach-${c.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ff4fa3" strokeWidth={7} strokeDasharray="10 8" className="kc-dash" pointerEvents="none" />;
      })}

      {/* Route preview */}
      {route && route.length > 1 && (
        <g pointerEvents="none">
          <polyline
            points={route.map((s) => `${graph.space[s].x},${graph.space[s].y}`).join(' ')}
            fill="none"
            stroke="white"
            strokeWidth={14}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.9}
          />
          <polyline
            points={route.map((s) => `${graph.space[s].x},${graph.space[s].y}`).join(' ')}
            fill="none"
            stroke="#f4a81d"
            strokeWidth={6}
            strokeDasharray="12 8"
            strokeLinejoin="round"
            className="kc-dash"
          />
        </g>
      )}

      {/* Spaces */}
      {board.spaces.map((sp) => {
        const hl = spaceHl[sp.id];
        const isCastle = sp.type === 'castle';
        const seat = castleSeat[sp.id];
        const castle = state.castles[sp.id];
        const trap = state.traps.find((t) => t.space === sp.id);
        const tempPortal = state.tempPortals.find((t) => t.space === sp.id);
        const name =
          SPACE_LABELS[sp.id] ??
          (isCastle ? `${seatTheme(seat).kingdom} castle` : { normal: 'Path space', card: 'Card space', treasure: 'Treasure space', portal: 'Fixed portal', portalSite: 'Portal site', castle: 'Castle' }[sp.type]);
        const interactive = !!hl;
        const handler = () => onSpace?.(sp.id);
        return (
          <g
            key={sp.id}
            transform={`translate(${sp.x},${sp.y})`}
            data-space={sp.id}
            data-highlight={hl || undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${name}${hl ? ` — ${hl === 'capture' ? 'capture here' : hl === 'bank' ? 'bank treasure here' : hl === 'pickup' ? 'pick up treasure here' : 'choose'}` : ''}` : undefined}
            onClick={handler}
            onKeyDown={keyActivate(handler)}
            className={onSpace ? 'cursor-pointer' : undefined}
          >
            <title>{name}</title>
            {isCastle ? (
              <>
                <g transform="scale(0.48)">
                  {castle ? (
                    <CastleArt theme={seatTheme(seat)} damaged={!!castle.damagedBy} guarded={castle.royalGuard} />
                  ) : (
                    <g opacity={0.55}>
                      <CastleArt theme={{ ...seatTheme(seat), color: '#b8b0a0', dark: '#6e6352' }} damaged={false} guarded={false} />
                    </g>
                  )}
                </g>
                {hl && <ellipse cy={10} rx={34} ry={14} fill="none" stroke={HL_COLOR[hl]} strokeWidth={4} className="kc-pulse" />}
              </>
            ) : (
              <>
                <ellipse cy={9} rx={SPACE_R + 2} ry={SPACE_R * 0.55} fill="rgba(20,25,45,0.28)" />
                <circle cy={5} r={SPACE_R} fill={sp.type === 'card' ? '#7f67cf' : sp.type === 'treasure' ? '#c48f1c' : sp.type === 'portal' ? '#4a2296' : '#bfae8a'} />
                <circle
                  r={SPACE_R}
                  fill={sp.type === 'card' ? 'url(#kc-cardspace)' : sp.type === 'treasure' ? 'url(#kc-treasure)' : sp.type === 'portal' ? '#7b4fe0' : 'url(#kc-stone)'}
                  stroke={sp.type === 'treasure' ? '#a8740a' : sp.type === 'card' ? '#5e46b4' : '#a8987a'}
                  strokeWidth={2}
                />
                <ellipse cx={-7} cy={-9} rx={10} ry={5} fill="white" opacity={0.35} />
                {sp.type === 'card' && <ScrollIcon />}
                {sp.type === 'treasure' && <circle r={15} fill="none" stroke="#a8740a" strokeWidth={2} strokeDasharray="3 3" />}
                {sp.type === 'portal' && <PortalArt r={12} />}
                {sp.type === 'portalSite' && (tempPortal ? <PortalArt r={12} temp /> : <circle r={10} fill="none" stroke="#b8248f" strokeWidth={2} strokeDasharray="2 4" />)}
                {trap && (
                  <g transform="scale(0.62)">
                    <TrapArt theme={seatTheme(seatOf[trap.owner])} />
                  </g>
                )}
                {hl && (
                  <>
                    <circle r={SPACE_R + 7} fill="none" stroke={HL_COLOR[hl]} strokeWidth={6} className="kc-pulse" filter="url(#kc-glow)" />
                    {hl === 'capture' && (
                      <g transform="translate(19,-19)">
                        <circle r={9} fill="#ff4d4d" stroke="white" strokeWidth={2} />
                        <path d="M-4 4 L4 -4 M-4 -4 L4 4" stroke="white" strokeWidth={2.4} strokeLinecap="round" />
                      </g>
                    )}
                  </>
                )}
              </>
            )}
            {coach.has(sp.id) && <circle r={isCastle ? 36 : 24} fill="none" stroke="#ff4fa3" strokeWidth={3.5} strokeDasharray="6 4" className="kc-dash" />}
          </g>
        );
      })}

      {/* Treasures lying on the board */}
      {state.treasures.map((t) => {
        if (!t.space) return null;
        const sp = graph.space[t.space];
        const occupied = Object.values(state.characters).some((c) => c.space === t.space);
        return (
          <g key={t.id} transform={`translate(${sp.x + (occupied ? 20 : 0)},${sp.y - (occupied ? 14 : 4)})`} pointerEvents="none">
            <g className="kc-float">
              <GemArt size={occupied ? 12 : 16} />
            </g>
          </g>
        );
      })}

      {/* Pieces */}
      {characters.map(({ c, p }) => {
        const seat = seatOf[c.owner];
        const theme = seatTheme(seat);
        const anim = anims[c.id];
        const hl = charHl[c.id];
        const selected = selectedCharacter === c.id;
        const owner = state.players.find((x) => x.id === c.owner);
        const info = CHARACTER_INFO[c.kind];
        const status = [
          c.carrying && 'carrying treasure',
          c.power?.type === 'shield' && 'shielded',
          c.power?.type === 'attack_boost' && 'attack boosted',
          c.immune && 'immune',
          c.recovering && 'recovering',
        ]
          .filter(Boolean)
          .join(', ');
        const label = `${owner?.name ?? ''}${c.owner === viewerId ? ' (you)' : ''} — ${theme.kingdom} ${info.name}${status ? `, ${status}` : ''}`;
        const handler = () => onCharacter?.(c.id);
        return (
          <motion.g
            key={c.id}
            initial={false}
            animate={anim ? { x: anim.xs, y: anim.ys } : { x: p.x, y: p.y }}
            transition={anim ? { duration: anim.duration, delay: anim.delay, ease: 'easeInOut' } : { duration: reducedMotion ? 0 : 0.3 }}
            data-character={c.id}
            role="button"
            tabIndex={hl ? 0 : -1}
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              handler();
            }}
            onKeyDown={keyActivate(handler)}
            className="cursor-pointer"
          >
            <title>{`${label}\n${info.abilityName}: ${info.ability}`}</title>
            <g transform={`scale(${p.scale})`}>
              {(hl || selected) && (
                <ellipse
                  cy={0}
                  rx={22}
                  ry={9}
                  fill={selected ? '#ffcf3f' : hl === 'target' ? '#22d3ee' : '#fff2b0'}
                  opacity={selected ? 0.95 : 0.8}
                  className={selected ? undefined : 'kc-pulse'}
                />
              )}
              <g opacity={c.recovering ? 0.55 : 1} style={c.recovering ? { filter: 'grayscale(0.7)' } : undefined}>
                <g transform={selected ? 'translate(0,-6)' : undefined}>
                  <CharacterFigure kind={c.kind} theme={theme} />
                </g>
              </g>
              {c.power?.type === 'shield' && <circle cy={-24} r={27} fill="rgba(96,180,255,0.18)" stroke="#3b9cff" strokeWidth={2.5} />}
              {c.immune && (
                <g>
                  <circle cy={-24} r={30} fill="none" stroke="#ffc928" strokeWidth={3} strokeDasharray="4 5" className="kc-spin" />
                  <path d="M0 -66 L2.5 -60 L9 -60 L4 -56 L6 -50 L0 -54 L-6 -50 L-4 -56 L-9 -60 L-2.5 -60 Z" fill="#ffc928" stroke="#8a5a00" strokeWidth={1} />
                </g>
              )}
              {c.power?.type === 'attack_boost' && (
                <g transform="translate(-17,-44)">
                  <circle r={8} fill="#ff4d4d" stroke="white" strokeWidth={1.6} />
                  <path d="M-3.5 3.5 L3.5 -3.5 M1 -3.5 L3.5 -3.5 L3.5 -1" stroke="white" strokeWidth={1.8} fill="none" strokeLinecap="round" />
                </g>
              )}
              {c.recovering && (
                <g transform="translate(16,-46)">
                  <rect x={-11} y={-5} width={22} height={10} rx={5} fill="#fff" stroke="#e5484d" strokeWidth={1.6} transform="rotate(-25)" />
                  <path d="M-3 0 L3 0 M0 -3 L0 3" stroke="#e5484d" strokeWidth={2} transform="rotate(-25)" />
                </g>
              )}
              {c.carrying && (
                <g transform="translate(0,-62)">
                  <g className="kc-float">
                    <GemArt size={17} />
                  </g>
                </g>
              )}
            </g>
            {coach.has(`char:${c.id}`) && <circle cy={-14} r={34} fill="none" stroke="#ff4fa3" strokeWidth={5} strokeDasharray="8 6" className="kc-dash" />}
            <rect x={-20} y={-50} width={40} height={56} fill="transparent" />
          </motion.g>
        );
      })}
    </svg>
  );
}

export const Board = memo(BoardImpl);
