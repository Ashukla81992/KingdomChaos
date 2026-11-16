import { getBoard, other } from './board';
import { travelDistances } from './graph';
import { adventureOptions, movableCharacters, playableCards, type Mover, type QueryState } from './queries';
import { companionOf, cutsMade, finalUnlocked, houseOf, isSafe, missingPlates, neededGems, type MoveOption } from './rules';
import type { BoardState, CardInstance, CardTarget, Character, GameAction, GemKind, PlayerView } from './types';

type MapChange = Partial<Pick<BoardState, 'bridges' | 'blocks' | 'transforms'>>;

/**
 * Practice AI. Plays by the same rules through the same action API and only reads its own
 * redacted view (it never sees other hands, the deck order, or the discovery order).
 */

function distFn(s: QueryState) {
  const cache = new Map<string, Record<string, number>>();
  return (from: string, to: string) => {
    let d = cache.get(from);
    if (!d) {
      d = travelDistances(s, from, (n) => getBoard(s.boardId).nodes[n].type !== 'castle');
      cache.set(from, d);
    }
    return d[to] ?? 60;
  };
}

/**
 * Where this character should be heading next: the temple once it may enter; home to bank with full
 * hands; otherwise the nearest of a needed gem station and a plate it has not touched.
 */
function goalOf(s: QueryState, ch: Character, carried: number, need: GemKind[], dist: (a: string, b: string) => number): string {
  const house = houseOf(s, ch.owner);
  const { board, nodes } = getBoard(s.boardId);
  if (finalUnlocked(s, ch.owner) && ch.lap >= 4) return board.temple;
  if (carried >= Math.max(1, s.config.carryLimit ?? 1)) return house.entry;
  const here = nodes[ch.node].type === 'castle' ? house.entry : ch.node;
  const stations = carried < Math.max(1, s.config.carryLimit ?? 1) ? board.nodes.filter((n) => n.station && need.includes(n.station)).map((n) => n.id) : [];
  const plates = missingPlates(ch).map((seat) => board.houses.find((h) => h.seat === seat)!.plate);
  const goals = [...stations, ...plates];
  if (carried > 0) goals.push(house.entry);
  if (!goals.length) return house.branch;
  return goals.sort((a, b) => dist(here, a) - dist(here, b))[0];
}

/** How exposed a piece is on `node`: opponents within one roll behind it on the road. */
function danger(s: QueryState, owner: string, node: string, dist: (a: string, b: string) => number): number {
  if (isSafe(s.boardId, node)) return 0;
  let d = 0;
  for (const o of Object.values(s.characters)) {
    if (o.owner === owner) continue;
    const steps = dist(o.node, node);
    if (steps >= 1 && steps <= 6) d += 1;
  }
  return d;
}

export interface MovePick {
  characterId: string;
  option: MoveOption;
  gain: number;
}

/** Roads run both ways, so steady progress toward the goal has to outweigh small detours. */
const PROGRESS_WEIGHT = 2.5;

/** Score one route by what actually happens along it. */
function routeValue(s: QueryState, ch: Character, o: MoveOption, dist: (a: string, b: string) => number): number {
  const { nodes, out } = getBoard(s.boardId);
  const house = houseOf(s, ch.owner);
  const end = o.path[o.path.length - 1];
  let need = neededGems(s, ch.owner);
  const limit = Math.max(1, s.config.carryLimit ?? 1);
  let carrying: GemKind[] = ch.carrying.map((id) => s.gems.find((g) => g.id === id)?.kind).filter((k): k is GemKind => !!k);
  const banked = s.players.find((p) => p.id === ch.owner)!.gems;
  const plates = new Set(ch.plates);
  let v = 0;
  if (nodes[ch.node].type === 'castle') v += 3;
  for (let i = 1; i < o.path.length; i++) {
    const prev = o.path[i - 1];
    const node = o.path[i];
    const walked = out[prev].some((e) => other(e, prev) === node);
    const plate = nodes[node].plate;
    if (walked && plate !== undefined && !plates.has(plate)) {
      plates.add(plate);
      v += plates.size === 4 ? 9 : 4;
    }
    if (carrying.length && node === house.entry) {
      for (const k of carrying) v += banked.includes(k) ? 0.5 : 14;
      carrying = [];
    }
    const st = nodes[node].station;
    if (carrying.length < limit && st && need.includes(st)) {
      v += 7;
      carrying = [...carrying, st];
      need = need.filter((k) => k !== st);
    }
  }
  const cutVictims = [...o.landingCuts, ...(o.knightCut ? Object.values(s.characters).filter((c) => c.node === o.knightCut && c.owner !== ch.owner).map((c) => c.id) : [])];
  for (const id of cutVictims) {
    const victim = s.characters[id];
    // A cut also earns an extra turn.
    v += (cutsMade(s, ch.owner) === 0 ? 9 : 2.5) + 3 + victim.carrying.length * 5 + victim.lap * 1.2;
  }
  if (o.entersFinal) v += 25;
  if (end === getBoard(s.boardId).board.temple) v += 1000;
  const tp = nodes[end].teleport;
  if (tp) v += tp.type === 'trap' ? -5 : 2;
  if (nodes[end].hazard) v -= 1.5 + plates.size * 0.3;
  if (nodes[end].dig && !carrying.length) v += 1;
  const goalBefore = goalOf(s, ch, ch.carrying.length, neededGems(s, ch.owner), dist);
  const startNode = nodes[ch.node].type === 'castle' ? house.entry : ch.node;
  v += (dist(startNode, goalBefore) - dist(end, goalBefore)) * PROGRESS_WEIGHT;
  v += (danger(s, ch.owner, ch.node, dist) - danger(s, ch.owner, end, dist)) * (carrying.length || plates.size >= 3 ? 2 : 0.8);
  return v;
}

