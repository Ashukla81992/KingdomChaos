import { getBoard } from './board';
import { charLabel, drawCard, log, relocate, retreat, roll, type Ctx } from './rules';
import type { BoardState, Character, GameEvent, GameState } from './types';

/** [A3] Encounters, the dragon on the road, and the Dragon Slayer duel. Contract: docs/island-adventure/CONTRACTS.md. */

function holdsSlayer(s: BoardState, playerId: string): boolean {
  const hands = (s as GameState).hands;
  return !!hands?.[playerId]?.some((c) => c.type === 'dragon_slayer');
}

/**
 * How the dragon's space treats this mover. `block`: may end there (to tame) but never pass.
 * `pass`: may walk through and end there (the Witch, wild only). `slay`: the Queen holding Dragon
 * Slayer may end there to fight it.
 */
export function dragonSpaceRule(s: BoardState, characterId: string): 'block' | 'pass' | 'slay' {
  if (s.dragon.state !== 'wild' && s.dragon.state !== 'guarding') return 'block';
  const ch = s.characters[characterId];
  if (!ch) return 'block';
  if (s.dragon.state === 'wild' && ch.kind === 'witch') return 'pass';
  if (s.dragon.state === 'wild' && ch.kind === 'queen' && holdsSlayer(s, ch.owner)) return 'slay';
  return 'block';
}

/** What ending a move on `node` would trigger, for previews. Null when nothing happens there. */
export interface ArrivalPreview {
  kind: 'golem' | 'spider' | 'slay';
  name: string;
  /** Roll needed (after the Knight's bonus). */
  need: number;
  success: string;
  failure: string;
}

export function arrivalPreview(s: BoardState, characterId: string, node: string): ArrivalPreview | null {
  const ch = s.characters[characterId];
  if (!ch) return null;
  const { nodes } = getBoard(s.boardId);
  const def = nodes[node];
  const knightBonus = ch.kind === 'knight' ? s.config.knightBonus : 0;
  const need = s.config.encounterThreshold - knightBonus;

  if (def?.encounter) {
    const enc = def.encounter;
    if (enc.monster === 'golem') {
      const dest = enc.shortcutTo ? nodes[enc.shortcutTo]?.name ?? enc.shortcutTo : 'the shortcut';
      return {
        kind: 'golem',
        name: enc.name,
        need,
        success: `Beat the ${enc.name} (need ${need}+) and take the shortcut to ${dest}.`,
        failure: `The ${enc.name} drives you to ${nodes[enc.safeRoom]?.name ?? enc.safeRoom}.`,
      };
    }
    return {
      kind: 'spider',
      name: enc.name,
      need,
      success: `Beat the ${enc.name} (need ${need}+) and draw a power card.`,
      failure: `The ${enc.name} drives you to ${nodes[enc.safeRoom]?.name ?? enc.safeRoom}.`,
    };
  }

  if (s.dragon.state === 'wild' && s.dragon.node === node && ch.kind === 'queen' && holdsSlayer(s, ch.owner)) {
    return {
      kind: 'slay',
      name: 'Dragon Slayer',
      need: s.config.encounterThreshold,
      success: `Roll ${s.config.encounterThreshold}+ to drive the dragon back to its lair to recover.`,
      failure: 'The dragon swats you away; Dragon Slayer is discarded.',
    };
  }
  return null;
}

/**
 * Forced encounter at the end of a move, called by the movement code after landing captures and
 * pickups, before traps and the temple. Rolls once and moves the piece as needed.
 *
 * Failure on a Dragon Slayer arrival duel uses `retreat` (nearest safe space, else castle) and
 * discards the Dragon Slayer card. Success keeps the card.
 */
export function resolveArrival(ctx: Ctx, ch: Character, discardCardId?: string | null): void {
  const s = ctx.state;
  const { nodes, board } = getBoard(s.boardId);
  const node = nodes[ch.node];
  if (!node) return;

  if (node.encounter) {
    const enc = node.encounter;
    const value = roll(s);
    const bonus = ch.kind === 'knight' ? s.config.knightBonus : 0;
    const total = value + bonus;
    const success = total >= s.config.encounterThreshold;
    const who = charLabel(s, ch.id);
    const bonusNote = bonus ? ` (+${bonus} Knight)` : '';

    if (success && enc.monster === 'golem' && enc.shortcutTo) {
      const to = enc.shortcutTo;
      ctx.events.push({ type: 'encounter', characterId: ch.id, monster: 'golem', roll: value, total, success: true, to });
      log(ctx, `${who} rolls ${value}${bonusNote} = ${total} and beats the ${enc.name}! The shortcut carries them to ${nodes[to]?.name ?? to}.`, 'good', ch.owner);
      relocate(ctx, ch, to, 'encounter', enc.name, discardCardId);
      return;
    }
    if (success && enc.monster === 'spider') {
      ctx.events.push({ type: 'encounter', characterId: ch.id, monster: 'spider', roll: value, total, success: true, to: ch.node });
      log(ctx, `${who} rolls ${value}${bonusNote} = ${total} and beats the ${enc.name}! A power card waits in the chest.`, 'good', ch.owner);
      drawCard(ctx, ch.owner, { category: 'power', discardCardId });
      return;
    }
    const to = enc.safeRoom;
    ctx.events.push({ type: 'encounter', characterId: ch.id, monster: enc.monster, roll: value, total, success: false, to });
    log(ctx, `${who} rolls ${value}${bonusNote} = ${total} (needs ${s.config.encounterThreshold}+) — the ${enc.name} drives them to ${nodes[to]?.name ?? to}.`, 'bad', ch.owner);
    relocate(ctx, ch, to, 'encounter', enc.name, discardCardId);
    return;
  }

  if (s.dragon.state === 'wild' && s.dragon.node === ch.node && ch.kind === 'queen') {
    const hand = s.hands[ch.owner];
    const idx = hand.findIndex((c) => c.type === 'dragon_slayer');
    if (idx < 0) return;
    const value = roll(s);
    const success = value >= s.config.encounterThreshold;
    s.stats[ch.owner].slayAttempts++;
    ctx.events.push({ type: 'slay', characterId: ch.id, roll: value, success });
    if (success) {
      s.stats[ch.owner].slays++;
      s.dragon = {
        state: 'recovering',
        node: board.dragonHome,
        companion: null,
        recoverUntilTurn: s.turn.number + s.players.length - 1,
        releasedBy: null,
      };
      log(ctx, `${charLabel(s, ch.id)} rolls ${value} and drives the dragon back to its lair to recover for a round!`, 'dragon', ch.owner);
    } else {
      const card = hand.splice(idx, 1)[0];
      s.discard.push(card);
      log(ctx, `${charLabel(s, ch.id)} rolls ${value} — the dragon swats them away. Dragon Slayer is lost.`, 'bad', ch.owner);
      retreat(ctx, ch);
    }
  }
}

export type EncounterEvent = Extract<GameEvent, { type: 'encounter' | 'slay' }>;
