import type { GameState, PlayerView, PublicState } from './types';

/** Strip all hidden information. Only the viewer's own hand is included. */
export function toPlayerView(state: GameState, viewerId: string | null): PlayerView {
  // Explicitly drop hidden fields so they never reach the wire.
  const {
    hands,
    deck,
    discard,
    rngState: _rng,
    logCounter: _lc,
    cardCounter: _cc,
    forcedRolls: _fr,
    ...publicState
  } = state;
  void _rng;
  void _lc;
  void _cc;
  void _fr;
  const pub: PublicState = structuredClone(publicState);
  return {
    ...pub,
    viewerId,
    hand: viewerId && hands[viewerId] ? structuredClone(hands[viewerId]) : [],
    handCounts: Object.fromEntries(Object.entries(hands).map(([id, h]) => [id, h.length])),
    deckCount: deck.length,
    discardCount: discard.length,
  };
}
