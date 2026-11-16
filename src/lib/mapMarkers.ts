import type { BoardState, PlayerView } from '@/engine';

/** A3 mapMarkers shape (guarded until exported). */
export type MapMarkerKind =
  | 'landslide'
  | 'portal'
  | 'teleport'
  | 'crossingOpen'
  | 'crossingClosed'
  | 'trap'
  | 'shortcut'
  | 'encounter'
  | 'safeRoom'
  | 'wildDragon';

export interface MapMarker {
  id: string;
  kind: MapMarkerKind;
  label: string;
  color: string;
  /** Art path or short glyph key. */
  icon: string;
  explain: string;
  node?: string;
  edgeId?: string;
  /** Hidden discoveries stay off the map. */
  hidden?: boolean;
}

const STYLE: Record<MapMarkerKind, { color: string; icon: string }> = {
  landslide: { color: '#8B5A2B', icon: '/art/icon-mountain.png' },
  portal: { color: '#9b6cf0', icon: '' },
  teleport: { color: '#18a38a', icon: '/art/icon-trapdoor.png' },
  crossingOpen: { color: '#2e9e62', icon: '/art/icon-bridge.png' },
  crossingClosed: { color: '#c8281e', icon: '/art/icon-broken-bridge.png' },
  trap: { color: '#d64532', icon: '/art/icon-trapdoor.png' },
  shortcut: { color: '#18a38a', icon: '/art/icon-tunnel.png' },
  encounter: { color: '#a3300b', icon: '/art/icon-chest.png' },
  safeRoom: { color: '#c58b00', icon: '' },
  wildDragon: { color: '#a3300b', icon: '/art/dragon.png' },
};

/** Read A3 markers when present; otherwise empty (board keeps its built-in glyphs). */
export function readMapMarkers(state: BoardState | PlayerView): MapMarker[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/engine/dungeon') as { mapMarkers?: (s: BoardState | PlayerView) => MapMarker[] };
    if (typeof mod.mapMarkers !== 'function') return [];
    return (mod.mapMarkers(state) ?? []).filter((m) => !m.hidden).map((m) => ({
      ...m,
      color: m.color || STYLE[m.kind]?.color || '#1d2440',
      icon: m.icon || STYLE[m.kind]?.icon || '',
    }));
  } catch {
    return [];
  }
}
