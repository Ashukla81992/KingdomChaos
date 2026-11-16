import type { EncounterDef, GemKind } from './types';

/**
 * Crown Quest board data, in pixels of the island painting (public/board/island.jpg, 1024 × 1024).
 *
 * The painting is decoration; these lists are the rules. The main road is a ring of CIRCUIT_LENGTH
 * spaces through all four house plates, walked in either direction; it crosses Dragon Mountain
 * through the painted tunnel. Anchors pin chosen circuit indices to points on the painted road;
 * `scripts/trace-island.ts` snaps the road between consecutive anchors (and every inner road marked
 * `snap`) onto the painting and writes crownRoutes.ts, and the builder spaces the stones evenly.
 */

export const ISLAND_SIZE = 1024;
export const CIRCUIT_LENGTH = 40;
export const FINAL_LENGTH = 5;

export type Pt = [number, number];

export interface CircuitAnchor {
  idx: number;
  at: Pt;
  /** Waypoints toward the next anchor (helps the tracer pick the right road). */
  via?: Pt[];
  /** false: draw the given waypoints instead of snapping to the painted road. */
  snap?: boolean;
  /** The stretch to the next anchor runs underground (a single step, drawn as a tunnel). */
  tunnel?: string;
}

/** Clockwise from the Red gate. */
export const CIRCUIT_ANCHORS: CircuitAnchor[] = [
  { idx: 0, at: [205, 175], via: [[248, 178]] },
  { idx: 2, at: [292, 174], via: [[322, 205]] },
  { idx: 4, at: [345, 238], via: [[395, 224]] },
  { idx: 6, at: [443, 205], snap: false, tunnel: 'Dragon Mountain Tunnel' },
  { idx: 7, at: [676, 150], via: [[718, 165]] },
  { idx: 8, at: [756, 184], via: [[801, 183]] },
  { idx: 10, at: [845, 175], via: [[843, 221], [871, 254]] },
  { idx: 12, at: [880, 290], via: [[925, 311], [941, 351], [939, 393], [959, 432], [933, 467]] },
  { idx: 16, at: [872, 496], via: [[869, 549], [877, 591], [874, 633], [866, 674], [829, 695]] },
  { idx: 19, at: [811, 699], via: [[800, 724], [797, 767]] },
  { idx: 20, at: [812, 810], via: [[769, 799], [725, 794], [682, 789], [642, 771]] },
  { idx: 23, at: [608, 755], via: [[565, 778], [546, 817], [506, 829], [473, 855], [431, 866], [402, 841], [364, 822]] },
  { idx: 28, at: [334, 792], via: [[295, 788], [253, 801]] },
  { idx: 30, at: [210, 805], via: [[173, 777]] },
  { idx: 31, at: [164, 712], via: [[147, 705], [106, 694], [84, 670], [81, 628], [92, 587], [80, 549], [65, 508], [91, 473]] },
  { idx: 35, at: [105, 459], via: [[106, 435], [97, 392], [127, 362], [152, 334], [197, 329]] },
  { idx: 38, at: [215, 313], via: [[202, 297], [165, 273], [148, 238], [186, 217]] },
];

export const HOUSE_KEYS = ['red', 'blue', 'purple', 'green'] as const;
export type HouseKey = (typeof HOUSE_KEYS)[number];

export interface HouseDef {
  key: HouseKey;
  name: string;
  castleName: string;
  /** Home area drawn on the castle art. */
  castle: Pt;
  entry: number;
  /** Final path: from the branch space (entry + 1) to the temple. */
  finalVia: Pt[];
}

/** Clockwise seat order around the island. */
export const HOUSES: HouseDef[] = [
  { key: 'red', name: 'Red', castleName: 'Red Castle', castle: [135, 100], entry: 0, finalVia: [[290, 238], [345, 300], [405, 330], [460, 362]] },
  { key: 'blue', name: 'Blue', castleName: 'Blue Castle', castle: [912, 105], entry: 10, finalVia: [[812, 250], [742, 290], [665, 335], [585, 372]] },
  { key: 'purple', name: 'Purple', castleName: 'Purple Castle', castle: [905, 735], entry: 20, finalVia: [[715, 735], [672, 655], [628, 560], [560, 470]] },
  { key: 'green', name: 'Green', castleName: 'Green Castle', castle: [92, 740], entry: 30, finalVia: [[240, 630], [305, 580], [350, 500], [440, 445]] },
];

