import { accountFromRequest } from '@/server/auth';
import { error, json, withServerErrors } from '@/server/http';
import { iceServers } from '@/server/ice';

/** STUN, plus the optional TURN relay, for signed-in players starting voice chat. */
export const GET = withServerErrors(async (req: Request) => {
  const account = await accountFromRequest(req);
  if (!account) return error('Sign in to use voice chat.', 401);
  return json({ iceServers: iceServers() });
});
