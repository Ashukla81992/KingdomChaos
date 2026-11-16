import { NextResponse } from 'next/server';
import { accountFromRequest } from '@/server/auth';
import { error, readJson } from '@/server/http';
import { actionSchema } from '@/server/protocol';
import { applyRoomAction } from '@/server/rooms';
import { z } from 'zod';

const bodySchema = z.object({
  action: actionSchema,
  version: z.number().int().nonnegative(),
  clientActionId: z.string().min(1).max(128),
});

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to play.', 401);
  const { code } = await ctx.params;
  const raw = await readJson(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return error('Malformed action.', 400);
  const result = await applyRoomAction({
    code,
    accountId: account.id,
    action: parsed.data.action,
    version: parsed.data.version,
    clientActionId: parsed.data.clientActionId,
  });
  return NextResponse.json(result.body, { status: result.status });
}