export const TEMPLE_AT: Pt = [512, 388];

export type SpaceFeature =
  | { kind: 'station'; gem: GemKind; name: string }
  | { kind: 'safe' }
  | { kind: 'name'; name: string }
  | { kind: 'dig'; name: string }
  | { kind: 'dungeon'; name: string }
  | { kind: 'dock'; name: string }
  | { kind: 'airfield'; name: string }
  | { kind: 'portal'; name: string; pair: number }
  | { kind: 'teleport'; type: 'trap' | 'shortcut'; name: string; to: number; text: string };

/** Special circuit spaces by index. Every other circuit space is a plain stepping stone. */
export const CIRCUIT_FEATURES: Record<number, SpaceFeature[]> = {
  2: [{ kind: 'station', gem: 'ruby', name: 'Ruby Mine' }],
  3: [{ kind: 'safe' }],
  5: [{ kind: 'teleport', type: 'trap', name: 'Landslide', to: 37, text: 'Rocks give way under Dragon Mountain and sweep the character down to Willow Valley.' }],
  6: [{ kind: 'name', name: 'Tunnel Mouth' }],
  7: [{ kind: 'name', name: 'Crystal Mine' }],
  8: [{ kind: 'station', gem: 'sapphire', name: 'Sapphire Falls' }],
  12: [{ kind: 'airfield', name: 'East Airfield' }],
  13: [{ kind: 'teleport', type: 'shortcut', name: 'Magic Lift', to: 18, text: 'A cliff lift carries the character down the east coast.' }],
  14: [{ kind: 'portal', name: 'East Moonstone Arch', pair: 34 }],
  15: [{ kind: 'dock', name: 'East Landing' }],
  16: [{ kind: 'dungeon', name: 'Dragon Gate' }],
  17: [{ kind: 'teleport', type: 'trap', name: 'Hidden Pit', to: 4, text: 'The ground gives way into the spike pit’s tunnels, which come out under Dragon Mountain.' }],
  18: [{ kind: 'safe' }],
  19: [{ kind: 'dig', name: 'Bone Dig' }],
  22: [{ kind: 'station', gem: 'diamond', name: 'Diamond Hill' }],
  25: [{ kind: 'teleport', type: 'trap', name: 'River Current', to: 29, text: 'The river under the falls carries the character down to the west beach. It touches no plates on the way.' }],
  26: [{ kind: 'dock', name: 'Harbour' }],
  28: [{ kind: 'station', gem: 'emerald', name: 'Emerald Grove' }],
  29: [{ kind: 'safe' }],
  33: [{ kind: 'teleport', type: 'shortcut', name: 'Secret Passage', to: 38, text: 'A passage under the old arches leads north along the west coast.' }],
  34: [{ kind: 'portal', name: 'West Moonstone Arch', pair: 14 }],
  35: [{ kind: 'airfield', name: 'West Airfield' }],
  37: [{ kind: 'name', name: 'Willow Valley' }],
  38: [{ kind: 'safe' }],
};

/** Plain names for the stretches of the circuit (by index range), used in place descriptions. */
export const CIRCUIT_NAMES: [number, number, string][] = [
  [0, 9, 'Mountain Road'],
  [10, 19, 'East Coast Road'],
  [20, 29, 'Harbour Road'],
  [30, 39, 'West Coast Road'],
];

export const MAIN_ROAD = {
  perk: 'The ring road: always open, passes every house plate, and cards can never close it.',
  risk: 'Long and easy for rivals to predict, and its Landslide, Hidden Pit and River Current traps fire if you stop on them.',
};

/** What kind of road a route is, so the game can describe its trade-off in a word. */
export type TrailKind = 'main' | 'mountain' | 'forest' | 'river' | 'ruins';

/** A family of inner roads that share a look and a trade-off (listed in the legend). */
export interface TrailDef {
  id: string;
  name: string;
  kind: TrailKind;
  /** Shown when a move uses this route: what it is good for, and what can go wrong. */
  perk: string;
  risk: string;
}

