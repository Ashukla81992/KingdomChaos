'use client';

import { Check, Copy, Crown, Link2, LogOut, Play } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GameScreen, type Presence } from '@/components/game/GameScreen';
import { ChatBody } from '@/components/game/MatchChat';
import { MenuShell } from '@/components/MenuShell';
import { TimerChoice } from '@/components/TimerChoice';
import type { MatchPace } from '@/engine';
import { useOnlineRoom } from '@/lib/onlineClient';
import { recordMatch, savedPace, savePace } from '@/lib/storage';

export default function RoomPage() {
  const { code: raw } = useParams<{ code: string }>();
  const code = (raw ?? '').toUpperCase();
  const router = useRouter();
  const { lobby, view, connection, error, send, start, endMatch, clockSkew, chat, sendChat } = useOnlineRoom(code);
  const chatController = useMemo(() => ({ messages: chat, send: sendChat }), [chat, sendChat]);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [timers, setTimers] = useState<MatchPace>('untimed');
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimers(savedPace());
  }, []);

  const presence = useMemo(() => {
    const p: Record<string, Presence> = {};
    for (const m of lobby?.seats ?? []) {
      p[m.playerId] = { connected: true, left: false, isHost: m.isHost };
    }
    return p;
  }, [lobby]);

  const recorded = useRef<number | null>(null);
  useEffect(() => {
    if (view?.status === 'finished' && view.result && recorded.current !== view.startedAt) {
      recorded.current = view.startedAt;
      recordMatch({
        at: new Date().toISOString(),
        mode: 'online',
        players: view.players.length,
        durationMs: view.result.durationMs,
        turns: view.result.turns,
        winners: view.result.winners,
        reason: view.result.reason,
      });
    }
  }, [view]);

  const exit = () => router.push('/');

  // A 404/410 means the room is really gone (not a network blip), so stop showing "Reconnecting…".
  if (error) {
    return (
      <MenuShell title="Room unavailable">
        <div className="panel space-y-4 p-5 text-center">
          <p role="alert" className="font-semibold">
            {lobby ? 'This room has closed, so the match cannot continue.' : error}
          </p>
          <Link className="btn btn-primary" href={`/online?code=${code}`}>
            Join room {code}
          </Link>
        </div>
      </MenuShell>
    );
  }

  if (!lobby) {
    return (
      <MenuShell title={`Room ${code}`}>
        <p className="panel p-5 text-center" role="status">
          Loading the room…
        </p>
      </MenuShell>
    );
  }

  const isHost = lobby.isHost;
  const inGame = (lobby.status === 'playing' || lobby.status === 'finished' || lobby.status === 'ended') && view && view.startedAt;

  if (inGame && view) {
    return (
      <GameScreen
        controller={{ view, send, mode: 'online', connection, presence, clockSkew, chat: lobby.youPlayerId ? chatController : undefined }}
        onExit={exit}
        hostEndMatch={
          isHost && lobby.status === 'playing'
            ? {
                label: 'End match',
                busy: ending,
                onClick: () => {
                  if (!window.confirm('End this match for everyone? There will be no winner.')) return;
                  setEnding(true);
                  void endMatch()
                    .then((r) => {
                      if (!r.ok) setStartError(r.error);
                    })
                    .finally(() => setEnding(false));
                },
              }
            : undefined
        }
        results={{
          secondary: { label: 'Leave to menu', onClick: exit },
        }}
      />
    );
  }

  const humanCount = lobby.seats.filter((s) => !s.isAI).length;
  const canStart = isHost && lobby.seats.length >= lobby.minPlayers;
  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/room/${lobby.code}` : '';

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? lobby.code : shareLink);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const doStart = async () => {
    setStartError(null);
    savePace(timers);
    const r = await start(timers);
    if (!r.ok) setStartError(r.error);
  };

  return (
    <MenuShell title="Lobby" back={null}>
      <div className="space-y-4">
        <div className="panel p-5 text-center">
          <div className="text-sm font-bold tracking-wide text-[#4a5374] uppercase">Room code</div>
          <div className="font-display mt-1 text-5xl font-bold tracking-[0.25em]" data-testid="room-code">
            {lobby.code}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button className="btn btn-ghost" onClick={() => copy('code')}>
              {copied === 'code' ? <Check size={18} /> : <Copy size={18} />} {copied === 'code' ? 'Copied!' : 'Copy code'}
            </button>
            <button className="btn btn-ghost" onClick={() => copy('link')}>
              {copied === 'link' ? <Check size={18} /> : <Link2 size={18} />} {copied === 'link' ? 'Copied!' : 'Copy invite link'}
            </button>
          </div>
          <p className="mt-2 text-sm text-[#4a5374]" role="status">
            {connection === 'connected' ? 'Connected' : connection === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
          </p>
        </div>

        <div className="panel p-5">
          <h3 className="mb-3 text-lg font-semibold">
            Players {lobby.seats.length}/{lobby.seatCount}
          </h3>
          <ul className="space-y-2" aria-label="Players in lobby">
            {lobby.seats.map((p) => (
              <li key={p.playerId} className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2">
                <span className="h-3 w-3 rounded-full bg-[#2fd17a]" aria-hidden="true" />
                <span className="font-display flex-1 truncate font-semibold">
                  {p.username} {p.isYou && <span className="text-sm text-[#4a5374]">(you)</span>}
                  {p.isAI && <span className="text-sm text-[#4a5374]"> · AI</span>}
                </span>
                {p.isHost && (
                  <span className="flex items-center gap-1 rounded-full bg-[#fff1b8] px-2 py-0.5 text-xs font-bold text-[#6b4a00]">
                    <Crown size={13} aria-hidden="true" /> Host
                  </span>
                )}
              </li>
            ))}
            {Array.from({ length: Math.max(0, lobby.seatCount - lobby.seats.length) }, (_, i) => (
              <li key={`empty-${i}`} className="rounded-2xl border-2 border-dashed border-[#e3d6b6] px-3 py-2 text-sm text-[#8a8370]">
                Waiting for a player…
              </li>
            ))}
          </ul>
          {isHost && (
            <div className="mt-4">
              <TimerChoice value={timers} onChange={setTimers} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {isHost ? (
              <button className="btn btn-primary flex-1" onClick={doStart} disabled={!canStart}>
                <Play size={18} aria-hidden="true" /> Start match
              </button>
            ) : (
              <p className="flex-1 self-center text-sm text-[#4a5374]">Waiting for the host to start…</p>
            )}
            <button className="btn btn-ghost" onClick={exit}>
              <LogOut size={18} aria-hidden="true" /> Leave
            </button>
          </div>
          {isHost && !canStart && <p className="mt-2 text-sm text-[#4a5374]">At least {lobby.minPlayers} players are needed to start ({humanCount} joined).</p>}
          {startError && (
            <p role="alert" className="mt-2 font-semibold text-[#8c2a10]">
              {startError}
            </p>
          )}
        </div>
        {lobby.youPlayerId && (
          <div className="panel flex h-[22rem] flex-col p-5" data-lobby-chat>
            <h3 className="mb-2 text-lg font-semibold">Chat</h3>
            <ChatBody chat={chatController} me={lobby.youPlayerId} view={null} />
          </div>
        )}
      </div>
    </MenuShell>
  );
}
