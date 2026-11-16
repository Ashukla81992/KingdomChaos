'use client';

import { motion } from 'framer-motion';
import { CARD_INFO, CATEGORY_INFO, type CardType } from '@/engine';
import { cardArt } from '../art/cardIcons';

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

/** Painted card face. The name sits on the blank banner; the full rule is the accessible name. */
export function CardView({ type, selected, disabled, compact, fluid, onClick, reason, reducedMotion }: CardViewProps) {
  const info = CARD_INFO[type];
  return (
    <motion.button
      type="button"
      layout={!reducedMotion}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${info.name} — ${CATEGORY_INFO[info.category].name} card. ${info.full}${reason ? ` Unavailable: ${reason}` : ''}`}
      title={`${info.name} (${info.duration}): ${info.full}`}
      whileHover={reducedMotion ? undefined : { y: -6, rotate: -1 }}
      animate={{ y: selected ? -12 : 0 }}
      className={`relative shrink-0 overflow-hidden rounded-xl bg-transparent p-0 text-left ${
        compact ? 'w-[104px]' : fluid ? 'w-[132px] lg:w-full' : 'w-[132px]'
      } ${selected ? 'ring-4 ring-[#ffcf3f]' : ''} ${disabled ? 'saturate-[0.45]' : ''}`}
      data-card={type}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cardArt(type)} alt="" className="block h-auto w-full" draggable={false} />
      <span
        className={`pointer-events-none absolute inset-x-[11%] top-[79%] bottom-[4.5%] flex items-center justify-center text-center font-display leading-[1.05] font-semibold text-[#6a3d12] ${
          compact ? 'text-[10px]' : 'text-[12px]'
        }`}
      >
        {info.name}
      </span>
      {disabled && reason && selected && (
        <div className="absolute inset-x-0 bottom-0 bg-[#1d2440]/85 px-2 py-1 text-[11px] leading-tight font-semibold text-white">{reason}</div>
      )}
    </motion.button>
  );
}
