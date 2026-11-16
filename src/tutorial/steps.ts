import { applyAction, chooseAiAction, createGame, QUICK_GOAL, toPlayerView, type CardType, type GameAction, type GameEvent, type GameState, type GemKind } from '@/engine';

export const TUTORIAL_YOU = 'you';

export interface TutorialStep {
  id: string;
  title: string;
  body: string[];
  setup: () => GameState;
  /** Continue from the previous step's board instead of a fresh setup (when arriving with Next). */
  keep?: boolean;
  done?: (before: GameState, after: GameState, events: GameEvent[]) => boolean;
  /** The step completes when this character is selected (a client-side choice, not an action). */
  selectDone?: string;
  allowed?: GameAction['type'][];
  allowCard?: CardType;
  allowCharacter?: string;
  /** A move must end here. */
  allowEnd?: string;
  coach?: (state: GameState) => { board?: string[]; ui?: string[] };
  after?: string;
  showCharacters?: boolean;
  finish?: boolean;
}

/** You are Red (seat 0, gate c0, fork c1); the rival is Purple (gate c20). */
function fresh(): GameState {
  const s = createGame({
    players: [
      { id: 'you', name: 'Red' },
      { id: 'foe', name: 'Alex' },
    ],
    seed: 3,
    now: 1,
    firstPlayer: 0,
    config: { matchDurationMs: 0, turnDurationMs: 0 },
  });
  s.hands.foe = [];
  s.hands.you = [];
  return s;
}

const give = (s: GameState, characterId: string, kind: GemKind) => {
  const id = `tut-${kind}-${characterId}`;
  s.gems.push({ id, kind, node: null, carriedBy: characterId });
  s.characters[characterId].carrying.push(id);
};
/** Put a Red piece somewhere having touched `plates` house plates (the rivals' first, then its own). */
const place = (s: GameState, id: string, node: string, plates = 0) => {
  s.characters[id].node = node;
  s.characters[id].plates = [1, 2, 3, 0].slice(0, plates);
  s.characters[id].lap = s.characters[id].plates.length;
};
const card = (s: GameState, type: CardType) => {
  s.hands.you = [{ id: `tut-${type}`, type }];
};

const you = (s: GameState) => s.players.find((p) => p.id === TUTORIAL_YOU)!;
const ready = (s: GameState) => {
  you(s).gems = ['ruby', 'sapphire', 'emerald', 'diamond'];
  you(s).cut = true;
  s.stats.you.cuts = 1;
};
const withRoll = (s: GameState, n: number) => {
  s.forcedRolls = [n];
  return s;
};

/** One move from opening the Royal Path: three gems banked, a cut already made, the fourth gem in hand. */
export function unlockFixture(): GameState {
  const s = withRoll(fresh(), 3);
  you(s).gems = ['ruby', 'sapphire', 'emerald'];
  you(s).cut = true;
  s.stats.you.cuts = 1;
  place(s, 'you-witch', 'c37', 3);
  give(s, 'you-witch', 'diamond');
  return s;
}

