'use client';

import { DoorOpen, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MenuShell } from '@/components/MenuShell';
import { RealtimeNotice } from '@/components/RealtimeNotice';
import { realtimeAvailable } from '@/lib/realtime';
import { ROOM_CONFIG } from '@/engine';
import { getSocket, saveSession } from '@/lib/socket';
import { savedName, saveName } from '@/lib/storage';

function OnlineForms() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(savedName());
    setCode((params.get('code') ?? '').toUpperCase());
    const s = getSocket();
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    s.on('connect', on);
    s.on('disconnect', off);
    if (s.connected) on();
    else s.connect();
    return () => {
      s.off('connect', on);
      s.off('disconnect', off);
    };
  }, [params]);

  const validName = () => {
    const n = name.trim();
    if (!n) return setError('Enter a display name first.'), null;
    if (n.length > ROOM_CONFIG.maxNameLength) return setError(`Names can be at most ${ROOM_CONFIG.maxNameLength} characters.`), null;
    saveName(n);
    return n;
  };

  const create = async () => {
    setError(null);
    const n = validName();
    if (!n) return;
    setBusy('create');
    try {
      const r = await getSocket().timeout(5000).emitWithAck('room:create', { name: n });
      if (!r.ok) return setError(r.error);
      saveSession(r.session);
      router.push(`/room/${r.session.code}`);
    } catch {
      setError('Could not reach the game server. Is it running?');
    } finally {
      setBusy(null);
    }
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const n = validName();
    if (!n) return;
    const c = code.trim().toUpperCase();
    if (c.length !== ROOM_CONFIG.roomCodeLength) return setError(`Room codes have ${ROOM_CONFIG.roomCodeLength} characters.`);
    setBusy('join');
    try {
      const r = await getSocket().timeout(5000).emitWithAck('room:join', { code: c, name: n });
      if (!r.ok) return setError(r.error);
      saveSession(r.session);
      router.push(`/room/${r.session.code}`);
    } catch {
      setError('Could not reach the game server. Is it running?');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <label className="block">
          <span className="font-display mb-1 block font-semibold">Display name</span>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ROOM_CONFIG.maxNameLength}
            placeholder="e.g. Captain Pickles"
            autoComplete="nickname"
            aria-describedby="name-help"
          />
          <span id="name-help" className="mt-1 block text-xs text-[#4a5374]">
            Up to {ROOM_CONFIG.maxNameLength} characters. No account needed.
          </span>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel flex flex-col p-5">
          <h3 className="text-lg font-semibold">Create a room</h3>
          <p className="mt-1 mb-4 flex-1 text-sm text-[#4a5374]">Get a short code to share with 1–3 friends.</p>
          <button className="btn btn-primary w-full" onClick={create} disabled={!!busy}>
            <Plus size={20} aria-hidden="true" /> {busy === 'create' ? 'Creating…' : 'Create room'}
          </button>
        </div>
        <form className="panel flex flex-col p-5" onSubmit={join}>
          <h3 className="text-lg font-semibold">Join with a code</h3>
          <label className="mt-2 mb-3 block">
            <span className="sr-only">Room code</span>
            <input
              className="field text-center font-mono text-2xl tracking-[0.3em] uppercase"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={ROOM_CONFIG.roomCodeLength}
              placeholder="ABCDE"
              inputMode="text"
              autoCapitalize="characters"
              aria-label="Room code"
            />
          </label>
          <button className="btn btn-blue w-full" type="submit" disabled={!!busy}>
            <DoorOpen size={20} aria-hidden="true" /> {busy === 'join' ? 'Joining…' : 'Join room'}
          </button>
        </form>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-[#ffe0d6] px-4 py-3 font-semibold text-[#8c2a10]">
          {error}
        </p>
      )}
      <p className="text-center text-sm text-[#4a5374]" role="status">
        {connected ? 'Connected to the game server.' : 'Connecting to the game server…'}
      </p>
    </div>
  );
}

export default function OnlinePage() {
  return (
    <MenuShell title="Play with Friends">
      {realtimeAvailable ? (
        <Suspense>
          <OnlineForms />
        </Suspense>
      ) : (
        <RealtimeNotice />
      )}
    </MenuShell>
  );
}
