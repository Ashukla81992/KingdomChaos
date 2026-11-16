'use client';

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameEvent, PlayerView } from '@/engine';
import { explainEvents, shortenCard, type EventCardModel } from '@/lib/explain';

const HELP_KEY = 'kc:eventHelp';

function readHelp(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(HELP_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function bumpHelp(kind: string) {
  const map = readHelp();
  map[kind] = (map[kind] ?? 0) + 1;
  try {
    localStorage.setItem(HELP_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
  return map[kind];
}

const TONE: Record<EventCardModel['tone'], string> = {
  info: 'border-[#2f7bf5]/40 bg-[#1d2440]/78 text-white',
  good: 'border-[#2e9e62]/50 bg-[#155c36]/82 text-white',
  bad: 'border-[#e0532d]/50 bg-[#8c2a10]/82 text-white',
  gold: 'border-[#ffcf33]/60 bg-[#5a3d00]/85 text-[#fff6d6]',
  warn: 'border-[#f2a11a]/50 bg-[#6b4a00]/82 text-[#fff1c7]',
};

interface Props {
  view: PlayerView;
  reduced?: boolean;
  /** Extra events to force (tests / tutorials). */
  events?: GameEvent[];
}

/** Small translucent card near a board corner; auto-dismisses and taps away. */
export function EventCard({ view, reduced, events }: Props) {
  const [card, setCard] = useState<(EventCardModel & { id: number; full: boolean }) | null>(null);
  const lastVersion = useRef(view.version);
  const seq = useRef(0);
  const matchSeen = useRef<Record<string, number>>({});

  const incoming = useMemo(() => explainEvents(view, events ?? view.lastEvents), [view, events]);

  useEffect(() => {
    if (view.version === lastVersion.current && !events) return;
    if (view.version < lastVersion.current) matchSeen.current = {};
    lastVersion.current = view.version;
    const next = incoming[incoming.length - 1];
    if (!next) return;
    const stored = readHelp()[next.kind] ?? 0;
    const local = matchSeen.current[next.kind] ?? 0;
    const seen = Math.max(stored, local);
    const full = seen < 2;
    matchSeen.current[next.kind] = local + 1;
    bumpHelp(next.kind);
    const shown = shortenCard(next, seen);
    setCard({ ...shown, id: ++seq.current, full });
  }, [view.version, incoming, events]);

  useEffect(() => {
    if (!card) return;
    const ms = card.full ? (reduced ? 5200 : 4500) : reduced ? 3200 : 2800;
    const t = setTimeout(() => setCard(null), ms);
    return () => clearTimeout(t);
  }, [card, reduced]);

  if (!card) return null;
  return (
    <motion.button
      type="button"
      key={card.id}
      className={`absolute right-2 bottom-14 z-20 w-[min(16.5rem,calc(100%-1rem))] rounded-2xl border px-3 py-2.5 text-left shadow-lg backdrop-blur-md sm:bottom-16 ${TONE[card.tone]}`}
      initial={reduced ? false : { opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      onClick={() => setCard(null)}
      aria-label={`${card.title}. ${card.why}. ${card.now}. Tap to dismiss.`}
      data-event-card={card.kind}
      data-event-full={card.full ? 'true' : 'false'}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-extrabold tracking-wide">{card.title}</div>
          <p className="mt-0.5 text-xs leading-snug opacity-95">{card.why}</p>
          <p className="mt-1 text-xs font-semibold leading-snug opacity-90">{card.now}</p>
        </div>
        <span className="mt-0.5 shrink-0 rounded-full bg-white/15 p-1" aria-hidden="true">
          <X size={14} />
        </span>
      </div>
    </motion.button>
  );
}
