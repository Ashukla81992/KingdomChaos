import {
  CARD_INFO,
  CHARACTER_INFO,
  createGame,
  QUICK_GOAL,
  TURN_SUMMARY,
  type CardType,
  type GameAction,
  type GameEvent,
  type GameState,
} from '../engine';

export const TUTORIAL_YOU = 'you';
export const TUTORIAL_RIVAL = 'rival';
const ch = (pid: string, kind: string) => `${pid}-${kind}`;

/** A safe, local, scripted state: no timers, no network, fixed dice. */
export function tutorialBase(): GameState {
  const s = createGame({
    players: [
      { id: TUTORIAL_YOU, name: 'You' },
      { id: TUTORIAL_RIVAL, name: 'Rival' },
    ],
    seed: 2024,
    now: Date.now(),
    firstPlayer: 0,
    config: { matchDurationMs: 0, turnDurationMs: 0 },
  });
  for (const p of [TUTORIAL_YOU, TUTORIAL_RIVAL]) {
    s.deck.push(...s.hands[p]);
    s.hands[p] = [];
  }
  s.log = [{ id: 1, turn: 1, text: 'Welcome to the training grounds!', kind: 'system' }];
  return s;
}

function place(s: GameState, id: string, space: string) {
  s.characters[id].space = space;
}

function carry(s: GameState, id: string, home: string) {
  const t = s.treasures.find((x) => x.home === home)!;
  t.space = null;
  t.carriedBy = id;
  s.characters[id].carrying = t.id;
}

function giveCard(s: GameState, type: CardType) {
  s.hands[TUTORIAL_YOU].push({ id: `tut-${type}`, type });
}

function actionPhase(s: GameState) {
  s.turn.phase = 'action';
  s.turn.roll = null;
  s.turn.steps = null;
}

export interface Coach {
  /** Board coach marks: space ids, `char:<id>`, `conn:<id>`. */
  board?: string[];
  /** CSS selectors of UI controls to spotlight. */
  ui?: string[];
}

export interface TutorialStep {
  id: string;
  title: string;
  body: string[];
  /** Shown once the step's goal is achieved. */
  after?: string;
  setup: () => GameState;
  allowed?: GameAction['type'][];
  allowCard?: CardType;
  done?: (prev: GameState, next: GameState, events: GameEvent[]) => boolean;
  coach?: (s: GameState) => Coach;
  showCharacters?: boolean;
  finish?: boolean;
}

