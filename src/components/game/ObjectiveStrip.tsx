'use client';

import { Check, Crown, Lock, RotateCw, Swords } from 'lucide-react';
import { aGem, finalUnlocked, type GemKind, type PlayerView } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { EmblemBadge } from '../art/art';
import { GEM_KINDS, GEM_NAMES, GemIcon } from '../art/gems';
import type { Presence } from './GameScreen';

type GemState = 'banked' | 'carrying' | 'needed';

export function gemStates(view: PlayerView, playerId: string): Record<GemKind, GemState> {
  const p = view.players.find((x) => x.id === playerId);
  const carried = new Set(
    Object.values(view.characters)
      .filter((c) => c.owner === playerId)
      .flatMap((c) => c.carrying.map((id) => view.gems.find((g) => g.id === id)?.kind)),
  );
  return Object.fromEntries(GEM_KINDS.map((k) => [k, p?.gems.includes(k) ? 'banked' : carried.has(k) ? 'carrying' : 'needed'])) as Record<GemKind, GemState>;
}

/** What a kingdom still needs before its Royal Path opens, as a short phrase. */
export function stillNeeded(view: PlayerView, playerId: string): string {
  const p = view.players.find((x) => x.id === playerId);
  if (!p) return '';
  const parts: string[] = view.config.gemsRequired > p.gems.length ? GEM_KINDS.filter((k) => !p.gems.includes(k)).map((k) => aGem(k)) : [];
  if ((view.stats[playerId]?.cuts ?? 0) < view.config.cutsRequired) parts.push('a cut');
  if (!parts.length) return '';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export const bestLap = (view: PlayerView, playerId: string) => Math.max(0, ...Object.values(view.characters).filter((c) => c.owner === playerId).map((c) => c.lap));

/** The always-visible goal: gems, cut, lap, Royal Path, and a compact line for every rival. */
export function ObjectiveStrip({ view, me, presence }: { view: PlayerView; me: string | null; presence?: Record<string, Presence> }) {
  const you = view.players.find((p) => p.id === me);
  const playing = view.status === 'playing';
  const open = !!you && finalUnlocked(view, you.id);
  const states = you ? gemStates(view, you.id) : null;
  const cut = !!you && (view.stats[you.id]?.cuts ?? 0) >= view.config.cutsRequired;
  const lap = you ? bestLap(view, you.id) : 0;
  return (
    <div className="flex flex-col gap-1.5 px-2 pb-1.5 sm:px-4" data-objectives>
      <div className="flex flex-wrap items-center gap-1.5">
        {you && states && (
          <div className="panel flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl! px-3 py-1.5" aria-label="Your objective" data-tutorial="objective">
            <span className="flex items-center gap-1.5 text-xs font-extrabold tracking-wide text-[#4a5374] uppercase">
              <EmblemBadge theme={seatTheme(you.seat)} size={20} /> {seatTheme(you.seat).kingdom} house
            </span>
            <ul className="flex items-center gap-2" aria-label="Gems">
              {GEM_KINDS.map((k) => {
                const st = states[k];
                return (
                  <li key={k} className="flex items-center gap-1 text-xs font-bold" data-gem-state={st} data-gem-kind={k} aria-label={`${GEM_NAMES[k]}: ${st === 'banked' ? 'banked' : st === 'carrying' ? 'being carried to your gate' : 'still needed'}`}>
                    <span className={`relative inline-flex rounded-full p-0.5 ${st === 'carrying' ? 'ring-2 ring-[#ffcf33] ring-offset-1' : ''}`}>
                      <GemIcon kind={k} size={20} empty={st === 'needed'} />
                    </span>
                    <span className={`hidden sm:inline ${st === 'needed' ? 'text-[#6b7086]' : ''}`}>
                      {GEM_NAMES[k]} {st === 'banked' ? <Check size={12} className="inline text-[#155c36]" aria-hidden="true" /> : st === 'carrying' ? <span className="text-[#8a5a00]">carrying</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <span className={`flex items-center gap-1 text-xs font-bold ${cut ? 'text-[#155c36]' : 'text-[#6b7086]'}`} data-cut={cut ? 'done' : 'needed'}>
              <Swords size={14} aria-hidden="true" /> Cut {cut ? <Check size={12} aria-hidden="true" /> : '○'}
            </span>
            <span className={`flex items-center gap-1 text-xs font-bold ${lap >= 4 ? 'text-[#155c36]' : 'text-[#6b7086]'}`} data-lap={lap} title="Most house plates touched by any one of your pieces. A lap is all four, in any order.">
              <RotateCw size={13} aria-hidden="true" /> Plates {lap}/4 {lap >= 4 && <Check size={12} aria-hidden="true" />}
            </span>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-extrabold ${open ? 'bg-[#ffcf33] text-[#5a3d00]' : 'bg-[#1d2440] text-white'}`} data-final={open ? 'open' : 'locked'}>
              {open ? <Crown size={13} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />} Royal Path {open ? 'OPEN' : 'LOCKED'}
            </span>
          </div>
        )}
        <ul className="flex min-w-0 gap-1.5 overflow-x-auto" aria-label="Players">
          {view.players
            .filter((p) => p.id !== me)
            .map((p) => {
              const t = seatTheme(p.seat);
              const active = p.id === view.turn.playerId && playing;
              const away = presence?.[p.id] && !presence[p.id].connected;
              const st = gemStates(view, p.id);
              const pCut = (view.stats[p.id]?.cuts ?? 0) >= view.config.cutsRequired;
              const pOpen = finalUnlocked(view, p.id);
              const pLap = bestLap(view, p.id);
              return (
                <li
                  key={p.id}
                  aria-current={active ? 'true' : undefined}
                  data-player={p.id}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/85 py-1 pr-3 pl-1 text-xs"
                  style={{ boxShadow: active ? `0 0 0 3px ${t.color}` : '0 0 0 1px #e6dcc6' }}
                  aria-label={`${p.name} (${t.kingdom}): ${p.gems.length} of ${view.config.gemsRequired} gems${pCut ? ', cut made' : ''}, best piece ${pLap} of 4 plates${pOpen ? ', Royal Path open' : ''}${active ? ', playing now' : ''}`}
                >
                  <EmblemBadge theme={t} size={20} />
                  <span className="max-w-[7rem] truncate font-semibold">
                    {p.name}
                    {p.isAI && <span className="text-[#6b7086]"> · AI</span>}
                    {away && <span className="text-[#8c2a10]"> · away</span>}
                  </span>
                  <span className="flex gap-0.5" aria-hidden="true">
                    {GEM_KINDS.map((k) => (
                      <GemIcon key={k} kind={k} size={13} empty={st[k] === 'needed'} />
                    ))}
                  </span>
                  {pCut && <Swords size={12} className="text-[#a3300b]" aria-hidden="true" />}
                  <span className="font-bold text-[#4a5374]" aria-hidden="true" title="Most plates touched by one piece">
                    P{pLap}
                  </span>
                  {pOpen && <Crown size={13} className="text-[#b07800]" aria-hidden="true" />}
                </li>
              );
            })}
        </ul>
      </div>
      {open && playing && (
        <div className="rounded-2xl bg-gradient-to-r from-[#ffcf33] to-[#ffe38a] px-3 py-1.5 text-center text-sm font-extrabold text-[#5a3d00] shadow-sm" role="status" data-final-banner>
          ROYAL PATH OPEN! {lap >= 4 ? 'Turn a piece that touched all four plates in at your fork and land exactly on the Crown Temple.' : 'Touch all four house plates with one piece, then turn in at your fork.'}
        </div>
      )}
    </div>
  );
}
