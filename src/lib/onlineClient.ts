'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction, MatchPace, PlayerView } from '@/engine';
import type { ChatMessage, RoomGetResponse, RoomLobbyView, VoiceSignal } from '@/server/protocol';
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

export async function getOnlineRoom(code: string, chatAfter?: number) {
  const q = chatAfter === undefined ? '' : `?chatAfter=${chatAfter}`;
  return api<RoomGetResponse>(`/api/rooms/${encodeURIComponent(code)}${q}`);
}

export type SignalOut =
  | { kind: 'hello' | 'bye'; to: string }
  | { kind: 'offer' | 'answer'; to: string; data: { type: 'offer' | 'answer'; sdp: string } };

export async function sendVoiceSignal(code: string, signal: SignalOut) {
  return api<{ ok: true }>(`/api/rooms/${encodeURIComponent(code)}/signal`, { method: 'POST', body: JSON.stringify(signal), keepalive: true });
}

export async function reportOnlinePlayer(code: string, playerId: string, reason: string) {
  return api<{ ok: true }>(`/api/rooms/${encodeURIComponent(code)}/report`, { method: 'POST', body: JSON.stringify({ playerId, reason }) });
}

export async function fetchIceServers() {
  return api<{ iceServers: RTCIceServer[] }>('/api/voice/ice');
}

export async function sendChatMessage(code: string, text: string) {
  return api<{ message: ChatMessage }>(`/api/rooms/${encodeURIComponent(code)}/chat`, { method: 'POST', body: JSON.stringify({ text }) });
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
/** Faster polling while a voice call is being set up, so it connects in a couple of seconds. */
const FAST_POLL_MS = 400;
/** Chat lines kept on screen; older ones scroll away. */
const CHAT_KEEP = 200;

export type OnlineConnection = 'connected' | 'reconnecting' | 'offline';

export function useOnlineRoom(code: string) {
  const [lobby, setLobby] = useState<RoomLobbyView | null>(null);
  const [view, setView] = useState<(PlayerView & { serverNow?: number }) | null>(null);
  const [connection, setConnection] = useState<OnlineConnection>('reconnecting');
  const [error, setError] = useState<string | null>(null);
  const [clockSkew, setClockSkew] = useState(0);
  const versionRef = useRef(0);
  const pendingIds = useRef(new Map<string, GameAction>());
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const signalListeners = useRef(new Set<(s: VoiceSignal[]) => void>());
  /** Poll quickly until this time (while a voice call is connecting). */
  const fastUntil = useRef(0);
  const chatAfterRef = useRef(0);

  const addChat = useCallback((incoming: ChatMessage[] | undefined) => {
    if (!incoming?.length) return;
    chatAfterRef.current = Math.max(chatAfterRef.current, ...incoming.map((m) => m.id));
    setChat((cur) => {
      const seen = new Set(cur.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (!fresh.length) return cur;
      return [...cur, ...fresh].sort((a, b) => a.id - b.id).slice(-CHAT_KEEP);
    });
  }, []);

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
    const r = await getOnlineRoom(code, chatAfterRef.current);
    if (!r.ok) {
      if (r.status === 410 || r.status === 404) setError(r.error);
      setConnection(r.status === 0 ? 'offline' : 'reconnecting');
      return r;
    }
    applyPayload(r.data);
    if (r.data.chat?.length === 0 && r.data.lobby.status !== 'lobby' && r.data.lobby.status !== 'playing') {
      // The match is over: the server wiped this session's chat, so clear it here too.
      setChat([]);
    }
    addChat(r.data.chat);
    if (r.data.signals?.length) for (const fn of signalListeners.current) fn(r.data.signals);
    return r;
  }, [addChat, applyPayload, code]);

  const sendChat = useCallback(
    async (text: string): Promise<SendResult> => {
      const r = await sendChatMessage(code, text);
      if (!r.ok) return { ok: false, error: r.error };
      addChat([r.data.message]);
      return { ok: true };
    },
    [addChat, code],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const loop = async () => {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      timer = setTimeout(loop, Date.now() < fastUntil.current ? FAST_POLL_MS : POLL_MS);
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

  const onSignals = useCallback((fn: (s: VoiceSignal[]) => void) => {
    signalListeners.current.add(fn);
    return () => {
      signalListeners.current.delete(fn);
    };
  }, []);
  const sendSignal = useCallback(
    (signal: SignalOut) => {
      fastUntil.current = Date.now() + 8000;
      return sendVoiceSignal(code, signal);
    },
    [code],
  );
  const pollFast = useCallback((ms = 8000) => {
    fastUntil.current = Math.max(fastUntil.current, Date.now() + ms);
  }, []);
  const report = useCallback((playerId: string, reason: string) => reportOnlinePlayer(code, playerId, reason), [code]);

  return { lobby, view, connection, error, send, start, endMatch, refresh, clockSkew, chat, sendChat, onSignals, sendSignal, pollFast, report };
}
