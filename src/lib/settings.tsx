'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from './storage';
import { playSound, unlockAudio, type SoundName } from './sound';

export interface Settings {
  volume: number;
  muted: boolean;
  motion: 'system' | 'reduced' | 'full';
  /** Shortens camera moves and the die tumble. */
  pace: 'normal' | 'fast';
  /** Wide screens: show the rules column beside the board, or fold it away so the board gets the room. */
  rulesRail?: 'open' | 'folded';
  /** How landmarks are drawn on the map. Names show on hover in the quieter styles. */
  markers?: MarkerStyle;
}

export type MarkerStyle = 'minimal' | 'medallion' | 'labelled';
export const MARKER_STYLES: { id: MarkerStyle; name: string; hint: string }[] = [
  { id: 'minimal', name: 'Minimal', hint: 'Small icons, names on hover' },
  { id: 'medallion', name: 'Medallion', hint: 'Framed icons, names on hover' },
  { id: 'labelled', name: 'Labelled', hint: 'Framed icons with small names' },
];

const DEFAULTS: Settings = { volume: 0.4, muted: false, motion: 'system', pace: 'normal' };
const KEY = 'kc:settings';

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reducedMotion: boolean;
  play: (s: SoundName) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  useEffect(() => {
    // Hydrate from storage after mount to avoid SSR mismatches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(readJSON(KEY, DEFAULTS));
  }, []);
  const systemReduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      writeJSON(KEY, next);
      return next;
    });
  }, []);
  useEffect(() => {
    // Browsers keep audio locked until a user gesture: unlock on the first tap or key press.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  const reducedMotion = settings.motion === 'reduced' || (settings.motion === 'system' && systemReduced);
  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
  }, [reducedMotion]);
  const play = useCallback(
    (s: SoundName) => {
      if (!settings.muted) playSound(s, settings.volume);
    },
    [settings.muted, settings.volume],
  );
  const value = useMemo(() => ({ settings, update, reducedMotion, play }), [settings, update, reducedMotion, play]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings outside provider');
  return v;
}
