import { accountFromRequest } from '@/server/auth';
import { error, json } from '@/server/http';
import { getRoomForAccount } from '@/server/rooms';

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const account = await accountFromRequest(req);
  const got = await getRoomForAccount(code, account?.id ?? null);
  if (!got.ok) return error(got.error, got.status);
  return json(got.data);
}