export const TRAILS: TrailDef[] = [
  {
    id: 'temple',
    name: 'Temple Roads',
    kind: 'ruins',
    perk: 'Every inner road meets at the Temple Plaza: the quickest way across the middle of the island.',
    risk: 'Everyone passes through, so cuts are common, and a Landslide can block the Temple Pass.',
  },
  {
    id: 'lake',
    name: 'Lakeside Roads',
    kind: 'forest',
    perk: 'From the west coast past the lake to the temple, with a dig site on the shore.',
    risk: 'The shore can be flooded by Create River or raised by Raise Mountain.',
  },
  {
    id: 'camp',
    name: 'Camp and Glade Roads',
    kind: 'forest',
    perk: 'A web of forest roads between Green, the old camp and the bridges. Dig sites at the camp and the glade.',
    risk: 'Trap risk in the brambles, and the Camp Road is unbuilt until someone plays Build Road.',
  },
  {
    id: 'river',
    name: 'River Crossings',
    kind: 'river',
    perk: 'The Stone Bridge and the Rope Bridge cross the gorge between west and east.',
    risk: 'Trap risk on the spray. The Rope Bridge starts broken, and cards can collapse the Stone Bridge.',
  },
  {
    id: 'ruins',
    name: 'East Ruins Roads',
    kind: 'ruins',
    perk: 'Round the spike pit and the old ruins, linking Purple, the Dragon Gate and the temple. A dig site in the ruins.',
    risk: 'Trap risk on the Pit Road. The Ruins Road is unbuilt until Build Road, and a Landslide can block the Vale Pass.',
  },
  {
    id: 'falls',
    name: 'Sapphire Falls Roads',
    kind: 'mountain',
    perk: 'Mountain roads from Blue down past the falls to the temple.',
    risk: 'The Crystal Mine Tunnel stays sealed until someone digs it, and a Landslide can block the Crag Pass.',
  },
];

export type SideSegmentKind = 'road' | 'bridge' | 'tunnel' | 'plot';

/** A named crossroads inside the island where several inner roads meet. */
export interface RouteHub {
  id: string;
  name: string;
  at: Pt;
  trail: string;
}

export const ROUTE_HUBS: RouteHub[] = [
  { id: 'plaza', name: 'Temple Plaza', at: [509, 462], trail: 'temple' },
  { id: 'temple-west', name: 'West Temple Gate', at: [397, 448], trail: 'temple' },
  { id: 'temple-east', name: 'East Temple Gate', at: [583, 496], trail: 'temple' },
  { id: 'camp-west', name: 'Camp Crossing', at: [254, 524], trail: 'camp' },
  { id: 'camp-east', name: 'Camp Corner', at: [386, 553], trail: 'camp' },
  { id: 'fern', name: 'Fern Crossing', at: [195, 652], trail: 'camp' },
  { id: 'glade', name: 'Emerald Glade', at: [353, 656], trail: 'camp' },
  { id: 'rope-west', name: 'Rope Bridge Landing', at: [377, 716], trail: 'river' },
  { id: 'bridge-west', name: 'Stone Bridge West', at: [409, 602], trail: 'river' },
  { id: 'bridge-east', name: 'Stone Bridge East', at: [593, 606], trail: 'river' },
  { id: 'falls', name: 'Falls Crossing', at: [618, 678], trail: 'river' },
  { id: 'ruins', name: 'Old Ruins', at: [672, 556], trail: 'ruins' },
  { id: 'vale', name: 'Diamond Vale', at: [783, 681], trail: 'ruins' },
  { id: 'pit', name: 'Pit Crossing', at: [731, 496], trail: 'ruins' },
  { id: 'crag', name: 'Crag Crossing', at: [711, 378], trail: 'falls' },
  { id: 'sapphire', name: 'Sapphire Pool', at: [759, 301], trail: 'falls' },
];

export interface SideRoute {
  id: string;
  name: string;
  trail: string;
  /** A circuit index, a hub id, or a space on another route. */
  from: number | string;
  to: number | string;
  via: Pt[];
  /** Number of new spaces along the route. */
  spaces: number;
  /** Snap the drawn road onto the painting (scripts/trace-island.ts). */
  snap?: boolean;
  /** Features are placed on the edge or space nearest to `at`, so they stay put when spacing changes. */
  structures?: { at: Pt; kind: 'bridge' | 'tunnel' | 'plot'; gate: string; name: string; open: boolean }[];
  blockable?: { at: Pt; id: string; name: string }[];
  /** Spaces a Raise Mountain or Create River card may replace. */
  terrainSites?: Pt[];
  digSites?: { at: Pt; name: string }[];
  /** Stopping here risks a hidden snare (see `hazardChance`). */
  hazards?: { at: Pt; name: string }[];
}

