'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 26], [72, 26], [28, 50], [72, 50], [28, 74], [72, 74]],
};

// Rotation that brings each face to the front.
const FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

const FACE_TRANSFORM: Record<number, string> = {
  1: 'rotateY(0deg)',
  2: 'rotateY(90deg)',
  3: 'rotateX(90deg)',
  4: 'rotateX(-90deg)',
  5: 'rotateY(-90deg)',
  6: 'rotateY(180deg)',
};

function Face({ n, half }: { n: number; half: number }) {
  return (
    <div
      className="absolute inset-0 rounded-[18%] border-2 border-[#e6dcc6]"
      style={{
        transform: `${FACE_TRANSFORM[n]} translateZ(${half}px)`,
        background: 'radial-gradient(circle at 30% 25%, #ffffff, #fff6e3 60%, #f1e3c2)',
        backfaceVisibility: 'hidden',
      }}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
        {PIPS[n].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={9} fill={n === 1 ? '#e5484d' : '#1d2440'} />
        ))}
      </svg>
    </div>
  );
}

type Flight = {
  id: number;
  value: number;
  size: number;
  xs: number[];
  ys: number[];
  scales: number[];
  rx: number[];
  ry: number[];
  times: number[];
  duration: number;
};

const FLY_SIZE = 96;

/** Plan a romp across the viewport: three bounces, a rest showing the rolled face, then home. */
function planFlight(anchor: DOMRect, value: number, id: number, fast: boolean): Flight {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const half = FLY_SIZE / 2;
  const clampX = (x: number) => Math.min(vw - half - 8, Math.max(half + 8, x));
  const clampY = (y: number) => Math.min(vh - half - 8, Math.max(half + 8, y));
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const hx = anchor.left + anchor.width / 2;
  const hy = anchor.top + anchor.height / 2;
  // Head for the far side of the screen, bouncing on the way, and come to rest near the middle.
  const dir = hx > vw / 2 ? -1 : 1;
  const xs = [hx, clampX(hx + dir * vw * rnd(0.25, 0.35)), clampX(hx + dir * vw * rnd(0.5, 0.65)), clampX(vw / 2 + rnd(-0.12, 0.12) * vw), clampX(vw / 2 + rnd(-0.12, 0.12) * vw), hx];
  const ys = [hy, clampY(vh * rnd(0.15, 0.3)), clampY(vh * rnd(0.65, 0.85)), clampY(vh * rnd(0.4, 0.55)), 0, hy];
  ys[4] = ys[3];
  const f = FACE_ROT[value];
  const spins = 3;
  const rx = [-18, 260, 520, f.x + 360 * spins, f.x + 360 * spins, f.x + 360 * spins];
  const ry = [24, 300, 610, f.y + 360 * spins, f.y + 360 * spins, f.y + 360 * spins];
  const start = Math.max(0.35, anchor.width / FLY_SIZE);
  return {
    id,
    value,
    size: FLY_SIZE,
    xs: xs.map((x) => x - half),
    ys: ys.map((y) => y - half),
    scales: [start, 1.15, 1, 1.25, 1.25, start],
    rx,
    ry,
    times: [0, 0.2, 0.42, 0.62, 0.84, 1],
    duration: fast ? 1.4 : 2.4,
  };
}

function FlyingDie({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[80]" aria-hidden="true" data-die-flight>
      <motion.div
        className="absolute top-0 left-0"
        style={{ width: flight.size, height: flight.size, perspective: 500, filter: 'drop-shadow(0 14px 12px rgba(29,36,64,0.35))' }}
        initial={{ x: flight.xs[0], y: flight.ys[0], scale: flight.scales[0] }}
        animate={{ x: flight.xs, y: flight.ys, scale: flight.scales }}
        transition={{ duration: flight.duration, times: flight.times, ease: 'easeInOut' }}
        onAnimationComplete={onDone}
      >
        <motion.div
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
          initial={{ rotateX: flight.rx[0], rotateY: flight.ry[0] }}
          animate={{ rotateX: flight.rx, rotateY: flight.ry }}
          transition={{ duration: flight.duration, times: flight.times, ease: 'easeOut' }}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Face key={n} n={n} half={flight.size / 2} />
          ))}
        </motion.div>
      </motion.div>
    </div>,
    document.body,
  );
}

/**
 * A 3D CSS die that tumbles to `value` each time `rollId` changes.
 * On a fresh roll a big copy also tumbles across the whole screen and returns home (purely visual:
 * it ignores the pointer and never touches game state). Reduced motion skips the flight.
 */
export function Die({ value, rollId, size = 64, reducedMotion, fast }: { value: number | null; rollId: number; size?: number; reducedMotion: boolean; fast?: boolean }) {
  const half = size / 2;
  const spins = useRef(0);
  const anchor = useRef<HTMLDivElement>(null);
  const lastValue = useRef<number | null>(value);
  const [rot, setRot] = useState({ x: -18, y: 24 });
  const [flight, setFlight] = useState<Flight | null>(null);
  useEffect(() => {
    if (!value) return;
    spins.current += 2;
    const f = FACE_ROT[value];
    setRot({ x: f.x + 360 * spins.current, y: f.y + 360 * spins.current });
  }, [value, rollId]);
  useEffect(() => {
    const prev = lastValue.current;
    lastValue.current = value;
    // Only a new roll flies: null → number, or a different number. Later board moves keep the same value.
    if (!value || value === prev || reducedMotion || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    if (!rect.width) return;
    setFlight(planFlight(rect, value, Date.now(), !!fast));
  }, [value, reducedMotion, fast]);
  return (
    <div ref={anchor} className="relative" style={{ width: size, height: size, perspective: 400 }} aria-label={value ? `Die shows ${value}` : 'Die not rolled yet'} role="img">
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d', opacity: flight ? 0 : 1 }}
        animate={{ rotateX: rot.x, rotateY: rot.y }}
        transition={{ duration: reducedMotion ? 0 : fast ? 0.35 : 0.9, ease: [0.2, 0.8, 0.25, 1] }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Face key={n} n={n} half={half} />
        ))}
      </motion.div>
      {flight && <FlyingDie key={flight.id} flight={flight} onDone={() => setFlight((f) => (f?.id === flight.id ? null : f))} />}
    </div>
  );
}
