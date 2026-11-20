import { accountFromRequest } from '@/server/auth';
import { error, json, readJson, withServerErrors } from '@/server/http';
import { reportPayloadSchema } from '@/server/protocol';
import { reportPlayer } from '@/server/rooms';

export const POST = withServerErrors(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to report a player.', 401);
  const { code } = await ctx.params;
  const body = reportPayloadSchema.safeParse(await readJson(req));
  if (!body.success) return error('Pick a reason.', 400);
  const done = await reportPlayer({ code, accountId: account.id, playerId: body.data.playerId, reason: body.data.reason });
  if (!done.ok) return error(done.error, done.status);
  return json({ ok: true });
});
