import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getStore, type Account } from './store';

export const SESSION_COOKIE = 'kc_session';
const SESSION_DAYS = 30;
const DEV_SECRET = 'kingdom-chaos-dev-session-secret-change-me';

export function sessionSecret() {
  return process.env.SESSION_SECRET || DEV_SECRET;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, 'hex');
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

interface SessionPayload {
  accountId: string;
  username: string;
  exp: number;
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function unsign(token: string): SessionPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', sessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!payload.accountId || !payload.username || typeof payload.exp !== 'number') return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function makeSessionToken(account: Pick<Account, 'id' | 'username'>, now = Date.now()) {
  return sign({
    accountId: account.id,
    username: account.username,
    exp: now + SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function parseSessionToken(token: string | undefined | null) {
  if (!token) return null;
  return unsign(token);
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function attachSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export async function accountFromRequest(req: Request): Promise<Account | null> {
  const token = readCookie(req, SESSION_COOKIE);
  const session = parseSessionToken(token);
  if (!session) return null;
  const account = await getStore().findAccountById(session.accountId);
  if (!account || account.username !== session.username) return null;
  return account;
}

export const usernameSchema = {
  min: 3,
  max: 24,
};

export function normalizeUsername(raw: string): string | null {
  const u = raw.trim();
  if (u.length < usernameSchema.min || u.length > usernameSchema.max) return null;
  if (!/^[a-zA-Z0-9_\-.]+$/.test(u)) return null;
  return u;
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'Passwords need at least 6 characters.';
  if (password.length > 128) return 'That password is too long.';
  return null;
}
