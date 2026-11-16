/**
 * Socket.IO client removed — online play polls `/api/rooms`.
 * Kept as a stub so accidental imports fail clearly.
 */
export function getSocket(): never {
  throw new Error('Socket.IO client removed. Use src/lib/onlineClient.ts');
}

export function useRoom(_code: string): never {
  throw new Error('useRoom removed. Use useOnlineRoom from src/lib/onlineClient.ts');
}
