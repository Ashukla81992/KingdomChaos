'use client';

import { Ban, Bandage, Bomb, Bot, Crown, Flame, Gem, Layers, Orbit, Plane, Sailboat, ShieldCheck, Snail, Star, Shield, Swords, Wifi, WifiOff } from 'lucide-react';
import { CHARACTER_INFO, getGraph, type Character, type PlayerView } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { CharacterFigure, EmblemBadge } from '../art/art';

export interface Presence {
  connected: boolean;
  left: boolean;
  isHost: boolean;
}

function MiniCharacter({ c, seat, onClick }: { c: Character; seat: number; onClick?: () => void }) {
  const theme = seatTheme(seat);
  const tags = [
    c.carrying && 'carrying treasure',
    c.power?.type === 'shield' && 'Shield',
    c.power?.type === 'attack_boost' && 'Attack Boost',
    c.power?.type === 'boat' && 'Boat',
    c.power?.type === 'glider' && 'Glider',
    c.immune && 'Immune',
    c.recovering && 'recovering',
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-12 w-10 flex-col items-center justify-end rounded-xl bg-white/70 hover:bg-white"
      title={`${CHARACTER_INFO[c.kind].name}: ${CHARACTER_INFO[c.kind].ability}`}
      aria-label={`${CHARACTER_INFO[c.kind].name}${tags.length ? ` (${tags.join(', ')})` : ''}. ${CHARACTER_INFO[c.kind].abilityName}: ${CHARACTER_INFO[c.kind].ability}`}
    >
      <svg viewBox="-20 -60 40 64" width={30} height={46} aria-hidden="true" style={c.recovering ? { opacity: 0.5, filter: 'grayscale(0.7)' } : undefined}>
        <CharacterFigure kind={c.kind} theme={theme} />
      </svg>
      <span className="absolute -top-1 -right-1 flex gap-0.5">
        {c.carrying && <Gem size={13} className="rounded-full bg-[#c9fbff] p-[1px] text-[#0e5a7a]" aria-hidden="true" />}
        {c.power?.type === 'shield' && <Shield size={13} className="rounded-full bg-[#d6ebff] p-[1px] text-[#2b6fd6]" aria-hidden="true" />}
        {c.power?.type === 'attack_boost' && <Swords size={13} className="rounded-full bg-[#ffd9d9] p-[1px] text-[#c22]" aria-hidden="true" />}
        {c.power?.type === 'boat' && <Sailboat size={13} className="rounded-full bg-[#d4f1ff] p-[1px] text-[#0b6aa2]" aria-hidden="true" />}
        {c.power?.type === 'glider' && <Plane size={13} className="rounded-full bg-[#fff0d6] p-[1px] text-[#a35a00]" aria-hidden="true" />}
        {c.immune && <Star size={13} className="rounded-full bg-[#fff1b8] p-[1px] text-[#8a5a00]" aria-hidden="true" />}
        {c.recovering && <Bandage size={13} className="rounded-full bg-white p-[1px] text-[#e5484d]" aria-hidden="true" />}
      </span>
    </button>
  );
}

