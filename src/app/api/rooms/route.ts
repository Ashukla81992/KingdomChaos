import { accountFromRequest } from '@/server/auth';
import { error, json, readJson } from '@/server/http';
import { createRoom, getRoomForAccount } from '@/server/rooms';
import type { MatchPace } from '@/engine';

export async function POST(req: Request) {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to create a room.', 401);
  const body = await readJson<{ seatCount?: number; pace?: MatchPace; fillAi?: boolean }>(req);
  const room = await createRoom({
    accountId: account.id,
    username: account.username,
    seatCount: body?.seatCount,
    pace: body?.pace,
    fillAi: body?.fillAi,
  });
  const got = await getRoomForAccount(room.code, account.id);
  if (!got.ok) return error(got.error, got.status);
  return json(got.data, 201);
}
