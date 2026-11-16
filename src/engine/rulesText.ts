import { DEFAULT_CONFIG as C } from './config';
import { HAZARD_ROLL_MAX } from './crownLayout';
import type { CardCategory, CardType, CharacterKind, NodeType } from './types';

export const GAME_TITLE = 'Kingdom Chaos: Crown Quest';
export const QUICK_GOAL =
  'Bank a Ruby, Sapphire, Emerald and Diamond at your gate, cut at least one opponent, touch all four house plates with one character (a lap), then walk it up your Royal Path to the Crown Temple.';

export interface CardText {
  name: string;
  category: CardCategory;
  /** One line on the card face. */
  short: string;
  /** Full effect text. */
  full: string;
  usesAction: string;
  targets: string;
  duration: string;
  restrictions: string;
  /** Shown when there is no legal target. */
  noTarget?: string;
}

const A = 'Uses your adventure action';

export const CARD_INFO: Record<CardType, CardText> = {
  build_bridge: {
    name: 'Build Bridge',
    category: 'map',
    short: 'Rebuild a broken bridge.',
    full: 'Rebuild a marked broken bridge (the Rope Bridge on the River Crossings starts broken). Every house can walk across it afterwards.',
    usesAction: A,
    targets: 'A marked broken bridge',
    duration: 'Until collapsed',
    restrictions: 'Only marked bridge sites.',
    noTarget: 'Every bridge is already standing.',
  },
  collapse_bridge: {
    name: 'Collapse Bridge',
    category: 'map',
    short: 'Knock down a bridge.',
    full: 'Collapse a standing bridge on an inner route (the Stone Bridge starts open; the Rope Bridge can be collapsed once it is rebuilt). The main road can never be closed.',
    usesAction: A,
    targets: 'A standing bridge with nobody at either end',
    duration: 'Until rebuilt or repaired',
    restrictions: 'Cannot strand any piece or castle.',
    noTarget: 'No bridge can be collapsed right now (occupied, or it would strand someone).',
  },
  dig_tunnel: {
    name: 'Dig Tunnel',
    category: 'map',
    short: 'Open a marked tunnel.',
    full: 'Open the Crystal Mine Tunnel on the Sapphire Falls Roads. It stays sealed until someone digs it. The Dragon Mountain Tunnel is one step of the main road and is already open.',
    usesAction: A,
    targets: 'A marked tunnel site',
    duration: 'Permanent',
    restrictions: 'Only marked tunnel sites.',
    noTarget: 'Every tunnel is already open.',
  },
  build_road: {
    name: 'Build Road',
    category: 'map',
    short: 'Pave a marked road plot.',
    full: 'Pave a marked road plot: the Camp Road on the Camp and Glade Roads, or the Ruins Road on the East Ruins Roads. Both start unbuilt.',
    usesAction: A,
    targets: 'A marked road plot',
    duration: 'Permanent',
    restrictions: 'Only marked plots.',
    noTarget: 'Every road is already built.',
  },
  raise_mountain: {
    name: 'Raise Mountain',
    category: 'map',
    short: 'Close a marked inner-route space.',
    full: 'Raise a mountain on an empty marked terrain site. Paths through that space close for everyone.',
    usesAction: A,
    targets: 'An empty marked terrain site',
    duration: 'Until repaired',
    restrictions: 'Never on the main road, castles, temple, stations or the dungeon gate. Cannot strand anyone.',
    noTarget: 'No terrain site is free (occupied, already changed, or it would strand someone).',
  },
  create_river: {
    name: 'Create River',
    category: 'map',
    short: 'Flood a marked inner-route space.',
    full: 'Flood an empty marked terrain site with a river. Paths through that space close for everyone. (It does not create a boat route.)',
    usesAction: A,
    targets: 'An empty marked terrain site',
    duration: 'Until repaired',
    restrictions: 'Never on the main road, castles, temple, stations or the dungeon gate. Cannot strand anyone.',
    noTarget: 'No terrain site is free (occupied, already changed, or it would strand someone).',
  },
  landslide: {
    name: 'Landslide',
    category: 'map',
    short: 'Block a marked pass.',
    full: 'Drop rocks on a marked pass (Temple Pass, Vale Pass or Crag Pass). Pieces and Dragon Fire cannot cross it.',
    usesAction: A,
    targets: 'A marked pass',
    duration: 'Until repaired, or until you place another landslide',
    restrictions: 'One landslide per player at a time. Cannot strand anyone.',
    noTarget: 'No pass can be blocked right now.',
  },
  repair: {
    name: 'Repair',
    category: 'map',
    short: 'Undo a map change.',
    full: 'Clear a landslide, restore a raised or flooded space, or rebuild a broken bridge.',
    usesAction: A,
    targets: 'A landslide, a changed space, or a broken bridge',
    duration: 'Permanent',
    restrictions: 'Only map changes.',
    noTarget: 'Nothing needs repairing.',
  },
  shield: {
    name: 'Shield',
    category: 'power',
    short: 'No cuts, no Dragon Fire.',
    full: 'One of your pieces cannot be cut (landing on it is not allowed) or hit by Dragon Fire. Traps still work.',
    usesAction: A,
    targets: 'One of your pieces',
    duration: 'Until the start of your next turn',
    restrictions: 'Does not stop traps.',
  },
  magic_boots: {
    name: 'Magic Boots',
    category: 'power',
    short: `Walk exactly ${C.magicBootsSteps} more spaces.`,
    full: `Walk one of your pieces exactly ${C.magicBootsSteps} spaces by the normal road rules. Plates, gems and banking count, but the boots never cut.`,
    usesAction: A,
    targets: 'One of your pieces and a route',
    duration: 'Instant',
    restrictions: 'Cannot land on an opponent on an unsafe space. No portal hop.',
    noTarget: `None of your pieces has a legal ${C.magicBootsSteps}-space walk.`,
  },
  immunity: {
    name: 'Immunity',
    category: 'power',
    short: 'Untouchable.',
    full: 'One of your pieces cannot be cut, hit by Dragon Fire, or targeted by opponents’ Swap.',
    usesAction: A,
    targets: 'One of your pieces',
    duration: 'Until the start of your next turn',
    restrictions: 'Does not stop traps.',
  },
  dragon_slayer: {
    name: 'Dragon Slayer',
    category: 'power',
    short: `Queen: roll ${C.slayThreshold}+ to drive off the dragon.`,
    full: `Your Queen, on or next to the dragon, rolls: ${C.slayThreshold}–6 sends the dragon (and anyone’s companion) back to its lair to recover for one round. Fail: she retreats.`,
    usesAction: A,
    targets: 'Your Queen',
    duration: 'Dragon recovers for one round',
    restrictions: 'Queen only. Not on a recovering dragon or your own companion.',
    noTarget: 'Your Queen must stand on or next to the dragon (and it must not be recovering or yours).',
  },
  dragon_feast: {
    name: 'Dragon Feast',
    category: 'power',
    short: `Tame on ${C.feastTameThreshold}+.`,
    full: `Lure the dragon with a feast: a piece standing with a guarding or wild dragon tames it on ${C.feastTameThreshold}+ instead of ${C.tameThreshold}+. Fail: retreat.`,
    usesAction: A,
    targets: 'Your piece on the dragon’s space',
    duration: 'Instant',
    restrictions: 'You cannot already have the dragon.',
    noTarget: 'Stand on the dragon’s space with one of your pieces first.',
  },
  swap: {
    name: 'Swap',
    category: 'special',
    short: 'Trade places with an opponent.',
    full: 'Swap one of your pieces with an opponent’s piece. Both must be on roads (not castles, Royal Paths, the temple or the dungeon). Plates in between do not count; a piece swapped onto a plate touches it.',
    usesAction: A,
    targets: 'One of your pieces and one opponent piece',
    duration: 'Instant',
    restrictions: 'Not on protected pieces or dragon companions.',
    noTarget: 'No legal pair to swap.',
  },
  slow_down: {
    name: 'Slow Down',
    category: 'special',
    short: `Rival’s next move: at most ${C.slowDownMaxSteps}.`,
    full: `Choose an opponent. Their next move is capped at ${C.slowDownMaxSteps} spaces.`,
    usesAction: A,
    targets: 'An opponent',
    duration: 'Their next roll',
    restrictions: 'Not on a player already slowed.',
  },
  dragon_roar: {
    name: 'Dragon Roar',
    category: 'special',
    short: 'Drive a free dragon up to 3 spaces.',
    full: 'Move a guarding or wild dragon up to 3 open spaces on its map. It runs wild where it lands and blocks the road there.',
    usesAction: A,
    targets: 'A space within 3 of a free dragon',
    duration: 'Until moved again',
    restrictions: 'Not a companion. Never into castles, Royal Paths or the temple.',
    noTarget: 'The dragon is a companion or recovering.',
  },
  rescue: {
    name: 'Rescue',
    category: 'special',
    short: 'Bring a piece home, banking its gems.',
    full: 'Send one of your pieces straight home. A carried gem is banked on arrival. Its plates start over.',
    usesAction: A,
    targets: 'One of your pieces outside the castle and Royal Path',
    duration: 'Instant',
    restrictions: 'Resets that piece’s plates.',
  },
  reveal_discovery: {
    name: 'Reveal Discovery',
    category: 'special',
    short: 'Draw a discovery anywhere.',
    full: 'One of your pieces draws a discovery where it stands, as if it had dug there.',
    usesAction: A,
    targets: 'One of your pieces',
    duration: 'Instant',
    restrictions: 'Not in a castle, on a Royal Path or at the temple.',
  },
};

