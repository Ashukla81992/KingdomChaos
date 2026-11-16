import { getBoard, royalPathOpen, type PlayerView } from '@/engine';

/**
 * Which house's Royal Path should be drawn as a live move highlight.
 * Presentation only: the engine still decides whether the move is legal.
 * A path is relevant when the kingdom's path is open and this roll can step onto it
 * (or the piece is already on it). Markers are checked at the temple gate, not at entry.
 */
export function royalPlaySeat(view: Pick<PlayerView, 'boardId' | 'characters' | 'players' | 'config' | 'stats' | 'viewerId'>, characterId: string | null, ends: Iterable<string>): number | null {
  if (!characterId || !view.viewerId) return null;
  const ch = view.characters[characterId];
  if (!ch || ch.owner !== view.viewerId || ch.finished) return null;
  if (!royalPathOpen(view, ch.owner)) return null;
  const { nodes } = getBoard(view.boardId);
  const here = nodes[ch.node];
  const onPath = here?.lane === 'final';
  const usesPath = onPath || [...ends].some((id) => nodes[id]?.lane === 'final' || nodes[id]?.id === 'temple');
  if (!usesPath) return null;
  return view.players.find((p) => p.id === ch.owner)?.seat ?? null;
}

export const TEMPLE_UNLOCK_TITLE = 'Temple path unlocked!';
