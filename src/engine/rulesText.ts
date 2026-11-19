import { DEFAULT_CONFIG as C } from './config';
import { HAZARD_ROLL_MAX } from './crownLayout';
import type { CardCategory, CardType, CharacterKind, NodeType } from './types';

export const GAME_TITLE = 'Kingdom Chaos: Crown Quest';
export const QUICK_GOAL =
  'Bank one of each gem at your gate to open your Royal Path. Touch the four public checkpoints with each character you send to the temple, earn your kingdom’s capture credit, walk them up the Royal Path, and get all four characters into the Crown Temple.';

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
    full: 'Collapse a standing bridge on an inner route (the Stone Bridge starts open; the Rope Bridge can be collapsed once it is rebuilt). The main road always stays open.',
    usesAction: A,
    targets: 'A standing bridge with nobody at either end',
    duration: 'Until rebuilt or repaired',
    restrictions: 'Keeps every house able to reach its castle, checkpoints, and Royal Path.',
    noTarget: 'No bridge can be collapsed right now (occupied, or it would strand someone).',
  },
  dig_tunnel: {
    name: 'Dig Tunnel',
    category: 'map',
    short: 'Open a marked tunnel.',
    full: 'Open the Crystal Mine Tunnel on the Sapphire Falls Roads. It stays sealed until someone digs it. Once open it is a shortcut from the Sapphire station to the north road, and its diamond vein gives each kingdom one Diamond (the first time one of its pieces walks through with a free hand while it still needs one). The Dragon Mountain Tunnel is one step of the main road and is already open.',
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
    restrictions: 'Never on the main road, castles, temple, stations or the dungeon gate. Keeps every house connected.',
    noTarget: 'No terrain site is free (occupied, already changed, or it would strand someone).',
  },
  create_river: {
    name: 'Create River',
    category: 'map',
    short: 'Flood a marked inner-route space.',
    full: 'Flood an empty marked terrain site with a river. Paths through that space close for everyone.',
    usesAction: A,
    targets: 'An empty marked terrain site',
    duration: 'Until repaired',
    restrictions: 'Never on the main road, castles, temple, stations or the dungeon gate. Keeps every house connected.',
    noTarget: 'No terrain site is free (occupied, already changed, or it would strand someone).',
  },
  landslide: {
    name: 'Landslide',
    category: 'map',
    short: 'Block a marked pass.',
    full: 'Drop rocks on a marked pass (Temple Pass, Vale Pass or Crag Pass). Pieces and Dragon Fire stop at the blocked crossing.',
    usesAction: A,
    targets: 'A marked pass',
    duration: 'Until repaired, or until you place another landslide',
    restrictions: 'One landslide per player at a time. Keeps every house connected.',
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
    short: 'Safe from captures and Dragon Fire.',
    full: `One of your pieces cannot be captured (landing on it is refused) and is safe from Dragon Fire. A monster attack is blocked once and breaks the Shield. Traps still work.`,
    usesAction: A,
    targets: 'One of your pieces',
    duration: `${C.protectionMoves} enemy moves: every rival movement counts (bonus rolls too); it still protects during the last one, then expires. Playing it again refreshes it to ${C.protectionMoves}.`,
    restrictions: 'Does not stop traps.',
  },
  magic_boots: {
    name: 'Magic Boots',
    category: 'power',
    short: `Walk exactly ${C.magicBootsSteps} more spaces.`,
    full: `Walk one of your pieces exactly ${C.magicBootsSteps} spaces by the normal road rules. Checkpoints, gems and banking count; the boots never capture.`,
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
    full: 'One of your pieces cannot be captured, hit by Dragon Fire, attacked by monsters, or targeted by opponents’ Swap.',
    usesAction: A,
    targets: 'One of your pieces',
    duration: `${C.protectionMoves} enemy moves: every rival movement counts (bonus rolls too); it still protects during the last one, then expires. Playing it again refreshes it to ${C.protectionMoves}.`,
    restrictions: 'Does not stop traps.',
  },
  dragon_slayer: {
    name: 'Dragon Slayer',
    category: 'power',
    short: `Queen: end on the wild dragon, then roll ${C.slayThreshold}+.`,
    full: `Only your Queen holding this card may end her move on the wild dragon’s space. She then rolls: ${C.slayThreshold}–6 clears the block and sends the dragon back to its lair to recover for one round. Fail: she retreats.`,
    usesAction: 'Triggers when the Queen ends on the wild dragon',
    targets: 'Your Queen on the wild dragon’s space',
    duration: 'Dragon recovers for one round',
    restrictions: 'Queen only. Wild dragon. Holding this card.',
    noTarget: 'Your Queen must hold Dragon Slayer and end on the wild dragon’s space.',
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
    full: 'Swap one of your pieces with an opponent’s piece. Both must be on roads (castles, Royal Paths, the temple and the dungeon stay put). Checkpoints in between stay untouched; a piece swapped onto a checkpoint touches it.',
    usesAction: A,
    targets: 'One of your pieces and one opponent piece',
    duration: 'Instant',
    restrictions: 'Protected pieces and dragon companions stay put.',
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
    restrictions: 'Skip a player already slowed.',
  },
  dragon_roar: {
    name: 'Dragon Roar',
    category: 'special',
    short: 'Drive a free dragon up to 3 spaces.',
    full: 'Move a guarding or wild dragon up to 3 open spaces on its map. It runs wild where it lands and blocks the road there.',
    usesAction: A,
    targets: 'A space within 3 of a free dragon',
    duration: 'Until moved again',
    restrictions: 'Companions stay with their piece. Never into castles, Royal Paths or the temple.',
    noTarget: 'The dragon is a companion or recovering.',
  },
  rescue: {
    name: 'Rescue',
    category: 'special',
    short: 'Bring a piece home, banking its gems.',
    full: 'Send one of your pieces straight home. A carried gem is banked on arrival. Its checkpoints start over.',
    usesAction: A,
    targets: 'One of your pieces outside the castle and Royal Path',
    duration: 'Instant',
    restrictions: 'Resets that piece’s checkpoints.',
  },
  reveal_discovery: {
    name: 'Reveal Discovery',
    category: 'special',
    short: 'Draw a discovery anywhere.',
    full: 'One of your pieces draws a discovery where it stands, as if it had dug there.',
    usesAction: A,
    targets: 'One of your pieces',
    duration: 'Instant',
    restrictions: 'Skip castles, Royal Paths and the temple.',
  },
};