/** Best character and route after the roll (also used to auto-finish timed-out moves). */
export function bestMove(s: QueryState, movers: Mover[], random: () => number = () => 0): MovePick | null {
  const dist = distFn(s);
  let best: MovePick | null = null;
  for (const m of movers) {
    const ch = s.characters[m.characterId];
    for (const o of m.options) {
      const gain = routeValue(s, ch, o, dist) + random() * 0.05;
      if (!best || gain > best.gain) best = { characterId: ch.id, option: o, gain };
    }
  }
  return best;
}

/**
 * How much a map change helps this player: the best shortening of one of their pieces' trips to its
 * goal, minus most of the best shortening it gives a rival (map changes affect every house).
 */
function routeGain(s: QueryState, pid: string, change: MapChange): number {
  const before = distFn(s);
  const after = distFn({ ...s, ...change });
  const { nodes } = getBoard(s.boardId);
  let mine = 0;
  let theirs = 0;
  for (const c of Object.values(s.characters)) {
    if (nodes[c.node].lane === 'final' || nodes[c.node].map !== 'island') continue;
    const here = nodes[c.node].type === 'castle' ? houseOf(s, c.owner).entry : c.node;
    const goal = goalOf(s, c, c.carrying.length, neededGems(s, c.owner), before);
    const gain = before(here, goal) - after(here, goal);
    if (c.owner === pid) mine = Math.max(mine, gain);
    else theirs = Math.max(theirs, gain);
  }
  return mine - 0.6 * theirs;
}

function mapChangeOf(s: QueryState, pid: string, card: CardInstance, target: CardTarget): MapChange | null {
  const { edges } = getBoard(s.boardId);
  if (target.kind === 'edge') {
    const e = edges[target.edgeId];
    if (card.type === 'landslide') return { blocks: [...s.blocks.filter((b) => b.owner !== pid), { edgeId: e.id, owner: pid }] };
    if (card.type === 'repair' && s.blocks.some((b) => b.edgeId === e.id)) return { blocks: s.blocks.filter((b) => b.edgeId !== e.id) };
    if (e.gate) return { bridges: { ...s.bridges, [e.gate]: card.type !== 'collapse_bridge' } };
  }
  if (target.kind === 'node') {
    if (card.type === 'repair') {
      const rest = { ...s.transforms };
      delete rest[target.node];
      return { transforms: rest };
    }
    return { transforms: { ...s.transforms, [target.node]: card.type === 'create_river' ? 'river' : 'mountain' } };
  }
  return null;
}

