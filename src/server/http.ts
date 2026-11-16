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
