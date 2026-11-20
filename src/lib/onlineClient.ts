'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction, MatchPace, PlayerView } from '@/engine';
import type { RoomGetResponse, RoomLobbyView } from '@/server/protocol';
import type { SendResult } from '@/components/game/GameScreen';

export type AccountInfo = { id: string; username: string };

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T; status: number } | { ok: false; error: string; status: number; data?: T }> {
  try {
    const res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      credentials: 'include',
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, error: data.error || (res.status >= 500 ? 'The game server hit a problem. Please try again in a moment.' : `Request failed (${res.status})`), status: res.status, data };
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false, error: 'Could not reach the game server. Try again.', status: 0 };
  }
}

export async function fetchAuthProviders() {
  return api<{ google: boolean }>('/api/auth/providers');
}

export async function fetchMe() {
  return api<{ account: AccountInfo }>('/api/auth/me');
}

export async function registerAccount(username: string, password: string) {
  return api<{ account: AccountInfo }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function loginAccount(username: string, password: string) {
  return api<{ account: AccountInfo }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function logoutAccount() {
  return api<{ ok: true }>('/api/auth/logout', { method: 'POST', body: '{}' });
}

export async function createOnlineRoom(opts: { seatCount?: number; pace?: MatchPace; fillAi?: boolean } = {}) {
  return api<RoomGetResponse>('/api/rooms', { method: 'POST', body: JSON.stringify(opts) });
}

export async function joinOnlineRoom(code: string) {
  return api<RoomGetResponse>(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body: '{}' });
}

export async function getOnlineRoom(code: string) {
  return api<RoomGetResponse>(`/api/rooms/${encodeURIComponent(code)}`);
}

export async function startOnlineRoom(code: string, pace?: MatchPace) {
  return api<RoomGetResponse>(`/api/rooms/${encodeURIComponent(code)}/start`, { method: 'POST', body: JSON.stringify({ pace }) });
}

export async function endOnlineRoom(code: string) {
  return api<RoomGetResponse>(`/api/rooms/${encodeURIComponent(code)}/end`, { method: 'POST', body: '{}' });
}

export async function sendOnlineAction(code: string, action: GameAction, version: number, clientActionId: string) {
  return api<RoomGetResponse>(`/api/rooms/${encodeURIComponent(code)}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action, version, clientActionId }),
  });
}

const POLL_MS = 1500;

export type OnlineConnection = 'connected' | 'reconnecting' | 'offline';

export function useOnlineRoom(code: string) {
  const [lobby, setLobby] = useState<RoomLobbyView | null>(null);
  const [view, setView] = useState<(PlayerView & { serverNow?: number }) | null>(null);
  const [connection, setConnection] = useState<OnlineConnection>('reconnecting');
  const [error, setError] = useState<string | null>(null);
  const [clockSkew, setClockSkew] = useState(0);
  const versionRef = useRef(0);
  const pendingIds = useRef(new Map<string, GameAction>());

  const applyPayload = useCallback((data: RoomGetResponse) => {
    setLobby(data.lobby);
    if (data.view) {
      if (data.view.serverNow) setClockSkew(data.view.serverNow - Date.now());
      setView(data.view);
      versionRef.current = data.view.version;
    } else {
      setView(null);
    }
    setConnection('connected');
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    const r = await getOnlineRoom(code);
    if (!r.ok) {
      if (r.status === 410 || r.status === 404) setError(r.error);
      setConnection(r.status === 0 ? 'offline' : 'reconnecting');
      return r;
    }
    applyPayload(r.data);
    return r;
  }, [applyPayload, code]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      timer = setTimeout(loop, POLL_MS);
    };
    void loop();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  const send = useCallback(
    async (action: GameAction): Promise<SendResult> => {
      const clientActionId = crypto.randomUUID();
      pendingIds.current.set(clientActionId, action);
      const version = versionRef.current;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await sendOnlineAction(code, action, versionRef.current || version, clientActionId);
        if (r.ok) {
          pendingIds.current.delete(clientActionId);
          applyPayload(r.data);
          return { ok: true };
        }
        if (r.status === 409 && r.data) {
          applyPayload(r.data as RoomGetResponse);
          // Stale version: retry once with the same clientActionId and fresh version
          continue;
        }
        if (r.status === 400) {
          pendingIds.current.delete(clientActionId);
          return { ok: false, error: r.error };
        }
        // Network blip — retry same clientActionId
        await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
      }
      pendingIds.current.delete(clientActionId);
      return { ok: false, error: 'Could not send that move. Try again.' };
    },
    [applyPayload, code],
  );

  const start = useCallback(
    async (pace?: MatchPace) => {
      const r = await startOnlineRoom(code, pace);
      if (!r.ok) return r;
      applyPayload(r.data);
      return r;
    },
    [applyPayload, code],
  );

  const endMatch = useCallback(async () => {
    const r = await endOnlineRoom(code);
    if (!r.ok) return r;
    applyPayload(r.data);
    return r;
  }, [applyPayload, code]);

  return { lobby, view, connection, error, send, start, endMatch, refresh, clockSkew };
}
