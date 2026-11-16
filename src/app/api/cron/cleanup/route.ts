import { error, json } from '@/server/http';
import { cleanupExpired } from '@/server/rooms';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!secret || token !== secret) return error('Unauthorized.', 401);
  const deleted = await cleanupExpired();
  return json({ ok: true, deleted });
}
