'use client';

import { motion } from 'framer-motion';
import { memo, useMemo, useState } from 'react';
import { CHARACTER_INFO, getGraph, isLand, SPACE_LABELS, TERRAIN_INFO, terrainOf, type BoardConnection, type Character, type PublicState } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { BoardDefs, CastleArt, CharacterFigure, GemArt, PortalArt, TrapArt } from '../art/art';
import { TerrainLayer, tileHeight } from './Terrain';

/** A dig site: a dirt mound with an X. Ending a regular move here digs up a card. */
function DigSite() {
  return (
    <g>
      <ellipse cy={6} rx={17} ry={8} fill="#8a5a2b" />
      <ellipse cy={3} rx={15} ry={6.5} fill="#b07a45" />
      <path d="M-6 -3 L6 9 M6 -3 L-6 9" stroke="#e5484d" strokeWidth={3.4} strokeLinecap="round" />
      <path d="M10 -2 L18 -14" stroke="#5a3a1c" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M15 -16 L22 -11 L19 -9 Z" fill="#9aa3b5" stroke="#4a5374" strokeWidth={1} />
    </g>
  );
}

export type SpaceHighlight = 'move' | 'capture' | 'bank' | 'pickup' | 'target' | 'blocked';

/** What to tell the player when they hover a tile that is more than open meadow. */
function tileTip(state: PublicState, sp: { id: string; type: string; seat?: number; road?: boolean }, terrain: keyof typeof TERRAIN_INFO): { title: string; body: string } | null {
  const terrainLine = TERRAIN_INFO[terrain].rule;
  const lines: string[] = [];
  let title = SPACE_LABELS[sp.id] ?? TERRAIN_INFO[terrain].name;
  if (sp.type === 'castle') {
    const castle = state.castles[sp.id];
    title = castle ? `${seatTheme(sp.seat ?? 0).kingdom} castle` : 'Empty castle';
    lines.push('Characters start here. End a move here while carrying treasure to bank it.');
    if (castle?.damagedBy) lines.push('Damaged: this kingdom cannot bank until the castle is repaired.');
    if (castle?.royalGuard) lines.push('A Royal Guard blocks the next Castle Attack.');
  } else if (sp.type === 'treasure') {
    title = SPACE_LABELS[sp.id] ?? 'Treasure space';
    lines.push('Treasure comes back here after it is banked. End your move on the gem to pick it up.');
  } else if (sp.type === 'card') {
    title = 'Dig site';
    lines.push('End your regular move here to dig up a card when your turn ends.');
  } else if (sp.type === 'portal') {
    title = SPACE_LABELS[sp.id] ?? 'Fixed portal';
    lines.push('The Witch can jump between the two fixed portals for one step. Teleport lands on an empty one.');
  } else if (sp.type === 'portalSite') {
    title = state.tempPortals.some((p) => p.space === sp.id) ? 'Temporary portal' : 'Portal site';
    lines.push(
      state.tempPortals.some((p) => p.space === sp.id)
        ? 'Anyone can step through this portal to the fixed portal it links to. It closes on its owner’s next turn.'
        : 'The Portal card can open a temporary portal on this empty site.',
    );
  } else if (terrain !== 'grass') {
    title = TERRAIN_INFO[terrain].name;
    lines.push(terrainLine);
  } else if (sp.road) {
    title = "King's road";
    lines.push('The wide middle path. It can never be blocked or reshaped, so every castle can still reach treasure.');
  } else {
    return null;
  }
  if (terrain !== 'grass' && sp.type !== 'normal') lines.push(terrainLine);
  if (sp.road && title !== "King's road") lines.push('This square is on the king’s road, so map cards cannot change it.');
  if (state.traps.some((t) => t.space === sp.id)) lines.push('A trap is set here. An opponent who ends a move on it is sent back to their castle.');
  if (state.treasures.some((t) => t.space === sp.id)) lines.push('A treasure is lying on this square.');
  return { title, body: lines.join(' ') };
}

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

interface Anim {
  xs: number[];
  ys: number[];
  duration: number;
  delay: number;
}