export const CATEGORY_INFO: Record<CardCategory, { name: string; blurb: string }> = {
  map: { name: 'Map', blurb: 'Open or close marked sites on the inner routes — for every house. The main road, castles, temple, stations and dungeon gate never change, and nobody can be stranded.' },
  power: { name: 'Power', blurb: 'Protect a piece, walk further, or deal with the dragon.' },
  special: { name: 'Special', blurb: 'Tricks: swaps, slow-downs, roars, rescues and discoveries.' },
};

export interface CharacterText {
  name: string;
  abilityName: string;
  ability: string;
}

export const CHARACTER_INFO: Record<CharacterKind, CharacterText> = {
  king: { name: 'King', abilityName: 'Royal Treasury', ability: 'When the King banks a new gem, draw a card.' },
  queen: { name: 'Queen', abilityName: 'Royal Passage', ability: 'Passes opponents without cutting them (she still cuts by landing). Only she can use Dragon Slayer.' },
  witch: { name: 'Witch', abilityName: 'Portal Hop', ability: 'Once per turn, hop between the East and West Moonstone Arches for free during her move.' },
  knight: { name: 'Knight', abilityName: 'Charge', ability: `+${C.knightBonus} against the monster. May cut one unprotected opponent he passes and keep moving.` },
};

export interface LocationText {
  name: string;
  rule: string;
}

