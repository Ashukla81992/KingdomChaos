'use client';

import { Check, Copy, Crown, Link2, LogOut, Play, Wifi, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GameScreen } from '@/components/game/GameScreen';
import { RealtimeNotice } from '@/components/RealtimeNotice';
import { realtimeAvailable } from '@/lib/realtime';
import type { Presence } from '@/components/game/Panels';
import { MenuShell } from '@/components/MenuShell';
import { recordMatch } from '@/lib/storage';
import { useRoom } from '@/lib/socket';

export default function RoomPage() {
  if (!realtimeAvailable) {
    return (
      <MenuShell title="Play with Friends">
        <RealtimeNotice />
      </MenuShell>
    );
  }
  return <RoomLive />;
}

function RoomLive() {
  const { code: raw } = useParams<{ code: string }>();
  const code = (raw ?? '').toUpperCase();
  const router = useRouter();
  const { room, view, connection, error, send, leave, clockSkew, socket } = useRoom(code);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const presence = useMemo(() => {
    const p: Record<string, Presence> = {};
    for (const m of room?.players ?? []) p[m.id] = { connected: m.connected, left: m.left, isHost: m.isHost };
    return p;
  }, [room]);

  const recorded = useRef<number | null>(null);
  useEffect(() => {
    if (view?.status === 'finished' && view.result && recorded.current !== view.startedAt) {
      recorded.current = view.startedAt;
      recordMatch({ at: new Date().toISOString(), mode: 'online', players: view.players.length, durationMs: view.result.durationMs, turns: view.result.turns, winners: view.result.winners, reason: view.result.reason });
    }
  }, [view]);

  const exit = async () => {
    await leave();
    router.push('/');
  };

  if (error && !room) {
    return (
      <MenuShell title="Room unavailable">
        <div className="panel space-y-4 p-5 text-center">
          <p role="alert" className="font-semibold">
            {error}
          </p>
          <Link className="btn btn-primary" href={`/online?code=${code}`}>
            Join room {code}
          </Link>
        </div>
      </MenuShell>
    );
  }

  if (!room) {
    return (
      <MenuShell title={`Room ${code}`}>
        <p className="panel p-5 text-center" role="status">
          Connecting to the room…
        </p>
      </MenuShell>
    );
  }

  const isHost = room.hostId === room.you;
  const inGame = (room.status === 'playing' || room.status === 'finished') && view && view.startedAt;

  if (inGame && view) {
    return (
      <GameScreen
        controller={{ view, send, mode: 'online', connection, presence, clockSkew }}
        onExit={exit}
        results={{
          primary: isHost
            ? {
                label: 'Back to lobby',
                onClick: () => socket.current?.emit('room:toLobby', (r) => !r.ok && setStartError(r.error)),
              }
            : undefined,
          secondary: { label: 'Leave to menu', onClick: exit },
        }}
      />
    );
  }

  const me = room.players.find((p) => p.id === room.you);
  const connectedCount = room.players.filter((p) => p.connected).length;
  const canStart = isHost && room.players.length >= room.minPlayers;
  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/online?code=${room.code}` : '';

  const copy = async (what: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(what === 'code' ? room.code : shareLink);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  const start = () => {
    setStartError(null);
    socket.current?.emit('room:start', (r) => !r.ok && setStartError(r.error));
  };

  return (
    <MenuShell title="Lobby" back={null}>
      <div className="space-y-4">
        <div className="panel p-5 text-center">
          <div className="text-sm font-bold tracking-wide text-[#4a5374] uppercase">Room code</div>
          <div className="font-display mt-1 text-5xl font-bold tracking-[0.25em]" data-testid="room-code">
            {room.code}
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
            Players {room.players.length}/{room.maxPlayers}
          </h3>
          <ul className="space-y-2" aria-label="Players in lobby">
            {room.players.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/80 px-3 py-2">
                <span className={`h-3 w-3 rounded-full ${p.connected ? 'bg-[#2fd17a]' : 'bg-[#e5484d]'}`} aria-hidden="true" />
                <span className="font-display flex-1 truncate font-semibold">
                  {p.name} {p.id === room.you && <span className="text-sm text-[#4a5374]">(you)</span>}
                </span>
                {p.isHost && (
                  <span className="flex items-center gap-1 rounded-full bg-[#fff1b8] px-2 py-0.5 text-xs font-bold text-[#6b4a00]">
                    <Crown size={13} aria-hidden="true" /> Host
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.ready ? 'bg-[#d8f5e4] text-[#155c36]' : 'bg-[#eee] text-[#555]'}`}>{p.ready ? 'Ready' : 'Not ready'}</span>
                <span className="sr-only">{p.connected ? 'connected' : 'disconnected'}</span>
                {p.connected ? <Wifi size={16} className="text-[#155c36]" aria-hidden="true" /> : <WifiOff size={16} className="text-[#8c2a10]" aria-hidden="true" />}
              </li>
            ))}
            {Array.from({ length: room.maxPlayers - room.players.length }, (_, i) => (
              <li key={`empty-${i}`} className="rounded-2xl border-2 border-dashed border-[#e3d6b6] px-3 py-2 text-sm text-[#8a8370]">
                Waiting for a player…
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={`btn ${me?.ready ? 'btn-green' : 'btn-ghost'}`} aria-pressed={!!me?.ready} onClick={() => socket.current?.emit('room:ready', { ready: !me?.ready })}>
              <Check size={18} aria-hidden="true" /> {me?.ready ? 'Ready!' : "I'm ready"}
            </button>
            {isHost ? (
              <button className="btn btn-primary flex-1" onClick={start} disabled={!canStart}>
                <Play size={18} aria-hidden="true" /> Start match
              </button>
            ) : (
              <p className="flex-1 self-center text-sm text-[#4a5374]">Waiting for the host to start…</p>
            )}
            <button className="btn btn-ghost" onClick={exit}>
              <LogOut size={18} aria-hidden="true" /> Leave
            </button>
          </div>
          {isHost && !canStart && <p className="mt-2 text-sm text-[#4a5374]">At least {room.minPlayers} players are needed to start.</p>}
          {isHost && canStart && connectedCount < room.players.length && <p className="mt-2 text-sm text-[#8c2a10]">Disconnected players will be removed when you start.</p>}
          {startError && (
            <p role="alert" className="mt-2 font-semibold text-[#8c2a10]">
              {startError}
            </p>
          )}
        </div>
      </div>
    </MenuShell>
  );
}
