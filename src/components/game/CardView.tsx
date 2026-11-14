'use client';

import { motion } from 'framer-motion';
import { Hourglass } from 'lucide-react';
import { CARD_INFO, CATEGORY_INFO, type CardType } from '@/engine';
import { CARD_ICONS, CATEGORY_STYLE } from '../art/cardIcons';

interface CardViewProps {
  type: CardType;
  selected?: boolean;
  disabled?: boolean;
  compact?: boolean;
  /** Fill the grid cell on large screens. */
  fluid?: boolean;
  onClick?: () => void;
  reason?: string | null;
  reducedMotion?: boolean;
}

/** An illustrated card face: category band, icon medallion, name, short text, duration. */
export function CardView({ type, selected, disabled, compact, fluid, onClick, reason, reducedMotion }: CardViewProps) {
  const info = CARD_INFO[type];
  const style = CATEGORY_STYLE[info.category];
  const Icon = CARD_ICONS[type];
  return (
    <motion.button
      type="button"
      layout={!reducedMotion}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${info.name} — ${CATEGORY_INFO[info.category].name} card. ${info.full}${reason ? ` Unavailable: ${reason}` : ''}`}
      title={`${info.name}: ${info.full}`}
      whileHover={reducedMotion ? undefined : { y: -6, rotate: -1 }}
      animate={{ y: selected ? -12 : 0 }}
      className={`relative flex shrink-0 flex-col overflow-hidden rounded-2xl text-left shadow-[var(--shadow-soft)] ${
        compact ? 'w-[118px]' : fluid ? 'w-[138px] lg:w-full' : 'w-[138px]'
      } ${selected ? 'ring-4 ring-[#ffcf3f]' : 'ring-2 ring-white'} ${disabled ? 'saturate-[0.55]' : ''}`}
      style={{ background: style.bg }}
      data-card={type}
    >
      <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-white" style={{ background: style.band }}>
        <span>{style.label}</span>
        <span className="opacity-80">{info.duration === 'Instant' ? 'INSTANT' : ''}</span>
      </div>
      <div className="flex flex-col items-center px-2 pt-2 pb-2.5">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white shadow-inner" style={{ background: style.soft, color: style.ink }}>
          <Icon size={26} strokeWidth={2.3} aria-hidden="true" />
        </div>
        <div className="font-display mt-1.5 text-center text-[15px] leading-tight font-semibold" style={{ color: style.ink }}>
          {info.name}
        </div>
        {!compact && <div className="mt-1 text-center text-[12.5px] leading-snug text-[#3b4366]">{info.short}</div>}
        {!compact && info.duration !== 'Instant' && (
          <div className="mt-1.5 flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-bold text-[#4a5374]">
            <Hourglass size={11} aria-hidden="true" /> {info.duration}
          </div>
        )}
      </div>
      {disabled && reason && selected && (
        <div className="absolute inset-x-0 bottom-0 bg-[#1d2440]/85 px-2 py-1 text-[11px] leading-tight font-semibold text-white">{reason}</div>
      )}
    </motion.button>
  );
}
