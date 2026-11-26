import { describe, expect, it } from 'vitest';
import { BOARD_H, BOARD_W, CROWN_QUEST, getBoard } from '@/engine';
import { SIMPLE_NODES, SIMPLE_ROUTES } from '@/lib/simpleLayout';
import { mapArt, viewBoard, viewPoint } from '@/lib/mapMode';

const id = CROWN_QUEST.id;

describe('Simple and Detailed map modes', () => {
  it('pins every space and road of the board on the simple paintings', () => {
    for (const n of CROWN_QUEST.nodes) expect(SIMPLE_NODES[n.id], n.id).toBeDefined();
    for (const e of CROWN_QUEST.edges) expect(SIMPLE_ROUTES[e.id]?.length, e.id).toBeGreaterThanOrEqual(2);
    expect(Object.keys(SIMPLE_NODES).sort()).toEqual(CROWN_QUEST.nodes.map((n) => n.id).sort());
  });

  it('keeps every simple position on the painting, with room between spaces', () => {
    const view = viewBoard(id, 'simple');
    const nodes = view.board.nodes;
    for (const n of nodes) {
      expect(n.xy[0]).toBeGreaterThan(0);
      expect(n.xy[0]).toBeLessThan(BOARD_W);
      expect(n.xy[1]).toBeGreaterThan(0);
      expect(n.xy[1]).toBeLessThan(BOARD_H);
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.map !== b.map) continue;
        expect(Math.hypot(a.xy[0] - b.xy[0], a.xy[1] - b.xy[1]), `${a.id} / ${b.id}`).toBeGreaterThan(30);
      }
    }
  });

  it('roads start and end on their own spaces', () => {
    const { nodes, edges } = viewBoard(id, 'simple');
    for (const e of Object.values(edges)) {
      const first = e.route[0];
      const last = e.route[e.route.length - 1];
      expect(Math.hypot(first[0] - nodes[e.a].xy[0], first[1] - nodes[e.a].xy[1]), e.id).toBeLessThan(3);
      expect(Math.hypot(last[0] - nodes[e.b].xy[0], last[1] - nodes[e.b].xy[1]), e.id).toBeLessThan(3);
    }
  });

  it('changes only the look: same ids, links and rules in both modes', () => {
    const base = getBoard(id);
    const simple = viewBoard(id, 'simple');
    expect(viewBoard(id, 'complex')).toBe(base);
    for (const n of base.board.nodes) expect({ ...simple.nodes[n.id], xy: n.xy }).toEqual(n);
    for (const e of base.board.edges) expect({ ...simple.edges[e.id], route: e.route }).toEqual(e);
    for (const k of Object.keys(base.adj)) expect(simple.adj[k].map((e) => e.id)).toEqual(base.adj[k].map((e) => e.id));
    // The rules' own index is untouched by building the simple view.
    expect(getBoard(id).nodes.c0.xy).toEqual([483, 175]);
  });

  it('moves a detailed-map point next to the same space on the simple map', () => {
    const c0 = getBoard(id).nodes.c0.xy;
    expect(viewPoint(id, 'simple', 'island', [c0[0] + 5, c0[1]])).toEqual([SIMPLE_NODES.c0[0] + 5, SIMPLE_NODES.c0[1]]);
    expect(viewPoint(id, 'complex', 'island', [10, 20])).toEqual([10, 20]);
  });

  it('names a painting per mode', () => {
    expect(mapArt('simple', 'island').art).toBe('/board/island-simple.jpg');
    expect(mapArt('complex', 'dungeon').bleed).toBe('/board/dungeon-bleed.jpg');
  });
});