/**
 * Inner roads run both ways between the main road and the crossroads above, following the painted
 * roads. The main road itself can never be closed, so every house can always reach every plate and
 * its own fork; map cards only open or close these detours.
 */
export const SIDE_ROUTES: SideRoute[] = [
  // Temple roads
  { id: 'red-road', name: 'Red Temple Road', trail: 'temple', from: 4, to: 'temple-west', via: [[370, 278], [416, 289], [435, 318], [405, 353], [398, 399]], spaces: 3, snap: true },
  { id: 'temple-pass', name: 'Temple Pass', trail: 'temple', from: 'temple-west', to: 'plaza', via: [[433, 461], [471, 461]], spaces: 1, snap: true, blockable: [{ at: [480, 462], id: 'temple-pass', name: 'Temple Pass' }] },
  { id: 'camp-steps', name: 'Camp Steps', trail: 'temple', from: 'camp-east', to: 'plaza', via: [[431, 510], [467, 482]], spaces: 1, snap: true },
  { id: 'east-steps', name: 'East Temple Steps', trail: 'temple', from: 'temple-east', to: 'plaza', via: [[555, 494]], spaces: 0, snap: true },
  { id: 'crag-road', name: 'Crag Road', trail: 'temple', from: 'crag', to: 'temple-east', via: [[669, 385], [631, 397], [626, 438], [596, 460]], spaces: 2, snap: true },
  // Lakeside
  { id: 'lake', name: 'Lakeside Road', trail: 'lake', from: 38, to: 'temple-west', via: [[251, 334], [296, 339], [322, 370], [358, 383]], spaces: 3, snap: true, terrainSites: [[322, 370]], digSites: [{ at: [270, 336], name: 'Lakeside Dig' }] },
  { id: 'willow', name: 'Willow Road', trail: 'lake', from: 38, to: 4, via: [[248, 276], [295, 258]], spaces: 1, snap: true },
  // Camp and glade
  { id: 'camp-trail', name: 'Camp Trail', trail: 'camp', from: 35, to: 'camp-west', via: [[146, 470], [180, 494], [213, 513]], spaces: 1, snap: true },
  { id: 'camp-road', name: 'Camp Road', trail: 'camp', from: 'camp-west', to: 'camp-east', via: [[300, 511], [347, 511]], spaces: 1, snap: true, structures: [{ at: [360, 515], kind: 'plot', gate: 'camp-road', name: 'Camp Road (unbuilt)', open: false }], digSites: [{ at: [310, 512], name: 'Old Camp Dig' }] },
  { id: 'bridge-lane', name: 'Bridge Lane', trail: 'camp', from: 'camp-east', to: 'bridge-west', via: [[383, 571]], spaces: 0, snap: true },
  { id: 'bramble', name: 'Bramble Lane', trail: 'camp', from: 'camp-west', to: 'fern', via: [[230, 551], [198, 574], [196, 613]], spaces: 1, snap: true, hazards: [{ at: [205, 590], name: 'Bramble Snare' }] },
  { id: 'green-lane', name: 'Green Lane', trail: 'camp', from: 'fern', to: 31, via: [[172, 676]], spaces: 0, snap: true },
  { id: 'glade-road', name: 'Glade Road', trail: 'camp', from: 'fern', to: 'glade', via: [[235, 651], [274, 644], [314, 647]], spaces: 1, snap: true, digSites: [{ at: [274, 644], name: 'Glade Dig' }] },
  { id: 'glade-north', name: 'Glade Path', trail: 'camp', from: 'glade', to: 'bridge-west', via: [[390, 638]], spaces: 0, snap: true },
  { id: 'glade-south', name: 'Glade Path', trail: 'camp', from: 'glade', to: 'rope-west', via: [[351, 692]], spaces: 0, snap: true },
  { id: 'harbour-lane', name: 'Harbour Lane', trail: 'camp', from: 'rope-west', to: 28, via: [[357, 753]], spaces: 0, snap: true },
  // River crossings
  { id: 'rope', name: 'Rope Bridge Road', trail: 'river', from: 'rope-west', to: 'falls', via: [[413, 700], [453, 688], [493, 676], [533, 681], [573, 688]], spaces: 2, snap: true, structures: [{ at: [448, 690], kind: 'bridge', gate: 'broken-bridge', name: 'Rope Bridge', open: false }], hazards: [{ at: [540, 680], name: 'Spray Snare' }] },
  { id: 'stone', name: 'Stone Bridge Road', trail: 'river', from: 'bridge-west', to: 'bridge-east', via: [[455, 602], [501, 602], [547, 605]], spaces: 1, snap: true, structures: [{ at: [470, 602], kind: 'bridge', gate: 'stone-bridge', name: 'Stone Bridge', open: true }] },
  { id: 'gorge', name: 'Gorge Path', trail: 'river', from: 'bridge-east', to: 'falls', via: [[605, 640]], spaces: 0, snap: true },
  { id: 'falls-road', name: 'Falls Road', trail: 'river', from: 'falls', to: 23, via: [[606, 716]], spaces: 0, snap: true },
  { id: 'vale-road', name: 'Vale Road', trail: 'river', from: 'falls', to: 'vale', via: [[660, 669], [703, 661]], spaces: 1, snap: true, terrainSites: [[680, 665]] },
  // East ruins
  { id: 'ruins-lane', name: 'Ruins Lane', trail: 'ruins', from: 'bridge-east', to: 'ruins', via: [[631, 584]], spaces: 0, snap: true },
  { id: 'ruins-steps', name: 'Ruins Steps', trail: 'ruins', from: 'ruins', to: 'temple-east', via: [[617, 523]], spaces: 1, snap: true, digSites: [{ at: [617, 523], name: 'Ruins Dig' }] },
  { id: 'vale-pass', name: 'Vale Pass', trail: 'ruins', from: 'vale', to: 'ruins', via: [[750, 616], [742, 578], [703, 565]], spaces: 1, snap: true, blockable: [{ at: [705, 562], id: 'vale-pass', name: 'Vale Pass' }] },
  { id: 'purple-lane', name: 'Purple Lane', trail: 'ruins', from: 'vale', to: 19, via: [[778, 678]], spaces: 0, snap: true },
  { id: 'ruins-road', name: 'Ruins Road', trail: 'ruins', from: 'pit', to: 'ruins', via: [[697, 520]], spaces: 0, snap: true, structures: [{ at: [697, 520], kind: 'plot', gate: 'ruins-road', name: 'Ruins Road (unbuilt)', open: false }] },
  { id: 'gate-road', name: 'Dragon Gate Road', trail: 'ruins', from: 'pit', to: 16, via: [[774, 493], [816, 495]], spaces: 1, snap: true },
  { id: 'pit-road', name: 'Pit Road', trail: 'ruins', from: 'pit', to: 'crag', via: [[735, 452], [744, 409]], spaces: 1, snap: true, hazards: [{ at: [740, 430], name: 'Crag Snare' }] },
  // Sapphire falls
  { id: 'crag-pass', name: 'Crag Pass', trail: 'falls', from: 'crag', to: 'sapphire', via: [[742, 343]], spaces: 0, snap: true, blockable: [{ at: [742, 343], id: 'crag-pass', name: 'Crag Pass' }] },
  { id: 'blue-road', name: 'Blue Falls Road', trail: 'falls', from: 'sapphire', to: 12, via: [[798, 298], [837, 293]], spaces: 1, snap: true },
  { id: 'falls-path', name: 'Falls Path', trail: 'falls', from: 'sapphire', to: 8, via: [[775, 262], [758, 225]], spaces: 1, snap: true, terrainSites: [[768, 245]] },
  {
    id: 'mine',
    name: 'Crystal Mine Road',
    trail: 'falls',
    from: 'sapphire',
    to: 7,
    via: [[714, 288], [670, 292], [625, 302], [612, 258], [621, 213], [636, 168]],
    spaces: 3,
    snap: true,
    structures: [{ at: [640, 170], kind: 'tunnel', gate: 'mine-tunnel', name: 'Crystal Mine Tunnel', open: false }],
  },
];

