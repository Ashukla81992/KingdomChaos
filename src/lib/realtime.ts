/** False when this build is hosted on Vercel, which cannot run the Socket.IO game server. */
export const realtimeAvailable = process.env.NEXT_PUBLIC_REALTIME !== 'off';