export const CATEGORY_INFO: Record<CardCategory, { name: string; blurb: string }> = {
  map: {
    name: 'Map',
    blurb: 'Open or close marked sites on the inner routes — for every house. The main road, castles, temple, stations and dungeon gate stay as they are, and every house keeps a path to its castle, checkpoints and Royal Path.',
  },
  power: { name: 'Power', blurb: 'Protect a piece, walk further, or deal with the dragon.' },
  special: { name: 'Special', blurb: 'Tricks: swaps, slow-downs, roars, rescues and discoveries.' },
};

export interface CharacterText {
  name: string;
  abilityName: string;
  ability: string;
}

export const CHARACTER_INFO: Record<CharacterKind, CharacterText> = {
  king: {
    name: 'King',
    abilityName: 'Royal Treasury & Guard',
    ability: `When the King banks a new gem kind, draw a card (hand limit applies). Once per match, after he moved this turn, Royal Guard protects him or an adjacent ally for the next ${C.protectionMoves} enemy moves.`,
  },
  queen: {
    name: 'Queen',
    abilityName: 'Royal Passage & Diplomacy',
    ability: `Passes through opponents but never captures: she must end on an empty space (safe spaces included). She collects spare gems at stations (Diplomacy currency). After she moved this turn, once per turn, offer a spare banked gem for a rival’s spare gem or a power card. Only she may use Dragon Slayer by ending on the wild dragon.`,
  },
  witch: {
    name: 'Witch',
    abilityName: 'Alchemy & Portal Hop',
    ability: `Once per turn, hop between the East and West Moonstone Arches for free during her move. Alchemy, only in her palace (her castle or her kingdom’s gate): turn a spare gem (a second banked copy, or a carried gem of a kind already banked) into a kind her kingdom is missing; it is banked at once. Each kind of stone can be transmuted only once per match. She also collects spare gems at stations. She walks through the wild dragon’s space and is immune to Dragon Fire.`,
  },
  knight: {
    name: 'Knight',
    abilityName: 'Charge',
    ability: `+${C.knightBonus} against dungeon monsters and encounters. On a route with at least two eligible rivals, may route-attack ${C.knightAttackMin}–${C.knightAttackMax} of them (an eligible rival on the final space must be included).`,
  },
};

export interface LocationText {
  name: string;
  rule: string;
}

export const LOCATION_INFO: Record<NodeType, LocationText> = {
  castle: { name: 'Castle', rule: 'Home. Pieces start here and return here when captured. Any roll moves a piece out onto its gate.' },
  circuit: {
    name: 'Main road',
    rule: 'A 40-space two-way ring through all four house gates. It crosses Dragon Mountain in one tunnel step. Cards leave it open. Moves use the whole allowance.',
  },
  final: {
    name: 'Royal Path',
    rule: 'Your own path to the temple. Safe. Opens once your kingdom has banked one of each gem kind. Edges run both ways, so a piece may enter early and walk back onto the island. The temple gate still asks for four checkpoints and the kingdom’s capture credit.',
  },
  temple: {
    name: 'Crown Temple',
    rule: 'A piece that enters finishes for its kingdom. Get all four characters into the temple to win.',
  },
  side: { name: 'Inner route', rule: 'A two-way trail across the island: often shorter, but cards can open or close it, and some stones carry a trap risk.' },
  dEntrance: { name: 'Dungeon Entrance', rule: 'Where you arrive in the dungeon, and its exit. Safe from captures and monsters. Adventure: climb out to the Dragon Gate.' },
  path: { name: 'Dungeon passage', rule: 'Dungeon moves use the exact allowance, the same as the island.' },
  monster: {
    name: 'Monster Den',
    rule: `Adventure: fight the monster. Roll ${C.monsterThreshold}+ (Knight +${C.knightBonus}) to open the Vault Door this visit. Fail: retreat to a safe room.`,
  },
  dragonChamber: { name: 'Dragon Lair', rule: 'The dragon guards and recovers here. Stand with it to tame it.' },
  gemChamber: { name: 'Crystal Shrine', rule: 'Adventure: take any gem your kingdom still needs.' },
  trap: { name: 'Spike Pit', rule: 'Ending a move here drops you through the Dungeon Trapdoor to the Dungeon Entrance.' },
  vault: { name: 'Old Vault', rule: 'Behind the guarded Vault Door. Adventure: dig for a discovery.' },
  safeRoom: { name: 'Safe room', rule: 'Safe from captures and monsters. Failed fights and encounters retreat here.' },
};