/** Chance (out of the die) that stopping on a trap-risk stone springs the snare: 1–2 on a d6. */
export const HAZARD_ROLL_MAX = 2;

/** Dungeon spaces on the dungeon painting (public/board/dungeon.jpg, 1024 × 1024). */
export interface DungeonSpace {
  id: string;
  name: string;
  at: Pt;
  type: 'dEntrance' | 'path' | 'monster' | 'dragonChamber' | 'gemChamber' | 'trap' | 'vault' | 'safeRoom';
  /** Arrival encounter (Stone Golem / Cave Spider). Separate from the Monster Den adventure fight. */
  encounter?: EncounterDef;
}

export const DUNGEON_SPACES: DungeonSpace[] = [
  { id: 'd-entrance', name: 'Dungeon Entrance', at: [495, 880], type: 'dEntrance' },
  { id: 'd-w1', name: 'West Tunnel', at: [400, 790], type: 'path' },
  { id: 'd-e1', name: 'East Tunnel', at: [600, 790], type: 'path' },
  { id: 'd-w2', name: 'West Tunnel', at: [290, 720], type: 'path' },
  { id: 'd-ruins', name: 'Fallen Ruins', at: [175, 668], type: 'safeRoom' },
  { id: 'd-w3', name: 'Bone Passage', at: [110, 560], type: 'path' },
  { id: 'd-monster', name: 'Monster Den', at: [175, 445], type: 'monster' },
  { id: 'd-w4', name: 'Vault Stair', at: [150, 270], type: 'path' },
  { id: 'd-vault', name: 'Old Vault', at: [135, 165], type: 'vault' },
  { id: 'd-c1', name: 'Pool Path', at: [380, 640], type: 'path' },
  { id: 'd-c2', name: 'Waterfall Pool', at: [355, 470], type: 'path' },
  {
    id: 'd-golem',
    name: 'Stone Golem',
    at: [250, 530],
    type: 'path',
    encounter: { monster: 'golem', name: 'Stone Golem', shortcutTo: 'd-e4', safeRoom: 'd-ruins' },
  },
  { id: 'd-c3', name: 'Lair Steps', at: [330, 320], type: 'path' },
  { id: 'd-lair', name: 'Dragon Lair', at: [505, 185], type: 'dragonChamber' },
  { id: 'd-e2', name: 'Spike Hall', at: [700, 690], type: 'path' },
  { id: 'd-pit', name: 'Spike Pit', at: [820, 640], type: 'trap' },
  { id: 'd-e3', name: 'Crystal Path', at: [700, 520], type: 'path' },
  {
    id: 'd-spider',
    name: 'Cave Spider',
    at: [800, 450],
    type: 'path',
    encounter: { monster: 'spider', name: 'Cave Spider', safeRoom: 'd-safe-crystal' },
  },
  { id: 'd-safe-crystal', name: 'Crystal Niche', at: [850, 520], type: 'safeRoom' },
  { id: 'd-e4', name: 'Crystal Path', at: [700, 330], type: 'path' },
  { id: 'd-shrine', name: 'Crystal Shrine', at: [865, 345], type: 'gemChamber' },
];

export const DUNGEON_HALLS: [string, string, { guard?: true; name?: string }?][] = [
  ['d-entrance', 'd-w1'],
  ['d-entrance', 'd-e1'],
  ['d-w1', 'd-w2'],
  ['d-w2', 'd-ruins'],
  ['d-ruins', 'd-w3'],
  ['d-w3', 'd-monster'],
  ['d-monster', 'd-w4', { guard: true, name: 'Vault Door' }],
  ['d-w4', 'd-vault'],
  ['d-w1', 'd-c1'],
  ['d-c1', 'd-c2'],
  ['d-c2', 'd-golem'],
  ['d-c2', 'd-c3'],
  ['d-c3', 'd-lair'],
  ['d-e1', 'd-e2'],
  ['d-e2', 'd-pit'],
  ['d-e2', 'd-e3'],
  ['d-e3', 'd-spider'],
  ['d-e3', 'd-safe-crystal'],
  ['d-e3', 'd-e4'],
  ['d-e4', 'd-shrine'],
  ['d-e4', 'd-lair'],
];
