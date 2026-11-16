/** Small, SSR-safe localStorage helpers. */
import type { MatchPace } from '@/engine';
export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be unavailable (private mode); settings are then per-session only
  }
}

const TUTORIAL_KEY = 'kc:tutorialDone';
export const tutorialDone = () => typeof window !== 'undefined' && window.localStorage.getItem(TUTORIAL_KEY) === '1';
export const markTutorialDone = () => {
  try {
    window.localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {}
};

const PACE_KEY = 'kc:pace';
/** The last chosen match length. No limit is the default. */
export const savedPace = (): MatchPace => {
  if (typeof window === 'undefined') return 'untimed';
  const v = window.localStorage.getItem(PACE_KEY);
  return v === 'clock' || v === 'rounds' ? v : 'untimed';
};
export const savePace = (p: MatchPace) => {
  try {
    window.localStorage.setItem(PACE_KEY, p);
  } catch {}
};

const NAME_KEY = 'kc:name';
export const savedName = () => (typeof window === 'undefined' ? '' : window.localStorage.getItem(NAME_KEY) ?? '');
export const saveName = (n: string) => {
  try {
    window.localStorage.setItem(NAME_KEY, n);
  } catch {}
};

export interface MatchRecord {
  at: string;
  mode: string;
  players: number;
  durationMs: number;
  turns: number;
  winners: string[];
  reason: string;
}

const HISTORY_KEY = 'kc:matchHistory';
/** Local playtest telemetry: match duration and turn counts. */
export function recordMatch(r: MatchRecord) {
  try {
    const list: MatchRecord[] = JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]');
    list.push(r);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-50)));
  } catch {}
}

export function matchHistory(): MatchRecord[] {
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}
