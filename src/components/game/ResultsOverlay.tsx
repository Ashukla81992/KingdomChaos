'use client';

import { motion } from 'framer-motion';
import { Gem, Trophy } from 'lucide-react';
import type { PlayerView } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { useSettings } from '@/lib/settings';
import { EmblemBadge } from '../art/art';
import { GEM_KINDS, GemIcon } from '../art/gems';
import { formatClock } from './useNow';

interface Btn {
  label: string;
  onClick: () => void;
}

export function ResultsOverlay({ view, primary, secondary }: { view: PlayerView; primary?: Btn; secondary?: Btn }) {
  const { reducedMotion } = useSettings();
  const r = view.result!;
  const winners = view.players.filter((p) => r.winners.includes(p.id));
  const shared = winners.length > 1;
  const youWon = !!view.viewerId && r.winners.includes(view.viewerId);
  const ranked = [...view.players].sort((a, b) => r.finalGems[b.id] - r.finalGems[a.id]);
  const tie =
    r.tieBreak === 'cut'
      ? 'Tied on gems — decided by who made a cut.'
      : r.tieBreak === 'shared'
          ? 'Still tied — the victory is shared.'
          : null;
  const reason =
    r.reason === 'temple'
      ? 'Four pieces entered the Crown Temple.'
      : r.reason === 'rounds'
        ? `The ${r.rounds}-round limit was reached.`
        : r.reason === 'ended'
          ? 'The host ended the match.'
          : 'The match clock ran out.';
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#1d2440]/55 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="results-title">
      <motion.div
        className="panel relative w-full max-w-xl overflow-hidden p-5 text-center"
        initial={reducedMotion ? false : { scale: 0.85, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        {!reducedMotion &&
          Array.from({ length: 14 }, (_, i) => (
            <motion.span
              key={i}
              className="pointer-events-none absolute text-[#2bb6e6]"
              style={{ left: `${(i * 7.3) % 100}%`, top: -20 }}
              animate={{ y: [0, 520], rotate: [0, 260], opacity: [1, 0] }}
              transition={{ duration: 2.6 + (i % 4) * 0.4, delay: (i % 5) * 0.25, repeat: 1 }}
              aria-hidden="true"
            >
              <Gem size={14 + (i % 3) * 5} />
            </motion.span>
          ))}
        <Trophy className="mx-auto text-[#f4a81d]" size={56} aria-hidden="true" />
        <h2 id="results-title" className="mt-1 text-3xl font-bold">
          {shared ? 'Shared victory!' : youWon ? 'You win!' : `${winners[0]?.name} wins!`}
        </h2>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {winners.map((w) => (
            <span key={w.id} className="font-display flex items-center gap-1.5 rounded-full bg-white px-3 py-1 font-semibold shadow-sm">
              <EmblemBadge theme={seatTheme(w.seat)} size={22} /> {w.name} · {seatTheme(w.seat).kingdom}
            </span>
          ))}
        </div>
        <p className="mt-2 text-sm text-[#4a5374]">
          {reason} {tie}
        </p>
        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-[#4a5374] uppercase">
              <th className="py-1">Kingdom</th>
              <th className="py-1 text-center">Gems</th>
              <th className="py-1 text-center">Cut</th>
              <th className="py-1 text-center">Defeated</th>
              <th className="py-1 text-center">Cards</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((p) => (
              <tr key={p.id} className={r.winners.includes(p.id) ? 'bg-[#fff4d6]' : ''}>
                <td className="flex items-center gap-1.5 py-1.5 pl-1 font-semibold">
                  <EmblemBadge theme={seatTheme(p.seat)} size={20} /> {p.name}
                </td>
                <td className="text-center" aria-label={`${r.finalGems[p.id]} of 4 gems`}>
                  <span className="inline-flex gap-0.5">
                    {GEM_KINDS.map((k) => (
                      <GemIcon key={k} kind={k} size={16} empty={!p.gems.includes(k)} />
                    ))}
                  </span>
                </td>
                <td className="text-center font-bold">{p.cut ? '✓' : '—'}</td>
                <td className="text-center">{view.stats[p.id].defeated}</td>
                <td className="text-center">{view.stats[p.id].cardsPlayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-[#4a5374]">
          Match length {formatClock(r.durationMs)} · {r.turns} turns
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {primary && (
            <button className="btn btn-primary" onClick={primary.onClick} data-autofocus>
              {primary.label}
            </button>
          )}
          {secondary && (
            <button className="btn btn-ghost" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
