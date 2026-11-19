import type { EncounterDef, GemKind } from './types';

/**
 * Crown Quest board data, in pixels of the island painting (public/board/island.jpg, 1536 × 1024).
 *
 * The painting is decoration; these lists are the rules. The main road is a ring of CIRCUIT_LENGTH
 * spaces through all four house plates, walked in either direction; it crosses Dragon Mountain
 * through the painted tunnel. Anchors pin chosen circuit indices to points on the painted road;
 * `scripts/trace-island.ts` snaps the road between consecutive anchors (and every inner road marked
 * `snap`) onto the painting and writes crownRoutes.ts, and the builder spaces the stones evenly.
 */

/** Both paintings (island and dungeon) are 3:2, 1536 × 1024; every position below is in their pixels. */
export const BOARD_W = 1536;
export const BOARD_H = 1024;
/** The playable middle of both paintings: everything outside it is open sea or cave wall. */
export const BOARD_CONTENT = { x: 270, y: 0, w: 1030, h: 1024 };
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
  { idx: 0, at: [483, 175], via: [[526, 178]] },
  { idx: 2, at: [570, 174], via: [[600, 205]] },
  { idx: 4, at: [623, 238], via: [[673, 224]] },
  { idx: 6, at: [721, 205], snap: false, tunnel: 'Dragon Mountain Tunnel' },
  { idx: 7, at: [954, 150], via: [[996, 165]] },
  { idx: 8, at: [1034, 184], via: [[1079, 183]] },
  { idx: 10, at: [1123, 175], via: [[1121, 221], [1149, 254]] },
  { idx: 12, at: [1158, 290], via: [[1203, 311], [1219, 351], [1217, 393], [1237, 432], [1211, 467]] },
  { idx: 16, at: [1150, 496], via: [[1147, 549], [1155, 591], [1152, 633], [1144, 674], [1107, 695]] },
  { idx: 19, at: [1089, 699], via: [[1078, 724], [1075, 767]] },
  { idx: 20, at: [1090, 810], via: [[1047, 799], [1003, 794], [960, 789], [920, 771]] },
  { idx: 23, at: [886, 755], via: [[843, 778], [824, 817], [784, 829], [751, 855], [709, 866], [680, 841], [642, 822]] },
  { idx: 28, at: [612, 792], via: [[573, 788], [531, 801]] },
  { idx: 30, at: [488, 805], via: [[451, 777]] },
  { idx: 31, at: [442, 712], via: [[425, 705], [384, 694], [362, 670], [359, 628], [370, 587], [358, 549], [343, 508], [369, 473]] },
  { idx: 35, at: [383, 459], via: [[384, 435], [375, 392], [405, 362], [430, 334], [475, 329]] },
  { idx: 38, at: [493, 313], via: [[480, 297], [443, 273], [426, 238], [464, 217]] },
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
  { key: 'red', name: 'Red', castleName: 'Red Castle', castle: [413, 100], entry: 0, finalVia: [[568, 238], [623, 300], [683, 330], [738, 362]] },
  { key: 'blue', name: 'Blue', castleName: 'Blue Castle', castle: [1190, 105], entry: 10, finalVia: [[1090, 250], [1020, 290], [943, 335], [863, 372]] },
  { key: 'purple', name: 'Purple', castleName: 'Purple Castle', castle: [1183, 735], entry: 20, finalVia: [[993, 735], [950, 655], [906, 560], [838, 470]] },
  { key: 'green', name: 'Green', castleName: 'Green Castle', castle: [370, 740], entry: 30, finalVia: [[518, 630], [583, 580], [628, 500], [718, 445]] },
];

