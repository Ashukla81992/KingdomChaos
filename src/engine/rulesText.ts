import { DEFAULT_CONFIG } from './config';
import type { CardCategory, CardType, CharacterKind } from './types';

const C = DEFAULT_CONFIG;
const turnSeconds = Math.round(C.turnDurationMs / 1000);
const matchMinutes = Math.round(C.matchDurationMs / 60000);

export interface CharacterInfo {
  name: string;
  abilityName: string;
  ability: string;
}

export const CHARACTER_INFO: Record<CharacterKind, CharacterInfo> = {
  king: {
    name: 'King',
    abilityName: 'Royal Treasury',
    ability: `When the King banks a treasure, you draw one card (hand limit ${C.handLimit} still applies).`,
  },
  queen: {
    name: 'Queen',
    abilityName: 'Graceful Step',
    ability:
      'The Queen may move through spaces occupied by opponents without capturing or stopping. Ending on an opponent still captures.',
  },
  witch: {
    name: 'Witch',
    abilityName: 'Portal Walker',
    ability:
      'When the Witch reaches a fixed portal, she may jump to the other fixed portal. The jump costs one movement step.',
  },
  knight: {
    name: 'Knight',
    abilityName: 'Charge',
    ability:
      'When the Knight captures an opponent, it may keep moving with its unused steps. Maximum one capture per movement.',
  },
};

export interface CategoryInfo {
  name: string;
  description: string;
}

export const CATEGORY_INFO: Record<CardCategory, CategoryInfo> = {
  map: { name: 'Map', description: 'Change routes or create obstacles. Map changes affect everyone.' },
  power: { name: 'Character Power', description: 'Give one of your characters a temporary advantage.' },
  special: { name: 'Special Move', description: 'Surprise moves that affect players or castles.' },
};

export interface CardInfo {
  name: string;
  category: CardCategory;
  /** Short text shown on the card face. */
  short: string;
  /** Full effect shown in tooltips and the rules panel. */
  full: string;
  /** Who/what can be targeted. */
  targets: string;
  duration: string;
}

