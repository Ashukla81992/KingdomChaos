'use client';

import { DoorOpen, LogIn, LogOut, Plus, UserPlus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MenuShell } from '@/components/MenuShell';
import { ROOM_CONFIG, type MatchPace } from '@/engine';
import {
  createOnlineRoom,
  fetchAuthProviders,
  fetchMe,
  joinOnlineRoom,
  loginAccount,
  logoutAccount,
  registerAccount,
  type AccountInfo,
} from '@/lib/onlineClient';
import { savedPace, savePace } from '@/lib/storage';
import { TimerChoice } from '@/components/TimerChoice';

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function OnlineForms() {
  const router = useRouter();
  const params = useSearchParams();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [seatCount, setSeatCount] = useState(2);
  const [pace, setPace] = useState<MatchPace>('untimed');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode((params.get('code') ?? '').toUpperCase());
    setPace(savedPace());
    const authError = params.get('authError');
    if (authError) setError(authError === 'google-off' ? 'Google sign-in is not set up yet. Use a username and password instead.' : 'Google sign-in did not finish. Please try again.');
    void fetchAuthProviders().then((r) => setGoogleOn(r.ok && r.data.google));
    void fetchMe().then((r) => {
      if (r.ok) setAccount(r.data.account);
      setLoadingMe(false);
    });
  }, [params]);

  const auth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(authMode);
    const r = authMode === 'register' ? await registerAccount(username, password) : await loginAccount(username, password);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setAccount(r.data.account);
    setPassword('');
  };

  const signOut = async () => {
    await logoutAccount();
    setAccount(null);
  };

  const create = async () => {
    setError(null);
    setBusy('create');
    savePace(pace);
    const r = await createOnlineRoom({ seatCount, pace });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    router.push(`/room/${r.data.lobby.code}`);
  };

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const c = code.trim().toUpperCase();
    if (c.length !== ROOM_CONFIG.roomCodeLength) return setError(`Room codes have ${ROOM_CONFIG.roomCodeLength} characters.`);
    setBusy('join');
    const r = await joinOnlineRoom(c);
    setBusy(null);
    if (!r.ok) return setError(r.error);
    router.push(`/room/${r.data.lobby.code}`);
  };

  if (loadingMe) {
    return (
      <p className="panel p-5 text-center" role="status">
        Checking your account…
      </p>
    );
  }

  if (!account) {
    return (
      <div className="space-y-4">
        <form className="panel space-y-4 p-5" onSubmit={auth}>
          <h3 className="text-lg font-semibold">{authMode === 'register' ? 'Create an account' : 'Sign in'}</h3>
          <p className="text-sm text-[#4a5374]">Online rooms save your seat — sign in on any device to resume.</p>
          <p className="rounded-2xl bg-[#e8f0ff] px-4 py-3 text-sm text-[#2c3a66]">
            <strong>No email needed.</strong> Just pick any username and password — a quick throwaway one for today or one you’ll keep. Remember them to get back into your games.
          </p>
          {googleOn && (
            <>
              <a className="btn btn-ghost w-full" href="/api/auth/google">
                <GoogleMark />
                Continue with Google
              </a>
              <p className="text-center text-xs font-semibold uppercase tracking-wide text-[#6b7393]">or use a username</p>
            </>
          )}
          <label className="block">
            <span className="font-display mb-1 block font-semibold">Username</span>
            <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" minLength={3} maxLength={24} required />
          </label>
          <label className="block">
            <span className="font-display mb-1 block font-semibold">Password</span>
            <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength={6} required />
          </label>
          <button className="btn btn-primary w-full" type="submit" disabled={!!busy}>
            {authMode === 'register' ? <UserPlus size={20} aria-hidden="true" /> : <LogIn size={20} aria-hidden="true" />}
            {busy ? 'Working…' : authMode === 'register' ? 'Create account' : 'Sign in'}
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}>
            {authMode === 'register' ? 'Already have an account? Sign in' : 'Need an account? Register'}
          </button>
        </form>
        {error && (
          <p role="alert" className="rounded-2xl bg-[#ffe0d6] px-4 py-3 font-semibold text-[#8c2a10]">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="font-semibold">
          Signed in as <span className="font-display">{account.username}</span>
        </p>
        <button className="btn btn-ghost" onClick={signOut}>
          <LogOut size={18} aria-hidden="true" /> Sign out
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="panel flex flex-col gap-3 p-5">
          <h3 className="text-lg font-semibold">Create a private room</h3>
          <p className="text-sm text-[#4a5374]">Share the invite code or link with friends (2–4 seats).</p>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Seats</legend>
            <div className="grid grid-cols-3 gap-2">
              {[2, 3, 4].map((n) => (
                <button key={n} type="button" className={`btn ${seatCount === n ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSeatCount(n)}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <TimerChoice value={pace} onChange={setPace} />
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
          <button className="btn btn-blue mt-auto w-full" type="submit" disabled={!!busy}>
            <DoorOpen size={20} aria-hidden="true" /> {busy === 'join' ? 'Joining…' : 'Join room'}
          </button>
        </form>
      </div>
      {error && (
        <p role="alert" className="rounded-2xl bg-[#ffe0d6] px-4 py-3 font-semibold text-[#8c2a10]">
          {error}
        </p>
      )}
    </div>
  );
}

export default function OnlinePage() {
  return (
    <MenuShell title="Play Online">
      <Suspense>
        <OnlineForms />
      </Suspense>
    </MenuShell>
  );
}
