import { attachSessionCookie, hashPassword, makeSessionToken, normalizeUsername, validatePassword } from '@/server/auth';
import { error, json, readJson, withServerErrors } from '@/server/http';
import { getStore } from '@/server/store';

export const POST = withServerErrors(async (req: Request) => {
  const body = await readJson<{ username?: string; password?: string }>(req);
  if (!body) return error('Send a JSON body with username and password.', 400);
  const username = normalizeUsername(body.username ?? '');
  if (!username) return error('Usernames are 3–24 letters, numbers, _, - or .', 400);
  const badPass = validatePassword(body.password ?? '');
  if (badPass) return error(badPass, 400);
  try {
    const account = await getStore().createAccount(username, hashPassword(body.password!));
    const res = json({ account: { id: account.id, username: account.username } }, 201);
    return attachSessionCookie(res, makeSessionToken(account));
  } catch (e) {
    if ((e as { code?: string }).code === 'USERNAME_TAKEN') return error('That username is taken.', 409);
    throw e;
  }
});
