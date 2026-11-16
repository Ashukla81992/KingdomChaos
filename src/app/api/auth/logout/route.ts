import { clearSessionCookie } from '@/server/auth';
import { json } from '@/server/http';

export async function POST() {
  return clearSessionCookie(json({ ok: true }));
}
