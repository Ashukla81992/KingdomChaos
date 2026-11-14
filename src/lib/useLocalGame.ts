'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPlayerView, type GameAction, type GameConfig, type GameState, type NewPlayer, type PlayerView } from '@/engine';
import { GameRunner } from '@/runner/GameRunner';
import { recordMatch } from './storage';
import type { SendResult } from '@/components/game/GameScreen';

export interface LocalSetup {
  players: NewPlayer[];
  config?: Partial<GameConfig>;
  mode: 'practice' | 'hotseat';
}

/**
 * Runs a match in the browser with the same GameRunner the server uses.
 * `viewerFor` picks whose hand is visible (fixed for practice, current player for hot-seat).
 */
export function useLocalGame(setup: LocalSetup | null, viewerFor: (s: GameState) => string) {
  const runner = useRef<GameRunner | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [gen, setGen] = useState(0);
  const viewerRef = useRef(viewerFor);
  useEffect(() => {
    viewerRef.current = viewerFor;
  }, [viewerFor]);

  useEffect(() => {
    if (!setup) return;
    const seed = crypto.getRandomValues(new Uint32Array(1))[0] | 0;
    const r = new GameRunner({
      players: setup.players,
      seed,
      config: setup.config,
      onUpdate: (s) => {
        setState(s);
        if (s.status === 'finished' && s.result) {
          recordMatch({
            at: new Date().toISOString(),
            mode: setup.mode,
            players: s.players.length,
            durationMs: s.result.durationMs,
            turns: s.result.turns,
            winners: s.result.winners,
            reason: s.result.reason,
          });
        }
      },
    });
    runner.current = r;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(r.state);
    return () => {
      r.dispose();
      runner.current = null;
    };
  }, [setup, gen]);

  const view: PlayerView | null = useMemo(() => (state ? toPlayerView(state, viewerFor(state)) : null), [state, viewerFor]);

  const send = useCallback(async (action: GameAction): Promise<SendResult> => {
    const r = runner.current;
    if (!r) return { ok: false, error: 'No game running.' };
    const pid = viewerRef.current(r.state);
    return r.dispatch(pid, action, r.state.version);
  }, []);

  const restart = useCallback(() => setGen((g) => g + 1), []);
  return { view, state, send, restart };
}
