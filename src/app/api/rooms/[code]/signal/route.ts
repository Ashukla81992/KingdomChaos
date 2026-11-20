import { accountFromRequest } from '@/server/auth';
import { error, json, readJson, withServerErrors } from '@/server/http';
import { postSignal } from '@/server/rooms';

export const POST = withServerErrors(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to use voice chat.', 401);
  const { code } = await ctx.params;
  const sent = await postSignal({ code, accountId: account.id, payload: await readJson(req) });
  if (!sent.ok) return error(sent.error, sent.status);
  return json({ ok: true });
});