export const FEATURE_INFO = {
  safe: 'Safe space (gold star): you can stop here beside a rival, but nobody is captured. Safe spaces are the four starred road stones, the four kingdom gates, castles, Royal Paths, the Dungeon Entrance and the two dungeon safe rooms. Everywhere else, ending your move on a rival captures it, unless it has a Shield, Immunity or Royal Guard. The Queen never captures: she must stop on an empty or safe space.',
  entry:
    'House gate and public checkpoint: its pieces leave the castle here and bank gems here. Any piece of any house that passes or lands here touches this checkpoint.',
  fork: 'Fork: once your Royal Path is open, a piece may turn in here — even before it has every checkpoint. The temple gate still checks checkpoints and capture credit.',
  station: 'Gem station: passing or landing with free hands picks up this gem if your kingdom still needs that kind.',
  dig: 'Dig site: adventure action to draw a discovery — a gem, a card, a key, a hidden route opened for everyone, or a buried trap.',
  dungeonGate: `Dragon Gate, on the east coast: Enter Dungeon here as an Adventure action (you arrive at the Dungeon Entrance). On a monster die of ${C.monsterOutsideRoll} a monster climbs out and attacks along this road within ${C.monsterRange} steps.`,
  dock: 'Dock: when the boat is here, sail to the other dock. Cost: your Adventure action only. Why: it skips a long walk round the coast, and gems ride safely. The boat then waits at the far dock, so a rival may take it back. Plates on the way do not count.',
  airfield: 'Airfield: when the plane is here, fly to another airfield. Cost: your Adventure action and one card from your hand as fuel. Why: the fastest jump across the island, ideal to rush gems home or reach a far plate. The plane stays where it lands. Plates on the way do not count.',
  portal: 'East and West Moonstone Arches: the Witch may hop from one to the other once per turn for free.',
  terrainSite: 'Terrain site: Raise Mountain or Create River can close this space.',
  hazard: `Trap risk: a piece that stops here rolls the die; on 1–${HAZARD_ROLL_MAX} a snare drags it back to the nearest main-road space. It keeps its gems and checkpoints. Passing through is safe.`,
};

export const STATUS_INFO = {
  shield: `Shield — safe from captures and Dragon Fire for ${C.protectionMoves} enemy moves (any rival's move counts, bonus rolls too). A monster attack breaks it.`,
  immune: `Immune — safe from captures, Dragon Fire, monster attacks and Swap for ${C.protectionMoves} enemy moves.`,
  carrying: 'Carrying gems — bank them at your house gate. If captured, the attacker takes what it can carry.',
  companion: `Dragon companion — moves max(${C.dragonMinMove}, roll − ${C.dragonMovePenalty}); Dragon Fire needs no card: spend the Adventure action and roll ${C.dragonFireHit}+ on the attack die.`,
  slowed: `Slowed — next move is at most ${C.slowDownMaxSteps}.`,
  beatMonster: 'Beat the monster — the Vault Door is open for this visit.',
  lap: 'Checkpoints — this piece must touch all four public markers (Red, Blue, Purple, Green), in any order. Captured pieces keep the markers they have touched.',
  guarded: `Royal Guard — safe from captures, Dragon Fire and monster attacks for ${C.protectionMoves} enemy moves.`,
  finished: 'Finished — this piece has entered the Crown Temple and stays there.',
};

/** Colours and labels for every map marker kind (colours match `src/engine/markers.ts`). */
export const MAP_MARKER_INFO = {
  landslide: { name: 'Landslide', color: '#b45309', rule: 'A blocked pass. Pieces and Dragon Fire stop here until Repair clears it.' },
  portal: { name: 'Portal', color: '#0f766e', rule: 'Moonstone Arch pair. The Witch may hop between the linked arches once per turn.' },
  teleport: { name: 'Teleport', color: '#7c3aed', rule: 'A named teleport tile that fires when a move ends here (shown as a trap or shortcut marker).' },
  crossingOpen: { name: 'Created crossing', color: '#15803d', rule: 'A bridge, tunnel or paved road opened for every house.' },
  crossingClosed: { name: 'Destroyed crossing', color: '#b91c1c', rule: 'A collapsed bridge or sealed crossing. Build Bridge, Dig Tunnel, Build Road or Repair can reopen marked sites.' },
  trap: { name: 'Trap', color: '#9f1239', rule: 'Ending a move here sweeps the piece along the trap’s path. Gems and checkpoints are kept; markers on the way stay untouched.' },
  shortcut: { name: 'Shortcut', color: '#a16207', rule: 'Ending a move here carries the piece along the shortcut. Markers on the skipped spaces stay untouched.' },
  hazard: { name: 'Hazard', color: '#d97706', rule: `Trap risk: stopping here rolls the die; 1–${HAZARD_ROLL_MAX} springs a snare. Passing through is safe.` },
  encounter: { name: 'Encounter', color: '#be123c', rule: `Stone Golem or Cave Spider. Ending here forces one roll: ${C.encounterThreshold}+ succeeds (Knight +${C.knightBonus}). Fail: retreat to the marked safe room.` },
  safeRoom: { name: 'Safe room', color: '#0369a1', rule: 'Safe dungeon space. Failed fights and encounters retreat here.' },
  wildDragon: { name: 'Wild dragon', color: '#c2410c', rule: 'Blocks the road. The Witch may pass through. The Queen holding Dragon Slayer may end here to duel.' },
} as const;

