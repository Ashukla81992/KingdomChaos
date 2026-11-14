'use client';

import { useEffect, useState } from 'react';

/** Current time, refreshed on an interval (for countdowns). */
export function useNow(intervalMs = 250, offset = 0): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, offset]);
  return now;
}

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
