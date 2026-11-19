import { tradesFor } from './powers';
import type { GameState, PlayerView } from './types';

/** What one player is allowed to see: their own hand only, no deck order, no discovery order, no RNG state. */
export function toPlayerView(s: GameState, viewerId: string | null): PlayerView {
  return {
    viewerId,
    boardId: s.boardId,
    config: s.config,
    version: s.version,
    status: s.status,
    players: s.players,
    characters: s.characters,
    gems: s.gems,
    dragon: s.dragon,
    bridges: s.bridges,
    transforms: s.transforms,
    blocks: s.blocks,
    vehicles: s.vehicles,
    turn: s.turn,
    startedAt: s.startedAt,
    endsAt: s.endsAt,
    result: s.result,
    log: s.log,
    lastEvents: s.lastEvents,
    stats: s.stats,
    hand: viewerId ? (s.hands[viewerId] ?? []) : [],
    handCounts: Object.fromEntries(s.players.map((p) => [p.id, s.hands[p.id]?.length ?? 0])),
    deckCount: s.deck.length,
    discardTop: s.discard.length ? s.discard[s.discard.length - 1].type : null,
    discardCount: s.discard.length,
    discoveryCount: s.discoveries.length,
    trades: tradesFor(s, viewerId),
    monsters: s.monsters,
    monsterRound: s.monsterRound,
    shortcutsOpen: s.shortcutsOpen,
    eventSeq: s.eventSeq ?? 0,
    battle: s.battle ?? null,
    rewardsClaimed: s.rewardsClaimed,
  };
}
