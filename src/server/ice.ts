/**
 * Network helpers for voice chat. STUN (free, public) lets most players' browsers find each other directly.
 * Players on strict office or mobile networks need a TURN relay, which costs money to run, so it is optional:
 * set TURN_URLS (comma separated, e.g. "turn:turn.example.com:3478,turns:turn.example.com:5349"),
 * TURN_USERNAME and TURN_CREDENTIAL to switch one on.
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const FREE_STUN: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

export function iceServers(env: Record<string, string | undefined> = process.env): IceServer[] {
  const urls = (env.TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^turns?:/.test(u));
  if (!urls.length) return FREE_STUN;
  return [...FREE_STUN, { urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
}