export const LOCATION_INFO: Record<NodeType, LocationText> = {
  castle: { name: 'Castle', rule: 'Home. Pieces start here and return here when cut. Any roll moves a piece out onto its gate.' },
  circuit: { name: 'Main road', rule: 'A 40-space two-way ring through all four house plates. It crosses Dragon Mountain in one tunnel step (the painted tunnel between the north road and the Crystal Mine). Cards cannot close it. Moves use the whole roll. Ending on an opponent here cuts it.' },
  final: { name: 'Royal Path', rule: 'Your own path to the temple. Safe. Opens once you have every gem and a cut, for a piece that has touched all four house plates.' },
  temple: { name: 'Crown Temple', rule: 'Land here exactly from your Royal Path to win.' },
  side: { name: 'Inner route', rule: 'A two-way trail across the island: often shorter, but cards can open or close it, and some stones carry a trap risk.' },
  dEntrance: { name: 'Dungeon Entrance', rule: 'Safe. Adventure: leave the dungeon to the Dragon Gate.' },
  path: { name: 'Dungeon passage', rule: 'Dungeon moves may stop early and go either way.' },
  monster: { name: 'Monster Den', rule: `Adventure: fight the monster. Roll ${C.monsterThreshold}+ (Knight +${C.knightBonus}) to open the Vault Door this visit. Lose: retreat.` },
  dragonChamber: { name: 'Dragon Lair', rule: 'The dragon guards and recovers here. Stand with it to tame it.' },
  gemChamber: { name: 'Crystal Shrine', rule: 'Adventure: take any gem your kingdom still needs.' },
  trap: { name: 'Spike Pit', rule: 'Ending a move here drops you through the Dungeon Trapdoor to the Dungeon Entrance.' },
  vault: { name: 'Old Vault', rule: 'Behind the guarded Vault Door. Adventure: dig for a discovery.' },
  safeRoom: { name: 'Safe room', rule: 'Safe. Failed fights retreat here.' },
};

