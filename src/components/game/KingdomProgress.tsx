'use client';

import { Check, Crown, Swords } from 'lucide-react';
import { CHARACTER_INFO, GEM_KINDS, GEM_NAMES, getBoard, type Character, type GemKind, type PlayerView } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { EmblemBadge } from '../art/art';
import { GemIcon } from '../art/gems';

interface Props {
  view: PlayerView;
  me: string | null;
  /** Selected piece whose four markers are highlighted. */
  focusId?: string | null;
  compact?: boolean;
}

function bankCount(view: PlayerView, playerId: string, kind: GemKind): number {
  const p = view.players.find((x) => x.id === playerId);
  if (!p) return 0;
  if (p.bank) return p.bank[kind] ?? 0;
  return p.gems.includes(kind) ? 1 : 0;
}

function finishedCount(view: PlayerView, playerId: string) {
  return Object.values(view.characters).filter((c) => c.owner === playerId && c.finished).length;
}

/** Per-kingdom bank, capture credit, finishers, and the selected piece's markers. */
export function KingdomProgress({ view, me, focusId, compact }: Props) {
  const focus: Character | null = focusId ? view.characters[focusId] ?? null : null;
  const houses = getBoard(view.boardId).board.houses;
  const win = view.config.finishersToWin ?? 4;

  return (
    <div className={`panel space-y-2 ${compact ? 'p-2.5' : 'p-3'}`} data-kingdom-progress aria-label="Kingdom progress">
      {view.players.map((p) => {
        const theme = seatTheme(p.seat);
        const cuts = view.stats[p.id]?.cuts ?? 0;
        const need = view.config.cutsRequired ?? 1;
        const done = finishedCount(view, p.id);
        const mine = p.id === me;
        return (
          <div key={p.id} className={`rounded-2xl px-2.5 py-2 ${mine ? 'bg-[#fff7e0]' : 'bg-[#f6efdf]/70'}`} data-progress-player={p.id}>
            <div className="flex items-center gap-1.5 text-sm font-extrabold">
              <EmblemBadge theme={theme} size={18} />
              <span className="truncate">{mine ? 'Your house' : p.name}</span>
              <span className="ml-auto flex items-center gap-1 text-xs font-bold text-[#4a5374]">
                <Crown size={12} aria-hidden="true" />
                <span data-finishers={`${done}/${win}`}>
                  {done}/{win}
                </span>
              </span>
            </div>
            <ul className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="Banked gems">
              {GEM_KINDS.map((k) => {
                const n = bankCount(view, p.id, k);
                const spare = Math.max(0, n - 1);
                return (
                  <li key={k} className="flex items-center gap-0.5 text-[0.6875rem] font-bold" data-bank-gem={k} data-bank-count={n} title={`${GEM_NAMES[k]}: ${n} banked${spare ? `, ${spare} spare` : ''}`}>
                    <GemIcon kind={k} size={16} empty={n === 0} />
                    <span className={n ? 'text-[#155c36]' : 'text-[#6b7086]'}>{n || '·'}</span>
                    {spare > 0 && (
                      <span className="rounded-full bg-[#2e9e62] px-1 text-[0.625rem] text-white" data-spare={k}>
                        +{spare}
                      </span>
                    )}
                  </li>
                );
              })}
              <li className={`ml-auto flex items-center gap-0.5 text-xs font-bold ${cuts >= need ? 'text-[#155c36]' : 'text-[#6b7086]'}`} data-capture-credit={`${cuts}/${need}`}>
                <Swords size={12} aria-hidden="true" /> {cuts}/{need}
                {cuts >= need && <Check size={11} aria-hidden="true" />}
              </li>
            </ul>
          </div>
        );
      })}

      {focus && (
        <div className="rounded-2xl border border-[#d8cdb4] bg-white px-2.5 py-2" data-marker-progress={focus.id}>
          <p className="text-xs font-extrabold tracking-wide text-[#4a5374] uppercase">
            {focus.owner === me ? `Your ${CHARACTER_INFO[focus.kind].name}` : CHARACTER_INFO[focus.kind].name} markers
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {houses.map((h) => {
              const done = focus.plates.includes(h.seat);
              const th = seatTheme(h.seat);
              return (
                <li
                  key={h.seat}
                  className={`flex min-h-11 min-w-[4.5rem] items-center gap-1 rounded-full px-2 text-xs font-bold ${done ? 'text-white' : 'bg-[#f6efdf] text-[#6b7086]'}`}
                  style={done ? { background: th.color } : undefined}
                  data-marker={h.key}
                  data-marker-done={done ? 'true' : 'false'}
                >
                  {done ? <Check size={12} aria-hidden="true" /> : <span className="inline-block h-2 w-2 rounded-full" style={{ background: th.color }} />}
                  {h.name}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
