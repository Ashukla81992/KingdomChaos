import { describe, expect, it } from 'vitest';
import { applyAction, chooseAiAction, forceTimeout, toPlayerView, type GameState } from '@/engine';
import { act, carry, game, noCards, place, reject, rollWith, T0 } from './helpers';

/** a-king one step from the Golem, then moves onto it: the battle opens. */
function enterBattle(kind: 'king' | 'knight' = 'king'): GameState {
  let s = noCards(game());
  place(s, `a-${kind}`, 'd-c2');
  s = rollWith(s, 'a', 1);
  s = act(s, 'a', { type: 'move', characterId: `a-${kind}`, path: ['d-c2', 'd-golem'] });
  return s;
}

describe('[prototype] Stone Golem Strike/Guard battle', () => {
  it('opens on arrival, announces its first attack and holds the turn', () => {
    const s = enterBattle();
    expect(s.battle).toMatchObject({ monster: 'golem', characterId: 'a-king', monsterHp: 3, stamina: 3, intent: 'light' });
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'battleStarted', intent: 'light' }));
    expect(s.turn.playerId).toBe('a');
    reject(s, 'a', { type: 'skipAdventure' }, /Finish the battle/);
    reject(s, 'b', { type: 'battle', choice: 'strike' });
  });

  it('Strike hits on 4+ for 1, then the Golem makes its announced attack; intents alternate', () => {
    let s = enterBattle();
    s.forcedRolls = [5];
    s = act(s, 'a', { type: 'battle', choice: 'strike' });
    expect(s.battle).toMatchObject({ monsterHp: 2, stamina: 2, intent: 'heavy', exchange: 1 });
    const ex = s.lastEvents.find((e) => e.type === 'battleExchange');
    expect(ex).toMatchObject({ hit: true, damage: 1, monsterAttack: 'light', taken: 1, nextIntent: 'heavy' });
  });

  it('Guard blocks a heavy slam and exposes the Golem: the next hit deals 2', () => {
    let s = enterBattle();
    s.forcedRolls = [1];
    s = act(s, 'a', { type: 'battle', choice: 'strike' }); // miss, takes the light blow
    expect(s.battle).toMatchObject({ monsterHp: 3, stamina: 2, intent: 'heavy' });
    s = act(s, 'a', { type: 'battle', choice: 'guard' });
    expect(s.battle).toMatchObject({ stamina: 2, exposed: true, intent: 'light' });
    s.forcedRolls = [6];
    s = act(s, 'a', { type: 'battle', choice: 'strike' });
    expect(s.battle).toMatchObject({ monsterHp: 1, exposed: false });
  });

  it('winning opens the shortcut for the kingdom (once per kingdom) and carries the piece through', () => {
    let s = enterBattle('knight');
    s.battle!.monsterHp = 1;
    s.forcedRolls = [3]; // 3 + Knight 1 = 4
    s = act(s, 'a', { type: 'battle', choice: 'strike' });
    expect(s.battle).toBeNull();
    expect(s.shortcutsOpen?.['d-golem']).toContain('a');
    expect(s.rewardsClaimed?.['golem-shortcut']).toEqual(['a']);
    expect(s.characters['a-knight'].node).toBe('d-e4');
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'battleEnded', outcome: 'won', reward: 'golem-shortcut' }));
    // A later piece of the same kingdom walks through without a fight.
    s.turn = { ...s.turn, moveDone: false, move: null, adventureDone: false, playerId: 'a' };
    place(s, 'a-queen', 'd-c2');
    s = rollWith(s, 'a', 1);
    s = act(s, 'a', { type: 'move', characterId: 'a-queen', path: ['d-c2', 'd-golem'] });
    expect(s.battle ?? null).toBeNull();
    expect(s.characters['a-queen'].node).toBe('d-e4');
  });

  it('losing all stamina drops carried gems in the chamber and sends the piece to the safe room', () => {
    let s = enterBattle();
    carry(s, 'a-king', 'ruby');
    s.battle!.stamina = 1;
    s.forcedRolls = [1];
    s = act(s, 'a', { type: 'battle', choice: 'strike' });
    expect(s.battle).toBeNull();
    expect(s.characters['a-king'].node).toBe('d-ruins');
    expect(s.gems.find((g) => g.kind === 'ruby')).toMatchObject({ node: 'd-golem', carriedBy: null });
    expect(s.shortcutsOpen?.['d-golem'] ?? []).not.toContain('a');
  });

  it('Retreat returns to the entrance without the reward', () => {
    let s = enterBattle();
    s = act(s, 'a', { type: 'battle', choice: 'retreat' });
    expect(s.battle).toBeNull();
    expect(s.characters['a-king'].node).toBe('d-entrance');
    expect(s.rewardsClaimed?.['golem-shortcut']).toBeUndefined();
  });

  it('the AI fights (guards heavy slams) and a timeout retreats; views carry the battle for every client', () => {
    const s = enterBattle();
    expect(chooseAiAction(toPlayerView(s, 'a'))).toEqual({ type: 'battle', choice: 'strike' });
    expect(toPlayerView(s, 'b').battle).toEqual(toPlayerView(s, 'a').battle);
    const r = forceTimeout(s, T0);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.battle).toBeNull();
      expect(r.state.turn.playerId).toBe('b');
    }
  });

  it('a repeated battle request with a stale version is refused (no double exchange)', () => {
    const s = enterBattle();
    s.forcedRolls = [5, 5];
    const first = applyAction(s, { playerId: 'a', action: { type: 'battle', choice: 'strike' }, version: s.version }, T0);
    expect(first.ok).toBe(true);
    const again = applyAction(first.ok ? first.state : s, { playerId: 'a', action: { type: 'battle', choice: 'strike' }, version: s.version }, T0);
    expect(again.ok).toBe(false);
  });
});