function cardScore(s: QueryState, pid: string, card: CardInstance, target: CardTarget): number {
  const dist = distFn(s);
  if (CATEGORY_MAP.has(card.type)) {
    const change = mapChangeOf(s, pid, card, target);
    const gain = change ? routeGain(s, pid, change) : 0;
    return gain >= 1 ? 10 + gain * 4 : 0;
  }
  switch (card.type) {
    case 'dragon_slayer':
      return companionOf(s, pid) ? 0 : 40;
    case 'dragon_feast':
      return 70;
    case 'shield':
    case 'immunity': {
      if (target.kind !== 'character') return 0;
      const c = s.characters[target.characterId];
      const risk = danger(s, pid, c.node, dist);
      return risk && (c.carrying.length || c.lap >= 2) ? 30 + risk * 5 : 0;
    }
    case 'magic_boots': {
      if (target.kind !== 'path') return 0;
      const c = s.characters[target.characterId];
      const gain = routeValue(s, c, { path: target.path, cost: 2, witchPortal: false, knightCut: null, landingCuts: [], entersFinal: false }, dist);
      return gain > 2 ? 15 + gain * 3 : 0;
    }
    case 'rescue': {
      if (target.kind !== 'character') return 0;
      const c = s.characters[target.characterId];
      const banked = s.players.find((p) => p.id === pid)!.gems;
      const useful = c.carrying.some((id) => { const k = s.gems.find((g) => g.id === id)?.kind; return k && !banked.includes(k); });
      return useful && c.lap < 2 ? 45 : 0;
    }
    case 'reveal_discovery':
      return 12;
    case 'slow_down': {
      if (target.kind !== 'player') return 0;
      const leader = [...s.players].sort((a, b) => b.gems.length - a.gems.length)[0];
      return target.playerId === leader.id && leader.id !== pid ? 14 : 4;
    }
    case 'swap': {
      if (target.kind !== 'swap') return 0;
      const a = s.characters[target.characterId];
      const b = s.characters[target.targetId];
      const goal = goalOf(s, a, a.carrying.length, neededGems(s, pid), dist);
      const gain = dist(a.node, goal) - dist(b.node, goal);
      return gain > 8 ? 10 + gain : 0;
    }
    default:
      return 0;
  }
}

const CATEGORY_MAP = new Set<CardInstance['type']>(['build_bridge', 'collapse_bridge', 'dig_tunnel', 'build_road', 'raise_mountain', 'create_river', 'landslide', 'repair']);

interface Choice {
  action: GameAction;
  score: number;
}

function adventureChoices(s: QueryState, pid: string, hand: CardInstance[]): Choice[] {
  const out: Choice[] = [];
  const need = neededGems(s, pid);
  const full = hand.length >= s.config.handLimit;
  const discardCardId = full ? hand[0].id : null;
  const dist = distFn(s);
  for (const o of adventureOptions(s, pid, hand)) {
    const ch = s.characters[o.characterId];
    const a = o.action;
    let score = 0;
    switch (a.type) {
      case 'dig':
        score = a.gem ? 90 : full ? 6 : 25;
        if (!a.gem && full) out.push({ action: { ...a, discardCardId }, score });
        break;
      case 'enterDungeon':
        score = !ch.carrying.length && need.length >= 2 && !finalUnlocked(s, pid) ? 20 : 0;
        break;
      case 'leaveDungeon':
        score = ch.carrying.length || need.length === 0 ? 80 : 15;
        break;
      case 'fightMonster':
        score = 15;
        break;
      case 'tame':
        score = 45;
        break;
      case 'dragonFire': {
        const t = s.characters[a.targetId];
        score = t.carrying.length ? 80 : t.lap >= 2 ? 45 : 20;
        break;
      }
      case 'sail':
      case 'fly': {
        const goal = goalOf(s, ch, ch.carrying.length, need, dist);
        const to = a.type === 'fly' ? a.to : getBoard(s.boardId).board.docks.find((d) => d !== ch.node)!;
        const gain = dist(ch.node, goal) - dist(to, goal);
        score = gain > 6 && ch.lap < 1 ? 35 : 0;
        break;
      }
    }
    if (score > 0 && !(a.type === 'dig' && !a.gem && full)) out.push({ action: a, score });
  }
  for (const p of playableCards(s, pid, hand)) {
    let best: Choice | null = null;
    for (const t of p.targets) {
      const sc = cardScore(s, pid, p.card, t);
      if (!best || sc > best.score) best = { action: { type: 'playCard', cardId: p.card.id, target: t, discardCardId }, score: sc };
    }
    if (best && best.score > 5) out.push(best);
  }
  return out.sort((a, b) => b.score - a.score);
}

export function chooseAiAction(view: PlayerView, random: () => number = Math.random): GameAction | null {
  const pid = view.viewerId;
  if (!pid || view.status !== 'playing' || view.turn.playerId !== pid) return null;
  const s: QueryState = view;
  const hand = view.hand;
  const t = view.turn;

  if (!t.adventureDone) {
    const best = adventureChoices(s, pid, hand)[0];
    if (best && (t.moveDone || best.score >= 50)) return best.action;
  }
  if (!t.moveDone) {
    if (!t.move) return { type: 'roll' };
    const pick = bestMove(s, movableCharacters(s), random);
    if (!pick) return { type: 'skipMove' };
    return { type: 'move', characterId: pick.characterId, path: pick.option.path, discardCardId: hand.length >= view.config.handLimit ? hand[0].id : null };
  }
  return { type: 'skipAdventure' };
}
