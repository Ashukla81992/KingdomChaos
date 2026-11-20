import { NextResponse } from 'next/server';
import { googleAuthUrl, googleConfig, googleRedirectUri, newOAuthState, OAUTH_STATE_COOKIE } from '@/server/google';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const cfg = googleConfig();
  if (!cfg) return NextResponse.redirect(new URL('/online?authError=google-off', req.url));
  const state = newOAuthState();
  const res = NextResponse.redirect(googleAuthUrl(cfg.clientId, googleRedirectUri(req), state));
  res.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/google',
    maxAge: 10 * 60,
  });
  return res;
}