export const TEMPLE_AT: Pt = [790, 388];

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
  { id: 'plaza', name: 'Temple Plaza', at: [787, 462], trail: 'temple' },
  { id: 'temple-west', name: 'West Temple Gate', at: [675, 448], trail: 'temple' },
  { id: 'temple-east', name: 'East Temple Gate', at: [861, 496], trail: 'temple' },
  { id: 'camp-west', name: 'Camp Crossing', at: [532, 524], trail: 'camp' },
  { id: 'camp-east', name: 'Camp Corner', at: [664, 553], trail: 'camp' },
  { id: 'fern', name: 'Fern Crossing', at: [473, 652], trail: 'camp' },
  { id: 'glade', name: 'Emerald Glade', at: [631, 656], trail: 'camp' },
  { id: 'rope-west', name: 'Rope Bridge Landing', at: [655, 716], trail: 'river' },
  { id: 'bridge-west', name: 'Stone Bridge West', at: [687, 602], trail: 'river' },
  { id: 'bridge-east', name: 'Stone Bridge East', at: [871, 606], trail: 'river' },
  { id: 'falls', name: 'Falls Crossing', at: [896, 678], trail: 'river' },
  { id: 'ruins', name: 'Old Ruins', at: [950, 556], trail: 'ruins' },
  { id: 'vale', name: 'Diamond Vale', at: [1061, 681], trail: 'ruins' },
  { id: 'pit', name: 'Pit Crossing', at: [1009, 496], trail: 'ruins' },
  { id: 'crag', name: 'Crag Crossing', at: [989, 378], trail: 'falls' },
  { id: 'sapphire', name: 'Sapphire Pool', at: [1037, 301], trail: 'falls' },
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
  { id: 'red-road', name: 'Red Temple Road', trail: 'temple', from: 4, to: 'temple-west', via: [[648, 278], [694, 289], [713, 318], [683, 353], [676, 399]], spaces: 3, snap: true },
  { id: 'temple-pass', name: 'Temple Pass', trail: 'temple', from: 'temple-west', to: 'plaza', via: [[711, 461], [749, 461]], spaces: 1, snap: true, blockable: [{ at: [758, 462], id: 'temple-pass', name: 'Temple Pass' }] },
  { id: 'camp-steps', name: 'Camp Steps', trail: 'temple', from: 'camp-east', to: 'plaza', via: [[709, 510], [745, 482]], spaces: 1, snap: true },
  { id: 'east-steps', name: 'East Temple Steps', trail: 'temple', from: 'temple-east', to: 'plaza', via: [[833, 494]], spaces: 0, snap: true },
  { id: 'crag-road', name: 'Crag Road', trail: 'temple', from: 'crag', to: 'temple-east', via: [[947, 385], [909, 397], [904, 438], [874, 460]], spaces: 2, snap: true },
  // Lakeside
  { id: 'lake', name: 'Lakeside Road', trail: 'lake', from: 38, to: 'temple-west', via: [[529, 334], [574, 339], [600, 370], [636, 383]], spaces: 3, snap: true, terrainSites: [[600, 370]], digSites: [{ at: [548, 336], name: 'Lakeside Dig' }] },
  { id: 'willow', name: 'Willow Road', trail: 'lake', from: 38, to: 4, via: [[526, 276], [573, 258]], spaces: 1, snap: true },
  // Camp and glade
  { id: 'camp-trail', name: 'Camp Trail', trail: 'camp', from: 35, to: 'camp-west', via: [[424, 470], [458, 494], [491, 513]], spaces: 1, snap: true },
  { id: 'camp-road', name: 'Camp Road', trail: 'camp', from: 'camp-west', to: 'camp-east', via: [[578, 511], [625, 511]], spaces: 1, snap: true, structures: [{ at: [638, 515], kind: 'plot', gate: 'camp-road', name: 'Camp Road (unbuilt)', open: false }], digSites: [{ at: [588, 512], name: 'Old Camp Dig' }] },
  { id: 'bridge-lane', name: 'Bridge Lane', trail: 'camp', from: 'camp-east', to: 'bridge-west', via: [[661, 571]], spaces: 0, snap: true },
  { id: 'bramble', name: 'Bramble Lane', trail: 'camp', from: 'camp-west', to: 'fern', via: [[508, 551], [476, 574], [474, 613]], spaces: 1, snap: true, hazards: [{ at: [483, 590], name: 'Bramble Snare' }] },
  { id: 'green-lane', name: 'Green Lane', trail: 'camp', from: 'fern', to: 31, via: [[450, 676]], spaces: 0, snap: true },
  { id: 'glade-road', name: 'Glade Road', trail: 'camp', from: 'fern', to: 'glade', via: [[513, 651], [552, 644], [592, 647]], spaces: 1, snap: true, digSites: [{ at: [552, 644], name: 'Glade Dig' }] },
  { id: 'glade-north', name: 'Glade Path', trail: 'camp', from: 'glade', to: 'bridge-west', via: [[668, 638]], spaces: 0, snap: true },
  { id: 'glade-south', name: 'Glade Path', trail: 'camp', from: 'glade', to: 'rope-west', via: [[629, 692]], spaces: 0, snap: true },
  { id: 'harbour-lane', name: 'Harbour Lane', trail: 'camp', from: 'rope-west', to: 28, via: [[635, 753]], spaces: 0, snap: true },
  // River crossings
  { id: 'rope', name: 'Rope Bridge Road', trail: 'river', from: 'rope-west', to: 'falls', via: [[691, 700], [731, 688], [771, 676], [811, 681], [851, 688]], spaces: 2, snap: true, structures: [{ at: [726, 690], kind: 'bridge', gate: 'broken-bridge', name: 'Rope Bridge', open: false }], hazards: [{ at: [818, 680], name: 'Spray Snare' }] },
  { id: 'stone', name: 'Stone Bridge Road', trail: 'river', from: 'bridge-west', to: 'bridge-east', via: [[733, 602], [779, 602], [825, 605]], spaces: 1, snap: true, structures: [{ at: [748, 602], kind: 'bridge', gate: 'stone-bridge', name: 'Stone Bridge', open: true }] },
  { id: 'gorge', name: 'Gorge Path', trail: 'river', from: 'bridge-east', to: 'falls', via: [[883, 640]], spaces: 0, snap: true },
  { id: 'falls-road', name: 'Falls Road', trail: 'river', from: 'falls', to: 23, via: [[884, 716]], spaces: 0, snap: true },
  { id: 'vale-road', name: 'Vale Road', trail: 'river', from: 'falls', to: 'vale', via: [[938, 669], [981, 661]], spaces: 1, snap: true, terrainSites: [[958, 665]] },
  // East ruins
  { id: 'ruins-lane', name: 'Ruins Lane', trail: 'ruins', from: 'bridge-east', to: 'ruins', via: [[909, 584]], spaces: 0, snap: true },
  { id: 'ruins-steps', name: 'Ruins Steps', trail: 'ruins', from: 'ruins', to: 'temple-east', via: [[895, 523]], spaces: 1, snap: true, digSites: [{ at: [895, 523], name: 'Ruins Dig' }] },
  { id: 'vale-pass', name: 'Vale Pass', trail: 'ruins', from: 'vale', to: 'ruins', via: [[1028, 616], [1020, 578], [981, 565]], spaces: 1, snap: true, blockable: [{ at: [983, 562], id: 'vale-pass', name: 'Vale Pass' }] },
  { id: 'purple-lane', name: 'Purple Lane', trail: 'ruins', from: 'vale', to: 19, via: [[1056, 678]], spaces: 0, snap: true },
  { id: 'ruins-road', name: 'Ruins Road', trail: 'ruins', from: 'pit', to: 'ruins', via: [[975, 520]], spaces: 0, snap: true, structures: [{ at: [975, 520], kind: 'plot', gate: 'ruins-road', name: 'Ruins Road (unbuilt)', open: false }] },
  { id: 'gate-road', name: 'Dragon Gate Road', trail: 'ruins', from: 'pit', to: 16, via: [[1052, 493], [1094, 495]], spaces: 1, snap: true },
  { id: 'pit-road', name: 'Pit Road', trail: 'ruins', from: 'pit', to: 'crag', via: [[1013, 452], [1022, 409]], spaces: 1, snap: true, hazards: [{ at: [1018, 430], name: 'Crag Snare' }] },
  // Sapphire falls
  { id: 'crag-pass', name: 'Crag Pass', trail: 'falls', from: 'crag', to: 'sapphire', via: [[1020, 343]], spaces: 0, snap: true, blockable: [{ at: [1020, 343], id: 'crag-pass', name: 'Crag Pass' }] },
  { id: 'blue-road', name: 'Blue Falls Road', trail: 'falls', from: 'sapphire', to: 12, via: [[1076, 298], [1115, 293]], spaces: 1, snap: true },
  { id: 'falls-path', name: 'Falls Path', trail: 'falls', from: 'sapphire', to: 8, via: [[1053, 262], [1036, 225]], spaces: 1, snap: true, terrainSites: [[1046, 245]] },
  {
    id: 'mine',
    name: 'Crystal Mine Road',
    trail: 'falls',
    from: 'sapphire',
    to: 7,
    via: [[992, 288], [948, 292], [903, 302], [890, 258], [899, 213], [914, 168]],
    spaces: 3,
    snap: true,
    structures: [{ at: [918, 170], kind: 'tunnel', gate: 'mine-tunnel', name: 'Crystal Mine Tunnel', open: false }],
  },
];