/** Prowling dungeon monsters, in one sentence. */
export const MONSTER_RULE = `Roaming monsters: the Stone Golem and the Cave Spider attack any house. After every full round (bonus rolls do not count) roll the monster die once: 1–${C.monsterQuietMax} nothing happens; ${C.monsterQuietMax + 1}–${C.monsterOutsideRoll - 1} one random active monster attacks a random piece within ${C.monsterRange} connected steps of it in the dungeon; ${C.monsterOutsideRoll} one climbs out of the Dragon Gate and attacks a piece on the road within ${C.monsterRange} steps of the gate, then goes back inside. Stone Golem: pushes the piece back ${C.golemPush} legal spaces. Cave Spider: webs it, so its next move is ${C.webPenalty} shorter (minimum 1, webs do not stack). Safe spaces, castles, Royal Paths, the temple, Immunity and Royal Guard are never attacked; a Shield blocks one attack and breaks. With nobody in reach the monster stays idle: no attack, no notice. Blocked or unbuilt roads stop a monster’s reach.`;

/** How to beat the roaming monsters for good. */
export const MONSTER_KILL_RULE = `Killing monsters: each monster has ${C.monsterHearts} hearts. Three ways to strike one: win its fight by ending your move on its space; use the Attack action from within ${C.monsterAttackRange} step of it (roll ${C.encounterThreshold}+, Knight +${C.knightBonus}; a miss and it strikes back at once unless you stand on a safe space or are protected); or breathe Dragon Fire at it from up to ${C.dragonFireRange} steps (${C.dragonFireHit}+ on the attack die, no strike back). Each hit takes a heart and knocks it out until the end of the next round. At 0 hearts it is slain for the rest of the match: no more attacks, no fight on its space. A slain Golem leaves its shortcut open to every kingdom; whoever slays the Spider takes a power card from its hoard.`;

export interface DungeonGuideEntry {
  /** Board node the entry describes (for labels and tooltips). */
  node: string;
  name: string;
  /** What it is, in two or three words, shown on the board label. */
  tag: string;
  rule: string;
}

