import { getBoard } from './board';
import { CARDS, canTameHere } from './cards';
import { mapOf, walkingDistances } from './graph';
import { CARD_INFO } from './rulesText';
import {
  CHAR_NAMES,
  handsFree,
  canArrive,
  companionOf,
  dragonNode,
  enumerateMoves,
  finalUnlocked,
  houseOf,
  isCompanion,
  isProtected,
  neededGems,
  aGem,
  playerOf,
  type MoveOption,
} from './rules';
import type { BoardState, CardInstance, CardTarget, Character, GameAction, PlayerStats } from './types';

type Stats = { stats: Record<string, Pick<PlayerStats, 'cuts'>> };
export type QueryState = BoardState & Stats;

export interface AdventureOption {
  action: GameAction;
  characterId: string;
  /** Button text, e.g. "Tame the dragon". */
  label: string;
  /** Short explanation including odds. */
  detail: string;
  /** A draw may land in a full hand: the UI asks which card to discard (or none to decline). */
  mayDraw?: boolean;
}

/**
 * Move steps for a character: max(1, roll - 2) with a dragon, capped by Slow Down.
 * `slowed` defaults to the stored flag of the current roll, else the owner's pending Slow Down.
 */
export function stepsFor(s: BoardState, characterId: string, value: number, slowed?: boolean): { steps: number; note: string } {
  const ch = s.characters[characterId];
  const cfg = s.config;
  let steps = value;
  let note = `Roll ${value}`;
  if (isCompanion(s, ch.id)) {
    steps = Math.max(cfg.dragonMinMove, value - cfg.dragonMovePenalty);
    note += ` − Dragon ${cfg.dragonMovePenalty}`;
  }
  const slow = slowed ?? (s.turn.move && s.turn.playerId === ch.owner ? s.turn.move.slowed : playerOf(s, ch.owner).slowed);
  if (slow && steps > cfg.slowDownMaxSteps) {
    steps = cfg.slowDownMaxSteps;
    note += ` (slowed to ${cfg.slowDownMaxSteps})`;
  }
  return { steps, note: `${note} = Move ${steps}` };
}

/** Legal routes for one of the current player's characters after the roll. */
export function legalMoves(s: BoardState, characterId: string): MoveOption[] {
  const m = s.turn.move;
  const ch = s.characters[characterId];
  if (!m || s.turn.moveDone || !ch || ch.owner !== s.turn.playerId || s.status !== 'playing') return [];
  return enumerateMoves(s, characterId, { steps: stepsFor(s, characterId, m.roll).steps, allowCuts: true, portals: true });
}

export interface Mover {
  characterId: string;
  steps: number;
  note: string;
  options: MoveOption[];
}

/** The current player's characters that have at least one legal route after the roll. */
export function movableCharacters(s: BoardState): Mover[] {
  const m = s.turn.move;
  if (!m || s.turn.moveDone) return [];
  const out: Mover[] = [];
  for (const c of Object.values(s.characters)) {
    if (c.owner !== s.turn.playerId) continue;
    const { steps, note } = stepsFor(s, c.id, m.roll);
    const options = legalMoves(s, c.id);
    if (options.length) out.push({ characterId: c.id, steps, note, options });
  }
  return out;
}

/** Plain-language reason one character has no legal move with this roll. */
export function whyStuck(s: QueryState, characterId: string): string {
  const ch = s.characters[characterId];
  const { nodes } = getBoard(s.boardId);
  const node = nodes[ch.node];
  const m = s.turn.move;
  const steps = m ? stepsFor(s, characterId, m.roll).steps : 0;
  if (node.lane === 'final') return `needs exactly the right roll to reach the temple (${steps} is too many)`;
  if (dragonNode(s) === ch.node && s.dragon.state !== 'companion' && s.dragon.state !== 'recovering') return 'stands with the dragon';
  return `every ${steps}-space route is blocked by pieces, the dragon, or a closed road`;
}

export function noMoveReason(s: QueryState, playerId: string): string {
  const mine = Object.values(s.characters).filter((c) => c.owner === playerId);
  const parts = mine.map((c) => `${CHAR_NAMES[c.kind]}: ${whyStuck(s, c.id)}`);
  return `No legal move. ${parts.join('; ')}.`;
}