export const FEATURE_INFO = {
  safe: 'Safe space: nobody can be cut here, and several pieces (even opponents) may share it.',
  entry: 'House gate and public plate: its pieces leave the castle here and bank gems here. Any piece of any house that passes or lands here touches this plate for its lap.',
  fork: 'Fork: once your Royal Path is open, a piece that has touched all four plates turns in here.',
  station: 'Gem station: passing or landing with free hands picks up this gem if your kingdom needs it.',
  dig: 'Dig site: adventure action to draw a discovery — a gem, a card, a key, a hidden route opened for everyone, or a buried trap.',
  dungeonGate: 'Dragon Gate, on the east coast: adventure action to enter the dungeon.',
  dock: 'Dock: when the boat is here, sail to the other dock (adventure action; plates on the way do not count).',
  airfield: 'Airfield: when the plane is here, fly to the other airfield (adventure action; plates on the way do not count).',
  portal: 'East and West Moonstone Arches: the Witch may hop from one to the other once per turn for free.',
  terrainSite: 'Terrain site: Raise Mountain or Create River can close this space.',
  hazard: `Trap risk: a piece that stops here rolls the die; on 1–${HAZARD_ROLL_MAX} a snare drags it back to the nearest main-road space. It keeps its gems and plates. Passing through is safe.`,
};

export const STATUS_INFO = {
  shield: 'Shield — cannot be cut or burned until its owner’s next turn.',
  immune: 'Immune — cannot be cut, burned or swapped until its owner’s next turn.',
  carrying: 'Carrying gems — bank them at your house gate. If cut, the cutter takes what it can carry.',
  companion: `Dragon companion — moves max(${C.dragonMinMove}, roll − ${C.dragonMovePenalty}); can breathe Dragon Fire.`,
  slowed: `Slowed — next move is at most ${C.slowDownMaxSteps}.`,
  beatMonster: 'Beat the monster — the Vault Door is open for this visit.',
  lap: 'Lap — this piece must touch all four house plates (Red, Blue, Purple, Green), in any order. A cut or a trip home starts it over.',
};

