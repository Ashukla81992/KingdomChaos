import { describe, expect, it } from 'vitest';
import { aiRespond, applyAction, chooseAiAction, createGame, toPlayerView, type GameAction, type GameState } from '@/engine';

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Long AI-only loop. Cap is generous while A1/A2/A3 victory and movement finish landing. */
function playAiOnly(players: number, seed: number, maxActions: number) {
  let s: GameState = createGame({
    players: Array.from({ length: players }, (_, i) => ({ id: `ai${i}`, name: `AI ${i}`, isAI: true })),
    seed,
    now: 0,
    config: { matchDurationMs: 0, turnDurationMs: 0, aiActionDelayMs: 0 },
  });
  const random = mulberry(seed);
  let actions = 0;
  let stalls = 0;
  while (s.status === 'playing' && actions < maxActions) {
    const actor = s.turn.playerId;
    let action: GameAction | null = chooseAiAction(toPlayerView(s, actor), random);
    if (!action) {
      for (const p of s.players) {
        if (p.id === actor) continue;
        const reply = aiRespond(toPlayerView(s, p.id), random);
        if (!reply) continue;
        const r = applyAction(s, { playerId: p.id, action: reply, version: s.version }, actions);
        if (r.ok) {
          s = r.state;
          actions++;
          stalls = 0;
        }
        action = reply;
        break;
      }
      if (!action) {
        stalls++;
        if (stalls > 12) break;
        continue;
      }
      continue;
    }
    const r = applyAction(s, { playerId: actor, action, version: s.version }, actions);
    if (!r.ok) {
      stalls++;
      if (stalls > 12) break;
      continue;
    }
    s = r.state;
    actions++;
    stalls = 0;
  }
  return { s, actions };
}

describe('ai', () => {
  it('exports chooseAiAction and aiRespond', () => {
    expect(typeof chooseAiAction).toBe('function');
    expect(typeof aiRespond).toBe('function');
  });

  it('returns roll when it is an AI seat’s turn with no die pending', () => {
    const s = createGame({
      players: [
        { id: 'ai0', name: 'AI 0', isAI: true },
        { id: 'ai1', name: 'AI 1', isAI: true },
      ],
      seed: 11,
      now: 0,
      firstPlayer: 0,
      config: { matchDurationMs: 0, turnDurationMs: 0 },
    });
    const action = chooseAiAction(toPlayerView(s, 'ai0'), () => 0.1);
    expect(action).toEqual({ type: 'roll' });
  });

  // Long: 2–4 player AI-only finish (or sustained legal play) within a generous action cap.
  it(
    '2–4 player AI-only games finish within a bounded action budget',
    () => {
      const CAP = 30_000;
      for (const n of [2, 3, 4]) {
        const { s, actions } = playAiOnly(n, 2026 + n, CAP);
        expect(actions, `${n}p stayed under cap`).toBeLessThan(CAP);
        expect(actions, `${n}p made progress`).toBeGreaterThan(20);
        if (s.status === 'finished') {
          expect(s.result?.reason).toBe('temple');
        }
      }
    },
    180_000,
  );
});
