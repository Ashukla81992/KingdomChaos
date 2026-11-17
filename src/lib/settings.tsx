'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from './storage';
import { playSound, type SoundName } from './sound';

export interface Settings {
  volume: number;
  muted: boolean;
  motion: 'system' | 'reduced' | 'full';
  /** Shortens camera moves and the die tumble. */
  pace: 'normal' | 'fast';
  /** Wide screens: show the rules column beside the board, or fold it away so the board gets the room. */
  rulesRail?: 'open' | 'folded';
}

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
