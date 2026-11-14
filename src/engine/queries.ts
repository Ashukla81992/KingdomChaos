import { legalTargets } from './cards';
import { enumerateMoves, type MoveOption } from './movement';
import type { CardInstance, PublicState } from './types';

/** Characters of `playerId` that may be selected for regular movement this turn. */
export function movableCharacters(state: PublicState, playerId: string) {
  return Object.values(state.characters).filter((c) => c.owner === playerId && !c.recovering);
}

export function legalMovesForTurn(state: PublicState, playerId: string): MoveOption[] {
  if (state.status !== 'playing' || state.turn.playerId !== playerId || state.turn.phase !== 'move') return [];
  const steps = state.turn.steps ?? 0;
  return movableCharacters(state, playerId).flatMap((c) => enumerateMoves(state, c.id, steps, true));
}

export function legalMovesWithSteps(state: PublicState, playerId: string, steps: number): MoveOption[] {
  return movableCharacters(state, playerId).flatMap((c) => enumerateMoves(state, c.id, steps, true));
}

export type CardAvailability = { playable: true } | { playable: false; reason: string };

/** Explains whether a card in hand can be played right now (shown in the UI). */
export function cardAvailability(state: PublicState, playerId: string, card: CardInstance): CardAvailability {
  if (state.status !== 'playing') return { playable: false, reason: 'The match is over.' };
  if (state.turn.playerId !== playerId) return { playable: false, reason: 'Wait for your turn.' };
  if (state.turn.phase === 'roll') return { playable: false, reason: 'Roll and move first — cards are played after movement.' };
  if (state.turn.phase === 'move') return { playable: false, reason: 'Move a character first — cards are played after movement.' };
  if (state.turn.phase === 'drawChoice') return { playable: false, reason: 'Finish drawing first.' };
  if (state.turn.cardPlayed) return { playable: false, reason: 'You already played a card this turn.' };
  if (legalTargets(state, playerId, card.type).length === 0) return { playable: false, reason: 'No valid target right now.' };
  return { playable: true };
}
