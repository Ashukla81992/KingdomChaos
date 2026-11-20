import { accountFromRequest } from '@/server/auth';
import { error, json, readJson, withServerErrors } from '@/server/http';
import { chatPayloadSchema } from '@/server/protocol';
import { postChat } from '@/server/rooms';

export const POST = withServerErrors(async (req: Request, ctx: { params: Promise<{ code: string }> }) => {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to chat.', 401);
  const { code } = await ctx.params;
  const body = chatPayloadSchema.safeParse(await readJson(req));
  if (!body.success) return error('That message cannot be sent.', 400);
  const sent = await postChat({ code, accountId: account.id, text: body.data.text });
  if (!sent.ok) return error(sent.error, sent.status);
  return json({ message: sent.message });
});
