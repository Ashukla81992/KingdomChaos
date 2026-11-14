import { describe, expect, it } from 'vitest';
import { applyAction, legalMovesForTurn, legalTargets, type GameAction, type GameState } from '@/engine';
import { TUTORIAL_STEPS, TUTORIAL_YOU } from '@/tutorial/steps';

function act(s: GameState, action: GameAction) {
  const r = applyAction(s, { playerId: TUTORIAL_YOU, action }, Date.now());
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe('guided tutorial', () => {
  it('every interactive step can be completed with the real engine', () => {
    for (const step of TUTORIAL_STEPS) {
      let s = step.setup();
      expect(s.endsAt).toBeNull();
      expect(s.turn.deadline).toBeNull();
      if (!step.done) continue;
      const before = s;
      let events = [] as ReturnType<typeof act>['events'];
      if (step.allowed?.includes('roll')) {
        const r = act(s, { type: 'roll' });
        s = r.state;
        const winning = legalMovesForTurn(s, TUTORIAL_YOU).find((m) => {
          const res = applyAction(s, { playerId: TUTORIAL_YOU, action: { type: 'move', characterId: m.characterId, path: m.path } }, 0);
          return res.ok && step.done!(before, res.state, res.events);
        });
        expect(winning, `step ${step.id} has a winning move`).toBeDefined();
        const r2 = act(s, { type: 'move', characterId: winning!.characterId, path: winning!.path });
        s = r2.state;
        events = r2.events;
      } else if (step.allowCard) {
        const card = s.hands[TUTORIAL_YOU].find((c) => c.type === step.allowCard)!;
        const target = legalTargets(s, TUTORIAL_YOU, card.type)[0];
        expect(target, `step ${step.id} has a target`).toBeDefined();
        const r = act(s, { type: 'playCard', cardId: card.id, target });
        s = r.state;
        events = r.events;
      }
      expect(step.done(before, s, events), `step ${step.id} completes`).toBe(true);
    }
  });

  it('the Queen step requires passing through the opponent', () => {
    const step = TUTORIAL_STEPS.find((s) => s.id === 'abilities')!;
    const s = act(step.setup(), { type: 'roll' }).state;
    const pass = legalMovesForTurn(s, TUTORIAL_YOU).find((m) => m.path.join('>') === 'r0>r1>r2');
    expect(pass?.passedOpponents).toHaveLength(1);
  });
});