/** What every special dungeon space does, in the order a visitor meets them. */
export const DUNGEON_GUIDE: DungeonGuideEntry[] = [
  { node: 'd-entrance', name: 'Dungeon Entrance', tag: 'Start · exit · safe', rule: 'Where you arrive from the Dragon Gate. Safe from captures and monsters. Adventure action here: climb back out to the Dragon Gate.' },
  { node: 'd-ruins', name: 'Fallen Ruins', tag: 'Safe room', rule: 'Safe room: no captures, no monster attacks. Why visit: once per visit, use your Adventure action to search the ruins and draw a map card. Losers of the Monster Den and the Stone Golem retreat here.' },
  { node: 'd-safe-crystal', name: 'Crystal Niche', tag: 'Safe room', rule: `Safe room: no captures, no monster attacks. Why visit: once per visit, use your Adventure action to attune to the crystals: any web falls away and your next move is ${C.crystalBoost} longer. Losers of the Cave Spider retreat here.` },
  { node: 'd-golem', name: 'Stone Golem', tag: 'Battle · shortcut', rule: `End your move here and the Golem battles you (prototype): it has ${C.battleMonsterHp} health, you get ${C.battleStamina} stamina, and it announces each attack (swipe 1, heavy slam 2). Strike: ${C.encounterThreshold}+ hits (Knight +${C.knightBonus}). Guard: block it; guarding a heavy slam exposes it so your next hit deals 2. Retreat to the entrance before any exchange. Win: the shortcut to the Crystal Path stays open for your whole kingdom (once per kingdom). Lose: carried gems drop here and you limp to the Fallen Ruins. It roams: after a round it may push a piece within ${C.monsterRange} steps back ${C.golemPush} spaces.` },
  { node: 'd-spider', name: 'Cave Spider', tag: 'Fight · chest', rule: `End your move here and you must fight: roll ${C.encounterThreshold}+ (Knight +${C.knightBonus}). Win: open its chest and draw a power card; the Spider rests for a round. Lose: retreat to the Crystal Niche. It roams: after a round it may web a piece within ${C.monsterRange} steps (next move −${C.webPenalty}, minimum 1).` },
  { node: 'd-monster', name: 'Monster Den', tag: 'Fight · key', rule: `Adventure action: fight the Den Beast. Roll ${C.monsterThreshold}+ (Knight +${C.knightBonus}). Win: the Vault Door opens for this visit and the beast drops a dungeon key you keep (it opens the door once later). Lose: retreat to a safe room.` },
  { node: 'd-vault', name: 'Old Vault', tag: 'Hoard · locked', rule: 'Behind the Vault Door (beat the Den Beast or use a dungeon key). Why visit: once per visit, use your Adventure action to loot the hoard: a power card plus a discovery (a gem, a card, a key or a hidden route). Traps in the vault are disarmed.' },
  { node: 'd-shrine', name: 'Crystal Shrine', tag: 'Free gem', rule: 'Adventure action: take any gem your kingdom still needs (hands must be free). Carry it to your gate to bank it.' },
  { node: 'd-lair', name: 'Dragon Lair', tag: 'Tame dragon', rule: `The dragon guards and recovers here. End your move here, then use your Adventure action to tame it: roll ${C.tameThreshold}+. A tamed dragon can breathe fire as an Adventure action, no card: ${C.dragonFireHit}+ on the attack die hits.` },
  { node: 'd-pit', name: 'Spike Pit', tag: 'Trap · treasure', rule: `Ending a move here drops you down the chute to the Dungeon Entrance: a fast way out of the deep dungeon. On the way down roll the die: ${C.spikeTreasure}–6 and you grab a treasure among the spikes (a power card).` },
];

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
    paragraphs: [QUICK_GOAL, 'Every house has the same goal; you choose the routes and tactics.'],
    bullets: [
      'Gems and capture credit belong to the kingdom. Checkpoints belong to each character.',
      'Your Royal Path opens once one of each of the four gem kinds is banked. Captures and checkpoints are separate.',
      'A piece may enter an open Royal Path early and walk back onto the island. The temple gate still needs all four checkpoints on that piece and the kingdom’s capture credit.',
      `Victory: the first kingdom with ${C.finishersToWin} finished characters in the Crown Temple wins.`,
    ],
  },
  {
    id: 'setup',
    title: 'Setup and turn order',
    paragraphs: [
      'Each player takes a house colour and its King, Queen, Witch and Knight in the castle. Deal one map, one power and one special card to each (Dragon Slayer stays out of opening hands). Structures start with only the Stone Bridge open.',
    ],
    bullets: [
      'Turns go clockwise from the starting seat.',
      'Each turn has one move (roll, then exact route) and one optional Adventure action, in either order.',
      'Modes: Play Online (private rooms with an invite code), Play on This Device (handoff screens and a local save), and Practice vs AI.',
    ],
  },
  {
    id: 'turn',
    title: 'Turns and dice',
    paragraphs: [
      'Roll first when you need a move. The allowance is the roll, then a dragon companion uses max(1, roll − 2), then Slow Down may cap it. The rolled event shows value, steps, penalty and whether this is a bonus roll.',
    ],
    bullets: [
      'Choose one character and a route that uses exactly that allowance — island and dungeon alike.',
      'Portal hops, traps and shortcuts resolve after the steps.',
      'If none of your pieces has a legal full-length move, movement is skipped; any earned bonus still resolves.',
      'Forced effects (traps, shortcuts, hazards, encounters) resolve where they trigger and always log a reason.',
      'Bonus roll: a natural 6, or at least one movement capture on that move, earns exactly one bonus roll in the same turn. A 6 plus any number of captures is still one. Chains are possible. The Adventure action stays once per turn.',
      'Dragon Fire, encounters and card effects earn no bonus roll. On timeout, a pending bonus is lost.',
      'Adventure actions: play a card · dig · enter or leave the dungeon · fight the monster · tame · Dragon Fire (no card needed) · sail or fly. Releasing your dragon companion is free at the start of your turn.',
    ],
  },
  {
    id: 'movement',
    title: 'Movement and routes',
    paragraphs: ['Every road runs both ways. Tap a piece and every space it can reach with the exact allowance glows; the preview shows the route and what happens on it.'],
    bullets: [
      'A move may never step on the same space twice.',
      'The main road is a 40-space two-way ring through all four gates. Cards leave it open.',
      'Inner routes (Temple, Lakeside, Camp and Glade, River Crossings, East Ruins, Sapphire Falls) trade speed for map-card risk and trap stones.',
      'King and Witch capture by landing on an eligible opponent. The Queen passes opponents and must end on a space with no other piece. The Knight may take a normal move or a route attack when enough eligible rivals sit on the route.',
      'A wild or guarding dragon blocks its space for most pieces; the Witch may pass a wild dragon. You stay out of an opponent’s castle or Royal Path.',
    ],
  },
  {
    id: 'plates',
    title: 'Checkpoints',
    paragraphs: [
      'Four public checkpoints sit at the house gates: Red, Blue, Purple and Green. Each character tracks which it has touched, in any order and by any route.',
    ],
    bullets: [
      'Passing a checkpoint counts, and so does landing on it. Leaving your castle touches your own gate.',
      'Progress is tracked per character, for example “Queen: Red ✓ · Blue ✓ · Purple ○ · Green ○”.',
      'Captured pieces keep the markers they have touched. Banked gems and capture credit stay with the kingdom.',
      'Teleports, swaps, boats, planes, portal hops and shortcuts leave markers on the way untouched; a checkpoint you arrive on counts.',
      'The temple gate checks that this piece has all four markers. Royal Path access uses banked gems alone.',
    ],
  },
  {
    id: 'dungeon-battle',
    title: 'Dungeon: Dragon Fire and the Golem battle',
    paragraphs: [
      `Dragon Fire needs no card. Tap your dragon (or its Fire button): rivals within ${C.dragonFireRange} connected steps glow. Tap one to preview, confirm, and the attack die rolls at once: ${C.dragonFireHit}–6 hits, 1–${C.dragonFireHit - 1} misses. Tap a piece that does not glow to see why it cannot be burned.`,
      `Prototype: the Stone Golem fights a short battle. It has ${C.battleMonsterHp} health and you get ${C.battleStamina} stamina for the fight. Above it you see its next attack: a light swipe (1) or a telegraphed heavy slam (2), alternating.`,
    ],
    bullets: [
      `Strike: roll ${C.encounterThreshold}+ (Knight +${C.knightBonus}) to deal 1; then it attacks if still standing.`,
      'Guard: block its attack. Guarding a heavy slam exposes it: your next hit deals 2.',
      'Retreat before any exchange: back to the Dungeon Entrance, no reward.',
      'Win: the shortcut to the Crystal Path stays open for your kingdom for the rest of the match (once per kingdom). Lose: your carried gems drop in the chamber and you limp to the Fallen Ruins.',
    ],
  },
  {
    id: 'cuts',
    title: 'Captures and bonus rolls',
    paragraphs: [
      'A movement capture sends the rival home, keeps their checkpoints, and transfers carried gems while your hands are free. Capture credit (`stats.cuts`) is the kingdom’s temple requirement.',
    ],
    bullets: [
      'Safe spaces (gold-star stones, the four kingdom gates, castles, Royal Paths, the Dungeon Entrance and dungeon safe rooms) refuse captures and can hold several pieces. Everywhere else, ending on a rival captures it unless it is shielded, immune or guarded. The Queen never captures.',
      'Shield, Immunity, sanctuary and Royal Guard make landing or a Knight attack illegal — the preview shows it first, with the time left ("Protection · 2 enemy moves", then "1 enemy move").',
      `Timed protection counts completed rival movements across every rival kingdom (a bonus-roll move counts too; dice, Adventure actions, cards and reconnects do not). It still protects during the ${C.protectionMoves === 2 ? 'second' : 'last'} movement and expires right after it. Recasting refreshes it; it never stacks. The Witch's Dragon Fire immunity is a permanent trait, not a timed power.`,
      'Knight route attack: choose 2–3 eligible rivals among those he passes or lands on; an eligible rival on the final space must be included.',
      'One bonus roll per movement roll: a natural 6 or at least one movement capture. Chains re-check the same rule. Dragon Fire and card effects earn none.',
      'Capturing the dragon’s companion leaves the dragon wild on that space.',
    ],
  },
  {
    id: 'gems',
    title: 'Gems, spares and trading',
    paragraphs: ['Four stations: Ruby Mine, Sapphire Falls, Diamond Hill and Emerald Grove. They never run out, and every player can use them.'],
    bullets: [
      'Gems are picked up when a piece with free hands passes or lands on a station, and banked at your own gate.',
      `Each piece carries up to ${C.carryLimit} gems. A piece only picks up kinds its kingdom still needs.`,
      'Banking adds a copy to your bank. Duplicates stay as spares; your gem list shows the distinct kinds.',
      'Queen Diplomacy: after she moved this turn, offer one spare banked gem for a rival’s spare gem or a power card they hold. Accept swaps atomically; a full hand cannot take a card. Offers expire when your turn ends.',
      'Witch Alchemy: on her turn, only in her palace (her castle or her kingdom’s gate), turn a spare gem into a kind your kingdom is missing. It banks at once. Each kind of stone can be transmuted only once per match.',
      'Spare gems: the Queen and the Witch pick up a station’s gem even when your kingdom already has that kind. Banked, it becomes a spare: Diplomacy and Alchemy currency.',
      'The dungeon’s Crystal Shrine offers any gem you still need; a lucky dig can turn one up.',
    ],
  },
  {
    id: 'characters',
    title: 'Characters',
    paragraphs: ['Every house has a King, Queen, Witch and Knight in that house’s colours.'],
    bullets: [
      'King — Royal Treasury draws on banking a new kind; Royal Guard once per match after he moved.',
      'Queen — passes opponents, never captures, ends on empty or safe spaces, collects spare gems, Diplomacy once per turn after she moved; Dragon Slayer duel on the wild dragon.',
      'Witch — Portal Hop once per turn, Alchemy in her palace (each kind once per match), collects spare gems, walks through the wild dragon, immune to Dragon Fire.',
      `Knight — +${C.knightBonus} vs monsters and encounters; route attack ${C.knightAttackMin}–${C.knightAttackMax} when the route allows.`,
    ],
  },
  {
    id: 'cards',
    title: 'Terrain and cards',
    paragraphs: [
      `Everyone starts with one card of each category. Hands hold at most ${C.handLimit}; drawing into a full hand lets you discard one or decline the new card. Hands are hidden.`,
      'Digging (adventure action on a dig site) always gives something useful: a gem you need, a card, a dungeon key, a hidden route opened for every house, or a buried trap.',
    ],
    bullets: [CATEGORY_INFO.map.blurb, CATEGORY_INFO.power.blurb, CATEGORY_INFO.special.blurb, 'Playing a card uses your adventure action. A card with no legal target is greyed out with the reason.'],
  },
  {
    id: 'structures',
    title: 'Bridges, tunnels and terrain',
    paragraphs: [
      'Inner routes have marked sites: bridges, tunnels, road plots, passes and terrain sites. Opening or closing one changes the roads for every player at once.',
      'Crystal Mine Tunnel: sealed until someone plays Dig Tunnel. Then it links the Sapphire station to the north road, and its diamond vein gives each kingdom one free Diamond the first time one of its pieces walks through with a free hand while it still needs one.',
    ],
    bullets: [
      'Build Bridge, Dig Tunnel and Build Road open closed sites. Collapse Bridge, Landslide, Raise Mountain and Create River close open ones. Repair undoes a closure.',
      'Closed until a card or a dig: the Rope Bridge, the Camp Road, the Ruins Road and the Crystal Mine Tunnel. The Stone Bridge starts open.',
      'A change that would cut a kingdom off from its castle, a checkpoint, or its Royal Path entry is refused.',
      'The main road stays open, so every house can always reach every checkpoint and its own Royal Path.',
    ],
  },
  {
    id: 'traps',
    title: 'Traps and shortcuts',
    paragraphs: ['Red arrow spaces are traps and green arrow spaces are shortcuts. They fire only if your move ends on them.'],
    bullets: [
      'Landslide (space 5), Hidden Pit (space 17) and River Current (space 25) are traps. Magic Lift (space 13) and Secret Passage (space 33) are shortcuts.',
      'The East and West Moonstone Arches are a portal pair for the Witch.',
      `Trap risk on the Bramble Snare, the Spray Snare and the Crag Snare. Stopping there rolls the die; 1–${HAZARD_ROLL_MAX} drags you back to the nearest main-road space.`,
      'Traps keep your gems and checkpoints and grant no capture credit.',
    ],
  },
  {
    id: 'dungeon',
    title: 'Dungeon encounters',
    paragraphs: [
      'Enter from the Dragon Gate on the east coast (space 16) as an adventure action. Dungeon moves use the exact allowance.',
      'Why go down: the Crystal Shrine hands you any gem your kingdom still needs, the Old Vault holds a dig, and the Dragon Lair is where the dragon is tamed. Tap any dungeon space for what it does.',
    ],
    bullets: [
      `Stone Golem guards a shortcut; Cave Spider guards a power-card chest. Ending on the monster’s space forces one roll: ${C.encounterThreshold}+ succeeds (Knight +${C.knightBonus}).`,
      'Golem success carries the piece along the shortcut; Spider success draws a power card. Failure sends the piece to the marked safe room. Both outcomes are previewed before you confirm.',
      `Monster Den (adventure fight): roll ${C.monsterThreshold}+ (Knight +${C.knightBonus}) to open the Vault Door for this visit. A dungeon key also opens it once.`,
      'Crystal Shrine: take any needed gem. Old Vault: dig. Spike Pit: drops you to the entrance. Leaving returns you to the Dragon Gate.',
      MONSTER_RULE,
      MONSTER_KILL_RULE,
      'Safe rooms (Fallen Ruins, Crystal Niche) and the Dungeon Entrance are safe from captures and monsters. A beaten Golem or Spider rests through the next full round, then guards again; a kingdom that beat the Golem keeps its shortcut.',
    ],
  },
  {
    id: 'dragon',
    title: 'Dragon',
    paragraphs: ['There is one dragon: guarding its lair, a companion, wild somewhere, or recovering.'],
    bullets: [
      `Tame: stand with it and roll ${C.tameThreshold}–6. Fail: retreat to the nearest safe space.`,
      `A companion moves max(${C.dragonMinMove}, roll − ${C.dragonMovePenalty}), shown as “Roll 5 − Dragon 2 = Move 3”.`,
      `Dragon Fire is the dragon’s own power: no card. It uses your Adventure action: choose an eligible target, then roll a separate attack die. ${C.dragonFireHit}–6 hits; 1–${C.dragonFireHit - 1} misses and the action is still spent. The attack die never earns a bonus roll.`,
      `Dragon Fire hits an eligible rival within ${C.dragonFireRange} open, connected spaces. Gems drop on that space. No capture credit and no bonus roll. Shield, Immunity and Royal Guard block it. The Witch is immune.`,
      'Release at the start of your turn leaves a wild dragon blocking that space. The Witch may pass through.',
      `Dragon Slayer: only the Queen holding it may end on the wild dragon’s space, then rolls ${C.slayThreshold}+. Success clears the block and returns the dragon to recover for one round.`,
    ],
  },
  {
    id: 'vehicles',
    title: 'Boats and planes',
    paragraphs: [
      'The boat sails between the two docks; the plane flies between the airfields. Using either is your Adventure action, and the vehicle stays where it arrives (so it may not be there next time).',
      'Boat: free. Plane: also burn one card from your hand as fuel. Why ride: each trip skips a long walk (the option shows how many spaces), and nothing can capture you on the way. Plates you fly or sail over do not count.',
    ],
    bullets: ['Checkpoints on the way stay untouched. Dragon companions stay off the vehicles.'],
  },
  {
    id: 'victory',
    title: 'Royal Path, temple and victory',
    paragraphs: [
      'Bank one of each gem kind to open your Royal Path. Pieces may enter early and walk back. At the temple gate, the piece needs all four checkpoints and the kingdom needs its capture credit. Finished pieces stay on the temple; get all four in to win.',
    ],
    bullets: [
      'Royal Paths are safe and belong to their house. All of them are always drawn with their dots: faded with a lock badge while that kingdom’s path is locked, full colour once it has banked all four gems, and bright along the selected piece’s legal route. Tap the Crown Temple to see what each of your pieces still needs.',
      `Reaching the temple needs the exact roll${C.exactTemple ? '' : ' (this match allows overshooting)'}.`,
      `The first kingdom with ${C.finishersToWin} finished characters wins (reason: temple).`,
    ],
  },
  {
    id: 'modes',
    title: 'Play modes',
    paragraphs: ['Choose how you play from the main menu. Practice vs AI uses the same rules engine.'],
    bullets: [
      'Play Online: private rooms with an invite code. Sign in to recover your seat on any device. Only the host may end a match. Unfinished rooms expire after 2 hours of inactivity; finished results stay readable for 24 hours.',
      'Play on This Device: handoff screens hide private hands between turns (and for trade responses). The match saves locally after every accepted action and works offline.',
      'Practice vs AI: you versus one to three AI seats in the browser. The AI only sees its own redacted view.',
      'Learn to Play: a guided first turn plus the full rules rail during play.',
    ],
  },
  {
    id: 'timers',
    title: 'Timers',
    paragraphs: [
      `Timed matches offer a clock and a per-turn limit. Opening the rules never pauses the clock.`,
    ],
    bullets: [
      'When a turn timer runs out, the die is rolled if needed, a move is chosen automatically, a pending bonus is lost, and the adventure action is skipped.',
      'Disconnected players keep their seat; their turns are auto-resolved after a short delay.',
    ],
  },
  {
    id: 'physical',
    title: 'Physical prototype',
    paragraphs: [
      'Crown Quest plays on a table: print both boards, one die, 16 piece tokens, 1 dragon, gem tokens, status and map markers, boat and plane tokens, a 35-card deck and a discovery deck.',
    ],
    bullets: ['Without a clock, use a fixed 12-round limit: after round 12, most gems wins, then capture credit, then a shared victory.'],
  },
];