const playedCard = (events: GameEvent[], type: CardType) => events.some((e) => e.type === 'cardPlayed' && e.card === type);

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Kingdom Chaos!',
    body: [QUICK_GOAL, 'Your red castle is at the top. The glowing gems are treasure. Your four characters — King, Queen, Witch and Knight — start at home.'],
    setup: tutorialBase,
    coach: () => ({ board: ['c0', 'm1', 'm5', 'x'] }),
  },
  {
    id: 'roll-move',
    title: 'Roll and move',
    body: ['Every turn: roll the die, then move ONE character up to that many spaces along the paths.', 'Glowing spaces show where you can go. You may always stop early.'],
    after: 'Great! Only one character moves each turn, so choose wisely.',
    setup: () => {
      const s = tutorialBase();
      s.forcedRolls = [3];
      return s;
    },
    allowed: ['roll', 'move'],
    done: (_p, n) => Object.values(n.characters).some((c) => c.owner === TUTORIAL_YOU && c.space !== 'c0'),
    coach: (s) => (s.turn.phase === 'roll' ? { ui: ['[data-tutorial="roll"]'] } : { board: ['char:you-knight'] }),
  },
  {
    id: 'treasure',
    title: 'Grab the treasure',
    body: ['End your move ON a treasure space to pick it up. Each character carries one treasure at a time.', 'Roll, then move your Queen onto the Moonwell gem. You rolled more than you need — stopping early is fine!'],
    after: 'Got it! The gem above her head shows she is carrying treasure.',
    setup: () => {
      const s = tutorialBase();
      place(s, ch(TUTORIAL_YOU, 'queen'), 'r1');
      s.forcedRolls = [4];
      return s;
    },
    allowed: ['roll', 'move'],
    done: (_p, n) => Object.values(n.characters).some((c) => c.owner === TUTORIAL_YOU && c.carrying),
    coach: (s) => (s.turn.phase === 'roll' ? { ui: ['[data-tutorial="roll"]'] } : { board: ['char:you-queen', 'm1'] }),
  },
  {
    id: 'home',
    title: 'Bring it home',
    body: ['End your move in your own castle to bank the treasure. Watch your score gems on the left!', 'The treasure then reappears where it came from.'],
    after: 'Banked! One of three. If a castle is damaged by a card, banking waits until it is repaired.',
    setup: () => {
      const s = tutorialBase();
      place(s, ch(TUTORIAL_YOU, 'queen'), 'r0');
      carry(s, ch(TUTORIAL_YOU, 'queen'), 'm1');
      s.forcedRolls = [2];
      return s;
    },
    allowed: ['roll', 'move'],
    done: (_p, n) => n.players[0].score >= 1,
    coach: (s) => (s.turn.phase === 'roll' ? { ui: ['[data-tutorial="roll"]'] } : { board: ['char:you-queen', 'c0'] }),
  },
  {
    id: 'abilities',
    title: 'Character abilities',
    body: [
      'Each character has one special ability (tap any piece to read it).',
      'Try the Queen: she can glide THROUGH opponents. Move her past the rival Knight to the glowing space beyond.',
    ],
    after: 'Elegant! A normal character would have had to stop and capture the Knight.',
    showCharacters: true,
    setup: () => {
      const s = tutorialBase();
      place(s, ch(TUTORIAL_YOU, 'queen'), 'r0');
      place(s, ch(TUTORIAL_RIVAL, 'knight'), 'r1');
      s.forcedRolls = [2];
      return s;
    },
    allowed: ['roll', 'move'],
    done: (_p, n) => n.characters[ch(TUTORIAL_YOU, 'queen')].space === 'r2' && n.characters[ch(TUTORIAL_RIVAL, 'knight')].space === 'r1',
    coach: (s) => (s.turn.phase === 'roll' ? { ui: ['[data-tutorial="roll"]'] } : { board: ['char:you-queen', 'r2'] }),
  },
  {
    id: 'map-card',
    title: 'Map cards change the island',
    body: [
      'After moving you may play ONE card. Teal cards are Map cards.',
      `Tap “${CARD_INFO.build_bridge.name}”, then tap the dashed, unbuilt bridge next to the Dragon Hoard.`,
      'Careful — map changes help every kingdom, not just yours.',
    ],
    after: 'A new shortcut to the centre! Break Bridge and Block Path can cut routes too.',
    setup: () => {
      const s = tutorialBase();
      place(s, ch(TUTORIAL_YOU, 'knight'), 'i1');
      actionPhase(s);
      giveCard(s, 'build_bridge');
      return s;
    },
    allowed: ['playCard'],
    allowCard: 'build_bridge',
    done: (_p, _n, e) => playedCard(e, 'build_bridge'),
    coach: () => ({ ui: ['[data-card="build_bridge"]'], board: ['conn:i1-x'] }),
  },
  {
    id: 'power-card',
    title: 'Character power cards',
    body: ['Violet cards power up one character.', `Your Queen carries treasure and the rival Knight lurks nearby. Play “${CARD_INFO.shield.name}” on her: ${CARD_INFO.shield.full}`],
    after: 'The blue bubble shows her Shield. A character holds one power at a time.',
    setup: () => {
      const s = tutorialBase();
      place(s, ch(TUTORIAL_YOU, 'queen'), 'r1');
      carry(s, ch(TUTORIAL_YOU, 'queen'), 'm1');
      place(s, ch(TUTORIAL_RIVAL, 'knight'), 'r3');
      actionPhase(s);
      giveCard(s, 'shield');
      return s;
    },
    allowed: ['playCard'],
    allowCard: 'shield',
    done: (_p, _n, e) => playedCard(e, 'shield'),
    coach: (s) => ({ ui: s.hands[TUTORIAL_YOU].length ? ['[data-card="shield"]'] : [], board: ['char:you-queen'] }),
  },
  {
    id: 'special-card',
    title: 'Special move cards',
    body: [
      'Coral cards are surprises. Immunity is stronger than a Shield but shorter:',
      `${CARD_INFO.immunity.full}`,
      'Give Immunity to your Witch, who is carrying treasure next to the rival.',
    ],
    after: 'Golden stars = Immune. Unlike a Shield, Immunity also stops traps and Swap.',
    setup: () => {
      const s = tutorialBase();
      place(s, ch(TUTORIAL_YOU, 'witch'), 'r9');
      carry(s, ch(TUTORIAL_YOU, 'witch'), 'm5');
      place(s, ch(TUTORIAL_RIVAL, 'king'), 'r10');
      actionPhase(s);
      giveCard(s, 'immunity');
      return s;
    },
    allowed: ['playCard'],
    allowCard: 'immunity',
    done: (_p, _n, e) => playedCard(e, 'immunity'),
    coach: (s) => ({ ui: s.hands[TUTORIAL_YOU].length ? ['[data-card="immunity"]'] : [], board: ['char:you-witch'] }),
  },
  {
    id: 'capture',
    title: 'Capture and recovery',
    body: [
      'Ending on an opponent captures them: they go home and drop their treasure.',
      `Your Knight has “${CHARACTER_INFO.knight.abilityName}”: after a capture it keeps moving. Roll, then charge through the rival Witch to the space beyond.`,
    ],
    after: 'Captured! Nobody is eliminated — the Witch went home and is recovering (bandage) for one turn. Your Knight grabbed her treasure.',
    setup: () => {
      const s = tutorialBase();
      place(s, ch(TUTORIAL_YOU, 'knight'), 'r0');
      place(s, ch(TUTORIAL_RIVAL, 'witch'), 'r1');
      carry(s, ch(TUTORIAL_RIVAL, 'witch'), 'x');
      s.forcedRolls = [2];
      return s;
    },
    allowed: ['roll', 'move'],
    done: (_p, _n, e) => e.some((x) => x.type === 'captured'),
    coach: (s) => (s.turn.phase === 'roll' ? { ui: ['[data-tutorial="roll"]'] } : { board: ['char:you-knight', 'r2'] }),
  },
  {
    id: 'finish',
    title: 'You are ready!',
    body: [QUICK_GOAL, ...TURN_SUMMARY.map((t, i) => `${i + 1}. ${t}`), 'The Rules button is always available — even mid-match.'],
    setup: tutorialBase,
    finish: true,
  },
];
