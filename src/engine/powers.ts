import type { Ctx } from './rules';
import type { BoardState, GameAction, TradeView } from './types';

/** [A2] Character powers and Queen's Diplomacy. Contract: docs/island-adventure/CONTRACTS.md. */

export type PowerAction = Extract<GameAction, { type: 'royalGuard' | 'alchemy' | 'offerTrade' | 'respondTrade' | 'cancelTrade' }>;

export const POWER_ACTIONS: PowerAction['type'][] = ['royalGuard', 'alchemy', 'offerTrade', 'respondTrade', 'cancelTrade'];

/** Actions a player may send while it is not their turn. */
export const OFF_TURN_ACTIONS: PowerAction['type'][] = ['respondTrade', 'cancelTrade'];

/**
 * Validate and apply a power or trade action on the cloned state in `ctx`. Returns an error message,
 * or null once applied. These are free actions: they never set `moveDone` or `adventureDone`.
 */
export function applyPower(_ctx: Ctx, _playerId: string, _action: PowerAction): string | null {
  return 'That power is not available yet.';
}

/** Called by the turn flow at `playerId`'s `turnStarted`: their Royal Guard ends. */
export function clearGuards(_ctx: Ctx, _playerId: string): void {}

/** Called by the turn flow just before `playerId`'s turn ends: their open offers expire. */
export function expireTrades(_ctx: Ctx, _playerId: string): void {}

/** Open offers as `viewerId` may see them (third parties learn only who is trading). */
export function tradesFor(s: Pick<BoardState, 'players'> & { trades?: { id: string; from: string; to: string }[] }, _viewerId: string | null): TradeView[] {
  return (s.trades ?? []).map((t) => ({ id: t.id, from: t.from, to: t.to }));
}
