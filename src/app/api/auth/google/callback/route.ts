import { NextResponse } from 'next/server';
import { attachSessionCookie, makeSessionToken, readCookie } from '@/server/auth';
import { exchangeGoogleCode, googleConfig, googleRedirectUri, OAUTH_STATE_COOKIE } from '@/server/google';
import { getStore } from '@/server/store';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/online?authError=${reason}`, req.url));
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
    return res;
  };
  const cfg = googleConfig();
  if (!cfg) return fail('google-off');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== readCookie(req, OAUTH_STATE_COOKIE)) return fail('google-failed');
  try {
    const who = await exchangeGoogleCode(code, cfg, googleRedirectUri(req));
    const account = await getStore().findOrCreateGoogleAccount(who.sub, who.preferredName);
    const res = NextResponse.redirect(new URL('/online', req.url));
    res.cookies.set(OAUTH_STATE_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
    return attachSessionCookie(res, makeSessionToken(account));
  } catch (err) {
    console.error('[kingdom-chaos] Google sign-in failed:', err);
    return fail('google-failed');
  }
}
