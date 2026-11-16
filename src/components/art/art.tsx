import type { CharacterKind } from '@/engine';
import type { Emblem, SeatTheme } from '@/lib/seats';

/** All artwork is original, hand-authored SVG. Coordinates are local to each element. */

export function EmblemShape({ emblem, size = 20, fill = 'white', stroke }: { emblem: Emblem; size?: number; fill?: string; stroke?: string }) {
  const s = size / 20;
  const sw = stroke ? 1.6 / s : 0;
  return (
    <g transform={`scale(${s})`}>
      {emblem === 'flame' && (
        <path d="M0 -9 C4 -4.5 7.5 -1 6.5 3.5 C5.5 7.5 2.5 9 0 9 C-2.5 9 -5.5 7.5 -6.5 3.5 C-7.3 0 -4 -1.5 -2.5 -5.5 C-1.5 -3 0.8 -2 0 -9Z" fill={fill} stroke={stroke} strokeWidth={sw} />
      )}
      {emblem === 'moon' && <path d="M3 -8.6 A9 9 0 1 0 8.6 3.2 A7 7 0 1 1 3 -8.6Z" fill={fill} stroke={stroke} strokeWidth={sw} />}
      {emblem === 'wave' && (
        <g fill="none" stroke={fill} strokeWidth={2.6} strokeLinecap="round">
          <path d="M-8 -1.5 Q-4 -7 0 -1.5 T8 -1.5" />
          <path d="M-8 4.5 Q-4 -1 0 4.5 T8 4.5" />
        </g>
      )}
      {emblem === 'leaf' && (
        <g>
          <path d="M-7.5 7 C-8 -3 -1 -8.5 8.5 -8.5 C8.5 1 3.5 7.5 -7.5 7Z" fill={fill} stroke={stroke} strokeWidth={sw} />
          <path d="M-7 6.5 L4 -4" stroke={stroke ?? 'rgba(0,0,0,0.25)'} strokeWidth={1.2} fill="none" />
        </g>
      )}
    </g>
  );
}

export function EmblemBadge({ theme, size = 28 }: { theme: SeatTheme; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <circle r={11} fill={theme.color} stroke={theme.dark} strokeWidth={1.5} />
      <EmblemShape emblem={theme.emblem} size={13} />
    </svg>
  );
}

const SKIN = '#ffe0c4';
const SKIN_LINE = '#9a6847';

function Face({ y = -34 }: { y?: number }) {
  return (
    <g>
      <circle cy={y} r={7.2} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.1} />
      <circle cx={-2.6} cy={y - 0.6} r={1} fill="#2b1d14" />
      <circle cx={2.6} cy={y - 0.6} r={1} fill="#2b1d14" />
      <path d={`M-2.2 ${y + 2.4} Q0 ${y + 4} 2.2 ${y + 2.4}`} stroke="#2b1d14" strokeWidth={0.9} fill="none" strokeLinecap="round" />
      <circle cx={-4.4} cy={y + 1.6} r={1.3} fill="#ff9d9d" opacity={0.55} />
      <circle cx={4.4} cy={y + 1.6} r={1.3} fill="#ff9d9d" opacity={0.55} />
    </g>
  );
}

/**
 * A board piece standing on (0,0). Kind is recognisable by silhouette and headgear;
 * owner by colour AND the emblem on the chest.
 */
