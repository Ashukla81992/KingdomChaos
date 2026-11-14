'use client';

import { memo } from 'react';
import { getGraph, isWater, TERRAIN_INFO, type BoardSpace, type Terrain } from '@/engine';

export const TILE = 64;
const HALF = TILE / 2;
const BASE = 14;

interface Palette {
  top: string;
  alt: string;
  side: string;
}

const PALETTE: Record<Terrain, Palette> = {
  grass: { top: '#8fd16f', alt: '#86c966', side: '#5a9443' },
  forest: { top: '#63b257', alt: '#5aa850', side: '#447f3b' },
  plateau: { top: '#e0bb72', alt: '#d8b169', side: '#a3773a' },
  mountain: { top: '#a99c86', alt: '#a19480', side: '#6e6352' },
  river: { top: '#4cb6ea', alt: '#48b0e4', side: '#2f88bb' },
  lake: { top: '#3ea6df', alt: '#3aa0d9', side: '#2a7fb4' },
  ocean: { top: '#2a86c9', alt: '#2780c2', side: '#1d659f' },
  bridge: { top: '#4cb6ea', alt: '#48b0e4', side: '#2f88bb' },
  tunnel: { top: '#b0a38c', alt: '#a89b85', side: '#74685a' },
  harbor: { top: '#8fd16f', alt: '#86c966', side: '#5a9443' },
  airfield: { top: '#8fd16f', alt: '#86c966', side: '#5a9443' },
};

/** Height of a tile's top face; characters and markers stand on it. */
export const tileHeight = (t: Terrain) => Math.max(0, TERRAIN_INFO[t].height);

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <ellipse cy={10} rx={10} ry={3.5} fill="rgba(20,40,20,0.28)" />
      <rect x={-2} y={0} width={4} height={10} rx={1.5} fill="#7a4f28" />
      <path d="M0 -20 L11 2 L-11 2 Z" fill="#2f7d3b" />
      <path d="M0 -26 L8 -8 L-8 -8 Z" fill="#3c9a48" />
      <path d="M0 -26 L-8 -8 L-2 -8 Z" fill="#5cc06a" opacity={0.6} />
    </g>
  );
}

function Peak({ x, y, snow = true, scale = 1 }: { x: number; y: number; snow?: boolean; scale?: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <path d="M-30 22 L-8 -30 L2 -14 L12 -24 L30 22 Z" fill="#9b8d77" stroke="#5f5546" strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M-8 -30 L2 -14 L12 -24 L30 22 L4 22 Z" fill="#7f7362" opacity={0.75} />
      {snow && (
        <>
          <path d="M-8 -30 L-15 -14 L-9 -16 L-4 -11 L2 -14 Z" fill="white" />
          <path d="M12 -24 L8 -16 L12 -17 L16 -14 Z" fill="white" />
        </>
      )}
    </g>
  );
}

function Sailboat({ x, y, color = '#e5484d', flip = false }: { x: number; y: number; color?: string; flip?: boolean }) {
  return (
    <g transform={`translate(${x},${y}) scale(${flip ? -1 : 1},1)`}>
      <g className="kc-bob">
        <path d="M-11 2 L11 2 L7 8 L-7 8 Z" fill="#7a4f28" stroke="#4d2f14" strokeWidth={1} />
        <rect x={-0.8} y={-16} width={1.6} height={18} fill="#4d2f14" />
        <path d="M1 -15 L11 0 L1 0 Z" fill="white" stroke="#c7c2b5" strokeWidth={0.8} />
        <path d="M-1 -12 L-8 0 L-1 0 Z" fill={color} />
      </g>
    </g>
  );
}

