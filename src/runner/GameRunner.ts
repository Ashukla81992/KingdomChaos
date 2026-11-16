import * as ai from '../engine/ai';
import {
  applyAction,
  chooseAiAction,
  createGame,
  forceTimeout,
  tick,
  toPlayerView,
  type CreateGameOptions,
  type GameAction,
  type GameEvent,
  type GameState,
  type PlayerView,
} from '../engine';

/** Optional off-turn AI helper — A6 may export `aiRespond`. */
function tryAiRespond(view: PlayerView, random?: () => number): GameAction | null {
  const fn = (ai as { aiRespond?: (v: PlayerView, r?: () => number) => GameAction | null }).aiRespond;
  return typeof fn === 'function' ? fn(view, random) : null;
}

export interface RunnerOptions extends Omit<CreateGameOptions, 'now'> {
  onUpdate: (state: GameState, events: GameEvent[]) => void;
  /** Return false for human players who are currently disconnected. */
  isConnected?: (playerId: string) => boolean;
  now?: () => number;
  aiRandom?: () => number;
  /** Resume a saved match instead of creating a new one. */
  initialState?: GameState;
}

export type DispatchResult = { ok: true } | { ok: false; error: string };

/**
 * Owns one match: applies actions through the pure engine, runs the match/turn/reaction clocks,
 * drives AI seats (including off-turn trade replies), and shortens turns of disconnected players.
 * Runs unchanged on the server helpers and in the browser (practice / hot-seat).
 */
export class GameRunner {
  state: GameState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastProgressAt: number;
  private disposed = false;
  private readonly now: () => number;

  constructor(private readonly opts: RunnerOptions) {
    this.now = opts.now ?? Date.now;
    this.state = opts.initialState ? structuredClone(opts.initialState) : createGame({ ...opts, now: this.now() });
    this.lastProgressAt = this.now();
    this.schedule();
  }

  dispatch(playerId: string, action: GameAction, version?: number): DispatchResult {
    if (this.disposed) return { ok: false, error: 'This match has closed.' };
    const player = this.state.players.find((p) => p.id === playerId);
    if (player?.isAI) return { ok: false, error: 'AI seats cannot be controlled.' };
    const timed = tick(this.state, this.now());
    if (timed?.ok) this.commit(timed.state, timed.events);
    const r = applyAction(this.state, { playerId, action, version }, this.now());
    if (!r.ok) return r;
    this.commit(r.state, r.events);
    return { ok: true };
  }

  /** Call when a player's connection status changes. */
  connectionChanged() {
    this.schedule();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private commit(state: GameState, events: GameEvent[]) {
    this.state = state;
    this.lastProgressAt = this.now();
    this.opts.onUpdate(state, events);
    this.schedule();
  }

  private isAI(pid: string) {
    return !!this.state.players.find((p) => p.id === pid)?.isAI;
  }

  private isAway(pid: string) {
    return !this.isAI(pid) && this.opts.isConnected ? !this.opts.isConnected(pid) : false;
  }

  private respondAiTrades(): boolean {
    const offers = this.state.trades ?? [];
    for (const offer of offers) {
      if (!this.isAI(offer.to)) continue;
      const action = tryAiRespond(toPlayerView(this.state, offer.to), this.opts.aiRandom);
      if (!action) continue;
      const r = applyAction(this.state, { playerId: offer.to, action }, this.now());
      if (r.ok) {
        this.commit(r.state, r.events);
        return true;
      }
    }
    return false;
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed || this.state.status !== 'playing') return;
    if (this.respondAiTrades()) return;
    const s = this.state;
    const actor = s.turn.playerId;
    const wakeups: number[] = [];
    if (s.endsAt !== null) wakeups.push(s.endsAt);
    if (s.turn.deadline !== null) wakeups.push(s.turn.deadline);
    if (this.isAI(actor)) wakeups.push(this.lastProgressAt + s.config.aiActionDelayMs);
    else if (this.isAway(actor)) wakeups.push(this.lastProgressAt + s.config.disconnectedTurnMs);
    // Also wake soon if an AI has a pending trade offer.
    if ((s.trades ?? []).some((t) => this.isAI(t.to))) wakeups.push(this.lastProgressAt + s.config.aiActionDelayMs);
    if (!wakeups.length) return;
    const delay = Math.max(0, Math.min(...wakeups) - this.now());
    this.timer = setTimeout(() => this.wake(), delay);
  }

  private wake() {
    this.timer = null;
    if (this.disposed || this.state.status !== 'playing') return;
    const now = this.now();
    const timed = tick(this.state, now);
    if (timed?.ok) return this.commit(timed.state, timed.events);
    if (this.respondAiTrades()) return;
    const s = this.state;
    const actor = s.turn.playerId;
    if (this.isAI(actor) && now >= this.lastProgressAt + s.config.aiActionDelayMs) {
      const action = chooseAiAction(toPlayerView(s, actor), this.opts.aiRandom);
      const r = action ? applyAction(s, { playerId: actor, action }, now) : null;
      if (r?.ok) return this.commit(r.state, r.events);
      const forced = forceTimeout(s, now);
      if (forced.ok) return this.commit(forced.state, forced.events);
    }
    if (this.isAway(actor) && now >= this.lastProgressAt + s.config.disconnectedTurnMs) {
      const forced = forceTimeout(s, now);
      if (forced.ok) return this.commit(forced.state, forced.events);
    }
    this.schedule();
  }
}
