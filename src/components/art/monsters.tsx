'use client';

/**
 * Original vector creatures for the dungeon (drawn for Kingdom Chaos; no third-party art).
 * Each takes a state: idle (breathing, glowing runes or eyes), alert (a piece is in reach), attack
 * (the resolved attack this event), defeated (resting or slain). Animations use the shared kc-*
 * classes, which the reduced-motion setting and the OS preference both switch off.
 */
export type CreatureState = 'idle' | 'alert' | 'attack' | 'defeated';

/** Stone Golem: a heavy, broad-shouldered silhouette with a furnace core, rune seams and falling dust. */
export function GolemArt({ state, size = 84, reduced = false }: { state: CreatureState; size?: number; reduced?: boolean }) {
  const down = state === 'defeated';
  const hot = state === 'attack' ? '#ff7a1a' : state === 'alert' ? '#ffb347' : '#f2a11a';
  const anim = (c: string) => (reduced ? undefined : c);
  return (
    <svg viewBox="-50 -60 100 100" width={size} height={size} x={-size / 2} y={-size / 2} overflow="visible" aria-hidden data-creature="golem" data-creature-state={state}>
      <ellipse cx={0} cy={36} rx={34} ry={7} fill="rgba(0,0,0,0.35)" />
      <g transform={down ? 'rotate(-16) translate(-4 10)' : undefined} opacity={down ? 0.75 : 1} className={down ? undefined : anim('kc-breathe')}>
        {/* Legs */}
        <path d="M-20 18 L-24 36 L-8 36 L-6 18 Z M6 18 L8 36 L24 36 L20 18 Z" fill="#5d5348" stroke="#2b241d" strokeWidth={2} />
        {/* Torso: wide, chipped stone */}
        <path d="M-30 -22 L-20 -34 L20 -34 L30 -22 L26 20 L-26 20 Z" fill="#7a6d5e" stroke="#2b241d" strokeWidth={2.5} />
        <path d="M-20 -30 L-8 -12 L-16 8 M18 -28 L8 -8 L16 12" stroke="#2b241d" strokeWidth={1.4} fill="none" opacity={0.6} />
        {/* Furnace core and rune seams */}
        <circle cx={0} cy={-6} r={8} fill={hot} stroke="#3b1d00" strokeWidth={2} className={anim('kc-glow')} />
        <path d="M-14 -20 h6 M8 -20 h6 M-12 6 l4 4 M8 10 l4 -4" stroke={hot} strokeWidth={2.2} strokeLinecap="round" className={anim('kc-glow')} />
        {/* Head */}
        <path d="M-12 -46 L12 -46 L15 -34 L-15 -34 Z" fill="#6a5e51" stroke="#2b241d" strokeWidth={2} />
        <rect x={-9} y={-42} width={6} height={3} fill={hot} />
        <rect x={3} y={-42} width={6} height={3} fill={hot} />
        {/* Arms: raised for the heavy slam when attacking or alert */}
        <g transform={state === 'attack' ? 'rotate(-40 -30 -22)' : state === 'alert' ? 'rotate(-14 -30 -22)' : undefined}>
          <path d="M-30 -22 L-44 -4 L-40 16 L-28 10 L-30 -4 Z" fill="#6a5e51" stroke="#2b241d" strokeWidth={2} />
          <rect x={-48} y={12} width={14} height={12} rx={3} fill="#5d5348" stroke="#2b241d" strokeWidth={2} />
        </g>
        <g transform={state === 'attack' ? 'rotate(40 30 -22)' : state === 'alert' ? 'rotate(14 30 -22)' : undefined}>
          <path d="M30 -22 L44 -4 L40 16 L28 10 L30 -4 Z" fill="#6a5e51" stroke="#2b241d" strokeWidth={2} />
          <rect x={34} y={12} width={14} height={12} rx={3} fill="#5d5348" stroke="#2b241d" strokeWidth={2} />
        </g>
      </g>
      {/* Dust falling from its shoulders */}
      {!down && !reduced && (
        <g fill="#cbb89a">
          <circle cx={-24} cy={-30} r={1.6} className="kc-dust" />
          <circle cx={22} cy={-28} r={1.3} className="kc-dust" style={{ animationDelay: '1.1s' }} />
          <circle cx={4} cy={-36} r={1.2} className="kc-dust" style={{ animationDelay: '2s' }} />
        </g>
      )}
      {state === 'attack' && <path d="M-40 34 Q0 22 40 34" stroke="#c8281e" strokeWidth={3} fill="none" strokeDasharray="4 3" />}
    </svg>
  );
}

/** Cave Spider: a sharp, long-legged silhouette with clustered glowing eyes and a hanging thread. */
export function SpiderArt({ state, size = 84, reduced = false }: { state: CreatureState; size?: number; reduced?: boolean }) {
  const down = state === 'defeated';
  const eye = state === 'attack' ? '#ff4d6d' : state === 'alert' ? '#ffd166' : '#9df5c8';
  const anim = (c: string) => (reduced ? undefined : c);
  const legs = [-1, 1].flatMap((side) =>
    [0, 1, 2, 3].map((i) => {
      const y = -8 + i * 6;
      const reach = 30 + (i === 1 || i === 2 ? 6 : 0);
      return <path key={`${side}-${i}`} d={`M${side * 8} ${y} Q${side * reach * 0.6} ${y - 18} ${side * reach} ${y + 14}`} stroke="#1c1426" strokeWidth={3} fill="none" strokeLinecap="round" />;
    }),
  );
  return (
    <svg viewBox="-50 -60 100 100" width={size} height={size} x={-size / 2} y={-size / 2} overflow="visible" aria-hidden data-creature="spider" data-creature-state={state}>
      {!down && <line x1={0} y1={-60} x2={0} y2={-16} stroke="#e8eefc" strokeWidth={1.2} opacity={0.7} />}
      <ellipse cx={0} cy={30} rx={28} ry={6} fill="rgba(0,0,0,0.3)" />
      <g transform={down ? 'rotate(180) translate(0 -8)' : undefined} opacity={down ? 0.7 : 1}>
        <g className={down ? undefined : anim('kc-legs')}>{legs}</g>
        <ellipse cx={0} cy={6} rx={13} ry={16} fill="#3a2a4d" stroke="#1c1426" strokeWidth={2} />
        <path d="M-6 0 L0 12 L6 0" stroke="#c8281e" strokeWidth={2.5} fill="none" />
        <ellipse cx={0} cy={-12} rx={9} ry={8} fill="#2c1f3b" stroke="#1c1426" strokeWidth={2} />
        <g fill={eye} className={anim('kc-glow')}>
          <circle cx={-4} cy={-14} r={2.2} />
          <circle cx={4} cy={-14} r={2.2} />
          <circle cx={-6.5} cy={-10} r={1.4} />
          <circle cx={6.5} cy={-10} r={1.4} />
        </g>
        {state === 'attack' && <circle cx={0} cy={-26} r={7} fill="#f4f7ff" stroke="#9fb3d9" strokeWidth={2} />}
      </g>
    </svg>
  );
}
