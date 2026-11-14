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
} from '../engine';

export interface RunnerOptions extends Omit<CreateGameOptions, 'now'> {
  onUpdate: (state: GameState, events: GameEvent[]) => void;
  /** Return false for human players who are currently disconnected. */
  isConnected?: (playerId: string) => boolean;
  now?: () => number;
  aiRandom?: () => number;
}

export type DispatchResult = { ok: true } | { ok: false; error: string };

/**
 * Owns one match: applies actions through the pure engine, runs the match/turn clocks,
 * drives AI seats, and shortens turns of disconnected players so a match never stalls.
 * Runs unchanged on the server (online rooms) and in the browser (practice / hot-seat).
 */
export class GameRunner {
  state: GameState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastProgressAt: number;
  private disposed = false;
  private readonly now: () => number;

  constructor(private readonly opts: RunnerOptions) {
    this.now = opts.now ?? Date.now;
    this.state = createGame({ ...opts, now: this.now() });
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

  private currentIsAI() {
    return !!this.state.players.find((p) => p.id === this.state.turn.playerId)?.isAI;
  }

  private currentIsAway() {
    const pid = this.state.turn.playerId;
    return !this.currentIsAI() && this.opts.isConnected ? !this.opts.isConnected(pid) : false;
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.disposed || this.state.status !== 'playing') return;
    const now = this.now();
    const s = this.state;
    const wakeups: number[] = [];
    if (s.endsAt !== null) wakeups.push(s.endsAt);
    if (s.turn.deadline !== null) wakeups.push(s.turn.deadline);
    if (this.currentIsAI()) wakeups.push(this.lastProgressAt + s.config.aiActionDelayMs);
    else if (this.currentIsAway()) wakeups.push(this.lastProgressAt + s.config.disconnectedTurnMs);
    if (!wakeups.length) return;
    const delay = Math.max(0, Math.min(...wakeups) - now);
    this.timer = setTimeout(() => this.wake(), delay);
  }

  private wake() {
    this.timer = null;
    if (this.disposed || this.state.status !== 'playing') return;
    const now = this.now();
    const timed = tick(this.state, now);
    if (timed?.ok) return this.commit(timed.state, timed.events);
    const s = this.state;
    if (this.currentIsAI() && now >= this.lastProgressAt + s.config.aiActionDelayMs) {
      const pid = s.turn.playerId;
      const action = chooseAiAction(toPlayerView(s, pid), this.opts.aiRandom);
      const r = action ? applyAction(s, { playerId: pid, action }, now) : null;
      if (r?.ok) return this.commit(r.state, r.events);
      const forced = forceTimeout(s, now);
      if (forced.ok) return this.commit(forced.state, forced.events);
    }
    if (this.currentIsAway() && now >= this.lastProgressAt + s.config.disconnectedTurnMs) {
      const forced = forceTimeout(s, now);
      if (forced.ok) return this.commit(forced.state, forced.events);
    }
    this.schedule();
  }
}