function Plane({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x},${y}) rotate(${rotate})`}>
      <ellipse cx={3} cy={6} rx={14} ry={3} fill="rgba(0,0,0,0.18)" />
      <path d="M-14 0 Q-14 -3 -10 -3 L12 -3 Q16 -3 16 0 Q16 3 12 3 L-10 3 Q-14 3 -14 0 Z" fill="#f3f4f6" stroke="#5b6170" strokeWidth={1} />
      <path d="M-2 -3 L-6 -15 L0 -15 L5 -3 Z M-2 3 L-6 15 L0 15 L5 3 Z" fill="#e5484d" stroke="#8e1f24" strokeWidth={0.8} />
      <path d="M-12 -2 L-15 -8 L-11 -8 L-8 -2 Z" fill="#e5484d" />
      <circle cx={10} cy={0} r={1.6} fill="#2b6fd6" />
    </g>
  );
}

interface TileProps {
  sp: BoardSpace;
  col: number;
  row: number;
  terrain: Terrain;
  at: (c: number, r: number) => Terrain | null;
  fresh: boolean;
}

function TileImpl({ sp, col, row, terrain, at, fresh }: TileProps) {
  const p = PALETTE[terrain];
  const h = TERRAIN_INFO[terrain].height;
  const top = sp.y - HALF - h;
  const left = sp.x - HALF;
      const water = isWater(terrain) || terrain === 'bridge';
      const inset = water ? 0 : 4;
      const fill = (col + row) % 2 ? p.alt : p.top;
  const up = at(col, row - 1);
  const down = at(col, row + 1);
  const riverRunsVertically = (up !== null && isWater(up)) || (down !== null && isWater(down)) || up === 'bridge' || down === 'bridge';
  const cx = sp.x;
  const cy = sp.y - h;

  return (
    <g className={fresh ? 'kc-rise' : undefined}>
      <title>{`${TERRAIN_INFO[terrain].name}: ${TERRAIN_INFO[terrain].rule}`}</title>
      {!water && <ellipse cx={sp.x + 8} cy={sp.y + HALF - 6} rx={28} ry={10} fill="rgba(8, 28, 48, 0.28)" />}
      {!water && <rect x={left + inset} y={top + TILE - 2} width={TILE - inset * 2} height={h + BASE + 2} fill={p.side} />}
      {!water && h > 4 && <rect x={left + TILE - inset - 8} y={top + TILE - 2} width={8} height={h + BASE} fill="#000" opacity={0.16} />}
      <rect x={left + inset} y={top + inset} width={TILE - inset * 2} height={TILE - inset * 2} rx={water ? 0 : 6} fill={fill} />
      {!water && <rect x={left + inset} y={top + inset} width={TILE - inset * 2} height={3} fill="white" opacity={0.18} />}
      {water && up !== null && !isWater(up) && up !== 'bridge' && <rect x={left} y={top} width={TILE} height={14} fill="#0b3a66" opacity={0.25} />}
      {water && at(col - 1, row) !== null && !isWater(at(col - 1, row)!) && at(col - 1, row) !== 'bridge' && (
        <rect x={left} y={top} width={6} height={TILE} fill="#0b3a66" opacity={0.18} />
      )}

      {water && (
        <g opacity={0.55}>
          <clipPath id={`clip-${sp.id}`}>
            <rect x={left} y={top} width={TILE} height={TILE} />
          </clipPath>
          <g clipPath={`url(#clip-${sp.id})`}>
            <g className="kc-wave">
              <path
                d={`M${left - 16} ${top + 20} q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 M${left - 8} ${top + 44} q8 -5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0`}
                stroke="white"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      )}

      {terrain === 'forest' && (
        <>
          <Tree x={cx - 16} y={cy - 8} s={0.75} />
          <Tree x={cx + 15} y={cy - 12} s={0.7} />
          <Tree x={cx + 2} y={cy + 12} s={0.8} />
        </>
      )}
      {terrain === 'plateau' && (
        <path d={`M${left + 6} ${top + 14} h14 M${left + 34} ${top + 44} h18 M${left + 40} ${top + 18} h10`} stroke="#b9904a" strokeWidth={2} strokeLinecap="round" opacity={0.6} />
      )}
      {terrain === 'mountain' && <Peak x={cx} y={cy - 2} snow={(col + row) % 3 !== 0} />}
      {terrain === 'tunnel' && (
        <>
          <Peak x={cx - 14} y={cy - 6} scale={0.55} snow={false} />
          <Peak x={cx + 16} y={cy - 8} scale={0.5} snow={false} />
          <path d={`M${cx - 13} ${cy + 22} v-12 a13 13 0 0 1 26 0 v12 Z`} fill="#2b2622" stroke="#5f5546" strokeWidth={2} />
          <path d={`M${cx - 6} ${cy + 22} L${cx - 3} ${cy + 12} M${cx + 6} ${cy + 22} L${cx + 3} ${cy + 12}`} stroke="#d9b36b" strokeWidth={1.5} />
        </>
      )}
      {terrain === 'bridge' && (
        <g>
          <g transform={riverRunsVertically ? undefined : `rotate(90 ${cx} ${cy})`}>
            <rect x={left - 2} y={cy - 13} width={TILE + 4} height={26} rx={3} fill="#b07a45" />
            {Array.from({ length: 8 }, (_, i) => (
              <path key={i} d={`M${left + 4 + i * 8} ${cy - 12} V${cy + 12}`} stroke="#7a4f28" strokeWidth={1.4} />
            ))}
            <path d={`M${left - 2} ${cy - 13} H${left + TILE + 2} M${left - 2} ${cy + 13} H${left + TILE + 2}`} stroke="#4d2f14" strokeWidth={3} />
          </g>
        </g>
      )}
      {terrain === 'harbor' && (
        <g>
          <rect x={left + 2} y={cy + 4} width={TILE - 4} height={12} fill="#9a6a3a" stroke="#5a3a1c" strokeWidth={1.2} />
          <path d={`M${left + 12} ${cy + 4} v12 M${left + 26} ${cy + 4} v12 M${left + 40} ${cy + 4} v12 M${left + 54} ${cy + 4} v12`} stroke="#5a3a1c" strokeWidth={1} />
          <Sailboat x={cx - 6} y={cy - 12} color="#2b6fd6" />
          <path d={`M${cx + 18} ${cy - 18} v18`} stroke="#5a3a1c" strokeWidth={2} />
          <path d={`M${cx + 18} ${cy - 18} l10 4 l-10 4 Z`} fill="#ffcf3f" />
        </g>
      )}
      {terrain === 'airfield' && (
        <g>
          <rect x={left + 4} y={cy - 10} width={TILE - 8} height={20} rx={3} fill="#5b6170" />
          <path d={`M${left + 10} ${cy} H${left + TILE - 10}`} stroke="white" strokeWidth={2} strokeDasharray="6 5" />
          <Plane x={cx} y={cy - 18} rotate={-12} />
          <path d={`M${left + 8} ${top + 8} v10`} stroke="#5b6170" strokeWidth={1.5} />
          <path d={`M${left + 8} ${top + 8} l9 3 l-9 3 Z`} fill="#ff8a5c" />
        </g>
      )}
      {terrain === 'ocean' && (col * 7 + row * 3) % 13 === 0 && <Sailboat x={cx} y={cy} color="#ffcf3f" flip={col > 7} />}
      {terrain === 'lake' && (col + row * 2) % 5 === 0 && <Sailboat x={cx + 4} y={cy + 2} color="#9a6cf0" />}
    </g>
  );
}

