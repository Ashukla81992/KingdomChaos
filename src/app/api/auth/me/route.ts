import { accountFromRequest } from '@/server/auth';
import { error, json, withServerErrors } from '@/server/http';

export const GET = withServerErrors(async (req: Request) => {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to continue.', 401);
  return json({ account: { id: account.id, username: account.username } });
});
