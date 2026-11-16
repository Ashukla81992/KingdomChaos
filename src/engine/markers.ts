import { getBoard } from './board';
import type { BoardState } from './types';

export type MapMarkerKind =
  | 'landslide'
  | 'portal'
  | 'teleport'
  | 'crossing-created'
  | 'crossing-destroyed'
  | 'trap'
  | 'shortcut'
  | 'hazard'
  | 'encounter'
  | 'safeRoom'
  | 'dragon';

export interface MapMarker {
  id: string;
  kind: MapMarkerKind;
  nodes: string[];
  edges: string[];
  label: string;
  color: string;
  icon: string;
  /** Unrevealed traps/hazards stay on the board data but the UI can hide them. */
  hidden: boolean;
}

const COLORS: Record<MapMarkerKind, string> = {
  landslide: '#b45309',
  portal: '#0f766e',
  teleport: '#7c3aed',
  'crossing-created': '#15803d',
  'crossing-destroyed': '#b91c1c',
  trap: '#9f1239',
  shortcut: '#a16207',
  hazard: '#d97706',
  encounter: '#be123c',
  safeRoom: '#0369a1',
  dragon: '#c2410c',
};

function dragonAt(s: BoardState): string {
  const d = s.dragon;
  return d.state === 'companion' && d.companion ? s.characters[d.companion].node : d.node;
}

/**
 * Every map feature the UI should paint: portals, teleports, structures, landslides, encounters,
 * safe rooms and the dragon. Hidden hazards/traps that have not sprung yet are flagged `hidden`.
 */
export function mapMarkers(s: BoardState): MapMarker[] {
  const { board, edges } = getBoard(s.boardId);
  const out: MapMarker[] = [];
  const seenGates = new Set<string>();

  for (const n of board.nodes) {
    if (n.portal) {
      const pair = n.portal;
      if (n.id < pair) {
        out.push({
          id: `portal:${n.id}:${pair}`,
          kind: 'portal',
          nodes: [n.id, pair],
          edges: [],
          label: n.name,
          color: COLORS.portal,
          icon: 'portal',
          hidden: false,
        });
      }
    }
    if (n.teleport) {
      const kind: MapMarkerKind = n.teleport.type === 'trap' ? 'trap' : 'shortcut';
      out.push({
        id: `teleport:${n.id}`,
        kind,
        nodes: [n.id, n.teleport.to],
        edges: [],
        label: n.teleport.name,
        color: COLORS[kind],
        icon: kind,
        hidden: false,
      });
    }
    if (n.hazard) {
      out.push({
        id: `hazard:${n.id}`,
        kind: 'hazard',
        nodes: [n.id],
        edges: [],
        label: n.name,
        color: COLORS.hazard,
        icon: 'hazard',
        hidden: true,
      });
    }
    if (n.encounter) {
      out.push({
        id: `encounter:${n.id}`,
        kind: 'encounter',
        nodes: [n.id],
        edges: [],
        label: n.encounter.name,
        color: COLORS.encounter,
        icon: n.encounter.monster,
        hidden: false,
      });
    }
    if (n.type === 'safeRoom' || (n.safe && n.lane === 'dungeon' && n.type !== 'dEntrance')) {
      out.push({
        id: `safeRoom:${n.id}`,
        kind: 'safeRoom',
        nodes: [n.id],
        edges: [],
        label: n.name,
        color: COLORS.safeRoom,
        icon: 'safeRoom',
        hidden: false,
      });
    }
  }

  for (const e of board.edges) {
    if (e.kind !== 'buildable' || !e.gate || seenGates.has(e.gate)) continue;
    seenGates.add(e.gate);
    const open = !!s.bridges[e.gate];
    const kind: MapMarkerKind = open ? 'crossing-created' : 'crossing-destroyed';
    out.push({
      id: `gate:${e.gate}`,
      kind,
      nodes: [e.a, e.b],
      edges: board.edges.filter((x) => x.gate === e.gate).map((x) => x.id),
      label: e.name ?? e.gate,
      color: COLORS[kind],
      icon: e.structure ?? 'road',
      hidden: false,
    });
  }

  for (const b of s.blocks) {
    const e = edges[b.edgeId];
    out.push({
      id: `landslide:${b.edgeId}`,
      kind: 'landslide',
      nodes: e ? [e.a, e.b] : [],
      edges: [b.edgeId],
      label: e?.name ?? 'Landslide',
      color: COLORS.landslide,
      icon: 'landslide',
      hidden: false,
    });
  }

  for (const [node, kind] of Object.entries(s.transforms)) {
    out.push({
      id: `terrain:${node}`,
      kind: kind === 'mountain' ? 'landslide' : 'trap',
      nodes: [node],
      edges: [],
      label: kind === 'mountain' ? 'Mountain' : 'River',
      color: kind === 'mountain' ? '#78716c' : '#1d4ed8',
      icon: kind,
      hidden: false,
    });
  }

  if (s.dragon.state === 'wild' || s.dragon.state === 'guarding' || s.dragon.state === 'companion') {
    const at = dragonAt(s);
    out.push({
      id: 'dragon',
      kind: 'dragon',
      nodes: [at],
      edges: [],
      label: s.dragon.state === 'companion' ? 'Dragon companion' : s.dragon.state === 'guarding' ? 'Dragon Lair' : 'Wild dragon',
      color: COLORS.dragon,
      icon: 'dragon',
      hidden: false,
    });
  }

  return out;
}
