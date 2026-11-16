import type { MatchPace } from '@/engine';
import { accountFromRequest } from '@/server/auth';
import { error, json, readJson } from '@/server/http';
import { getRoomForAccount, startRoom } from '@/server/rooms';

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to start the match.', 401);
  const { code } = await ctx.params;
  const body = await readJson<{ pace?: MatchPace }>(req);
  const started = await startRoom({ code, accountId: account.id, pace: body?.pace });
  if (!started.ok) return error(started.error, started.status);
  const got = await getRoomForAccount(started.room.code, account.id);
  if (!got.ok) return error(got.error, got.status);
  return json(got.data);
}
