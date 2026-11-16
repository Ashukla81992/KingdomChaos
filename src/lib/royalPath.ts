import { finalUnlocked, getBoard, type PlayerView } from '@/engine';

/**
 * Which house's Royal Path should be drawn as a live move highlight.
 * Presentation only: the engine still decides whether the move is legal.
 * A path is relevant only when the selected piece may enter it and this roll
 * can actually step onto it (or the piece is already on it).
 */
export function royalPlaySeat(view: Pick<PlayerView, 'boardId' | 'characters' | 'players' | 'config' | 'stats' | 'viewerId'>, characterId: string | null, ends: Iterable<string>): number | null {
  if (!characterId || !view.viewerId) return null;
  const ch = view.characters[characterId];
  if (!ch || ch.owner !== view.viewerId) return null;
  if (!finalUnlocked(view, ch.owner)) return null;
  const { nodes } = getBoard(view.boardId);
  const here = nodes[ch.node];
  const onPath = here?.lane === 'final';
  if (ch.lap < 4 && !onPath) return null;
  const usesPath = onPath || [...ends].some((id) => nodes[id]?.lane === 'final' || nodes[id]?.id === 'temple');
  if (!usesPath) return null;
  return view.players.find((p) => p.id === ch.owner)?.seat ?? null;
}

export const TEMPLE_UNLOCK_TITLE = 'Temple path unlocked!';
