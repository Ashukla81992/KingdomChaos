'use client';

import { Minus, Play, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { EmblemBadge } from '@/components/art/art';
import { GameScreen } from '@/components/game/GameScreen';
import { TimerChoice } from '@/components/TimerChoice';
import { MenuShell } from '@/components/MenuShell';
import { CROWN_QUEST, ROOM_CONFIG, type GameState } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { savedPace, savePace } from '@/lib/storage';
import { paceConfig, type MatchPace } from '@/engine';
import { useLocalGame, type LocalSetup } from '@/lib/useLocalGame';

export default function HotseatPage() {
  const router = useRouter();
  const [names, setNames] = useState(['Player 1', 'Player 2']);
  const [timers, setTimers] = useState<MatchPace>('untimed');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimers(savedPace());
  }, []);
  const [setup, setSetup] = useState<LocalSetup | null>(null);
  const [revealedTurn, setRevealedTurn] = useState<number | null>(null);
  const viewer = useCallback((s: GameState) => s.turn.playerId, []);
  const { view, send, restart } = useLocalGame(setup, viewer);

  if (setup && view) {
    const current = view.players.find((p) => p.id === view.turn.playerId)!;
    const curtain = view.status === 'playing' && revealedTurn !== view.turn.number;
    return (
      <>
        <GameScreen
          controller={{ view, send, mode: 'hotseat' }}
          onExit={() => router.push('/')}
          results={{ primary: { label: 'Play again', onClick: () => (setRevealedTurn(null), restart()) }, secondary: { label: 'Main menu', onClick: () => router.push('/') } }}
        />
        {curtain && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: `linear-gradient(160deg, ${seatTheme(current.seat).light}, #fffaf0)` }} role="dialog" aria-modal="true" aria-labelledby="pass-title">
            <div className="panel max-w-sm p-6 text-center">
              <div className="flex justify-center">
                <EmblemBadge theme={seatTheme(current.seat)} size={72} />
              </div>
              <h2 id="pass-title" className="mt-3 text-2xl font-bold">
                Pass the device to {current.name}
              </h2>
              <p className="mt-1 text-[#4a5374]">
                Hands stay hidden until {current.name} is ready.{view.config.turnDurationMs > 0 ? ' The turn timer is already running.' : ' There is no timer.'}
              </p>
              <button className="btn btn-primary mt-4 w-full text-lg" onClick={() => setRevealedTurn(view.turn.number)} autoFocus>
                I&apos;m {current.name} — show my turn
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  const start = (e: React.FormEvent) => {
    e.preventDefault();
    savePace(timers);
    setSetup({
      mode: 'hotseat',
      players: names.map((n, i) => ({ id: `p${i + 1}`, name: n.trim().slice(0, ROOM_CONFIG.maxNameLength) || `Player ${i + 1}` })),
      config: paceConfig(timers),
    });
  };

  const seats = CROWN_QUEST.seatOrder[names.length];

  return (
    <MenuShell title="Hot-seat (same device)">
      <form onSubmit={start} className="panel space-y-4 p-5">
        <p className="text-sm text-[#4a5374]">Take turns on one screen. Between turns, a curtain hides the next player&apos;s cards.</p>
        {names.map((n, i) => (
          <label key={i} className="flex items-center gap-3">
            <EmblemBadge theme={seatTheme(seats[i])} size={34} />
            <span className="sr-only">Player {i + 1} name</span>
            <input className="field" value={n} maxLength={ROOM_CONFIG.maxNameLength} onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))} />
          </label>
        ))}
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" disabled={names.length <= 2} onClick={() => setNames(names.slice(0, -1))}>
            <Minus size={18} aria-hidden="true" /> Remove player
          </button>
          <button type="button" className="btn btn-ghost" disabled={names.length >= 4} onClick={() => setNames([...names, `Player ${names.length + 1}`])}>
            <Plus size={18} aria-hidden="true" /> Add player
          </button>
        </div>
        <TimerChoice value={timers} onChange={setTimers} />
        <button className="btn btn-primary w-full text-lg" type="submit">
          <Play size={20} aria-hidden="true" /> Start game
        </button>
      </form>
    </MenuShell>
  );
}
