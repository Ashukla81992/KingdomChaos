import { templeBlockers, type BoardState, type MoveOption, type PlayerStats } from '@/engine';
import type { ArrivalPreview } from '@/engine/dungeon';
import { choose, type Plan } from '@/lib/movePlan';

type S = BoardState & { stats: Record<string, Pick<PlayerStats, 'cuts'>> };

/** Rival character ids eligible for a Knight route attack on this option. */
export function attackCandidates(_s: BoardState, _characterId: string, o: MoveOption): string[] {
  return o.routeTargets ?? [];
}

/** Capture target character ids previewed for this route (landing + route attack). */
export function captureTargets(s: BoardState, characterId: string, o: MoveOption): string[] {
  const ch = s.characters[characterId];
  if (!ch || ch.kind === 'queen') return [];
  return [...new Set([...o.landingCuts, ...(o.routeTargets ?? [])])];
}

export function templeBlockersFor(s: S, characterId: string): string[] {
  return templeBlockers(s, characterId);
}

export function arrivalFor(s: BoardState, characterId: string, node: string, o: MoveOption): ArrivalPreview | null {
  if (o.arrival) return o.arrival;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@/engine/dungeon') as { arrivalPreview?: (st: BoardState, id: string, n: string) => ArrivalPreview | null };
    return mod.arrivalPreview?.(s, characterId, node) ?? null;
  } catch {
    return null;
  }
}

/** Select a specific route by path. */
export function chooseRoute(plan: Plan, path: string[]): Plan | null {
  const choice = plan.options.find((o) => o.path.join('>') === path.join('>'));
  return choice ? { ...plan, choice } : null;
}

/** Cycle routes when the end is already selected. */
export function cycleRoute(plan: Plan, end: string): Plan | null {
  return choose(plan, end);
}
