import { CHARACTER_INFO, getBoard, neededGems, royalPathOpen, templeBlockers, whyStuck, type Character, type PlayerView } from '@/engine';

/** Short “why” lines the tutorial and guide can point at. */
export function whyMoveBlocked(view: PlayerView, characterId: string): string {
  if (!view.turn.move) return 'Roll the die first, then pick a piece.';
  return `This ${CHARACTER_INFO[view.characters[characterId].kind].name} ${whyStuck(view, characterId)}.`;
}

export function whyBonusEarned(view: PlayerView): string | null {
  const extra = view.turn.extra;
  if (!extra) return null;
  if (extra === 'six') return 'A natural 6 earns one bonus roll in the same turn.';
  return 'A movement capture earns one bonus roll in the same turn.';
}

export function whyTempleNeeds(view: PlayerView, ch: Character): string[] {
  if (ch.finished) return [];
  const reasons: string[] = [];
  if (!royalPathOpen(view, ch.owner)) {
    const need = neededGems(view, ch.owner);
    const names = need.map((k) => k.charAt(0).toUpperCase() + k.slice(1));
    reasons.push(names.length ? `Bank ${names.join(', ')} to open the Royal Path.` : 'Bank one of each gem kind to open the Royal Path.');
  }
  for (const line of templeBlockers(view, ch.id)) reasons.push(line);
  if (!reasons.length) {
    const onPath = getBoard(view.boardId).nodes[ch.node]?.lane === 'final';
    reasons.push(onPath ? 'Land exactly on the Crown Temple.' : 'Turn in at your fork and walk the Royal Path to the Crown Temple.');
  }
  return reasons;
}
