'use client';

import { Minus, Play, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmblemBadge } from '@/components/art/art';
import { GameScreen } from '@/components/game/GameScreen';
import { TimerChoice } from '@/components/TimerChoice';
import { MenuShell } from '@/components/MenuShell';
import { CROWN_QUEST, ROOM_CONFIG, type GameState } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { clearLocalSave, loadLocalSave, savedPace, savePace, type LocalSave } from '@/lib/storage';
import { paceConfig, type MatchPace } from '@/engine';
import { useLocalGame, type LocalSetup } from '@/lib/useLocalGame';

type Handoff =
  | { kind: 'turn'; playerId: string; turnNumber: number }
  | { kind: 'trade'; playerId: string; offerId: string };

export default function HotseatPage() {
  const router = useRouter();
  const [names, setNames] = useState(['Player 1', 'Player 2']);
  const [timers, setTimers] = useState<MatchPace>('untimed');
  const [setup, setSetup] = useState<LocalSetup | null>(null);
  const [resume, setResume] = useState<LocalSave | null>(null);
  const [revealed, setRevealed] = useState<Handoff | null>(null);
  const [savedOffer, setSavedOffer] = useState<{ path: string | null }>({ path: null });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimers(savedPace());
    const existing = loadLocalSave('hotseat');
    if (existing && existing.state.status === 'playing') setSavedOffer({ path: 'resume' });
  }, []);

  const viewer = useCallback((s: GameState) => {
    // While waiting on a trade reply from another human, show that player's private view after handoff.
    const pending = (s.trades ?? []).find((t) => {
      const to = s.players.find((p) => p.id === t.to);
      return to && !to.isAI;
    });
    if (pending && revealed?.kind === 'trade' && revealed.offerId === pending.id && revealed.playerId === pending.to) {
      return pending.to;
    }
    return s.turn.playerId;
  }, [revealed]);

  const { view, state, send, restart } = useLocalGame(setup, viewer, { resume, persist: true });

  // Detect trade handoffs aimed at another human on this device.
  const pendingTrade = useMemo(() => {
    if (!state || state.status !== 'playing') return null;
    return (state.trades ?? []).find((t) => {
      const to = state.players.find((p) => p.id === t.to);
      return !!to && !to.isAI && t.to !== state.turn.playerId;
    }) ?? null;
  }, [state]);

  useEffect(() => {
    if (!view || view.status !== 'playing') return;
    if (pendingTrade) {
      if (revealed?.kind === 'trade' && revealed.offerId === pendingTrade.id) return;
      setRevealed(null);
      return;
    }
    if (revealed?.kind === 'turn' && revealed.turnNumber === view.turn.number && revealed.playerId === view.turn.playerId) return;
    if (revealed?.kind === 'trade') setRevealed(null);
  }, [view, pendingTrade, revealed]);

  if (savedOffer.path === 'resume' && !setup && !resume) {
    const existing = loadLocalSave('hotseat');
    return (
      <MenuShell title="Play on This Device">
        <div className="panel space-y-4 p-5 text-center">
          <h2 className="text-xl font-bold">Resume your match?</h2>
          <p className="text-sm text-[#4a5374]">A same-device game is saved on this browser.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!existing) return;
                setResume(existing);
                setSetup({
                  mode: 'hotseat',
                  players: existing.setup.players,
                  config: existing.setup.config as LocalSetup['config'],
                });
                setSavedOffer({ path: null });
              }}
            >
              Resume
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                clearLocalSave();
                setSavedOffer({ path: null });
              }}
            >
              New game
            </button>
          </div>
        </div>
      </MenuShell>
    );
  }

  if (setup && view && state) {
    const currentId = pendingTrade && (!revealed || revealed.kind !== 'trade' || revealed.offerId !== pendingTrade.id)
      ? pendingTrade.to
      : view.turn.playerId;
    const current = view.players.find((p) => p.id === currentId) ?? view.players.find((p) => p.id === view.turn.playerId)!;
    const needsHandoff =
      view.status === 'playing' &&
      (pendingTrade
        ? !(revealed?.kind === 'trade' && revealed.offerId === pendingTrade.id && revealed.playerId === pendingTrade.to)
        : !(revealed?.kind === 'turn' && revealed.turnNumber === view.turn.number && revealed.playerId === view.turn.playerId));

    return (
      <>
        <GameScreen
          controller={{ view, send, mode: 'hotseat' }}
          onExit={() => router.push('/')}
          results={{ primary: { label: 'Play again', onClick: () => (setRevealed(null), restart()) }, secondary: { label: 'Main menu', onClick: () => router.push('/') } }}
        />
        {needsHandoff && (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: `linear-gradient(160deg, ${seatTheme(current.seat).light}, #fffaf0)` }} role="dialog" aria-modal="true" aria-labelledby="pass-title">
            <div className="panel max-w-sm p-6 text-center">
              <div className="flex justify-center">
                <EmblemBadge theme={seatTheme(current.seat)} size={72} />
              </div>
              <h2 id="pass-title" className="mt-3 text-2xl font-bold">
                Pass the device to {current.name}
              </h2>
              <p className="mt-1 text-[#4a5374]">
                {pendingTrade
                  ? `${current.name} has a trade offer to answer. Hands stay hidden until they are ready.`
                  : `Hands stay hidden until ${current.name} is ready.${view.config.turnDurationMs > 0 ? ' The turn timer is already running.' : ' There is no timer.'}`}
              </p>
              <button
                className="btn btn-primary mt-4 w-full text-lg"
                onClick={() =>
                  setRevealed(
                    pendingTrade
                      ? { kind: 'trade', playerId: pendingTrade.to, offerId: pendingTrade.id }
                      : { kind: 'turn', playerId: view.turn.playerId, turnNumber: view.turn.number },
                  )
                }
                autoFocus
              >
                I&apos;m {current.name} — show my {pendingTrade ? 'cards' : 'turn'}
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
    clearLocalSave();
    setResume(null);
    setSetup({
      mode: 'hotseat',
      players: names.map((n, i) => ({ id: `p${i + 1}`, name: n.trim().slice(0, ROOM_CONFIG.maxNameLength) || `Player ${i + 1}` })),
      config: paceConfig(timers),
    });
  };

  const seats = CROWN_QUEST.seatOrder[names.length];

  return (
    <MenuShell title="Play on This Device">
      <form onSubmit={start} className="panel space-y-4 p-5">
        <p className="text-sm text-[#4a5374]">Take turns on one screen (2–4 players). Between turns — and for trade replies — a curtain hides private hands. Works offline with no account.</p>
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
