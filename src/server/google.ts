/**
 * "Continue with Google" (OpenID Connect authorization-code flow), no extra dependencies.
 * Turned on by setting GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; the redirect URI to register
 * in Google Cloud is <site>/api/auth/google/callback.
 */
import { randomBytes } from 'node:crypto';

export const OAUTH_STATE_COOKIE = 'kc_oauth_state';

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function googleRedirectUri(req: Request) {
  return `${new URL(req.url).origin}/api/auth/google/callback`;
}

export function newOAuthState() {
  return randomBytes(24).toString('base64url');
}

export function googleAuthUrl(clientId: string, redirectUri: string, state: string) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export interface GoogleIdentity {
  sub: string;
  preferredName: string;
}

/**
 * Exchange the code for an ID token. The token comes straight from Google's token endpoint over TLS,
 * authenticated with our client secret, so (per OpenID Connect Core 3.1.3.7) we check its claims
 * rather than its signature.
 */
export async function exchangeGoogleCode(
  code: string,
  cfg: { clientId: string; clientSecret: string },
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error('Google returned no ID token');
  return identityFromIdToken(id_token, cfg.clientId);
}

export function identityFromIdToken(idToken: string, clientId: string, now = Date.now()): GoogleIdentity {
  const part = idToken.split('.')[1];
  if (!part) throw new Error('Malformed ID token');
  const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: number;
    email?: string;
    given_name?: string;
    name?: string;
  };
  if (claims.aud !== clientId) throw new Error('ID token is for another app');
  if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw new Error('ID token issuer is not Google');
  if (!claims.exp || claims.exp * 1000 < now) throw new Error('ID token expired');
  if (!claims.sub) throw new Error('ID token has no subject');
  const preferredName = claims.given_name || claims.name || claims.email?.split('@')[0] || 'player';
  return { sub: claims.sub, preferredName };
}
