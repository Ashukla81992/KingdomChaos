import { attachSessionCookie, makeSessionToken, normalizeUsername, validatePassword, verifyPassword } from '@/server/auth';
import { error, json, readJson } from '@/server/http';
import { getStore } from '@/server/store';

export async function POST(req: Request) {
  const body = await readJson<{ username?: string; password?: string }>(req);
  if (!body) return error('Send a JSON body with username and password.', 400);
  const username = normalizeUsername(body.username ?? '');
  if (!username) return error('Check your username and password.', 400);
  const badPass = validatePassword(body.password ?? '');
  if (badPass) return error('Check your username and password.', 400);
  const account = await getStore().findAccountByUsername(username);
  if (!account || !verifyPassword(body.password!, account.passHash)) {
    return error('Check your username and password.', 401);
  }
  const res = json({ account: { id: account.id, username: account.username } });
  return attachSessionCookie(res, makeSessionToken(account));
}
