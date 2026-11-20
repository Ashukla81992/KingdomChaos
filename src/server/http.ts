import { NextResponse } from 'next/server';

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function error(message: string, status: number) {
  return json({ error: message }, status);
}

export async function readJson<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Wrap a route so an unexpected failure (say, the database is unreachable) returns a JSON error and is logged. */
export function withServerErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error('[kingdom-chaos] request failed:', err);
      return error('The game server hit a problem. Please try again in a moment.', 500);
    }
  };
}
