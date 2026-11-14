'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { CharacterFigure } from './art/art';
import { seatTheme } from '@/lib/seats';
import { CHARACTER_KINDS } from '@/engine';

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div className="text-center">
      <h1 className={`font-display font-bold tracking-tight drop-shadow-[0_3px_0_rgba(255,255,255,0.8)] ${size === 'lg' ? 'text-5xl sm:text-7xl' : 'text-3xl sm:text-4xl'}`}>
        Kingdom <span className="text-[#e0532d]">Chaos</span>
      </h1>
    </div>
  );
}

export function HeroCast() {
  return (
    <svg viewBox="-110 -70 220 80" className="mx-auto h-28 w-auto sm:h-36" aria-hidden="true">
      <ellipse cy={2} rx={108} ry={10} fill="rgba(29,36,64,0.15)" />
      {CHARACTER_KINDS.map((k, i) => (
        <g key={k} transform={`translate(${-75 + i * 50},0) scale(1.15)`} className="kc-float" style={{ animationDelay: `${i * 0.4}s` }}>
          <CharacterFigure kind={k} theme={seatTheme(i)} />
        </g>
      ))}
    </svg>
  );
}

export function MenuShell({ title, children, back = '/' }: { title?: string; children: React.ReactNode; back?: string | null }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-4 py-6">
      {back !== null && (
        <Link href={back} className="btn btn-ghost mb-4 self-start">
          <ChevronLeft size={18} aria-hidden="true" /> Back
        </Link>
      )}
      <Logo size="sm" />
      {title && <h2 className="mt-2 text-center text-2xl font-semibold text-[#2c3558]">{title}</h2>}
      <div className="mt-6 flex-1">{children}</div>
    </div>
  );
}
