import { accountFromRequest } from '@/server/auth';
import { error, json } from '@/server/http';
import { getRoomForAccount, joinRoom } from '@/server/rooms';

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to join a room.', 401);
  const { code } = await ctx.params;
  const joined = await joinRoom({ code, accountId: account.id, username: account.username });
  if (!joined.ok) return error(joined.error, joined.status);
  const got = await getRoomForAccount(joined.room.code, account.id);
  if (!got.ok) return error(got.error, got.status);
  return json(got.data);
}