function rolled(): GameState {
  const r = applyAction(withRoll(fresh(), 4), { playerId: TUTORIAL_YOU, action: { type: 'roll' }, version: 0 }, 2);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

/**
 * Alex's turns in the tutorial are played by the local AI so multi-turn lessons can continue.
 * Returns the state once it is your turn again (or the game is over), plus every event on the way.
 */
export function runTutorialOpponent(state: GameState, now = 1): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 20 && s.status === 'playing' && s.turn.playerId !== TUTORIAL_YOU; i++) {
    const action = chooseAiAction(toPlayerView(s, s.turn.playerId), random);
    if (!action) break;
    const r = applyAction(s, { playerId: s.turn.playerId, action, version: s.version }, now);
    if (!r.ok) break;
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

const MOVE_UI = (s: GameState) => ({ ui: !s.turn.move ? ['[data-dice]'] : s.turn.moveDone ? [] : ['[data-end="true"]', '[data-confirm]'] });

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Crown Quest',
    body: [QUICK_GOAL, 'You are the Red house (top left). Your King, Queen, Witch and Knight wait in your castle. Each token shows its symbol and your flame crest.'],
    setup: () => withRoll(fresh(), 4),
    showCharacters: true,
    coach: () => ({ board: ['home-red', 'temple'] }),
  },
  {
    id: 'roll',
    title: 'Roll the die',
    body: ['Each turn you roll one die. Any roll brings a piece out of the castle onto your gate. A 6 earns one extra turn after this one, and so does cutting a rival.', 'Tap the die (or press R).'],
    setup: () => withRoll(fresh(), 4),
    keep: true,
    allowed: ['roll'],
    coach: (s) => ({ ui: s.turn.move ? [] : ['[data-dice]'] }),
    done: (_b, a) => !!a.turn.move,
    after: 'You rolled 4. One piece will move exactly 4 spaces.',
  },
  {
    id: 'move',
    title: 'Pick a piece, preview, move',
    body: [
      'Tap your Witch (the pointed hat). Several spaces glow — roads run both ways and branch. Tap the one past the Ruby Mine: the preview shows the route and what will happen.',
      'Press “Move here” (or tap the space again). A move must use the whole roll and may not step on the same space twice.',
    ],
    setup: rolled,
    keep: true,
    allowed: ['move'],
    allowCharacter: 'you-witch',
    allowEnd: 'c3',
    coach: (s) => ({ ui: s.turn.moveDone ? [] : ['[data-piece="you-witch"]', '[data-end="true"]', '[data-confirm]'], board: ['c2'] }),
    done: (_b, a) => a.characters['you-witch'].node === 'c3' && a.characters['you-witch'].carrying.length > 0,
    after: 'Passing the Ruby Mine picked up a Ruby. The small gem badge on the Witch shows she carries it.',
  },
  {
    id: 'bank',
    title: 'Bank it at your gate',
    body: [
      'A gem counts once it reaches your Red Gate. Passing or landing on the gate banks it automatically.',
      'Each gate is also a house plate. Your Witch has touched the Blue, Purple and Green plates; your own plate completes her lap. Roll and move her onto the gate.',
    ],
    setup: () => {
      const s = withRoll(fresh(), 3);
      place(s, 'you-witch', 'c37', 3);
      give(s, 'you-witch', 'ruby');
      return s;
    },
    allowed: ['roll', 'move', 'skipAdventure'],
    allowCharacter: 'you-witch',
    allowEnd: 'c0',
    coach: (s) => ({ ...MOVE_UI(s), board: ['c0'] }),
    done: (_b, a) => you(a).gems.includes('ruby'),
    after: 'RUBY BANKED — and touching your Red plate completed her lap: one piece has now touched all four house plates, in any order.',
  },
  {
    id: 'cut',
    title: 'Cut and steal',
    body: [
      'End your move on a rival on an ordinary space and you cut it: it goes back to its castle, and you take the gem it carries.',
      'Alex’s Witch carries a Sapphire 3 spaces ahead of your Knight. Roll and land on her.',
    ],
    setup: () => {
      const s = withRoll(fresh(), 3);
      place(s, 'you-knight', 'c7');
      place(s, 'foe-witch', 'c4');
      give(s, 'foe-witch', 'sapphire');
      return s;
    },
    allowed: ['roll', 'move', 'skipAdventure'],
    allowCharacter: 'you-knight',
    allowEnd: 'c4',
    coach: (s) => ({ ...MOVE_UI(s), board: ['c4'] }),
    done: (_b, a) => a.characters['foe-witch'].node === 'home-purple',
    after: 'CUT! Her plates reset, your Knight carries the Sapphire, and the cut earns you an extra turn. Gold-star spaces, gates and Royal Paths are safe: nobody can be cut there.',
  },
  {
    id: 'shield',
    title: 'Power card: Shield',
    body: ['Cards use your adventure action — one per turn, before or after moving.', 'Alex’s Knight is 4 behind your Queen. Tap the Shield card, then your Queen. Nobody may land on a shielded piece until your next turn.'],
    setup: () => {
      const s = fresh();
      card(s, 'shield');
      place(s, 'you-queen', 'c15', 1);
      place(s, 'foe-knight', 'c11');
      return s;
    },
    allowed: ['playCard'],
    allowCard: 'shield',
    coach: () => ({ ui: ['[data-card="shield"]', '[data-highlight="target"]', '[data-piece="you-queen"]'] }),
    done: (_b, a) => a.characters['you-queen'].shield,
    after: 'Shielded. The blue S badge shows it, and Alex’s preview will refuse to land on her.',
  },
  {
    id: 'map-card',
    title: 'Map card: rebuild a bridge',
    body: ['Map cards open and close inner routes for everyone, only on marked sites, and never cut anyone off.', 'Tap Build Bridge and pick the Rope Bridge. It starts broken.'],
    setup: () => {
      const s = fresh();
      card(s, 'build_bridge');
      return s;
    },
    allowed: ['playCard'],
    allowCard: 'build_bridge',
    coach: () => ({ ui: ['[data-card="build_bridge"]', '[data-highlight="target"]'] }),
    done: (_b, a) => a.bridges['broken-bridge'] === true,
    after: 'The Rope Bridge is open again — a shortcut for every player, rivals included. Landslide, Collapse Bridge, Raise Mountain and Create River close routes the same way; digging can uncover hidden ones.',
  },
  {
    id: 'dungeon',
    title: 'The dungeon (optional)',
    body: [
      'Roll and move your Witch onto the Dragon Gate, then press “enter the dungeon” (your adventure action). Alex takes a turn; then press “leave the dungeon” to climb back out.',
      'Red and green arrow spaces nearby are traps and shortcuts: they fire only when a move ends on them.',
    ],
    setup: () => {
      const s = withRoll(fresh(), 2);
      place(s, 'you-witch', 'c18', 0);
      s.forcedRolls = [2, 1, 1];
      return s;
    },
    allowed: ['roll', 'move', 'enterDungeon', 'leaveDungeon', 'skipAdventure'],
    allowCharacter: 'you-witch',
    allowEnd: 'c16',
    coach: (s) => {
      const inside = s.characters['you-witch'].node.startsWith('d-');
      if (s.turn.playerId !== TUTORIAL_YOU) return {};
      if (inside) return { ui: ['[data-adventure-option="leaveDungeon"]'] };
      if (s.characters['you-witch'].node === 'c16' && !s.turn.adventureDone) return { ui: ['[data-adventure-option="enterDungeon"]'] };
      return { ...MOVE_UI(s), board: ['c16'] };
    },
    done: (_b, _a, ev) => ev.some((e) => e.type === 'teleported' && e.reason === 'dungeon' && e.characterId === 'you-witch' && e.to === 'c16'),
    after: 'Back on the island. Inside are a monster guarding the Vault Door, the Crystal Shrine (any gem you need), dig sites and the dragon’s lair.',
  },
  {
    id: 'royal-path',
    title: 'Turn onto your Royal Path',
    body: [
      'With all four gems banked and one cut, your Royal Path opens (top strip). A piece that has touched all four plates turns in at your fork.',
      'Your Queen has touched all four. Roll, then choose the glowing space on the red Royal Path.',
    ],
    setup: () => {
      const s = withRoll(fresh(), 2);
      ready(s);
      place(s, 'you-queen', 'c0', 4);
      return s;
    },
    allowed: ['roll', 'move', 'skipAdventure'],
    allowCharacter: 'you-queen',
    allowEnd: 'f-red-1',
    coach: (s) => ({ ...MOVE_UI(s), ui: [...MOVE_UI(s).ui, '[data-tutorial="objective"]'], board: ['f-red-1'] }),
    done: (_b, a) => a.characters['you-queen'].node === 'f-red-1',
    after: 'On the Royal Path. Only your pieces can use it, and it is safe.',
  },
  {
    id: 'temple',
    title: 'Land exactly on the Crown Temple',
    body: ['You need the exact roll to land on the temple. Too high and that piece cannot move this turn.', 'Your Queen is 3 away. Roll and walk her in.'],
    setup: () => {
      const s = withRoll(fresh(), 3);
      ready(s);
      place(s, 'you-queen', 'f-red-3', 4);
      return s;
    },
    allowed: ['roll', 'move'],
    allowCharacter: 'you-queen',
    allowEnd: 'temple',
    coach: (s) => ({ ...MOVE_UI(s), board: ['temple'] }),
    done: (_b, a) => a.status === 'finished' && a.result?.winners[0] === TUTORIAL_YOU,
    after: 'You claimed the Crown Temple. The Red house wins!',
  },
  {
    id: 'more',
    title: 'You are ready',
    body: [
      'Still to discover: the dungeon under the Dragon Gate (monster, vault, Crystal Shrine), the dragon you can tame or slay, the boat and plane, dig sites, and the Witch’s Moonstone Arches.',
      'Tap any space for what it does, open the Legend, or the Rules. Everything is one tap away during a match.',
    ],
    setup: fresh,
    finish: true,
  },
];