function BoardImpl({ state, highlights, selectedCharacter, viewerId, reducedMotion, onSpace, onConnection, onCharacter }: BoardProps) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const graph = getGraph(state.boardId);
  const board = graph.board;
  const terrain = state.terrain ?? {};
  const lift = (id: string) => tileHeight(terrainOf(state, id));
  const seatOf = Object.fromEntries(state.players.map((p) => [p.id, p.seat]));
  const castleSeat = Object.fromEntries(board.castles.map((c, i) => [c, i]));
  const fresh = useMemo(
    () => new Set(state.lastEvents.flatMap((e) => (e.type === 'terrainChanged' ? [e.space] : []))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.version],
  );

  const pieceAt = (c: Character, space = c.space): { x: number; y: number; scale: number } => {
    const sp = graph.space[space];
    const h = lift(space);
    if (sp.type === 'castle') {
      const i = KIND_ORDER.indexOf(c.kind);
      const col = i % 2;
      const row = Math.floor(i / 2);
      return { x: sp.x - 16 + col * 32, y: sp.y - 4 + row * 18 - h, scale: 0.95 };
    }
    return { x: sp.x, y: sp.y + 4 - h, scale: 1.15 };
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
  const hover = hoverId ? graph.space[hoverId] : undefined;
  const hoverTip = hover ? tileTip(state, hover, terrainOf(state, hover.id)) : null;

  return (
    <div className="relative h-full w-full">
    <svg
      viewBox={`0 0 ${board.width} ${board.height}`}
      className="h-full w-full select-none"
      role="group"
      aria-label={`${board.name} game board`}
      style={{ touchAction: 'manipulation', transform: 'perspective(1400px) rotateX(18deg) scale(0.9)', transformOrigin: '50% 72%' }}
    >
      <BoardDefs />
      <rect width={board.width} height={board.height} fill="#1f74b4" />
      <rect width={board.width} height={board.height} fill="url(#kc-sea)" opacity={0.6} />
      <TerrainLayer boardId={state.boardId} terrain={terrain} fresh={fresh} />

      {/* Pale paths, drawn like carved trails: you can only walk where a path shows. */}
      <g pointerEvents="none">
        {board.connections.map((c) => {
          if (!isLand(terrainOf(state, c.a)) || !isLand(terrainOf(state, c.b))) return null;
          const a = graph.space[c.a];
          const b = graph.space[c.b];
          const blocked = state.blocks.some((bl) => bl.connectionId === c.id);
          const road = c.kind === 'permanent';
          const y1 = a.y - lift(c.a);
          const y2 = b.y - lift(c.b);
          return (
            <g key={`path-${c.id}`}>
              <line
                x1={a.x}
                y1={y1}
                x2={b.x}
                y2={y2}
                stroke={blocked ? 'rgba(229,72,77,0.35)' : road ? 'rgba(255,220,140,0.42)' : 'rgba(255,248,230,0.34)'}
                strokeWidth={road ? 16 : 13}
                strokeLinecap="round"
              />
            </g>
          );
        })}
      </g>

      {/* Blocks sit on top of the path they close. */}
      <g>
        {board.connections.map((c) => {
          const style = connectionStyle(c);
          if (style === 'road' || style === 'blockable') return null;
          const a = graph.space[c.a];
          const b = graph.space[c.b];
          const ay = a.y - lift(c.a);
          const by = b.y - lift(c.b);
          const mx = (a.x + b.x) / 2;
          const my = (ay + by) / 2;
          const angle = (Math.atan2(by - ay, b.x - a.x) * 180) / Math.PI;
          return (
            <g key={c.id}>
              {style === 'blocked' && (
                <>
                  <line x1={a.x} y1={ay} x2={b.x} y2={by} stroke="#e5484d" strokeWidth={3} strokeDasharray="6 4" />
                  <g transform={`translate(${mx},${my}) rotate(${angle + 90}) scale(0.8)`}>
                    <rect x={-18} y={-7} width={36} height={14} rx={3} fill="white" stroke="#8e1f24" strokeWidth={2} />
                    <path d="M-12 7 L-4 -7 M0 7 L8 -7 M12 7 L18 -3" stroke="#e5484d" strokeWidth={4} />
                    <path d="M-14 7 v8 M14 7 v8" stroke="#5a3a1c" strokeWidth={3} />
                  </g>
                  <title>Blocked path</title>
                </>
              )}
              {style === 'bridge-open' && (
                <>
                  <line x1={a.x} y1={ay} x2={b.x} y2={by} stroke="#c58d55" strokeWidth={8} />
                  <title>Bridge (open)</title>
                </>
              )}
              {style === 'bridge-closed' && (
                <>
                  <line x1={a.x} y1={ay} x2={b.x} y2={by} stroke="#8a5a2b" strokeWidth={2} strokeDasharray="6 5" opacity={0.85} />
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
        const a = { x: graph.space[c.a].x, y: graph.space[c.a].y - lift(c.a) };
        const b = { x: graph.space[c.b].x, y: graph.space[c.b].y - lift(c.b) };
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
        const a = { x: graph.space[c.a].x, y: graph.space[c.a].y - lift(c.a) };
        const b = { x: graph.space[c.b].x, y: graph.space[c.b].y - lift(c.b) };
        return <line key={`coach-${c.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ff4fa3" strokeWidth={7} strokeDasharray="10 8" className="kc-dash" pointerEvents="none" />;
      })}

      {/* Route preview */}
      {route && route.length > 1 && (
        <g pointerEvents="none">
          <polyline
            points={route.map((s) => `${graph.space[s].x},${graph.space[s].y - lift(s)}`).join(' ')}
            fill="none"
            stroke="white"
            strokeWidth={14}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.9}
          />
          <polyline
            points={route.map((s) => `${graph.space[s].x},${graph.space[s].y - lift(s)}`).join(' ')}
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
        const t = terrainOf(state, sp.id);
        const tip = tileTip(state, sp, t);
        const name = tip?.title ?? TERRAIN_INFO[t].name;
        const interactive = !!hl;
        const handler = () => onSpace?.(sp.id);
        const marker = !isCastle && sp.type !== 'normal';
        return (
          <g
            key={sp.id}
            transform={`translate(${sp.x},${sp.y - lift(sp.id)})`}
            data-space={sp.id}
            data-highlight={hl || undefined}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${name}${hl ? ` — ${hl === 'capture' ? 'capture here' : hl === 'bank' ? 'bank treasure here' : hl === 'pickup' ? 'pick up treasure here' : 'choose'}` : ''}` : undefined}
            onClick={handler}
            onKeyDown={keyActivate(handler)}
            onMouseEnter={() => tip && setHoverId(sp.id)}
            onMouseLeave={() => setHoverId((current) => (current === sp.id ? null : current))}
            className={onSpace ? 'cursor-pointer' : undefined}
          >
            <title>{tip ? `${tip.title}. ${tip.body}` : name}</title>
            {(tip || interactive) && <rect x={-32} y={-32} width={64} height={64} fill="transparent" />}
            {isCastle ? (
              <>
                <g transform="scale(0.62)">
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
                {marker && sp.type !== 'card' && (
                  <>
                    <ellipse cy={9} rx={SPACE_R + 2} ry={SPACE_R * 0.55} fill="rgba(20,25,45,0.28)" />
                    <circle cy={5} r={SPACE_R} fill={sp.type === 'treasure' ? '#c48f1c' : sp.type === 'portal' ? '#4a2296' : '#bfae8a'} />
                    <circle
                      r={SPACE_R}
                      fill={sp.type === 'treasure' ? 'url(#kc-treasure)' : sp.type === 'portal' ? '#7b4fe0' : 'url(#kc-stone)'}
                      stroke={sp.type === 'treasure' ? '#a8740a' : '#a8987a'}
                      strokeWidth={2}
                    />
                    <ellipse cx={-7} cy={-9} rx={10} ry={5} fill="white" opacity={0.35} />
                  </>
                )}
                {sp.type === 'card' && <DigSite />}
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
                    <rect x={-27} y={-27} width={54} height={54} rx={12} fill={HL_COLOR[hl]} opacity={0.22} />
                    <rect x={-27} y={-27} width={54} height={54} rx={12} fill="none" stroke={HL_COLOR[hl]} strokeWidth={5} className="kc-pulse" filter="url(#kc-glow)" />
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
            {coach.has(sp.id) && <rect x={-31} y={-31} width={62} height={62} rx={14} fill="none" stroke="#ff4fa3" strokeWidth={4} strokeDasharray="8 5" className="kc-dash" />}
          </g>
        );
      })}

      {/* Treasures lying on the board */}
      {state.treasures.map((t) => {
        if (!t.space) return null;
        const sp = graph.space[t.space];
        const occupied = Object.values(state.characters).some((c) => c.space === t.space);
        return (
          <g key={t.id} transform={`translate(${sp.x + (occupied ? 20 : 0)},${sp.y - lift(sp.id) - (occupied ? 14 : 4)})`} pointerEvents="none">
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
          c.power?.type === 'boat' && 'has a boat',
          c.power?.type === 'glider' && 'has a glider',
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
              {state.status === 'playing' && c.owner === state.turn.playerId && (
                <ellipse cy={2} rx={26} ry={11} fill={theme.color} opacity={0.9} />
              )}
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
              {c.power?.type === 'boat' && (
                <g transform="translate(-18,-44)">
                  <circle r={9} fill="#d4f1ff" stroke="#0b6aa2" strokeWidth={1.6} />
                  <path d="M-6 2 L6 2 L4 5 L-4 5 Z M0 -6 L0 2 M0 -6 L5 1 L0 1" fill="#0b6aa2" stroke="#0b6aa2" strokeWidth={1.2} strokeLinejoin="round" />
                </g>
              )}
              {c.power?.type === 'glider' && (
                <g transform="translate(-18,-44)">
                  <circle r={9} fill="#fff0d6" stroke="#a35a00" strokeWidth={1.6} />
                  <path d="M-6 1 L6 -3 L1 1 L3 5 Z" fill="#a35a00" />
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
              <rect x={-14} y={-64} width={28} height={74} fill="transparent" />
            </g>
            {coach.has(`char:${c.id}`) && <circle cy={-14} r={34} fill="none" stroke="#ff4fa3" strokeWidth={5} strokeDasharray="8 6" className="kc-dash" />}
          </motion.g>
        );
      })}
    </svg>
    {hoverTip && (
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-[#1d2440]/92 px-3.5 py-2.5 text-white shadow-[var(--shadow-pop)]" role="tooltip">
        <div className="font-display text-[15px] font-semibold">{hoverTip.title}</div>
        <p className="mt-0.5 text-sm leading-snug text-white/85">{hoverTip.body}</p>
      </div>
    )}
    </div>
  );
}

export const Board = memo(BoardImpl);