export function PlayersPanel({
  view,
  presence,
  onInspect,
}: {
  view: PlayerView;
  presence?: Record<string, Presence>;
  onInspect?: (characterId: string) => void;
}) {
  const goal = view.config.treasuresToWin;
  return (
    <ul className="space-y-2" aria-label="Kingdoms">
      {view.players.map((p) => {
        const theme = seatTheme(p.seat);
        const chars = Object.values(view.characters).filter((c) => c.owner === p.id);
        const carried = chars.filter((c) => c.carrying).length;
        const active = view.turn.playerId === p.id && view.status === 'playing';
        const castle = view.castles[p.castle];
        const pr = presence?.[p.id];
        return (
          <li
            key={p.id}
            className={`rounded-2xl border-2 p-2.5 transition ${active ? 'shadow-[var(--shadow-pop)]' : 'border-transparent bg-white/60'}`}
            style={active ? { borderColor: theme.color, background: theme.light } : undefined}
            aria-current={active ? 'true' : undefined}
          >
            <div className="flex items-center gap-2">
              <EmblemBadge theme={theme} size={30} />
              <div className="min-w-0 flex-1">
                <div className="font-display flex items-center gap-1.5 truncate font-semibold">
                  <span className="truncate">{p.name}</span>
                  {p.id === view.viewerId && <span className="rounded-full bg-[#1d2440] px-1.5 text-[10px] font-bold text-white">YOU</span>}
                  {active && (
                    <span className="rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: theme.color }}>
                      PLAYING
                    </span>
                  )}
                  {p.isAI && <Bot size={14} aria-label="AI player" />}
                  {pr?.isHost && <Crown size={14} className="text-[#c48f1c]" aria-label="Host" />}
                </div>
                <div className="text-xs text-[#4a5374]">{theme.kingdom}</div>
              </div>
              {pr && (
                <span
                  className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${pr.left ? 'bg-[#eee] text-[#666]' : pr.connected ? 'bg-[#d8f5e4] text-[#155c36]' : 'bg-[#ffe0d6] text-[#8c2a10]'}`}
                >
                  {pr.connected && !pr.left ? <Wifi size={11} aria-hidden="true" /> : <WifiOff size={11} aria-hidden="true" />}
                  {pr.left ? 'Left' : pr.connected ? 'Online' : 'Away'}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" aria-label={`${p.score} of ${goal} treasures banked`}>
                {Array.from({ length: goal }, (_, i) => (
                  <span
                    key={i}
                    className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 ${i < p.score ? 'border-[#0e5a7a] bg-gradient-to-b from-[#c9fbff] to-[#2bb6e6]' : 'border-dashed border-[#c9bfa8] bg-white/60'}`}
                  >
                    {i < p.score && <Gem size={14} className="text-[#0e5a7a]" aria-hidden="true" />}
                  </span>
                ))}
                {carried > 0 && <span className="ml-1 text-xs font-bold text-[#0e5a7a]">+{carried} carried</span>}
              </div>
              <span className="flex items-center gap-1 text-xs font-bold text-[#4a5374]" title="Cards in hand">
                <Layers size={14} aria-hidden="true" /> {view.handCounts[p.id] ?? 0}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {castle?.damagedBy && (
                <span className="flex items-center gap-1 rounded-full bg-[#ffe0d6] px-2 py-0.5 text-[11px] font-bold text-[#8c2a10]">
                  <Flame size={11} aria-hidden="true" /> Castle damaged
                </span>
              )}
              {castle?.royalGuard && (
                <span className="flex items-center gap-1 rounded-full bg-[#fff1b8] px-2 py-0.5 text-[11px] font-bold text-[#6b4a00]">
                  <ShieldCheck size={11} aria-hidden="true" /> Royal Guard
                </span>
              )}
              {p.slowDownPending && (
                <span className="flex items-center gap-1 rounded-full bg-[#e8e4ff] px-2 py-0.5 text-[11px] font-bold text-[#45228f]">
                  <Snail size={11} aria-hidden="true" /> Slowed next turn
                </span>
              )}
            </div>
            <div className="mt-1.5 flex gap-1">
              {chars.map((c) => (
                <MiniCharacter key={c.id} c={c} seat={p.seat} onClick={() => onInspect?.(c.id)} />
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function EffectsPanel({ view }: { view: PlayerView }) {
  const name = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const graph = getGraph(view.boardId);
  const items: { icon: React.ReactNode; text: string; until: string }[] = [];
  for (const b of view.blocks) {
    const c = graph.connection[b.connectionId];
    items.push({ icon: <Ban size={16} />, text: `Path ${c.a}–${c.b} blocked by ${name(b.owner)}`, until: `until ${name(b.owner)}'s next turn` });
  }
  for (const t of view.tempPortals) items.push({ icon: <Orbit size={16} />, text: `Portal ${t.space} ↔ ${t.linkedTo} (${name(t.owner)})`, until: `until ${name(t.owner)}'s next turn` });
  for (const t of view.traps) items.push({ icon: <Bomb size={16} />, text: `${name(t.owner)}'s trap on ${t.space}`, until: `${t.roundsLeft} round${t.roundsLeft === 1 ? '' : 's'} left` });
  for (const [id, c] of Object.entries(view.castles)) {
    if (c.damagedBy) items.push({ icon: <Flame size={16} />, text: `${name(c.owner)}'s castle damaged (${id})`, until: `until ${name(c.damagedBy)}'s next turn` });
    if (c.royalGuard) items.push({ icon: <ShieldCheck size={16} />, text: `${name(c.owner)}'s Royal Guard`, until: 'until it blocks an attack' });
  }
  for (const c of Object.values(view.characters)) {
    const who = `${name(c.owner)}'s ${CHARACTER_INFO[c.kind].name}`;
    if (c.power?.type === 'shield') items.push({ icon: <Shield size={16} />, text: `${who}: Shield`, until: 'until it blocks a capture' });
    if (c.power?.type === 'attack_boost') items.push({ icon: <Swords size={16} />, text: `${who}: Attack Boost`, until: 'its next regular move' });
    if (c.power?.type === 'boat') items.push({ icon: <Sailboat size={16} />, text: `${who}: Boat`, until: 'its next regular move' });
    if (c.power?.type === 'glider') items.push({ icon: <Plane size={16} />, text: `${who}: Glider`, until: 'its next regular move' });
    if (c.immune) items.push({ icon: <Star size={16} />, text: `${who}: Immune`, until: `until ${name(c.owner)}'s next turn` });
    if (c.recovering) items.push({ icon: <Bandage size={16} />, text: `${who}: recovering`, until: `skips ${name(c.owner)}'s next turn` });
  }
  for (const p of view.players) if (p.slowDownPending) items.push({ icon: <Snail size={16} />, text: `${p.name} is slowed`, until: 'their next turn' });
  if (!items.length) return <p className="text-sm text-[#4a5374]">No active effects. Cards you and others play will show up here.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 rounded-xl bg-white/70 px-2.5 py-1.5 text-sm">
          <span className="mt-0.5 text-[#4a5374]" aria-hidden="true">
            {it.icon}
          </span>
          <span className="flex-1">
            {it.text}
            <span className="block text-xs text-[#4a5374]">{it.until}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LogPanel({ view }: { view: PlayerView }) {
  const seat = (pid?: string) => view.players.find((p) => p.id === pid)?.seat;
  const entries = view.log.slice(-30).reverse();
  return (
    <ol className="space-y-1" aria-label="Recent actions">
      {entries.map((e) => {
        const s = seat(e.playerId);
        return (
          <li key={e.id} className="flex gap-2 rounded-lg px-1.5 py-1 text-sm leading-snug odd:bg-white/50">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: s === undefined ? '#c9bfa8' : seatTheme(s).color }} aria-hidden="true" />
            <span className={e.kind === 'capture' ? 'font-semibold text-[#a3300b]' : e.kind === 'bank' ? 'font-semibold text-[#155c36]' : ''}>{e.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