/** Chance (out of the die) that stopping on a trap-risk stone springs the snare: 1–2 on a d6. */
export const HAZARD_ROLL_MAX = 2;

/** Dungeon spaces on the dungeon painting (public/board/dungeon.jpg, 1536 × 1024). */
export interface DungeonSpace {
  id: string;
  name: string;
  at: Pt;
  type: 'dEntrance' | 'path' | 'monster' | 'dragonChamber' | 'gemChamber' | 'trap' | 'vault' | 'safeRoom';
  /** Arrival encounter (Stone Golem / Cave Spider). Separate from the Monster Den adventure fight. */
  encounter?: EncounterDef;
}

export const DUNGEON_SPACES: DungeonSpace[] = [
  { id: 'd-entrance', name: 'Dungeon Entrance', at: [765, 835], type: 'dEntrance' },
  { id: 'd-w1', name: 'West Tunnel', at: [672, 751], type: 'path' },
  { id: 'd-e1', name: 'East Tunnel', at: [868, 751], type: 'path' },
  { id: 'd-w2', name: 'West Tunnel', at: [564, 685], type: 'path' },
  { id: 'd-ruins', name: 'Fallen Ruins', at: [452, 636], type: 'safeRoom' },
  { id: 'd-w3', name: 'Bone Passage', at: [388, 534], type: 'path' },
  { id: 'd-monster', name: 'Monster Den', at: [452, 426], type: 'monster' },
  { id: 'd-w4', name: 'Vault Stair', at: [427, 262], type: 'path' },
  { id: 'd-vault', name: 'Old Vault', at: [412, 163], type: 'vault' },
  { id: 'd-c1', name: 'Pool Path', at: [652, 610], type: 'path' },
  { id: 'd-c2', name: 'Waterfall Pool', at: [628, 450], type: 'path' },
  {
    id: 'd-golem',
    name: 'Stone Golem',
    at: [525, 506],
    type: 'path',
    encounter: { monster: 'golem', name: 'Stone Golem', shortcutTo: 'd-e4', safeRoom: 'd-ruins' },
  },
  { id: 'd-c3', name: 'Lair Steps', at: [603, 309], type: 'path' },
  { id: 'd-lair', name: 'Dragon Lair', at: [775, 182], type: 'dragonChamber' },
  { id: 'd-e2', name: 'Spike Hall', at: [966, 657], type: 'path' },
  { id: 'd-pit', name: 'Spike Pit', at: [1084, 610], type: 'trap' },
  { id: 'd-e3', name: 'Crystal Path', at: [966, 497], type: 'path' },
  {
    id: 'd-spider',
    name: 'Cave Spider',
    at: [1064, 431],
    type: 'path',
    encounter: { monster: 'spider', name: 'Cave Spider', safeRoom: 'd-safe-crystal' },
  },
  { id: 'd-safe-crystal', name: 'Crystal Niche', at: [1113, 497], type: 'safeRoom' },
  { id: 'd-e4', name: 'Crystal Path', at: [966, 318], type: 'path' },
  { id: 'd-shrine', name: 'Crystal Shrine', at: [1128, 332], type: 'gemChamber' },
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
