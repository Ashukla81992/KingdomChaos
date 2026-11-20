import { json } from '@/server/http';
import { googleConfig } from '@/server/google';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ google: !!googleConfig() });
}
