'use client';

import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import { portrait } from '@/lib/seats';
import { CHARACTER_KINDS } from '@/engine';

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <div className="text-center">
      <h1 className={`font-display font-bold tracking-tight drop-shadow-[0_3px_0_rgba(255,255,255,0.8)] ${size === 'lg' ? 'text-5xl sm:text-7xl' : 'text-3xl sm:text-4xl'}`}>
        Kingdom of <span className="text-[#e0532d]">Four Gems</span>
      </h1>
    </div>
  );
}

export function HeroCast() {
  return (
    <div className="mx-auto flex h-28 w-full max-w-sm items-end justify-center gap-1 sm:h-36" aria-hidden="true">
      {CHARACTER_KINDS.map((k, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={k} src={portrait(i, k)} alt="" className="kc-float h-full w-auto max-w-[24%] object-contain drop-shadow" style={{ animationDelay: `${i * 0.4}s` }} />
      ))}
    </div>
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