const Tile = memo(TileImpl);

interface TerrainLayerProps {
  boardId: string;
  terrain: Record<string, Terrain>;
  /** Squares reshaped by the latest action; they get a rising animation. */
  fresh: ReadonlySet<string>;
}

/** Pseudo-3D terrain blocks, drawn back-to-front so taller tiles cast their cliffs over the row below. */
function TerrainLayerImpl({ boardId, terrain, fresh }: TerrainLayerProps) {
  const graph = getGraph(boardId);
  const board = graph.board;
  const xs = [...new Set(board.spaces.map((s) => s.x))].sort((a, b) => a - b);
  const ys = [...new Set(board.spaces.map((s) => s.y))].sort((a, b) => a - b);
  const byCell = new Map<string, BoardSpace>();
  for (const s of board.spaces) byCell.set(`${xs.indexOf(s.x)},${ys.indexOf(s.y)}`, s);
  const at = (c: number, r: number): Terrain | null => {
    const s = byCell.get(`${c},${r}`);
    return s ? (terrain[s.id] ?? s.terrain ?? 'grass') : null;
  };
  const ordered = board.spaces.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  return (
    <g pointerEvents="none" aria-hidden="true">
      {ordered.map((sp) => {
        const col = xs.indexOf(sp.x);
        const row = ys.indexOf(sp.y);
        const t = terrain[sp.id] ?? sp.terrain ?? 'grass';
        return <Tile key={`${sp.id}:${t}`} sp={sp} col={col} row={row} terrain={t} at={at} fresh={fresh.has(sp.id)} />;
      })}
    </g>
  );
}

export const TerrainLayer = memo(
  TerrainLayerImpl,
  (a, b) => a.boardId === b.boardId && a.fresh === b.fresh && JSON.stringify(a.terrain) === JSON.stringify(b.terrain),
);
