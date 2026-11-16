import type { CharacterKind } from '@/engine';
import type { SeatTheme } from '@/lib/seats';
import { EmblemShape } from './art';

const SYMBOL: Record<CharacterKind, React.ReactNode> = {
  king: (
    <g>
      <path d="M-7 4 L-7 -4 L-3.5 -0.5 L0 -7 L3.5 -0.5 L7 -4 L7 4 Z" />
      <rect x={-7} y={5} width={14} height={2.6} rx={1} />
    </g>
  ),
  queen: (
    <g>
      <path d="M-7 5 L-6 -1 Q-3 2 0 -2 Q3 2 6 -1 L7 5 Z" />
      <circle cy={-5.2} r={2.3} />
      <circle cx={-6} cy={-2.6} r={1.3} />
      <circle cx={6} cy={-2.6} r={1.3} />
    </g>
  ),
  witch: (
    <g>
      <path d="M-9 6 L9 6 Q5 3.5 3 3 L1.5 -8.5 Q-0.5 -9 -2.5 -6 L-4 3 Q-6 3.5 -9 6 Z" />
    </g>
  ),
  knight: (
    <g>
      <path d="M-1.4 -9 L1.4 -9 L1.4 3 L-1.4 3 Z" />
      <path d="M-6 3 L6 3 L6 5.2 L-6 5.2 Z" />
      <path d="M-1.3 5.2 L1.3 5.2 L1.3 8.5 L-1.3 8.5 Z" />
    </g>
  ),
};

/**
 * A compact board piece centred on (0,0), radius about 13: house-colour base, a white face with the
 * character's symbol, and the house crest on top so colour is never the only cue.
 */
export function PieceToken({ kind, theme, dim = false }: { kind: CharacterKind; theme: SeatTheme; dim?: boolean }) {
  return (
    <g opacity={dim ? 0.55 : 1}>
      <circle r={13} fill={theme.color} stroke={theme.dark} strokeWidth={2} filter="url(#kc-soft)" />
      <circle r={9.6} fill="#fffaf0" stroke={theme.dark} strokeWidth={1} />
      <g fill={theme.dark} transform="scale(0.88)">
        {SYMBOL[kind]}
      </g>
      <g transform="translate(0 -13.5)">
        <circle r={5.2} fill={theme.dark} stroke="#fff" strokeWidth={1.2} />
        <EmblemShape emblem={theme.emblem} size={7} />
      </g>
    </g>
  );
}

export function TokenIcon({ kind, theme, size = 28 }: { kind: CharacterKind; theme: SeatTheme; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-16 -20 32 36" aria-hidden="true">
      <PieceToken kind={kind} theme={theme} />
    </svg>
  );
}