export function CharacterFigure({ kind, theme }: { kind: CharacterKind; theme: SeatTheme }) {
  const c = theme.color;
  const d = theme.dark;
  return (
    <g>
      <ellipse cy={0} rx={15} ry={5} fill="rgba(20,25,45,0.35)" />
      <ellipse cy={-1.5} rx={13.5} ry={4.4} fill={d} />
      {kind === 'king' && (
        <g>
          <path d="M-12.5 -2 Q-13.5 -18 -7.5 -27.5 L7.5 -27.5 Q13.5 -18 12.5 -2 Z" fill={c} stroke={d} strokeWidth={1.4} />
          <path d="M-12.5 -2 Q-13.5 -18 -7.5 -27.5 L-4 -27.5 Q-8 -16 -6 -2Z" fill="rgba(255,255,255,0.22)" />
          <rect x={-9} y={-29.5} width={18} height={5} rx={2.5} fill="#fffaf0" stroke={d} strokeWidth={0.9} />
          {[-5.5, -1.8, 1.8, 5.5].map((x) => (
            <circle key={x} cx={x} cy={-27} r={0.7} fill="#2b1d14" />
          ))}
          <Face />
          <path d="M-7.2 -38.5 L-7.6 -46 L-3.6 -42 L0 -48.5 L3.6 -42 L7.6 -46 L7.2 -38.5 Z" fill="#f7c741" stroke="#a8740a" strokeWidth={1.1} strokeLinejoin="round" />
          <circle cy={-41.6} r={1.4} fill="#e5484d" />
        </g>
      )}
      {kind === 'queen' && (
        <g>
          <path d="M-8 -33 Q-9 -43 0 -43.5 Q9 -43 8 -33 Q8.5 -27 6.5 -24 L-6.5 -24 Q-8.5 -27 -8 -33Z" fill="#7a4a2a" />
          <path d="M-14.5 -2 Q-12 -15 -6 -27 L6 -27 Q12 -15 14.5 -2 Z" fill={c} stroke={d} strokeWidth={1.4} />
          <path d="M-14.5 -2 Q-12 -15 -6 -27 L-3 -27 Q-7 -14 -7 -2Z" fill="rgba(255,255,255,0.22)" />
          <path d="M-6 -27 L0 -20 L6 -27" fill="none" stroke="#fffaf0" strokeWidth={1.6} />
          <Face />
          <path d="M-5.5 -40.5 Q0 -47 5.5 -40.5" stroke="#f7c741" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <circle cy={-44.6} r={1.8} fill="#8be0ff" stroke="#a8740a" strokeWidth={0.7} />
        </g>
      )}
      {kind === 'witch' && (
        <g>
          <path d="M-13 -2 L-6.5 -28 L6.5 -28 L13 -2 Z" fill={c} stroke={d} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M-13 -2 L-6.5 -28 L-3.5 -28 L-6 -2Z" fill="rgba(255,255,255,0.22)" />
          <path d="M-6.5 -28 L-10 -16 L-4 -20Z" fill={d} opacity={0.5} />
          <Face y={-33.5} />
          <ellipse cy={-39} rx={11} ry={2.8} fill="#3b2a55" stroke="#20162f" strokeWidth={1} />
          <path d="M-6.2 -39.5 L1.5 -55 Q3.8 -57.5 7 -54 L4.3 -52.4 L6.2 -39.5 Z" fill="#4a3570" stroke="#20162f" strokeWidth={1} strokeLinejoin="round" />
          <path d="M-5.6 -41.6 L5.9 -41.6 L5.7 -43.6 L-4.8 -43.6Z" fill="#f7c741" />
        </g>
      )}
      {kind === 'knight' && (
        <g>
          <path d="M-11.5 -2 L-11.5 -18 Q-11.5 -27.5 0 -28 Q11.5 -27.5 11.5 -18 L11.5 -2 Z" fill="#cfd7e3" stroke="#5b6676" strokeWidth={1.4} />
          <path d="M-6.5 -26.5 L6.5 -26.5 L5.5 -5 L0 -1.5 L-5.5 -5 Z" fill={c} stroke={d} strokeWidth={1.1} />
          <path d={`M4 -44 Q14 -49 13 -36 Q10 -41 4 -40Z`} fill={c} stroke={d} strokeWidth={1} />
          <circle cy={-35} r={8.3} fill="#dfe6ef" stroke="#5b6676" strokeWidth={1.3} />
          <path d="M-8.2 -35 L8.2 -35" stroke="#5b6676" strokeWidth={1} />
          <rect x={-5.5} y={-36.4} width={11} height={2.6} rx={1.3} fill="#2b3442" />
          <circle cx={-3} cy={-39.5} r={1.6} fill="white" opacity={0.7} />
        </g>
      )}
      <g transform={kind === 'knight' ? 'translate(0,-15)' : kind === 'queen' ? 'translate(0,-12)' : 'translate(0,-14)'}>
        <EmblemShape emblem={theme.emblem} size={9} fill="white" stroke={d} />
      </g>
    </g>
  );
}

