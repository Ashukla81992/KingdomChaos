import type { Terrain } from './types';

export const WATER: ReadonlySet<Terrain> = new Set(['river', 'lake', 'ocean']);
const STANDABLE: ReadonlySet<Terrain> = new Set(['grass', 'forest', 'plateau', 'bridge', 'tunnel', 'harbor', 'airfield']);

/** Ground characters may stop on (and walk across) these squares. */
export const isLand = (t: Terrain) => STANDABLE.has(t);
export const isWater = (t: Terrain) => WATER.has(t);

export interface TerrainInfo {
  name: string;
  /** One line for tooltips, the legend and the rules panel. */
  rule: string;
  /** Visual height of the tile top, in board units. */
  height: number;
}

export const TERRAIN_INFO: Record<Terrain, TerrainInfo> = {
  grass: { name: 'Meadow', rule: 'Open ground.', height: 16 },
  forest: { name: 'Forest', rule: 'Open ground under the trees.', height: 18 },
  plateau: { name: 'Plateau', rule: 'High ground you can walk on.', height: 40 },
  mountain: { name: 'Mountain', rule: 'Impassable on foot. Fly over it with a Glider, or Carve a Tunnel through it.', height: 58 },
  river: { name: 'River', rule: 'Needs a Boat, or Build a Bridge across it.', height: 0 },
  lake: { name: 'Lake', rule: 'Needs a Boat.', height: 0 },
  ocean: { name: 'Ocean', rule: 'Needs a Boat.', height: -4 },
  bridge: { name: 'Bridge', rule: 'Crosses a river. Break Bridge turns it back into river.', height: 10 },
  tunnel: { name: 'Tunnel', rule: 'A passage through a mountain.', height: 36 },
  harbor: { name: 'Harbor', rule: 'A character that starts its move here may sail across water (but must land).', height: 16 },
  airfield: { name: 'Airfield', rule: 'Fly to any other airfield for one step.', height: 16 },
};

export const TERRAINS = Object.keys(TERRAIN_INFO) as Terrain[];
