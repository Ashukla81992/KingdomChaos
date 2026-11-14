'use client';

import { io, type Socket } from 'socket.io-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction, PlayerView } from '@/engine';
import type { ClientToServer, RoomSnapshot, ServerToClient, SessionInfo } from '@/server/protocol';

export type ClientSocket = Socket<ServerToClient, ClientToServer>;

let shared: ClientSocket | null = null;

export function getSocket(): ClientSocket {
  if (!shared) {
    shared = io({ path: '/socket.io', transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 3000 });
  }
  return shared;
}

const SESSION_KEY = 'kc:session';

/** Sessions live in sessionStorage: they survive reloads and reconnects in the same tab. */
export function loadSession(code?: string): SessionInfo | null {
  try {
    const s = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? 'null') as SessionInfo | null;
    if (!s || (code && s.code !== code.toUpperCase())) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSession(s: SessionInfo | null) {
  try {
    if (s) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export type Connection = 'connected' | 'reconnecting' | 'offline';

export function useRoom(code: string) {
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [connection, setConnection] = useState<Connection>('reconnecting');
  const [error, setError] = useState<string | null>(null);
  const [clockSkew, setClockSkew] = useState(0);
  const socketRef = useRef<ClientSocket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    const resume = () => {
      const s = loadSession(code);
      if (!s) {
        setError('You are not part of this room. Join it with the room code first.');
        return;
      }
      socket.emit('room:resume', { code: s.code, playerId: s.playerId, token: s.token }, (r) => {
        if (r.ok) {
          setError(null);
          setConnection('connected');
        } else {
          saveSession(null);
          setError(r.error);
        }
      });
    };
    const onConnect = () => resume();
    const onDisconnect = () => setConnection('reconnecting');
    const onFail = () => setConnection('offline');
    const onRoom = (r: RoomSnapshot) => setRoom(r);
    const onView = (v: PlayerView & { serverNow?: number }) => {
      if (v.serverNow) setClockSkew(v.serverNow - Date.now());
      setView(v);
    };
    const onClosed = (reason: string) => {
      setError(reason);
      setConnection('offline');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_failed', onFail);
    socket.on('connect_error', onDisconnect);
    socket.on('room:update', onRoom);
    socket.on('game:view', onView);
    socket.on('room:closed', onClosed);
    if (socket.connected) resume();
    else socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_failed', onFail);
      socket.off('connect_error', onDisconnect);
      socket.off('room:update', onRoom);
      socket.off('game:view', onView);
      socket.off('room:closed', onClosed);
    };
  }, [code]);

  const version = view?.version ?? 0;
  const send = useCallback(
    async (action: GameAction) => {
      const socket = socketRef.current;
      if (!socket?.connected) return { ok: false as const, error: 'Not connected — reconnecting…' };
      try {
        return await socket.timeout(5000).emitWithAck('game:action', { action, version });
      } catch {
        return { ok: false as const, error: 'The server did not answer. Try again.' };
      }
    },
    [version],
  );

  const leave = useCallback(async () => {
    const socket = socketRef.current;
    saveSession(null);
    if (socket?.connected) await socket.timeout(2000).emitWithAck('room:leave').catch(() => undefined);
  }, []);

  return { room, view, connection, error, send, leave, clockSkew, socket: socketRef };
}
