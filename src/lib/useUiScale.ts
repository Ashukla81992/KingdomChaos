'use client';
import { useEffect, useState } from 'react';

/**
 * How much the interface is scaled up: the root font size over 16px. It is 1 except on big monitors
 * and TVs (see globals.css), where pixel-sized art such as the die and piece icons grows with the text.
 */
export function useUiScale(): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const read = () => setScale(Math.max(1, (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16));
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);
  return scale;
}
