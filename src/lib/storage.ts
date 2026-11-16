/** Small, SSR-safe localStorage helpers. */
import type { GameState, MatchPace } from '@/engine';

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

/** Island Adventure local save (old keys intentionally abandoned). */
export const LOCAL_SAVE_KEY = 'kc:localGame:v2';
export const localSaveKey = (mode: 'practice' | 'hotseat') => `${LOCAL_SAVE_KEY}:${mode}`;

export interface LocalSave {
  version: 2;
  mode: 'practice' | 'hotseat';
  setup: {
    players: { id: string; name: string; isAI?: boolean }[];
    config?: Record<string, unknown>;
  };
  state: GameState;
  savedAt: number;
}

export function loadLocalSave(mode: 'practice' | 'hotseat' = 'hotseat'): LocalSave | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localSaveKey(mode)) ?? window.localStorage.getItem(LOCAL_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LocalSave;
    if (data.version !== 2 || !data.state) return null;
    if (data.mode !== mode) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveLocalGame(save: LocalSave) {
  try {
    window.localStorage.setItem(localSaveKey(save.mode), JSON.stringify(save));
  } catch {}
}

export function clearLocalSave(mode?: 'practice' | 'hotseat') {
  try {
    if (mode) window.localStorage.removeItem(localSaveKey(mode));
    else {
      window.localStorage.removeItem(localSaveKey('hotseat'));
      window.localStorage.removeItem(localSaveKey('practice'));
      window.localStorage.removeItem(LOCAL_SAVE_KEY);
    }
  } catch {}
}

/** Serialize/deserialize helpers used by tests. */
export function serializeLocalState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeLocalState(raw: string): GameState {
  return JSON.parse(raw) as GameState;
}
