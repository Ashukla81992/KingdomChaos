'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

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

/** A 3D CSS die that tumbles to `value` each time `rollId` changes. */
export function Die({ value, rollId, size = 64, reducedMotion, fast }: { value: number | null; rollId: number; size?: number; reducedMotion: boolean; fast?: boolean }) {
  const half = size / 2;
  const spins = useRef(0);
  const [rot, setRot] = useState({ x: -18, y: 24 });
  useEffect(() => {
    if (!value) return;
    spins.current += 2;
    const f = FACE_ROT[value];
    setRot({ x: f.x + 360 * spins.current, y: f.y + 360 * spins.current });
  }, [value, rollId]);
  return (
    <div className="relative" style={{ width: size, height: size, perspective: 400 }} aria-label={value ? `Die shows ${value}` : 'Die not rolled yet'} role="img">
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateX: rot.x, rotateY: rot.y }}
        transition={{ duration: reducedMotion ? 0 : fast ? 0.35 : 0.9, ease: [0.2, 0.8, 0.25, 1] }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Face key={n} n={n} half={half} />
        ))}
      </motion.div>
    </div>
  );
}
