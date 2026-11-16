import { getBoard } from './board';
import { GEM_KINDS, type BoardState, type Character, type PlayerStats } from './types';

type VictoryState = BoardState & { stats: Record<string, Pick<PlayerStats, 'cuts'>> };

/** True once the kingdom has banked one of each required gem kind. Captures and markers are not required. */
export function royalPathOpen(s: Pick<BoardState, 'players' | 'config'>, playerId: string): boolean {
  const p = s.players.find((x) => x.id === playerId);
  if (!p) return false;
  const need = GEM_KINDS.slice(0, Math.max(1, Math.min(4, s.config.gemsRequired)));
  return need.every((k) => p.gems.includes(k));
}

/** Human-readable reasons the piece cannot step from its Royal Path onto the temple. Empty means it may enter. */
export function templeBlockers(s: VictoryState, characterId: string): string[] {
  const ch = s.characters[characterId];
  if (!ch) return ['Unknown piece'];
  const reasons: string[] = [];
  const { board } = getBoard(s.boardId);
  for (const seat of [0, 1, 2, 3]) {
    if (!ch.plates.includes(seat)) {
      const house = board.houses.find((h) => h.seat === seat);
      reasons.push(`Needs the ${house?.name ?? 'house'} marker`);
    }
  }
  const cuts = s.stats[ch.owner]?.cuts ?? 0;
  if (cuts < s.config.cutsRequired) reasons.push('Your kingdom needs a capture');
  return reasons;
}

/** How many of this kingdom's pieces have entered the Crown Temple. */
export function finishersOf(s: Pick<BoardState, 'characters'>, playerId: string): number {
  return Object.values(s.characters).filter((c: Character) => c.owner === playerId && c.finished).length;
}
