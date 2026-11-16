import { describe, expect, it } from 'vitest';
import { applyAction, cardTargets, legalMoves, type GameAction, type GameState } from '@/engine';
import { runTutorialOpponent, TUTORIAL_STEPS, TUTORIAL_YOU } from '@/tutorial/steps';

const step = (id: string) => TUTORIAL_STEPS.find((s) => s.id === id)!;

function play(s: GameState, action: GameAction) {
  const r = applyAction(s, { playerId: TUTORIAL_YOU, action, version: s.version }, 10);
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** Roll the step's forced die and walk the allowed character to the step's required end. */
function walk(id: string, start?: GameState) {
  const st = step(id);
  const s0 = start ?? st.setup();
  const s = s0.turn.move ? s0 : play(s0, { type: 'roll' }).state;
  const option = legalMoves(s, st.allowCharacter!).find((o) => o.path[o.path.length - 1] === st.allowEnd);
  expect(option, `${id}: ${st.allowEnd} must be reachable with the forced roll`).toBeTruthy();
  const r = play(s, { type: 'move', characterId: st.allowCharacter!, path: option!.path });
  return { before: s, after: r.state, events: r.events };
}

function playOnly(id: string) {
  const st = step(id);
  const s = st.setup();
  const c = s.hands[TUTORIAL_YOU].find((x) => x.type === st.allowCard)!;
  const targets = cardTargets(s, TUTORIAL_YOU, c.type);
  return { s, c, targets };
}

describe('tutorial', () => {
  it('has 11 steps, each on a playable board', () => {
    expect(TUTORIAL_STEPS).toHaveLength(11);
    for (const st of TUTORIAL_STEPS) expect(st.setup().status).toBe('playing');
  });

  it('roll 4: the Witch leaves the castle, passes the Ruby Mine and carries a Ruby', () => {
    const rolled = play(step('roll').setup(), { type: 'roll' });
    expect(step('roll').done!(step('roll').setup(), rolled.state, rolled.events)).toBe(true);
    const { before, after, events } = walk('move', rolled.state);
    expect(before.turn.move?.roll).toBe(4);
    expect(step('move').done!(before, after, events)).toBe(true);
  });

  it('banks the Ruby on the gate and completes the lap', () => {
    const { before, after, events } = walk('bank');
    expect(step('bank').done!(before, after, events)).toBe(true);
    expect(after.characters['you-witch'].lap).toBe(4);
  });

  it('the Knight cuts the rival Witch and takes her Sapphire', () => {
    const { before, after, events } = walk('cut');
    expect(step('cut').done!(before, after, events)).toBe(true);
    expect(after.characters['you-knight'].node).toBe('c4');
    expect(after.gems.find((g) => g.carriedBy === 'you-knight')?.kind).toBe('sapphire');
  });

  it('Shield and Build Bridge each have a target and complete their step', () => {
    for (const id of ['shield', 'map-card']) {
      const { s, c, targets } = playOnly(id);
      const t = id === 'shield' ? targets.find((x) => x.kind === 'character' && x.characterId === 'you-queen') : targets[0];
      expect(t, id).toBeTruthy();
      const r = play(s, { type: 'playCard', cardId: c.id, target: t! });
      expect(step(id).done!(s, r.state, r.events)).toBe(true);
    }
  });

  it('the Witch walks to the Dragon Gate, enters the dungeon, and after Alex’s turn climbs back out', () => {
    let s = step('dungeon').setup();
    s = play(s, { type: 'roll' }).state;
    const route = legalMoves(s, 'you-witch').find((o) => o.path[o.path.length - 1] === 'c16')!;
    s = play(s, { type: 'move', characterId: 'you-witch', path: route.path }).state;
    s = play(s, { type: 'enterDungeon', characterId: 'you-witch' }).state;
    expect(s.characters['you-witch'].node).toBe('d-entrance');
    expect(s.turn.playerId).toBe('foe');
    s = runTutorialOpponent(s).state;
    expect(s.turn.playerId).toBe(TUTORIAL_YOU);
    const out = play(s, { type: 'leaveDungeon', characterId: 'you-witch' });
    expect(out.state.characters['you-witch'].node).toBe('c16');
    expect(step('dungeon').done!(s, out.state, out.events)).toBe(true);
  });

  it('a lapped Queen chooses the Royal Path at the fork, then lands exactly on the temple', () => {
    const rp = walk('royal-path');
    expect(step('royal-path').done!(rp.before, rp.after, rp.events)).toBe(true);
    const ends = new Set(legalMoves(rp.before, 'you-queen').map((o) => o.path[o.path.length - 1]));
    expect(ends.size).toBeGreaterThan(1);
    const t = walk('temple');
    expect(step('temple').done!(t.before, t.after, t.events)).toBe(true);
    expect(t.after.result?.reason).toBe('temple');
  });
});