export const CARD_INFO: Record<CardType, CardInfo> = {
  build_bridge: {
    name: 'Build Bridge',
    category: 'map',
    short: 'Open one unbuilt bridge.',
    full: 'Open one marked, unbuilt bridge. It stays open until destroyed, and any player can use it.',
    targets: 'An unbuilt bridge (dashed gold line).',
    duration: 'Until broken',
  },
  break_bridge: {
    name: 'Break Bridge',
    category: 'map',
    short: 'Close one open bridge.',
    full: 'Close one currently open bridge. Permanent paths cannot be broken. Not allowed if a castle would lose every route to treasure.',
    targets: 'An open bridge.',
    duration: 'Until rebuilt',
  },
  block_path: {
    name: 'Block Path',
    category: 'map',
    short: 'Block a marked path for a round.',
    full: 'Block one marked blockable path (striped line) until the start of your next turn. Rejected if a castle would lose every route to treasure.',
    targets: 'An unblocked blockable path.',
    duration: 'Until your next turn',
  },
  portal: {
    name: 'Portal',
    category: 'map',
    short: 'Open a temporary portal.',
    full: 'Place a temporary portal on an empty portal site, linked to a fixed portal you choose. Anyone may use it; the jump costs one step.',
    targets: 'An empty portal site + a fixed portal.',
    duration: 'Until your next turn',
  },
  trap: {
    name: 'Trap',
    category: 'map',
    short: 'Hide a snare on an empty space.',
    full: 'Place a visible trap on an empty normal space. The first opponent to end movement there returns to their castle and drops any treasure. Shields do not stop traps; Immunity does.',
    targets: 'An empty normal space.',
    duration: `${C.trapLifetimeRounds} rounds or until sprung`,
  },
  speed_boost: {
    name: 'Speed Boost',
    category: 'power',
    short: `Move a character up to ${C.speedBoostSteps} more spaces.`,
    full: `Immediately move one of your characters up to ${C.speedBoostSteps} spaces. Normal movement, capture and treasure rules apply, but card spaces do not draw.`,
    targets: 'One of your characters that can move.',
    duration: 'Instant',
  },
  shield: {
    name: 'Shield',
    category: 'power',
    short: 'Block the next capture.',
    full: 'Protect one of your characters against the next capture. The attacker stops just before it. Lasts until used or replaced.',
    targets: 'One of your characters.',
    duration: 'Until it blocks a capture',
  },
  attack_boost: {
    name: 'Attack Boost',
    category: 'power',
    short: 'Capture while passing through.',
    full: 'During that character’s next regular move it may capture an opponent by entering their space and keep moving. Max one capture. Cannot be given to a Knight.',
    targets: 'One of your non-Knight characters.',
    duration: 'Next regular move',
  },
  teleport: {
    name: 'Teleport',
    category: 'power',
    short: 'Jump to an empty fixed portal.',
    full: 'Move one of your characters to an empty fixed portal. Treasure pickup applies; no card draw.',
    targets: 'One of your characters + an empty fixed portal.',
    duration: 'Instant',
  },
  royal_guard: {
    name: 'Royal Guard',
    category: 'power',
    short: 'Protect your castle from attack.',
    full: 'Your castle ignores the next Castle Attack played against it. Lasts until used.',
    targets: 'Your castle (if not already guarded).',
    duration: 'Until it blocks an attack',
  },
  swap: {
    name: 'Swap',
    category: 'special',
    short: 'Trade places with an opponent.',
    full: 'Swap the positions of one of your characters and an opponent’s character. Both keep their treasure. Neither may be in a castle, on a treasure space or immune. Not a move: no capture, pickup, trap or draw.',
    targets: 'Your character + an opponent character, both on open ground.',
    duration: 'Instant',
  },
  immunity: {
    name: 'Immunity',
    category: 'special',
    short: 'Untouchable until your next turn.',
    full: 'One of your characters cannot be captured, trapped or targeted by opponent cards until the start of your next turn.',
    targets: 'One of your characters.',
    duration: 'Until your next turn',
  },
  slow_down: {
    name: 'Slow Down',
    category: 'special',
    short: `Limit an opponent to ${C.slowDownMaxSteps} steps.`,
    full: `On the chosen opponent’s next turn, their regular move is capped at ${C.slowDownMaxSteps} spaces. They can still play a card. Only one Slow Down can be pending per player.`,
    targets: 'An opponent without a pending Slow Down.',
    duration: 'Their next turn',
  },
  castle_attack: {
    name: 'Castle Attack',
    category: 'special',
    short: 'Stop an opponent banking.',
    full: 'Damage an opponent’s castle until the start of your next turn: they cannot bank treasure (they may still enter and leave). Royal Guard blocks this and is used up.',
    targets: 'An opponent whose castle is not already damaged.',
    duration: 'Until your next turn',
  },
  repair: {
    name: 'Repair',
    category: 'special',
    short: 'Fix your castle or clear a block.',
    full: 'Repair your damaged castle (carriers inside bank immediately) OR remove one blocked path. Cannot rebuild a broken bridge.',
    targets: 'Your damaged castle, or any blocked path.',
    duration: 'Instant',
  },
};

export const CARD_TYPES = Object.keys(CARD_INFO) as CardType[];

export interface RuleSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

const charBullets = (Object.keys(CHARACTER_INFO) as CharacterKind[]).map(
  (k) => `${CHARACTER_INFO[k].name} — ${CHARACTER_INFO[k].abilityName}: ${CHARACTER_INFO[k].ability}`,
);
const cardBullets = (cat: CardCategory) =>
  CARD_TYPES.filter((t) => CARD_INFO[t].category === cat).map((t) => `${CARD_INFO[t].name}: ${CARD_INFO[t].full}`);

export const QUICK_GOAL = `Be the first kingdom to bring ${C.treasuresToWin} treasures home to your castle.`;
export const TURN_SUMMARY = ['Roll the die.', 'Move one character up to the roll.', 'Optionally play one card.', 'End your turn.'];

