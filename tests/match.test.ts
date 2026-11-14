import { describe, expect, it } from 'vitest';
import {
  applyAction,
  chooseAiAction,
  createGame,
  forceTimeout,
  tick,
  toPlayerView,
  type GameState,
} from '@/engine';
import { A, act, B, carry, ch, give, place, rolled, setup } from './helpers';

describe('timers', () => {
  it('match timer expiring mid-turn ends the match by banked score', () => {
    let s = setup();
    s.players[1].score = 1;
    rolled(s, 3);
    s.turn.deadline = null;
    const endsAt = s.endsAt!;
    expect(tick(s, endsAt - 1)).toBeNull();
    expect(applyAction(s, { playerId: A, action: { type: 'roll' } }, endsAt).ok).toBe(false);
    const r = tick(s, endsAt)!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(s.status).toBe('finished');
    expect(s.result).toMatchObject({ winners: [B], reason: 'timer', tieBreak: 'none' });
  });

  it('turn timeout before rolling: server rolls, makes a basic move and passes the turn', () => {
    const s = setup();
    const r = tick(s, s.turn.deadline!)!;
    if (!r.ok) throw new Error(r.error);
    expect(r.state.turn.playerId).toBe(B);
    expect(r.events.some((e) => e.type === 'rolled')).toBe(true);
    expect(r.events.some((e) => e.type === 'moved')).toBe(true);
    expect(r.events.some((e) => e.type === 'cardPlayed')).toBe(false);
    expect(r.state.stats[A].timeouts).toBe(1);
  });

  it('turn timeout after rolling: basic move; after moving: just ends; never plays a card', () => {
    let s = setup();
    give(s, A, 'shield');
    s = act(s, A, { type: 'roll' });
    const r = forceTimeout(s, 5000);
    if (!r.ok) throw new Error(r.error);
    expect(r.events.filter((e) => e.type === 'rolled')).toHaveLength(0);
    expect(r.events.some((e) => e.type === 'moved')).toBe(true);
    expect(r.events.some((e) => e.type === 'cardPlayed')).toBe(false);
    expect(r.state.hands[A].some((c) => c.type === 'shield')).toBe(true);

    const t = setup();
    t.turn.phase = 'action';
    const r2 = forceTimeout(t, 5000);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.events.some((e) => e.type === 'moved')).toBe(false);
    expect(r2.state.turn.playerId).toBe(B);
  });

  it('turn timeout with no legal move skips movement', () => {
    const s = setup();
    for (const c of Object.values(s.characters)) if (c.owner === A) c.recovering = true;
    const r = forceTimeout(s, 5000);
    if (!r.ok) throw new Error(r.error);
    expect(r.events.some((e) => e.type === 'moved')).toBe(false);
    expect(r.state.turn.playerId).toBe(B);
  });

  it('turn timeout during a draw choice declines the draw', () => {
    let s = setup();
    for (let i = 0; i < 4; i++) give(s, A, 'shield');
    place(s, ch(A, 'king'), 'r0');
    rolled(s, 1);
    s = act(s, A, { type: 'move', characterId: ch(A, 'king'), path: ['r0', 'm0'] });
    s = act(s, A, { type: 'endTurn' });
    expect(s.turn.phase).toBe('drawChoice');
    const r = forceTimeout(s, 5000);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.hands[A]).toHaveLength(4);
    expect(r.state.turn.playerId).toBe(B);
  });

  it('tutorial config disables both clocks', () => {
    const s = setup({ config: { matchDurationMs: 0, turnDurationMs: 0 } });
    expect(s.endsAt).toBeNull();
    expect(s.turn.deadline).toBeNull();
    expect(tick(s, 10 ** 12)).toBeNull();
  });
});

