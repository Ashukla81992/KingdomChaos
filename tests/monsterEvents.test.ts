import { describe, expect, it } from 'vitest';
import { getBoard, toPlayerView, walkingDistances, type GameState, type MonsterId } from '@/engine';
import { monsterReach, monsterTargets } from '@/engine/dungeon';
import { act, game, noCards, place } from './helpers';

function only(s: GameState, id: MonsterId) {
  for (const m of s.monsters!) m.restUntilRound = m.id === id ? 0 : 99;
  return s;
}

/** Both players pass; the round's monster event uses `rolls` (event die, then monster pick / target pick). */
function endRound(s: GameState, rolls: number[]) {
  s.forcedRolls = rolls;
  s = act(s, 'a', { type: 'skipMove' });
  if (s.turn.playerId === 'a') s = act(s, 'a', { type: 'skipAdventure' });
  s = act(s, 'b', { type: 'skipMove' });
  if (s.turn.playerId === 'b') s = act(s, 'b', { type: 'skipAdventure' });
  return s;
}
const monsterEvents = (s: GameState) => s.lastEvents.filter((e) => e.type === 'monsterEvent');

describe('monster events never attack without an eligible target', () => {
  it('empty dungeon: an attack roll resolves idle, with no target, origin, effect or outside climb', () => {
    for (const die of [4, 5, 6]) {
      let s = only(noCards(game()), 'golem');
      s = endRound(s, [die]);
      const [ev] = monsterEvents(s);
      expect(ev).toMatchObject({ kind: 'patrol', monster: 'golem' });
      expect(ev).not.toHaveProperty('characterId');
      expect(ev).not.toHaveProperty('effect');
      expect(ev).not.toHaveProperty('outside');
      expect(ev).not.toHaveProperty('at');
    }
  });

  it('respects the range boundary: exactly 3 connected steps is in, 4 is out', () => {
    const s = noCards(game());
    const { nodes } = getBoard(s.boardId);
    const d = walkingDistances(s, 'd-golem');
    const at = (n: number) => Object.keys(d).find((k) => d[k] === n && nodes[k].map === 'dungeon' && !nodes[k].safe && !nodes[k].encounter && nodes[k].type !== 'monster')!;
    const three = at(3);
    const four = at(4);
    place(s, 'b-king', three);
    expect(monsterTargets(s, 'golem').map((c) => c.id)).toEqual(['b-king']);
    place(s, 'b-king', four);
    expect(monsterTargets(s, 'golem')).toEqual([]);
  });

  it('disconnected paths do not count: a closed road cuts the reach', () => {
    const s = noCards(game());
    place(s, 'b-king', 'd-e2');
    expect(monsterReach(s).inside.spider.has('d-e2')).toBe(true);
    s.transforms['d-e3'] = 'mountain';
    expect(monsterTargets(s, 'spider').some((c) => c.id === 'b-king')).toBe(false);
  });

  it('outside attacks stay on the island road within the Dragon Gate boundary', () => {
    const s = noCards(game());
    const { nodes, board } = getBoard(s.boardId);
    const gate = board.transitions[0].island;
    const d = walkingDistances(s, gate);
    const far = Object.keys(d).find((k) => d[k] === 4 && nodes[k].map === 'island' && !nodes[k].safe && nodes[k].lane !== 'final')!;
    place(s, 'b-king', far);
    expect(monsterTargets(s, 'golem', true)).toEqual([]);
    // A distant island piece is never a target of an inside attack either.
    expect(monsterTargets(s, 'golem')).toEqual([]);
  });

  it('a valid target gets one resolved event naming monster, target, origin and outcome', () => {
    let s = only(noCards(game()), 'golem');
    place(s, 'b-king', 'd-c2');
    s = endRound(s, [4, 1, 1]);
    const evs = monsterEvents(s);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ kind: 'attack', monster: 'golem', characterId: 'b-king', origin: 'd-golem', from: 'd-c2', effect: 'push' });
    expect(['pushed', 'stuck']).toContain((evs[0] as { outcome?: string }).outcome);
    // Every client sees the same resolved event and the same batch id.
    expect(toPlayerView(s, 'a').lastEvents).toEqual(toPlayerView(s, 'b').lastEvents);
    expect(toPlayerView(s, 'a').eventSeq).toBe(toPlayerView(s, 'b').eventSeq);
  });

  it('Immune and Guarded pieces are not targets; a lone Immune piece leaves the monster idle', () => {
    let s = only(noCards(game()), 'golem');
    place(s, 'b-king', 'd-c2', { immune: true, wards: { immune: 2 } });
    s = endRound(s, [5]);
    expect(monsterEvents(s)[0]).toMatchObject({ kind: 'patrol' });
    expect(s.characters['b-king'].node).toBe('d-c2');
  });

  it('a batch id advances once per resolved action, so clients can drop repeats', () => {
    let s = noCards(game());
    const before = s.eventSeq ?? 0;
    s = act(s, 'a', { type: 'skipMove' });
    expect(s.eventSeq).toBe(before + 1);
  });
});