export const RULE_SECTIONS: RuleSection[] = [
  {
    id: 'quick-start',
    title: 'Quick Start',
    paragraphs: [
      QUICK_GOAL,
      `If the ${matchMinutes}-minute match timer runs out, the kingdom with the most banked treasure wins.`,
    ],
    bullets: TURN_SUMMARY.map((s, i) => `${i + 1}. ${s}`),
  },
  {
    id: 'movement',
    title: 'Movement & Spaces',
    paragraphs: [
      'Move one character along connected paths, up to the number rolled. You may stop early. Glowing spaces are valid destinations; if several routes lead there, you pick the route.',
      'You cannot revisit a space in one move, cannot end on your own character, and cannot enter an opponent’s castle. Your own castle holds any number of your characters.',
      'Ending on an opponent captures them. Most characters cannot pass through opponents.',
    ],
    bullets: [
      'Card space (scroll): ending your regular move here draws a card at the end of your turn.',
      'Treasure space (gem): ending here picks up treasure if the character is empty-handed.',
      'Fixed portal (swirl): the Witch can jump between the two fixed portals; Teleport lands here.',
      'Portal site (dotted ring): where the Portal card opens a temporary portal.',
      'The island is a 15×15 grid. The gold king’s road (middle row and column) can never be broken, so a castle always has a way to treasure. Crossing it still takes several rolls.',
      'Bridge (planks): can be built or broken with map cards. Dashed = not built. Rivers are lines of bridges.',
      'Blockable path (stripes): can be blocked by Block Path.',
      'Rolling a 6 does not give an extra turn.',
    ],
  },
  {
    id: 'characters',
    title: 'The Four Characters',
    paragraphs: ['Every kingdom has the same four characters. Each has one passive ability.'],
    bullets: charBullets,
  },
  {
    id: 'capture',
    title: 'Capture, Shield, Immunity & Recovery',
    paragraphs: [
      'Ending your move on an opponent captures them: they return to their castle and drop any treasure on that space. If your character is empty-handed, it grabs the dropped treasure.',
      'A captured character is recovering: it cannot move during its owner’s next turn (shown with a bandage icon). Nobody is ever eliminated.',
      'Shield (blue bubble) blocks one capture and breaks; the attacker stops on the last free space before the target, or stays put.',
      'Immunity (golden star aura) means the character cannot be captured, trapped or targeted by opponent cards until its owner’s next turn.',
    ],
  },
  {
    id: 'treasure',
    title: 'Treasure, Banking & Winning',
    paragraphs: [
      'A character carries at most one treasure. Pick it up by ending movement on it. Bank it by ending movement in your own castle.',
      'A banked treasure reappears at its original treasure space, even if someone is standing there.',
      `First to ${C.treasuresToWin} banked treasures wins. On timeout: most banked wins; tie → most treasure being carried; still tied → shared victory.`,
      'A damaged castle cannot bank. When it is repaired or the damage expires, carriers inside bank immediately.',
    ],
  },
  { id: 'map-cards', title: 'Map Cards', paragraphs: [CATEGORY_INFO.map.description], bullets: cardBullets('map') },
  { id: 'power-cards', title: 'Character Power Cards', paragraphs: [CATEGORY_INFO.power.description, 'Each character holds one power (Shield or Attack Boost) at a time; a new one replaces the old. Immunity can stack with a power.'], bullets: cardBullets('power') },
  { id: 'special-cards', title: 'Special Move Cards', paragraphs: [CATEGORY_INFO.special.description], bullets: cardBullets('special') },
  {
    id: 'cards-general',
    title: 'Card Rules',
    paragraphs: [
      'You start with three cards, one from each category. Hand limit: ' + C.handLimit + ' cards.',
      'Play at most one card per turn, after your regular move. Cards without a valid target cannot be played.',
      'If your hand is full when you draw, discard a card to make room or decline the draw. The discard pile is reshuffled when the deck runs out.',
      'Extra movement from cards resolves captures, pickup and banking but never draws from card spaces.',
    ],
  },
  {
    id: 'timers',
    title: 'Timers & Disconnections',
    paragraphs: [
      `Each turn has a ${turnSeconds}-second timer. When it runs out the game rolls and makes a basic move for you if needed, then ends your turn. Cards are never played automatically.`,
      `The match lasts ${matchMinutes} minutes and ends immediately when the clock reaches zero.`,
      'Opening the rules never pauses an online match.',
      'If you disconnect, your seat is kept. Reconnect from the same browser to continue. While you are away your turns use a short timer so the match keeps moving. If the host leaves, another player becomes host.',
    ],
  },
];
