import { GEM_KINDS, GEM_NAMES, type GemKind } from '@/engine';

export { GEM_KINDS, GEM_NAMES };

/** Gem colours; each gem also has its own cut so colour is never the only cue. */
export const GEM_STYLE: Record<GemKind, { fill: string; light: string; dark: string }> = {
  ruby: { fill: '#e0263f', light: '#ff9aa8', dark: '#7d0f1f' },
  sapphire: { fill: '#2a63e8', light: '#9cc0ff', dark: '#10306f' },
  emerald: { fill: '#16a35a', light: '#8ff0bb', dark: '#0a5530' },
  diamond: { fill: '#c9f3ff', light: '#ffffff', dark: '#3d8aa6' },
};

const CUT: Record<GemKind, string> = {
  ruby: 'M0 -9 L8 -2 L5 8 L-5 8 L-8 -2 Z',
  sapphire: 'M0 -9.5 L7 0 L0 9.5 L-7 0 Z',
  emerald: 'M-5 -8.5 L5 -8.5 L8 -5 L8 5 L5 8.5 L-5 8.5 L-8 5 L-8 -5 Z',
  diamond: 'M-8.5 -3 L-4.5 -8.5 L4.5 -8.5 L8.5 -3 L0 9 Z',
};

const FACETS: Record<GemKind, string> = {
  ruby: 'M-8 -2 L0 1 L8 -2 M0 1 L-5 8 M0 1 L5 8 M0 -9 L0 1',
  sapphire: 'M-7 0 L7 0 M0 -9.5 L-2.5 0 L0 9.5 M0 -9.5 L2.5 0 L0 9.5',
  emerald: 'M-4.5 -5 L4.5 -5 L4.5 5 L-4.5 5 Z',
  diamond: 'M-8.5 -3 L8.5 -3 M-4.5 -8.5 L-2.2 -3 L0 9 M4.5 -8.5 L2.2 -3 L0 9',
};

/** A gem centred on (0,0), about `size` units tall. `empty` draws an outline slot. */
export function GemShape({ kind, size = 18, empty = false }: { kind: GemKind; size?: number; empty?: boolean }) {
  const st = GEM_STYLE[kind];
  return (
    <g transform={`scale(${size / 19})`}>
      <path d={CUT[kind]} fill={empty ? 'rgba(255,255,255,0.6)' : st.fill} stroke={empty ? '#9aa1b5' : st.dark} strokeWidth={1.4} strokeLinejoin="round" strokeDasharray={empty ? '2.5 2' : undefined} />
      {!empty && (
        <>
          <path d={FACETS[kind]} stroke={st.dark} strokeWidth={0.8} fill="none" opacity={0.55} />
          <path d="M-4 -6 L-1.5 -6 L-4.5 -1.5 Z" fill={st.light} opacity={0.9} />
        </>
      )}
    </g>
  );
}

/** HTML-friendly gem icon. */
export function GemIcon({ kind, size = 18, empty = false, title }: { kind: GemKind; size?: number; empty?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="-10 -10 20 20" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <GemShape kind={kind} size={19} empty={empty} />
    </svg>
  );
}