describe('scoring and tie-breaks', () => {
  const finish = (s: GameState) => {
    const r = tick(s, s.endsAt!)!;
    if (!r.ok) throw new Error(r.error);
    return r.state.result!;
  };

  it('tied banked scores are broken by treasure being carried', () => {
    const s = setup();
    s.players[0].score = 1;
    s.players[1].score = 1;
    place(s, ch(B, 'king'), 'r9');
    carry(s, ch(B, 'king'), 'x');
    expect(finish(s)).toMatchObject({ winners: [B], tieBreak: 'carried' });
  });

  it('still tied after carried treasure → shared victory', () => {
    const s = setup({ players: 3 });
    s.players[0].score = 2;
    s.players[1].score = 2;
    carry(s, ch(A, 'king'), 'x');
    carry(s, ch(B, 'king'), 'm1');
    expect(finish(s)).toMatchObject({ winners: [A, B], tieBreak: 'shared' });
  });

  it('nobody scored → shared victory', () => {
    const s = setup();
    expect(finish(s)).toMatchObject({ winners: [A, B], tieBreak: 'shared' });
  });
});

describe('hidden information', () => {
  it('player views contain only the viewer hand and card counts', () => {
    const s = createGame({ players: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], seed: 1, now: 0 });
    const v = toPlayerView(s, A);
    expect(v.hand).toEqual(s.hands[A]);
    expect(v.handCounts).toEqual({ A: 3, B: 3 });
    const json = JSON.stringify(v);
    for (const card of s.hands[B]) expect(json).not.toContain(`"${card.id}"`);
    expect(json).not.toContain('rngState');
    expect(json).not.toContain('"deck":[');
    expect(json).not.toContain('"discard":[');
    expect(v.deckCount).toBe(s.deck.length);
    expect(toPlayerView(s, null).hand).toEqual([]);
  });
});

/** Play a whole game with AI-only seats, using timeouts if the AI stalls. */
function simulate(seed: number, players: number) {
  const ids = ['P1', 'P2', 'P3', 'P4'].slice(0, players);
  let s = createGame({ players: ids.map((id) => ({ id, name: id, isAI: true })), seed, now: 0 });
  let now = 0;
  let rngSeed = seed;
  const rand = () => ((rngSeed = (rngSeed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let actions = 0;
  while (s.status === 'playing' && actions < 5000) {
    now += 3000; // a human-paced action every 3 s
    const ticked = tick(s, now);
    if (ticked?.ok) {
      s = ticked.state;
      continue;
    }
    const view = toPlayerView(s, s.turn.playerId);
    const action = chooseAiAction(view, rand);
    expect(action).not.toBeNull();
    const r = applyAction(s, { playerId: s.turn.playerId, action: action!, version: s.version }, now);
    if (!r.ok) throw new Error(`AI produced an illegal action (${JSON.stringify(action)}): ${r.error}`);
    s = r.state;
    actions++;
  }
  return s;
}

describe('practice AI', () => {
  it('plays complete legal games for 2, 3 and 4 players', () => {
    const summary: string[] = [];
    for (const players of [2, 3, 4]) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = simulate(seed * 97 + players, players);
        expect(s.status).toBe('finished');
        const stats = Object.values(s.stats);
        summary.push(
          `${players}p seed ${seed}: ${s.result!.reason}, ${Math.round(s.result!.durationMs / 60000)} min, ${s.result!.turns} turns, ` +
            `scores ${s.players.map((p) => p.score).join('-')}, captures ${stats.reduce((a, x) => a + x.captures, 0)}, cards ${stats.reduce((a, x) => a + x.cardsPlayed, 0)}`,
        );
      }
    }
    // Balance telemetry for playtesting (visible with --reporter=verbose).
    console.info(summary.join('\n'));
  }, 60_000);

  it('AI never reads other players’ hands (works purely from its redacted view)', () => {
    const s = createGame({ players: [{ id: 'H', name: 'Human' }, { id: 'AI', name: 'Bot', isAI: true }], seed: 3, now: 0, firstPlayer: 1 });
    const view = toPlayerView(s, 'AI');
    expect((view as unknown as { hands?: unknown }).hands).toBeUndefined();
    expect(chooseAiAction(view, () => 0.5)).toEqual({ type: 'roll' });
  });
});
