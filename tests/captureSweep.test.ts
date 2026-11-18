import { describe, expect, it } from 'vitest';
import { getBoard, legalMoves, type GameState } from '@/engine';
import { game, place, rollWith } from './helpers';

/** Every space a rival can stand on: a landing captures there unless the space is safe. */
describe('capture sweep (every space on both maps)', () => {
  const base = game();
  const { nodes, adj, board } = getBoard(base.boardId);
  const standable = Object.values(nodes).filter((n) => n.type !== 'castle' && n.type !== 'temple' && n.lane !== 'final' && !n.teleport && n.id !== board.dragonHome);

  /** A start `d` steps away (1–6) along open roads, avoiding special spaces. */
  function startFor(s: GameState, target: string, mover: string): { from: string; d: number } | null {
    // Breadth-first rings around the target; try starts at graph distance d with a roll of d.
    const dist = new Map<string, number>([[target, 0]]);
    let ring = [target];
    for (let d = 1; d <= 6; d++) {
      const next: string[] = [];
      for (const x of ring) for (const ed of adj[x] ?? []) {
        const y = ed.a === x ? ed.b : ed.a;
        if (!dist.has(y)) (dist.set(y, d), next.push(y));
      }
      ring = next;
      for (const from of ring) {
        const n = nodes[from];
        if (n.type === 'castle' || n.type === 'temple' || n.lane === 'final' || n.teleport || n.map !== nodes[target].map || from === board.dragonHome) continue;
        const t = structuredClone(s);
        place(t, mover, from);
        const r = rollWith(t, 'a', d);
        if (legalMoves(r, mover).some((o) => o.path[o.path.length - 1] === target)) return { from, d };
      }
    }
    return null;
  }

  it.each(['king', 'witch', 'knight'])('the %s captures on every unsafe space and never on a safe one', (kind) => {
    const mover = `a-${kind}`;
    const problems: string[] = [];
    let unsafeChecked = 0;
    let safeChecked = 0;
    for (const n of standable) {
      const s = structuredClone(base);
      // Park every other piece out of the way in its castle.
      place(s, 'b-king', n.id);
      const start = startFor(s, n.id, mover);
      if (!start) continue; // not reachable by an exact roll from anywhere nearby (rare)
      place(s, mover, start.from);
      const r = rollWith(s, 'a', start.d);
      const opts = legalMoves(r, mover).filter((o) => o.path[o.path.length - 1] === n.id);
      const cuts = opts.some((o) => o.landingCuts.includes('b-king'));
      if (n.safe) {
        safeChecked++;
        if (cuts) problems.push(`${n.id} (${n.name}) is safe but allows a capture`);
      } else {
        unsafeChecked++;
        if (!cuts) problems.push(`${n.id} (${n.name}) is not safe but no capture is offered`);
      }
    }
        expect(problems).toEqual([]);
    expect(unsafeChecked).toBeGreaterThan(60);
    expect(safeChecked).toBeGreaterThan(4);
  });

  it('the Queen never captures: she cannot stop on an unsafe space a rival holds', () => {
    const s = structuredClone(base);
    place(s, 'b-king', 'c5');
    place(s, 'a-queen', 'c3');
    const r = rollWith(s, 'a', 2);
    expect(legalMoves(r, 'a-queen').some((o) => o.path.at(-1) === 'c5')).toBe(false);
  });
});