export interface RuleSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export const RULE_SECTIONS: RuleSection[] = [
  {
    id: 'objective',
    title: 'Objective',
    paragraphs: [QUICK_GOAL, 'Every house has the same goal, but you choose your own routes and tactics to reach it.'],
    bullets: [
      'Gems and the cut belong to the player (your house). Plates belong to each character.',
      'Your Royal Path opens once all four gems are banked and you have made one cut by movement. Only a character that has touched all four plates may turn onto it.',
      `Timer target: ${C.matchDurationMs / 60000} minutes. When time runs out: most gems wins, then a cut made, then a shared victory.`,
    ],
  },
  {
    id: 'turn',
    title: 'Turns and dice',
    paragraphs: ['Turns go clockwise. Each turn has one move and one optional adventure action, in either order. The turn ends by itself once both are used (or skipped).'],
    bullets: [
      'Roll one die, then choose which piece uses it. Changing your selection never rerolls.',
      `A move must use the whole roll: no stopping early on the island. With the dragon, the penalty comes first: move max(${C.dragonMinMove}, roll − ${C.dragonMovePenalty}).`,
      'If no piece can use the full roll, the game explains why and skips your move.',
      'Extra turn: a natural 6 earns one extra turn, and so does cutting a rival by movement. A 6 that also cuts still earns only one. Extra turns can chain. The current move and adventure action finish first.',
      'If the turn clock runs out, an earned extra turn is lost.',
      'Adventure actions: play a card · dig · enter or leave the dungeon · fight the monster · tame · Dragon Fire · sail or fly. Releasing your dragon companion is free at the start of your turn.',
    ],
  },
  {
    id: 'movement',
    title: 'Movement and multiple routes',
    paragraphs: ['Every road runs both ways. Tap a piece and every space it can reach with the exact roll glows; the preview shows the route, what happens on it, and the route’s trade-off.'],
    bullets: [
      'A move may never step on the same space twice.',
      'The main road is a 40-space two-way ring through all four house plates. It crosses Dragon Mountain in one tunnel step (the painted tunnel between the north road and the Crystal Mine). Cards cannot close it.',
      'Temple Roads: every inner road meets at the Temple Plaza, the quickest way across the middle of the island. Everyone passes through, so cuts are common, and a Landslide can block the Temple Pass.',
      'Lakeside Roads: from the west coast past the lake to the temple, with a dig site on the shore. The shore can be flooded by Create River or raised by Raise Mountain.',
      'Camp and Glade Roads: a web of forest roads between Green, the old camp and the bridges. Dig sites at the camp and the glade. Trap risk in the brambles, and the Camp Road is unbuilt until someone plays Build Road.',
      'River Crossings: the Stone Bridge and the Rope Bridge cross the gorge between west and east. Trap risk on the spray. The Stone Bridge starts open. The Rope Bridge starts broken, and cards can collapse the Stone Bridge.',
      'East Ruins Roads: round the spike pit and the old ruins, linking Purple, the Dragon Gate and the temple. A dig site in the ruins. Trap risk on the Pit Road (the Crag Snare). The Ruins Road is unbuilt until Build Road, and a Landslide can block the Vale Pass.',
      'Sapphire Falls Roads: mountain roads from Blue down past the falls to the temple. The Crystal Mine Tunnel stays sealed until someone digs it, and a Landslide can block the Crag Pass.',
      'You cannot pass an opponent on an unsafe space (the Queen can; the Knight cuts one he passes). You may pass your own pieces but not end on one outside a safe space.',
      'A wild or guarding dragon stops you on its space; nobody can walk past it. You can never enter an opponent’s castle or Royal Path.',
    ],
  },
  {
    id: 'plates',
    title: 'House plates and the lap',
    paragraphs: ['Each castle has a public house plate at its gate: Red, Blue, Purple and Green. A lap means one character has touched all four, in any order and by any route.'],
    bullets: [
      'Passing a plate counts, and so does landing on it. Leaving your castle touches your own plate.',
      'Progress is tracked per character, for example “Queen: Red ✓ · Blue ✓ · Purple ○ · Green ○”.',
      'Being cut, rescued or sent home resets that character’s plates. Your house keeps its banked gems and its cut.',
      'Teleports, swaps, boats, planes, portal hops and shortcuts do not count plates in between, but a plate you arrive on counts.',
      'A trap keeps your plate progress unless it sends you home. Nothing can grant a lap you did not earn.',
    ],
  },
  {
    id: 'cuts',
    title: 'Cutting and extra turns',
    paragraphs: ['End a move on an opponent on an unsafe space to cut it: it goes home, its plates reset, and you take the gems it carried while your hands are free. A movement cut earns an extra turn.'],
    bullets: [
      'Safe spaces (gold-star stones, castles, gates, Royal Paths, dungeon safe rooms) protect everyone on them and can hold several pieces, even opponents.',
      'Shield and Immunity make landing on that piece illegal — the preview shows it before you commit.',
      'The Knight may cut one unprotected opponent he passes and keep moving; that counts as a cut and earns the extra turn.',
      'A cut never uses your adventure action. Dragon Fire and traps are not cuts and earn no extra turn.',
      'Cutting the dragon’s companion sets the dragon wild on that space.',
    ],
  },
  {
    id: 'gems',
    title: 'Gems and banking',
    paragraphs: ['Four stations: Ruby Mine, Sapphire Falls, Diamond Hill and Emerald Grove. They never run out, and every player can use them.'],
    bullets: [
      'Gems are picked up automatically when a piece with free hands passes or lands on a station, and banked automatically at your own gate.',
      `Each piece carries up to ${C.carryLimit} gems. A piece only picks up gems its kingdom still needs.`,
      'Status per gem: not collected, carried (at risk), or banked (safe forever). A duplicate goes back to its station.',
      'The dungeon’s Crystal Shrine offers any gem you still need; a lucky dig can turn one up.',
    ],
  },
  {
    id: 'characters',
    title: 'Characters',
    paragraphs: ['Every house has a King, Queen, Witch and Knight, each a house-colour token with its symbol (crown, tiara, hat, sword).'],
    bullets: [
      'King — Royal Treasury: draws a card when he banks a new gem.',
      'Queen — Royal Passage: passes opponents without cutting them; only she can use Dragon Slayer.',
      'Witch — Portal Hop: once per turn, hops between the East and West Moonstone Arches for free during her move.',
      `Knight — Charge: +${C.knightBonus} against the monster; may cut one opponent he passes.`,
    ],
  },
  {
    id: 'cards',
    title: 'Cards and digging',
    paragraphs: [
      `Everyone starts with one card of each category. Hands hold at most ${C.handLimit}; drawing into a full hand lets you discard one or decline the new card. Hands are hidden.`,
      'Digging (adventure action on a dig site) always gives something you can use or plan around: a gem you need, a card, a dungeon key, a hidden route opened for every house, or a buried trap. The dig sites are Lakeside Dig, Old Camp Dig, Glade Dig, Ruins Dig and Bone Dig (space 19).',
    ],
    bullets: [CATEGORY_INFO.map.blurb, CATEGORY_INFO.power.blurb, CATEGORY_INFO.special.blurb, 'Playing a card uses your adventure action. Every card in the deck has a target in some position; a card with no legal target right now is greyed out with the reason.'],
  },
  {
    id: 'structures',
    title: 'Bridges, tunnels and terrain',
    paragraphs: ['Inner routes have marked sites: bridges, tunnels, road plots, passes and terrain sites. Opening or closing one changes the roads for every player at once.'],
    bullets: [
      'Build Bridge, Dig Tunnel and Build Road open closed sites. Collapse Bridge, Landslide, Raise Mountain and Create River close open ones. Repair undoes a closure.',
      'Closed until a card or a dig: the Rope Bridge (broken-bridge), the Camp Road (camp-road), the Ruins Road (ruins-road) and the Crystal Mine Tunnel (mine-tunnel). The Stone Bridge starts open. A Landslide card blocks Temple Pass, Vale Pass or Crag Pass.',
      'Selecting a map card shows every legal site on the board. A change that would strand any piece is not offered and is rejected by the server.',
      'The main road can never be closed, so every house can always reach every plate and its own Royal Path.',
    ],
  },
  {
    id: 'traps',
    title: 'Traps and shortcuts',
    paragraphs: ['Red arrow spaces are traps and green arrow spaces are shortcuts. They fire only if your move ends on them.'],
    bullets: [
      'The Landslide trap (space 5) sweeps you to Willow Valley (space 37). Hidden Pit (space 17) drops you to space 4, under Dragon Mountain. River Current (space 25) carries you to the west beach (space 29) and touches no plates on the way. Plates in between do not count.',
      'Magic Lift (space 13) carries you down the east coast to space 18. Secret Passage (space 33) leads north along the west coast to space 38. Plates on the skipped spaces do not count.',
      'The East Moonstone Arch (space 14) and the West Moonstone Arch (space 34) are a pair: the Witch may hop between them once per turn.',
      `Trap risk on the Bramble Snare, the Spray Snare and the Crag Snare. Stopping there rolls the die; 1–${HAZARD_ROLL_MAX} drags you back to the nearest main-road space. Passing through is safe. The board never shows which roll is coming.`,
      'Traps keep your gems and plates and are not cuts.',
    ],
  },
  {
    id: 'dungeon',
    title: 'Dungeon',
    paragraphs: ['Enter from the Dragon Gate on the east coast (space 16) as an adventure action. The dungeon has its own map; dungeon moves may stop early and go either way.'],
    bullets: [
      `Monster Den: roll ${C.monsterThreshold}+ (Knight +${C.knightBonus}) to open the Vault Door for this visit. A dungeon key also opens it once.`,
      'Crystal Shrine: take any needed gem. Old Vault: dig for a discovery. Spike Pit: drops you to the entrance.',
      'Leaving returns you to the Dragon Gate.',
    ],
  },
  {
    id: 'dragon',
    title: 'Dragon',
    paragraphs: ['There is one dragon: guarding its lair, a companion, wild somewhere, or recovering.'],
    bullets: [
      `Tame: stand with it and roll ${C.tameThreshold}–6. Fail: retreat to the nearest safe space.`,
      `A companion moves max(${C.dragonMinMove}, roll − ${C.dragonMovePenalty}), shown as “Roll 5 − Dragon 2 = Move 3”.`,
      `Dragon Fire: hits an opponent within ${C.dragonFireRange} open spaces. Not across closed roads, not into castles or Royal Paths. Shield and Immunity block it.`,
      `Queen + Dragon Slayer: roll ${C.slayThreshold}–6 to send it home to recover for one round. Fail: she retreats.`,
    ],
  },
  {
    id: 'vehicles',
    title: 'Boats and planes',
    paragraphs: ['The boat sails between the Harbour and East Landing; the plane flies between the airfields. Using one is an adventure action and it stays where it arrives.'],
    bullets: ['Plates on the way do not count. Dragon companions cannot ride.'],
  },
  {
    id: 'victory',
    title: 'Final path and victory',
    paragraphs: ['Once your path is open, a character that has touched all four plates turns in at your fork and walks your Royal Path to the Crown Temple.'],
    bullets: [
      'Royal Paths are one-way and safe; only your pieces may use yours. They stay hidden on the board until they matter (a legend toggle shows them for inspection).',
      `Reaching the temple needs the exact roll${C.exactTemple ? '' : ' (this match allows overshooting)'}. Too high and that piece cannot move this turn.`,
    ],
  },
  {
    id: 'timers',
    title: 'Timers',
    paragraphs: [`Timed matches: ${C.matchDurationMs / 60000} minutes total, ${C.turnDurationMs / 1000} seconds per turn. The ${C.matchDurationMs / 60000}-minute length is a design target and has not been validated by playtests. Opening the rules never pauses the clock.`],
    bullets: ['When a turn timer runs out, the die is rolled if needed, a move is chosen automatically, and the adventure action is skipped.', 'Disconnected players keep their seat; their turns are auto-resolved after a short delay.'],
  },
  {
    id: 'physical',
    title: 'Physical prototype',
    paragraphs: ['Crown Quest plays on a table: print both boards, one die, 16 piece tokens, 1 dragon, gem tokens, shield/immunity/landslide markers, boat and plane tokens, a 35-card deck and a discovery deck.'],
    bullets: ['Without a clock, use a fixed 12-round limit: after round 12, most gems wins, then a cut, then shared.'],
  },
];