export function dragonFireTargets(s: BoardState, playerId: string): Character[] {
  const comp = companionOf(s, playerId);
  if (!comp) return [];
  const from = comp.node;
  const { nodes } = getBoard(s.boardId);
  const dist = walkingDistances(s, from, s.config.dragonFireRange);
  return Object.values(s.characters).filter((c) => {
    const lane = nodes[c.node].lane;
    return c.owner !== playerId && !isProtected(c) && lane !== 'home' && lane !== 'final' && lane !== 'temple' && dist[c.node] !== undefined && mapOf(s.boardId, c.node) === mapOf(s.boardId, from);
  });
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
export const odds = (sides: number, need: number) => pct(Math.max(0, Math.min(1, (sides - need + 1) / sides)));

const label = (s: BoardState, c: Character) => `${playerOf(s, c.owner).name}'s ${CHAR_NAMES[c.kind]}`;

/** Every location and dragon adventure action available right now (cards are listed separately). */
export function adventureOptions(s: QueryState, playerId: string, hand: CardInstance[]): AdventureOption[] {
  if (s.status !== 'playing' || s.turn.playerId !== playerId || s.turn.adventureDone) return [];
  const { nodes, board } = getBoard(s.boardId);
  const cfg = s.config;
  const out: AdventureOption[] = [];
  const comp = companionOf(s, playerId);
  const full = hand.length >= cfg.handLimit;
  for (const c of Object.values(s.characters)) {
    if (c.owner !== playerId) continue;
    const node = nodes[c.node];
    const name = CHAR_NAMES[c.kind];
    const gate = board.transitions.find((t) => t.island === c.node);
    if (gate)
      out.push({ action: { type: 'enterDungeon', characterId: c.id }, characterId: c.id, label: `${name}: enter the dungeon`, detail: 'Go down to the Dungeon Entrance. Optional side quest: the Crystal Shrine has every gem.' });
    const exit = board.transitions.find((t) => t.dungeon === c.node);
    if (exit) {
      const ok = canArrive(s, exit.island, c.id);
      if (ok) out.push({ action: { type: 'leaveDungeon', characterId: c.id }, characterId: c.id, label: `${name}: leave the dungeon`, detail: `Climb out at ${nodes[exit.island].name}.` });
    }
    if (node.dig) {
      if (node.type === 'gemChamber') {
        if (handsFree(s, c))
          for (const gem of neededGems(s, playerId))
            out.push({ action: { type: 'dig', characterId: c.id, gem }, characterId: c.id, label: `${name}: take ${aGem(gem)}`, detail: 'The Crystal Shrine holds every gem. Carry it to your gate to bank it.' });
      } else
        out.push({
          action: { type: 'dig', characterId: c.id },
          characterId: c.id,
          label: `${name}: dig here`,
          detail: `Draw a discovery: a gem, a card, a dungeon key, a buried trap, or a secret shortcut.${full ? ' Your hand is full, so a found card needs a discard.' : ''}`,
          mayDraw: full,
        });
    }
    if (node.type === 'monster' && !c.beatMonster) {
      const bonus = c.kind === 'knight' ? cfg.knightBonus : 0;
      out.push({
        action: { type: 'fightMonster', characterId: c.id },
        characterId: c.id,
        label: `${name}: fight the monster`,
        detail: `Roll ${cfg.monsterThreshold}+${bonus ? ` (Knight +${bonus})` : ''} — ${odds(cfg.dieSides, cfg.monsterThreshold - bonus)}. Win: the Vault Door opens for this visit. Lose: retreat to a safe room.`,
      });
    }
    if (canTameHere(s, playerId, c.id))
      out.push({ action: { type: 'tame', characterId: c.id }, characterId: c.id, label: `${name}: tame the dragon`, detail: `Roll ${cfg.tameThreshold}+ (${odds(cfg.dieSides, cfg.tameThreshold)}). Fail: retreat to a safe space.` });
    if (!isCompanion(s, c.id)) {
      if (node.dock && s.vehicles.boat === c.node) {
        const to = board.docks.find((d) => d !== c.node)!;
        if (canArrive(s, to, c.id)) out.push({ action: { type: 'sail', characterId: c.id }, characterId: c.id, label: `${name}: sail to ${nodes[to].name}`, detail: 'The boat carries you across the water and stays there. Plates on the way do not count.' });
      }
      if (node.airfield && s.vehicles.plane === c.node)
        for (const to of board.airfields.filter((a) => a !== c.node && canArrive(s, a, c.id)))
          out.push({ action: { type: 'fly', characterId: c.id, to }, characterId: c.id, label: `${name}: fly to ${nodes[to].name}`, detail: 'The plane flies you there and stays there. Plates on the way do not count.' });
    }
  }
  if (comp) {
    for (const t of dragonFireTargets(s, playerId)) {
      out.push({
        action: { type: 'dragonFire', targetId: t.id },
        characterId: comp.id,
        label: `Dragon Fire at ${label(s, t)}`,
        detail: `Sends them home (not a cut). Range ${cfg.dragonFireRange}. Their gems drop where they stood.`,
      });
    }
  }
  return out;
}

export interface PlayableCard {
  card: CardInstance;
  targets: CardTarget[];
  reason: string | null;
}

export function playableCards(s: BoardState, playerId: string, hand: CardInstance[]): PlayableCard[] {
  const myTurn = s.status === 'playing' && s.turn.playerId === playerId;
  return hand.map((card) => {
    if (!myTurn) return { card, targets: [], reason: 'Wait for your turn.' };
    if (s.turn.adventureDone) return { card, targets: [], reason: 'You already used your Adventure action.' };
    const targets = CARDS[card.type].targets(s, playerId);
    let reason: string | null = null;
    if (!targets.length) reason = CARD_INFO[card.type].noTarget ?? `No legal target for ${CARD_INFO[card.type].name} right now.`;
    return { card, targets, reason };
  });
}

export function hasAdventure(s: QueryState, playerId: string, hand: CardInstance[]) {
  return adventureOptions(s, playerId, hand).length > 0 || playableCards(s, playerId, hand).some((p) => p.targets.length > 0);
}

/** One line for the objective strip: what this player still needs. */
export function objectiveText(s: QueryState, playerId: string): string {
  const p = playerOf(s, playerId);
  const cuts = s.stats[playerId]?.cuts ?? 0;
  if (finalUnlocked(s, playerId)) {
    const ready = Object.values(s.characters).filter((c) => c.owner === playerId && c.lap >= 4);
    return ready.length ? 'Royal Path open — turn in at your fork and land exactly on the Crown Temple.' : 'Royal Path open — touch all four house plates with one character, then turn in at your fork.';
  }
  const parts: string[] = [];
  if (p.gems.length < s.config.gemsRequired) parts.push(`bank ${s.config.gemsRequired - p.gems.length} more gem${s.config.gemsRequired - p.gems.length === 1 ? '' : 's'}`);
  if (cuts < s.config.cutsRequired) parts.push('cut an opponent');
  return `To open your Royal Path: ${parts.join(' and ')}. Then a character that has touched all four house plates turns in at your ${houseOf(s, playerId).name} fork.`;
}
