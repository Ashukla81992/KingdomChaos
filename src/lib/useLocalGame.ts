'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPlayerView, type GameAction, type GameConfig, type GameState, type NewPlayer, type PlayerView } from '@/engine';
import { GameRunner } from '@/runner/GameRunner';
import { clearLocalSave, loadLocalSave, recordMatch, saveLocalGame, type LocalSave } from './storage';
import type { SendResult } from '@/components/game/GameScreen';

export interface LocalSetup {
  players: NewPlayer[];
  config?: Partial<GameConfig>;
  mode: 'practice' | 'hotseat';
}

/**
 * Runs a match in the browser with the same GameRunner the server uses.
 * `viewerFor` picks whose hand is visible (fixed for practice, current player for hot-seat).
 * Saves after every accepted action; can resume from localStorage.
 */
export function useLocalGame(setup: LocalSetup | null, viewerFor: (s: GameState) => string, opts?: { resume?: LocalSave | null; persist?: boolean }) {
  const runner = useRef<GameRunner | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [gen, setGen] = useState(0);
  const viewerRef = useRef(viewerFor);
  const setupRef = useRef(setup);
  const persist = opts?.persist !== false;
  useEffect(() => {
    viewerRef.current = viewerFor;
  }, [viewerFor]);
  useEffect(() => {
    setupRef.current = setup;
  }, [setup]);

  useEffect(() => {
    if (!setup && !opts?.resume) return;
    const resumed = opts?.resume;
    const activeSetup = setup ?? (resumed
      ? {
          mode: resumed.mode,
          players: resumed.setup.players,
          config: resumed.setup.config as Partial<GameConfig> | undefined,
        }
      : null);
    if (!activeSetup) return;

    const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
    const r = new GameRunner({
      players: activeSetup.players,
      seed,
      config: activeSetup.config,
      initialState: resumed?.state,
      onUpdate: (s) => {
        setState(s);
        if (persist) {
          saveLocalGame({
            version: 2,
            mode: activeSetup.mode,
            setup: { players: activeSetup.players, config: activeSetup.config as Record<string, unknown> | undefined },
            state: s,
            savedAt: Date.now(),
          });
        }
        if (s.status === 'finished' && s.result) {
          recordMatch({
            at: new Date().toISOString(),
            mode: activeSetup.mode,
            players: s.players.length,
            durationMs: s.result.durationMs,
            turns: s.result.turns,
            winners: s.result.winners,
            reason: s.result.reason,
          });
          if (persist) clearLocalSave(activeSetup.mode);
        }
      },
    });
    runner.current = r;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(r.state);
    if (persist && !resumed) {
      saveLocalGame({
        version: 2,
        mode: activeSetup.mode,
        setup: { players: activeSetup.players, config: activeSetup.config as Record<string, unknown> | undefined },
        state: r.state,
        savedAt: Date.now(),
      });
    }
    return () => {
      r.dispose();
      runner.current = null;
    };
    // opts.resume is intentionally captured at mount/gen for a given setup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, gen, persist]);

  const view: PlayerView | null = useMemo(() => (state ? toPlayerView(state, viewerFor(state)) : null), [state, viewerFor]);

  const send = useCallback(async (action: GameAction): Promise<SendResult> => {
    const r = runner.current;
    if (!r) return { ok: false, error: 'No game running.' };
    const pid = viewerRef.current(r.state);
    const result = r.dispatch(pid, action, r.state.version);
    return result;
  }, []);

  /** Hot-seat: dispatch as a specific player (trade responses while it is someone else's turn). */
  const sendAs = useCallback(async (playerId: string, action: GameAction): Promise<SendResult> => {
    const r = runner.current;
    if (!r) return { ok: false, error: 'No game running.' };
    return r.dispatch(playerId, action, r.state.version);
  }, []);

  const restart = useCallback(() => {
    clearLocalSave(setupRef.current?.mode);
    setGen((g) => g + 1);
  }, []);

  return { view, state, send, sendAs, restart };
}

export { loadLocalSave };
