'use client';

/**
 * The dungeon creatures, drawn from the game's own Golem and Spider artwork in public/art
 * (monster-<id>-idle / -warning / -attack.png). The pictures are used as they are; only motion is
 * added on top: breathing, a glowing core, falling dust, a skitter, a slam or a lunge.
 *
 * States: idle (breathing), alert (a piece is in reach), attack (the resolved attack this event),
 * defeated (resting or slain). Animations use the shared kc-* classes, which the reduced-motion
 * setting and the OS preference both switch off.
 */
export type CreatureState = 'idle' | 'alert' | 'attack' | 'defeated';

type Kind = 'golem' | 'spider';

const ART: Record<Kind, Record<CreatureState, string>> = {
  golem: {
    idle: '/art/monster-golem-idle.png',
    alert: '/art/monster-golem-warning.png',
    attack: '/art/monster-golem-attack.png',
    defeated: '/art/monster-golem-idle.png',
  },
  spider: {
    idle: '/art/monster-spider-idle.png',
    alert: '/art/monster-spider-warning.png',
    attack: '/art/monster-spider-attack.png',
    defeated: '/art/monster-spider-idle.png',
  },
};

/** The motion added to each state's picture. */
const MOTION: Record<Kind, Record<CreatureState, string | undefined>> = {
  golem: { idle: 'kc-breathe', alert: 'kc-stomp', attack: 'kc-slam', defeated: undefined },
  spider: { idle: 'kc-sway', alert: 'kc-skitter', attack: 'kc-lunge', defeated: undefined },
};

function Creature({ kind, state, size, reduced }: { kind: Kind; state: CreatureState; size: number; reduced: boolean }) {
  const down = state === 'defeated';
  const anim = (c: string | undefined) => (reduced ? undefined : c);
  const glow = state === 'attack' ? '#ff4d2e' : state === 'alert' ? '#ffb347' : kind === 'golem' ? '#ffb02e' : '#7df0d0';
  return (
    <svg viewBox="-50 -60 100 100" width={size} height={size} x={-size / 2} y={-size / 2} overflow="visible" aria-hidden data-creature={kind} data-creature-state={state}>
      <defs>
        <radialGradient id={`kc-aura-${kind}-${state}`}>
          <stop offset="0%" stopColor={glow} stopOpacity={0.55} />
          <stop offset="100%" stopColor={glow} stopOpacity={0} />
        </radialGradient>
      </defs>
      {/* Spider's hanging thread */}
      {kind === 'spider' && !down && <line x1={0} y1={-62} x2={0} y2={-36} stroke="#e8eefc" strokeWidth={1.2} opacity={0.7} className={anim('kc-glow')} />}
      <ellipse cx={0} cy={32} rx={34} ry={6} fill="rgba(0,0,0,0.35)" />
      {/* A soft glow behind the creature: the Golem's furnace, the Spider's runes */}
      {!down && <ellipse cx={0} cy={-8} rx={40} ry={32} fill={`url(#kc-aura-${kind}-${state})`} className={anim('kc-glow')} />}
      <g transform={down ? (kind === 'spider' ? 'rotate(16) translate(4 6)' : 'rotate(-14) translate(-4 6)') : undefined}>
        <g className={down ? undefined : anim(MOTION[kind][state])}>
          <image
            href={ART[kind][state]}
            x={-50}
            y={-52}
            width={100}
            height={86}
            preserveAspectRatio="xMidYMax meet"
            style={down ? { filter: 'grayscale(0.9) brightness(0.8)', opacity: 0.75 } : undefined}
          />
        </g>
      </g>
      {/* Golem: dust falling from its shoulders; a crack in the floor when it slams */}
      {kind === 'golem' && !down && !reduced && (
        <g fill="#cbb89a">
          <circle cx={-26} cy={-30} r={1.6} className="kc-dust" />
          <circle cx={24} cy={-28} r={1.3} className="kc-dust" style={{ animationDelay: '1.1s' }} />
          <circle cx={4} cy={-40} r={1.2} className="kc-dust" style={{ animationDelay: '2s' }} />
        </g>
      )}
      {kind === 'golem' && state === 'attack' && <path d="M-40 32 Q0 22 40 32" stroke="#c8281e" strokeWidth={3} fill="none" strokeDasharray="4 3" className={anim('kc-shock')} />}
      {/* Spider: a web shot when it attacks */}
      {kind === 'spider' && state === 'attack' && (
        <g transform="translate(0 -30)" className={anim('kc-land')}>
          <circle r={7} fill="#f4f7ff" stroke="#9fb3d9" strokeWidth={2} opacity={0.9} />
          <path d="M-7 0 H7 M0 -7 V7 M-5 -5 L5 5 M5 -5 L-5 5" stroke="#9fb3d9" strokeWidth={1} />
        </g>
      )}
    </svg>
  );
}

/** Stone Golem, from the game's Golem artwork. */
export function GolemArt({ state, size = 84, reduced = false }: { state: CreatureState; size?: number; reduced?: boolean }) {
  return <Creature kind="golem" state={state} size={size} reduced={reduced} />;
}

/** Cave Spider, from the game's Spider artwork. */
export function SpiderArt({ state, size = 84, reduced = false }: { state: CreatureState; size?: number; reduced?: boolean }) {
  return <Creature kind="spider" state={state} size={size} reduced={reduced} />;
}
