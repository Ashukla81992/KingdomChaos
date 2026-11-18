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
/** Put a Red piece somewhere having touched `plates` house checkpoints (the rivals' first, then its own). */
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
  you(s).bank = { ruby: 1, sapphire: 1, emerald: 1, diamond: 1 };
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
  you(s).bank = { ruby: 1, sapphire: 1, emerald: 1, diamond: 0 };
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
    body: [
      QUICK_GOAL,
      'You are the Red house (top left). Your King, Queen, Witch and Knight wait in your castle. This Learn to Play walk-through covers a guided first turn, then the key rules.',
    ],
    setup: () => withRoll(fresh(), 4),
    showCharacters: true,
    coach: () => ({ board: ['home-red', 'temple'] }),
  },
  {
    id: 'roll',
    title: 'Roll the die',
    body: [
      'Each turn you roll one die, then choose one character and a route that uses exactly that allowance.',
      'A natural 6, or a movement capture, earns one bonus roll in the same turn. Tap the die (or press R).',
    ],
    setup: () => withRoll(fresh(), 4),
    keep: true,
    allowed: ['roll'],
    coach: (s) => ({ ui: s.turn.move ? [] : ['[data-dice]'] }),
    done: (_b, a) => !!a.turn.move,
    after: 'You rolled 4. One piece will move exactly 4 spaces — the whole allowance on one route.',
  },
  {
    id: 'move',
    title: 'Pick a piece and follow the route',
    body: [
      'Tap your Witch (the pointed hat). Several spaces glow — roads run both ways and branch. Tap the one past the Ruby Mine: the preview shows the exact route.',
      'Press “Move here” (or tap the space again). Use the whole roll on one path; portal hops and traps resolve after the steps.',
    ],
    setup: rolled,
    keep: true,
    allowed: ['move'],
    allowCharacter: 'you-witch',
    allowEnd: 'c3',
    coach: (s) => ({ ui: s.turn.moveDone ? [] : ['[data-piece="you-witch"]', '[data-end="true"]', '[data-confirm]'], board: ['c2'] }),
    done: (_b, a) => a.characters['you-witch'].node === 'c3' && a.characters['you-witch'].carrying.length > 0,
    after: 'Passing the Ruby Mine picked up a Ruby. The small gem badge on the Witch shows she carries it. Watch the event strip for what happened and why.',
  },
  {
    id: 'bank',
    title: 'Bank it at your gate',
    body: [
      'A gem counts once it reaches your Red Gate. Passing or landing on the gate banks it automatically. Duplicates stay as spares.',
      'Each gate is also a public checkpoint. Your Witch has touched the Blue, Purple and Green markers; your own gate completes her set. Roll and move her onto the gate.',
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
    after: 'RUBY BANKED — and touching your Red gate completed her four checkpoints. Captured pieces keep the markers they have touched.',
  },
  {
    id: 'cut',
    title: 'Capture and earn a bonus roll',
    body: [
      'End your move on a rival on an ordinary space to capture it: it returns to its castle, keeps its checkpoints, and you take the gem it carries while your hands are free.',
      'Alex’s Witch carries a Sapphire 3 spaces ahead of your Knight. Roll and land on her — that capture earns one bonus roll in this same turn.',
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
    after: 'CAPTURE! She keeps her checkpoints. Your Knight carries the Sapphire, and the capture earns a bonus roll. Read the event card or log for what you can do next.',
  },
  {
    id: 'bonus',
    title: 'Take the bonus roll',
    body: [
      'A natural 6 or at least one movement capture earns exactly one bonus roll in the same turn. A 6 plus captures is still one; chains are possible.',
      'Your Knight already captured and a bonus is pending. Tap the die to roll again, then move any piece the exact new allowance — or End turn / skip Adventure when you are finished looking.',
    ],
    setup: () => {
      const s = withRoll(fresh(), 2);
      place(s, 'you-knight', 'c4');
      give(s, 'you-knight', 'sapphire');
      s.characters['foe-witch'].node = 'home-purple';
      s.turn.extra = 'capture';
      s.turn.bonus = true;
      s.turn.moveDone = false;
      s.turn.adventureDone = false;
      s.turn.move = null;
      s.turn.rolls = 1;
      s.stats.you.cuts = 1;
      you(s).cut = true;
      return s;
    },
    allowed: ['roll', 'move', 'skipMove', 'skipAdventure'],
    coach: (s) => ({ ...MOVE_UI(s), ui: !s.turn.move ? ['[data-dice]'] : MOVE_UI(s).ui }),
    done: (_b, a, ev) => !!a.turn.move || a.turn.moveDone || a.turn.adventureDone || a.turn.playerId !== TUTORIAL_YOU || ev.some((e) => e.type === 'rolled' && e.bonus),
    after: 'Bonus rolls stay in the same turn. The Adventure action is still once per turn.',
  },
  {
    id: 'shield',
    title: 'Power card and the event strip',
    body: [
      'Cards use your adventure action — one per turn, before or after moving. After each action, the event strip (or event card) explains what happened and what you can do now.',
      'Alex’s Knight is 4 behind your Queen. Tap the Shield card, then your Queen. Landing on a shielded piece is refused until your next turn.',
    ],
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
    body: [
      'Map cards open and close inner routes for everyone, only on marked sites, and every house keeps a path to its castle, checkpoints and Royal Path.',
      'Tap Build Bridge: the roads it can fix glow blue on the map. Tap the broken Rope Bridge itself, check the green preview, then press “Build bridge ✓” beside it. (Tapping a road first also picks the card that fits it.)',
    ],
    setup: () => {
      const s = fresh();
      card(s, 'build_bridge');
      return s;
    },
    allowed: ['playCard'],
    allowCard: 'build_bridge',
    coach: () => ({ ui: ['[data-card="build_bridge"]', '[data-edge="rope-west~rope-1"]', '[data-edge-confirm]'] }),
    done: (_b, a) => a.bridges['broken-bridge'] === true,
    after: 'The Rope Bridge is open again — a shortcut for every player. Landslide, Collapse Bridge, Raise Mountain and Create River close routes the same way.',
  },
  {
    id: 'dungeon',
    title: 'The dungeon (optional)',
    body: [
      'Roll and move your Witch onto the Dragon Gate, then press “enter the dungeon” (your adventure action). Alex takes a turn; then press “leave the dungeon” to climb back out.',
      'Inside, every special space is labelled; tap one to see what it does. Stone Golem and Cave Spider fight anyone who ends on them (roll 4+, Knight +1): beat the Golem and its shortcut stays open for your kingdom, beat the Spider for a power card.',
      'They also roam: after every full round a monster die is rolled. 4–5: a monster attacks a piece within 3 steps inside (the Golem pushes it back 2 spaces, the Spider webs it so its next move is 2 shorter); 6: one climbs out and attacks near the Dragon Gate. Safe rooms protect you.',
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
    after: 'Back on the island. Failed encounters retreat to a marked safe room; both outcomes are previewed before you confirm a landing.',
  },
  {
    id: 'royal-path',
    title: 'Turn onto your Royal Path',
    body: [
      'Every house’s Royal Path is always drawn: faded with a lock until that kingdom banks one of each gem, then in full colour. Banking one of each gem kind opens your Royal Path (top strip). Pieces may enter early and walk back onto the island. The temple gate still needs four checkpoints on that piece and your kingdom’s capture credit.',
      'Your Queen has all four checkpoints and your path is open. Roll, then choose the glowing space on the red Royal Path.',
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
    after: 'On the Royal Path. Only your pieces can use it, and it is safe. Edges run both ways.',
  },
  {
    id: 'temple',
    title: 'Finish at the Crown Temple',
    body: [
      'A piece that enters the temple finishes for its kingdom and stays there. Get all four characters in to win.',
      'Three of your pieces are already finished. Your Queen is 3 away — roll and walk her in as the fourth.',
    ],
    setup: () => {
      const s = withRoll(fresh(), 3);
      ready(s);
      place(s, 'you-queen', 'f-red-3', 4);
      for (const kind of ['king', 'witch', 'knight'] as const) {
        const id = `you-${kind}`;
        s.characters[id].finished = true;
        s.characters[id].node = 'temple';
        s.characters[id].plates = [0, 1, 2, 3];
        s.characters[id].lap = 4;
      }
      return s;
    },
    allowed: ['roll', 'move'],
    allowCharacter: 'you-queen',
    allowEnd: 'temple',
    coach: (s) => ({ ...MOVE_UI(s), board: ['temple'] }),
    done: (_b, a) => a.status === 'finished' && a.result?.winners[0] === TUTORIAL_YOU,
    after: 'All four Red characters are in the Crown Temple. The Red house wins!',
  },
  {
    id: 'more',
    title: 'You are ready',
    body: [
      'Still to discover: Royal Guard, Queen Diplomacy, Witch Alchemy, Knight route attacks, roaming dungeon monsters, and the dragon. A tamed dragon breathes fire with no card: pick a rival within 3 spaces as your Adventure action and roll 4–6 on the attack die.',
      'Open the Rules rail or Legend any time during a match. Practice vs AI uses the same engine as online play.',
    ],
    setup: fresh,
    finish: true,
  },
];