/** Tappable dungeon landmarks: purpose, action, reward, risk and requirements (board, Legend, Learn to Play). */
export interface LandmarkInfo {
  id: string;
  name: string;
  /** Space the landmark belongs to. */
  node: string;
  purpose: string;
  action: string;
  reward: string;
  risk: string;
  needs: string;
}

export const DUNGEON_LANDMARKS: LandmarkInfo[] = [
  {
    id: 'entrance',
    name: 'Dragon-carved entrance',
    node: 'd-entrance',
    purpose: 'The way in and out of the dungeon. A safe space: no captures, no monster attacks.',
    action: 'Adventure action at the Dragon Gate goes down; here, an Adventure action climbs back out.',
    reward: 'Access to the Crystal Shrine (any gem), the vault, the lair and the shortcut.',
    risk: `On a monster die of ${C.monsterOutsideRoll} a monster may climb out and hit a piece within ${C.monsterRange} steps of the island gate.`,
    needs: 'Stand on the Dragon Gate (island) to enter.',
  },
  {
    id: 'lair',
    name: 'Dragon lair',
    node: 'd-lair',
    purpose: 'Where the dragon sleeps on its eggs and treasure, and recovers after a defeat.',
    action: `End your move here, then use your Adventure action to tame it: roll ${C.tameThreshold}+.`,
    reward: `A companion: Dragon Fire as an Adventure action, no card (${C.dragonFireHit}–6 hits a rival within ${C.dragonFireRange} steps).`,
    risk: `A companion slows its rider: moves max(${C.dragonMinMove}, roll − ${C.dragonMovePenalty}). A failed tame retreats you to a safe room.`,
    needs: 'The dragon must be home and guarding (not someone’s companion or recovering).',
  },
  {
    id: 'golem',
    name: 'Stone Golem chamber',
    node: 'd-golem',
    purpose: 'Broken pillars and a sealed stone gate: the Golem guards a shortcut to the Crystal Path by the Crystal Shrine.',
    action: `End your move on the Golem to start a battle. Each exchange: Strike (roll ${C.encounterThreshold}+ to hit, Knight +${C.knightBonus}) or Guard (block its announced attack; guarding a heavy slam exposes it so your next hit deals 2). Retreat to the entrance before any exchange.`,
    reward: 'Win: the stone gate opens and the shortcut stays open for your whole kingdom for the rest of the match (claimable once per kingdom).',
    risk: `Light swipe 1, heavy slam 2. At 0 of ${C.battleStamina} stamina your carried gems drop here and you limp to the Fallen Ruins. It also roams: after a round it may push a piece within ${C.monsterRange} steps back ${C.golemPush} spaces.`,
    needs: 'No requirement. Resting or slain Golems do not fight; a kingdom that already won walks through.',
  },
  {
    id: 'spider',
    name: 'Cave Spider chamber',
    node: 'd-spider',
    purpose: 'A web-hung chamber; the Spider guards a chest.',
    action: `End your move on the Spider and roll ${C.encounterThreshold}+ (Knight +${C.knightBonus}).`,
    reward: 'Win: open its chest and draw a power card.',
    risk: `Lose: retreat to the Crystal Niche. It roams: after a round it may web a piece within ${C.monsterRange} steps (next move −${C.webPenalty}, minimum 1).`,
    needs: 'No requirement. A resting or slain Spider does not fight.',
  },
  {
    id: 'ruins',
    name: 'Fallen Ruins (safe room)',
    node: 'd-ruins',
    purpose: 'Safe room: no captures, no monster attacks.',
    action: 'Once per visit, Adventure action: search the ruins.',
    reward: 'Draw a map card.',
    risk: 'None. Losers of the Golem battle arrive here.',
    needs: 'Stand here.',
  },
  {
    id: 'niche',
    name: 'Crystal Niche (safe room)',
    node: 'd-safe-crystal',
    purpose: 'Safe room: no captures, no monster attacks.',
    action: 'Once per visit, Adventure action: attune to the crystals.',
    reward: `Any web falls away and your next move is ${C.crystalBoost} longer.`,
    risk: 'None. Losers of the Spider fight arrive here.',
    needs: 'Stand here.',
  },
];

export const landmarkText = (l: LandmarkInfo) => `${l.name}. Purpose: ${l.purpose} Action: ${l.action} Reward: ${l.reward} Risk: ${l.risk} Needs: ${l.needs}`;
