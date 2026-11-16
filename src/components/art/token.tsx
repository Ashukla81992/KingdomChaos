import type { CharacterKind } from '@/engine';
import type { SeatTheme } from '@/lib/seats';

/**
 * The painted character, feet near (0, 6), with no backing plate. House colour is in the costume,
 * and the board's own seal stays visible underneath.
 */
export function PieceToken({ kind, theme, dim = false }: { kind: CharacterKind; theme: SeatTheme; dim?: boolean }) {
  return (
    <image
      href={`/art/${theme.key}-${kind}.png`}
      x={-22}
      y={-58}
      width={44}
      height={66}
      style={{ filter: 'drop-shadow(0 1px 1px rgba(20,12,4,0.55))' }}
      opacity={dim ? 0.55 : 1}
      preserveAspectRatio="xMidYMax meet"
    />
  );
}

export function TokenIcon({ kind, theme, size = 28 }: { kind: CharacterKind; theme: SeatTheme; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-22 -58 44 66" aria-hidden="true">
      <PieceToken kind={kind} theme={theme} />
    </svg>
  );
}
