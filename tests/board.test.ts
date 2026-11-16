import { describe, expect, it } from 'vitest';
import { CIRCUIT_LENGTH, CROWN_QUEST, FINAL_LENGTH, getBoard, walkingDistances } from '@/engine';
import { game } from './helpers';

const { nodes, out } = getBoard('crownquest');

describe('Crown Quest board', () => {
  it('has a 40-space two-way main road that cards can never close', () => {
    expect(CROWN_QUEST.circuit).toHaveLength(CIRCUIT_LENGTH);
    CROWN_QUEST.circuit.forEach((id, i) => {
      expect(nodes[id].circuit).toBe(i);
      expect(nodes[id].trail).toBe('main');
      const next = CROWN_QUEST.circuit[(i + 1) % CIRCUIT_LENGTH];
      const prev = CROWN_QUEST.circuit[(i + CIRCUIT_LENGTH - 1) % CIRCUIT_LENGTH];
      const road = out[id].filter((e) => e.lane === 'circuit').map((e) => (e.a === id ? e.b : e.a));
      expect(new Set(road)).toEqual(new Set([next, prev]));
      for (const e of out[id].filter((x) => x.lane === 'circuit')) {
        expect(e.oneWay).toBeFalsy();
        expect(e.kind).not.toBe('buildable');
      }
    });
  });

  it('describes every route with a perk and a risk', () => {
    const kinds = new Set(CROWN_QUEST.trails.map((t) => t.kind));
    for (const k of ['main', 'mountain', 'forest', 'river']) expect(kinds.has(k as never), k).toBe(true);
    for (const t of CROWN_QUEST.trails) {
      expect(t.perk.length, t.id).toBeGreaterThan(10);
      expect(t.risk.length, t.id).toBeGreaterThan(10);
    }
    for (const n of CROWN_QUEST.nodes.filter((x) => x.map === 'island' && x.lane !== 'final' && x.type !== 'castle' && x.lane !== 'temple'))
      expect(CROWN_QUEST.trails.some((t) => t.id === n.trail), n.id).toBe(true);
  });

  it('reaches every house plate from every castle on the main road alone, even with every inner route closed', () => {
    const s = game();
    for (const k of Object.keys(s.bridges)) s.bridges[k] = false;
    for (const h of CROWN_QUEST.houses) {
      const dist = walkingDistances(s, h.entry);
      for (const p of CROWN_QUEST.houses) expect(dist[p.plate], `${h.key} → ${p.key} plate`).toBeDefined();
    }
  });

  it('has four houses with safe entries ten spaces apart, forks, and five-space Royal Paths to the temple', () => {
    expect(CROWN_QUEST.houses.map((h) => [h.key, nodes[h.entry].circuit])).toEqual([
      ['red', 0],
      ['blue', 10],
      ['purple', 20],
      ['green', 30],
    ]);
    for (const h of CROWN_QUEST.houses) {
      expect(nodes[h.entry].safe).toBe(true);
      expect(nodes[h.branch].circuit).toBe((nodes[h.entry].circuit! + 1) % CIRCUIT_LENGTH);
      expect(h.final).toHaveLength(FINAL_LENGTH + 1);
      expect(h.final[FINAL_LENGTH]).toBe('temple');
      for (const f of h.final.slice(0, FINAL_LENGTH)) {
        expect(nodes[f].lane).toBe('final');
        expect(nodes[f].house).toBe(h.seat);
        expect(nodes[f].safe).toBe(true);
      }
      expect(out[h.castle].map((e) => e.b)).toEqual([h.entry]);
      // Royal Path edges run both ways (Island Adventure); the fork still connects to the first step.
      expect(out[h.branch].some((e) => e.b === h.final[0] || e.a === h.final[0])).toBe(true);
    }
  });

  it('puts one public house plate on each gate beside its castle', () => {
    expect(CROWN_QUEST.houses.map((h) => [h.key, h.plate, nodes[h.plate].plate])).toEqual([
      ['red', 'c0', 0],
      ['blue', 'c10', 1],
      ['purple', 'c20', 2],
      ['green', 'c30', 3],
    ]);
    expect(CROWN_QUEST.nodes.filter((n) => n.plate !== undefined)).toHaveLength(4);
  });

  it('places one station for each gem on the circuit', () => {
    const stations = CROWN_QUEST.nodes.filter((n) => n.station).map((n) => [n.station, n.lane]);
    expect(stations.sort()).toEqual([
      ['diamond', 'circuit'],
      ['emerald', 'circuit'],
      ['ruby', 'circuit'],
      ['sapphire', 'circuit'],
    ]);
  });

  it('marks traps, shortcuts, docks, airfields, portals and the dungeon gate', () => {
    const tps = CROWN_QUEST.nodes.filter((n) => n.teleport).map((n) => [n.id, n.teleport!.type, n.teleport!.to]);
    expect(tps).toEqual([
      ['c5', 'trap', 'c37'],
      ['c13', 'shortcut', 'c18'],
      ['c17', 'trap', 'c4'],
      ['c25', 'trap', 'c29'],
      ['c33', 'shortcut', 'c38'],
      ['d-pit', 'trap', 'd-entrance'],
    ]);
    expect(CROWN_QUEST.docks).toEqual(['c15', 'c26']);
    expect(CROWN_QUEST.airfields).toEqual(['c12', 'c35']);
    expect(nodes.c14.portal).toBe('c34');
    expect(nodes.c34.portal).toBe('c14');
    expect(CROWN_QUEST.nodes.filter((n) => n.dungeonGate).map((n) => n.id)).toEqual(['c16']);
  });

  it('keeps every stone on the painting and visually separated', () => {
    const island = CROWN_QUEST.nodes.filter((n) => n.map === 'island');
    for (const n of CROWN_QUEST.nodes) {
      expect(n.xy[0]).toBeGreaterThanOrEqual(0);
      expect(n.xy[0]).toBeLessThanOrEqual(1024);
      expect(n.xy[1]).toBeGreaterThanOrEqual(0);
      expect(n.xy[1]).toBeLessThanOrEqual(1024);
    }
    for (let i = 0; i < island.length; i++)
      for (let j = i + 1; j < island.length; j++) {
        const d = Math.hypot(island[i].xy[0] - island[j].xy[0], island[i].xy[1] - island[j].xy[1]);
        expect(d, `${island[i].id} vs ${island[j].id}`).toBeGreaterThan(18);
      }
  });

  it('starts with side-route structures in their marked state', () => {
    const startsOpen: Record<string, boolean> = {};
    for (const e of CROWN_QUEST.edges) {
      if (e.kind === 'buildable' && e.gate && !(e.gate in startsOpen)) startsOpen[e.gate] = !!e.startsOpen;
    }
    expect(startsOpen).toEqual({
      'camp-road': false,
      'broken-bridge': false,
      'stone-bridge': true,
      'ruins-road': false,
      'mine-tunnel': false,
    });
    const s = game();
    expect(s.bridges).toEqual(startsOpen);
    expect(CROWN_QUEST.edges.filter((e) => e.kind === 'blockable').map((e) => e.id).sort()).toEqual(['crag-pass', 'temple-pass', 'vale-pass']);
    expect(s.blocks).toEqual([]);
    expect(s.vehicles).toEqual({ boat: 'c15', plane: 'c12' });
    expect(s.dragon).toMatchObject({ state: 'guarding', node: 'd-lair' });
  });

  it('connects every dungeon room to the entrance', () => {
    const s = game();
    const dist = walkingDistances(s, 'd-entrance');
    for (const n of CROWN_QUEST.nodes.filter((x) => x.map === 'dungeon')) expect(dist[n.id], n.id).toBeDefined();
  });

  it('places Stone Golem and Cave Spider encounters with labeled safe rooms', () => {
    expect(nodes['d-golem'].encounter).toMatchObject({ monster: 'golem', shortcutTo: 'd-e4', safeRoom: 'd-ruins' });
    expect(nodes['d-spider'].encounter).toMatchObject({ monster: 'spider', safeRoom: 'd-safe-crystal' });
    expect(nodes['d-ruins'].safe).toBe(true);
    expect(nodes['d-safe-crystal'].safe).toBe(true);
    expect(nodes['d-safe-crystal'].type).toBe('safeRoom');
  });
});
