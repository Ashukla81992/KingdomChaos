import { accountFromRequest } from '@/server/auth';
import { error, json } from '@/server/http';
import { endRoom } from '@/server/rooms';

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to end the match.', 401);
  const { code } = await ctx.params;
  const ended = await endRoom({ code, accountId: account.id });
  if (!ended.ok) return error(ended.error, ended.status);
  return json(ended.data);
}