export function CastleArt({ theme, damaged, guarded }: { theme: SeatTheme; damaged: boolean; guarded: boolean }) {
  const c = theme.color;
  const d = theme.dark;
  return (
    <g>
      <ellipse cy={30} rx={56} ry={16} fill="rgba(20,25,45,0.28)" />
      <path d="M-48 26 Q0 44 48 26 L48 14 Q0 30 -48 14 Z" fill="#9a8a72" />
      <ellipse cy={14} rx={48} ry={13} fill="#d9ccb2" stroke="#9a8a72" strokeWidth={2} />
      {/* walls */}
      <path d="M-34 10 L-34 -18 L34 -18 L34 10 Q0 18 -34 10Z" fill="#efe6d2" stroke="#8d7f66" strokeWidth={2} />
      {[-30, -18, -6, 6, 18].map((x) => (
        <rect key={x} x={x} y={-24} width={8} height={7} fill="#efe6d2" stroke="#8d7f66" strokeWidth={1.6} />
      ))}
      <path d="M-9 13 L-9 -2 Q0 -12 9 -2 L9 13 Z" fill="#6b4a2f" stroke="#3f2a19" strokeWidth={1.6} />
      {/* towers */}
      {[-36, 36].map((x) => (
        <g key={x} transform={`translate(${x},0)`}>
          <rect x={-11} y={-30} width={22} height={40} rx={3} fill="#f6efdf" stroke="#8d7f66" strokeWidth={2} />
          <rect x={-3} y={-18} width={6} height={9} rx={3} fill="#3f2a19" />
          <path d="M-14 -29 L0 -54 L14 -29 Z" fill={c} stroke={d} strokeWidth={2} strokeLinejoin="round" />
          <path d="M-14 -29 L0 -54 L-4 -29 Z" fill="rgba(255,255,255,0.25)" />
        </g>
      ))}
      {/* keep + flag */}
      <rect x={-13} y={-40} width={26} height={24} rx={3} fill="#f6efdf" stroke="#8d7f66" strokeWidth={2} />
      <path d="M-16 -39 L0 -62 L16 -39 Z" fill={c} stroke={d} strokeWidth={2} strokeLinejoin="round" />
      <line x1={0} y1={-62} x2={0} y2={-84} stroke="#5b4a33" strokeWidth={2.2} />
      <path d="M0 -84 L26 -78 L0 -70 Z" fill={c} stroke={d} strokeWidth={1.6} />
      <g transform="translate(10,-77)">
        <EmblemShape emblem={theme.emblem} size={10} />
      </g>
      <g transform="translate(0,-28)">
        <circle r={7.5} fill={c} stroke={d} strokeWidth={1.4} />
        <EmblemShape emblem={theme.emblem} size={10} />
      </g>
      {damaged && (
        <g>
          <path d="M-26 -14 L-20 -4 L-25 4 L-18 10" stroke="#3a2a1a" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <path d="M22 -16 L16 -6 L22 2" stroke="#3a2a1a" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <g transform="translate(26,-44)" className="kc-pulse">
            <path d="M0 -14 C6 -6 10 -2 8 4 C6 9 2 10 0 10 C-3 10 -7 8 -8 3 C-9 -2 -3 -4 -2 -9 C0 -5 2 -5 0 -14Z" fill="#ff7a2f" stroke="#a3300b" strokeWidth={1.4} />
            <path d="M0 -4 C3 0 4 2 3 5 C2 7 -2 7 -3 5 C-4 2 -1 0 0 -4Z" fill="#ffd35c" />
          </g>
        </g>
      )}
      {guarded && (
        <g transform="translate(-30,-46)">
          <path d="M0 -12 L10 -8 L10 0 Q10 8 0 12 Q-10 8 -10 0 L-10 -8 Z" fill="#ffd35c" stroke="#8a5a00" strokeWidth={1.8} />
          <path d="M-4 0 L-1 3 L5 -4" stroke="#8a5a00" strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

export function GemArt({ size = 18 }: { size?: number }) {
  const s = size / 18;
  return (
    <g transform={`scale(${s})`}>
      <ellipse cy={10} rx={8} ry={2.4} fill="rgba(20,25,45,0.25)" />
      <path d="M-9 -3 L-5 -9 L5 -9 L9 -3 L0 9 Z" fill="url(#kc-gem)" stroke="#0e5a7a" strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M-9 -3 L9 -3 M-5 -9 L-2.5 -3 L0 9 M5 -9 L2.5 -3 L0 9" stroke="#0e5a7a" strokeWidth={0.8} fill="none" opacity={0.7} />
      <path d="M-5 -8 L-3 -4 L-7 -4 Z" fill="white" opacity={0.8} />
    </g>
  );
}

export function PortalArt({ r = 20, temp = false }: { r?: number; temp?: boolean }) {
  return (
    <g>
      <circle r={r} fill={temp ? 'url(#kc-portal-temp)' : 'url(#kc-portal)'} />
      <g className="kc-spin">
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d={`M0 0 Q${r * 0.55} ${-r * 0.2} ${r * 0.72} ${-r * 0.72}`}
            stroke="white"
            strokeOpacity={0.75}
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
            transform={`rotate(${a})`}
          />
        ))}
      </g>
    </g>
  );
}

export function TrapArt({ theme }: { theme: SeatTheme }) {
  return (
    <g>
      <ellipse cy={5} rx={17} ry={6} fill="rgba(20,25,45,0.3)" />
      <path d="M-15 2 Q0 -6 15 2 Q0 10 -15 2Z" fill="#6b4a2f" stroke="#3f2a19" strokeWidth={1.4} />
      {[-11, -6, -1, 4, 9].map((x) => (
        <path key={x} d={`M${x} 0 L${x + 2.5} -9 L${x + 5} 0`} fill="#d8dde6" stroke="#5b6676" strokeWidth={1} strokeLinejoin="round" />
      ))}
      <g transform="translate(14,-10)">
        <circle r={6} fill={theme.color} stroke={theme.dark} strokeWidth={1.2} />
        <EmblemShape emblem={theme.emblem} size={8} />
      </g>
    </g>
  );
}

export function ScrollIcon() {
  return (
    <g>
      <rect x={-8} y={-6} width={16} height={12} rx={2} fill="#fff4d6" stroke="#8a6a2a" strokeWidth={1.4} />
      <circle cx={-8} cy={0} r={3} fill="#f1d9a0" stroke="#8a6a2a" strokeWidth={1.2} />
      <circle cx={8} cy={0} r={3} fill="#f1d9a0" stroke="#8a6a2a" strokeWidth={1.2} />
      <path d="M-4 -2 L4 -2 M-4 1.5 L3 1.5" stroke="#8a6a2a" strokeWidth={1.1} />
    </g>
  );
}

export function BoardDefs() {
  return (
    <defs>
      <linearGradient id="kc-gem" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#c9fbff" />
        <stop offset="0.5" stopColor="#4fd3f5" />
        <stop offset="1" stopColor="#1590c4" />
      </linearGradient>
      <radialGradient id="kc-portal">
        <stop offset="0" stopColor="#fff" />
        <stop offset="0.35" stopColor="#c59bff" />
        <stop offset="1" stopColor="#5b2bbf" />
      </radialGradient>
      <radialGradient id="kc-portal-temp">
        <stop offset="0" stopColor="#fff" />
        <stop offset="0.35" stopColor="#ff9ce6" />
        <stop offset="1" stopColor="#b8248f" />
      </radialGradient>
      <radialGradient id="kc-grass" cx="0.45" cy="0.4" r="0.7">
        <stop offset="0" stopColor="#b8ec7e" />
        <stop offset="0.6" stopColor="#86d067" />
        <stop offset="1" stopColor="#5fae55" />
      </radialGradient>
      <radialGradient id="kc-sea" cx="0.5" cy="0.45" r="0.7">
        <stop offset="0.55" stopColor="#5fc6f0" />
        <stop offset="1" stopColor="#3aa0d8" />
      </radialGradient>
      <linearGradient id="kc-stone" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fffaf0" />
        <stop offset="1" stopColor="#e7dcc4" />
      </linearGradient>
      <linearGradient id="kc-cardspace" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d9ceff" />
        <stop offset="1" stopColor="#a993f2" />
      </linearGradient>
      <linearGradient id="kc-treasure" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff1b8" />
        <stop offset="1" stopColor="#f4c24a" />
      </linearGradient>
      <pattern id="kc-planks" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#b07a45" />
        <rect width="10" height="2" fill="#7a4f28" />
      </pattern>
      <filter id="kc-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
