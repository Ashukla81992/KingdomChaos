/**
 * Online play now uses HTTP polling + the store in `store.ts` / `rooms.ts`.
 * This module is kept so older imports fail loudly instead of pulling Socket.IO.
 */
export function attachGameServer(): never {
  throw new Error('Socket.IO game server removed. Use the /api/rooms HTTP API.');
}
