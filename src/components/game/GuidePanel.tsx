'use client';

import { Check, Crown, Lock, Search, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CHARACTER_INFO, RULE_SECTIONS, STATUS_INFO, charLabel, finalUnlocked, gemList, gemsOf, getBoard, nodeName, type Character, type PlayerView } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { EmblemBadge } from '../art/art';
import { GEM_KINDS, GEM_NAMES, GemIcon } from '../art/gems';
import { sectionText } from '../RulesPanel';
import { gemStates, stillNeeded } from './ObjectiveStrip';

type Tab = 'progress' | 'piece' | 'rules' | 'events';

const TABS: { id: Tab; label: string }[] = [
  { id: 'progress', label: 'Progress' },
  { id: 'piece', label: 'Piece' },
  { id: 'rules', label: 'Rules' },
  { id: 'events', label: 'Events' },
];

/** "Red ✓ · Blue ✓ · Purple ○ · Green ○" for one character, in board order. */
export function plateLine(view: PlayerView, ch: Character): string {
  return getBoard(view.boardId)
    .board.houses.map((h) => `${h.name} ${ch.plates.includes(h.seat) ? '✓' : '○'}`)
    .join(' · ');
}

/** Four house-colour dots, filled for each plate this character has touched. */
export function PlateDots({ view, ch, size = 9 }: { view: PlayerView; ch: Character; size?: number }) {
  const houses = getBoard(view.boardId).board.houses;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Plates: ${plateLine(view, ch)}`} data-plates={ch.plates.length}>
      {houses.map((h) => {
        const th = seatTheme(h.seat);
        const on = ch.plates.includes(h.seat);
        return <span key={h.seat} className="inline-block rounded-full" style={{ width: size, height: size, background: on ? th.color : 'transparent', boxShadow: `inset 0 0 0 1.5px ${th.color}` }} />;
      })}
    </span>
  );
}

interface TurnInfo {
  headline: string;
  sub: string;
  /** Steps the previewed piece will move (after the dragon penalty). */
  steps: number | null;
}

interface Props {
  view: PlayerView;
  me: string | null;
  /** The piece to describe: the selected or inspected one. */
  focusId: string | null;
  turn: TurnInfo;
  /** Compact: inside the mobile drawer. */
  compact?: boolean;
}

/**
 * The persistent guide: every house's progress, the selected piece, the turn, searchable rules and
 * recent events. Desktop shows it beside the board; phones open it as a drawer.
 */
export function GuidePanel({ view, me, focusId, turn, compact }: Props) {
  const [tab, setTab] = useState<Tab>('progress');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const playing = view.status === 'playing';
  const current = view.players.find((p) => p.id === view.turn.playerId);
  const extra = view.turn.extra;

  const focus = (picked && view.characters[picked]) || (focusId && view.characters[focusId]) || Object.values(view.characters).find((c) => c.owner === me) || null;

  const q = query.trim().toLowerCase();
  const sections = useMemo(() => RULE_SECTIONS.filter((s) => !q || sectionText(s).some((t) => t.toLowerCase().includes(q))), [q]);

  return (
    <div className="panel p-3" data-guide aria-label="Rules and guide">
      <div className="rounded-xl bg-[#f6efdf] px-2.5 py-1.5 text-sm" data-guide-turn>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-bold">
          {current && <EmblemBadge theme={seatTheme(current.seat)} size={16} />}
          <span>{!playing ? 'Match over' : current?.id === me ? 'Your turn' : `${current?.name}'s turn`}</span>
          {view.turn.bonus && playing && <span className="rounded-full bg-[#2e9e62] px-1.5 text-[11px] text-white">extra turn</span>}
          {playing && <span className="text-xs font-semibold text-[#4a5374]">Die: {view.turn.move ? view.turn.move.roll : '—'}</span>}
          {playing && turn.steps != null && <span className="text-xs font-semibold text-[#4a5374]">· {turn.steps} steps to move</span>}
          {playing && <span className="text-xs font-semibold text-[#4a5374]">· Move {view.turn.moveDone ? 'done' : view.turn.move ? 'to choose' : 'to roll'} · Adventure {view.turn.adventureDone ? 'done' : 'optional'}</span>}
        </div>
        {extra && playing && (
          <p className="text-xs font-bold text-[#155c36]" data-extra-turn={extra}>
            Extra turn earned ({extra === 'six' ? 'rolled a 6' : 'made a cut'}) — it starts when this turn ends.
          </p>
        )}
        {playing && compact && <p className="text-xs leading-snug text-[#2c3558]">{turn.headline}</p>}
      </div>

      <div className="mt-2 flex gap-1" role="tablist" aria-label="Guide sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`flex-1 rounded-lg px-1.5 py-1 text-xs font-bold ${tab === t.id ? 'bg-[#1d2440] text-white' : 'bg-white text-[#2c3558] hover:bg-[#fff1c7]'}`}
            onClick={() => setTab(t.id)}
            data-guide-tab={t.id}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={`mt-2 ${compact ? '' : 'max-h-[26rem] overflow-y-auto'} scrollbar-thin`} role="tabpanel">
        {tab === 'progress' && (
          <ul className="space-y-2" data-guide-progress>
            {view.players.map((p) => {
              const th = seatTheme(p.seat);
              const st = gemStates(view, p.id);
              const cut = (view.stats[p.id]?.cuts ?? 0) >= view.config.cutsRequired;
              const open = finalUnlocked(view, p.id);
              const need = stillNeeded(view, p.id);
              const pieces = Object.values(view.characters).filter((c) => c.owner === p.id);
              return (
                <li key={p.id} className="rounded-xl bg-white/80 p-2" data-guide-player={p.id}>
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    <EmblemBadge theme={th} size={18} />
                    <span className="truncate">
                      {p.id === me ? 'You' : p.name} <span className="font-semibold text-[#6b7086]">· {th.kingdom}</span>
                    </span>
                    <span className={`ml-auto flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] ${open ? 'bg-[#ffcf33] text-[#5a3d00]' : 'bg-[#1d2440] text-white'}`} data-guide-final={open ? 'open' : 'locked'}>
                      {open ? <Crown size={11} aria-hidden="true" /> : <Lock size={10} aria-hidden="true" />} {open ? 'Path open' : 'Path locked'}
                    </span>
                  </div>
                  <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-semibold">
                    {GEM_KINDS.map((k) => (
                      <li key={k} className="flex items-center gap-0.5" data-gem-state={st[k]}>
                        <GemIcon kind={k} size={14} empty={st[k] === 'needed'} />
                        <span className={st[k] === 'banked' ? 'text-[#155c36]' : st[k] === 'carrying' ? 'text-[#8a5a00]' : 'text-[#6b7086]'}>
                          {st[k] === 'banked' ? 'banked' : st[k] === 'carrying' ? 'carried' : 'not collected'}
                        </span>
                      </li>
                    ))}
                    <li className={`flex items-center gap-0.5 ${cut ? 'text-[#155c36]' : 'text-[#6b7086]'}`}>
                      <Swords size={12} aria-hidden="true" /> cut {cut ? '✓' : '○'}
                    </li>
                  </ul>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#4a5374]">
                    {open ? 'Royal Path open: any piece with all four plates may turn in at the fork.' : `Locked — still needs ${need}.`}
                  </p>
                  <ul className="mt-1 grid grid-cols-2 gap-x-2 text-[11px]">
                    {pieces.map((c) => (
                      <li key={c.id} className="flex items-center gap-1">
                        <span className="w-12 truncate font-semibold">{CHARACTER_INFO[c.kind].name}</span>
                        <PlateDots view={view} ch={c} />
                        {c.lap >= 4 && <Check size={11} className="text-[#155c36]" aria-label="lap complete" />}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}

        {tab === 'piece' && focus && (
          <div className="space-y-1.5 text-sm" data-guide-piece={focus.id}>
            <div className="flex flex-wrap gap-1">
              {Object.values(view.characters)
                .filter((c) => c.owner === focus.owner)
                .map((c) => (
                  <button key={c.id} className={`rounded-full px-2 py-0.5 text-xs font-bold ${c.id === focus.id ? 'bg-[#1d2440] text-white' : 'bg-white'}`} onClick={() => setPicked(c.id)}>
                    {CHARACTER_INFO[c.kind].name}
                  </button>
                ))}
            </div>
            <div className="font-display font-bold">{charLabel(view, focus.id)}</div>
            <p className="text-xs text-[#6a3fd0]">
              {CHARACTER_INFO[focus.kind].abilityName}: <span className="text-[#2c3558]">{CHARACTER_INFO[focus.kind].ability}</span>
            </p>
            <p className="text-xs">At {nodeName(view.boardId, focus.node)}</p>
            <p className="text-xs">
              Carrying:{' '}
              {(() => {
                const gs = gemsOf(view, focus);
                return gs.length ? `${gemList(gs.map((g) => g.kind))} — bank at its gate` : 'nothing';
              })()}
            </p>
            <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="House plates">
              {getBoard(view.boardId).board.houses.map((h) => {
                const on = focus.plates.includes(h.seat);
                return (
                  <li key={h.seat} className="flex items-center gap-1 rounded-lg bg-white/80 px-1.5 py-0.5" data-plate-check={h.key} data-done={on}>
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded" style={{ background: on ? seatTheme(h.seat).color : 'transparent', boxShadow: `inset 0 0 0 1.5px ${seatTheme(h.seat).color}` }}>
                      {on && <Check size={10} className="text-white" aria-hidden="true" />}
                    </span>
                    {h.name} plate
                  </li>
                );
              })}
            </ul>
            <p className="text-xs font-semibold">
              {focus.lap >= 4
                ? finalUnlocked(view, focus.owner)
                  ? 'Lap complete — may turn onto the Royal Path at the fork.'
                  : 'Lap complete — waiting for the Royal Path to open (gems and a cut).'
                : `Lap: ${focus.lap} of 4 plates. ${STATUS_INFO.lap.replace(/^Lap — /, '')}`}
            </p>
            {focus.shield && <p className="text-xs text-[#173e8c]">{STATUS_INFO.shield}</p>}
            {focus.immune && <p className="text-xs text-[#5a3d00]">{STATUS_INFO.immune}</p>}
            {view.dragon.companion === focus.id && <p className="text-xs text-[#a3300b]">{STATUS_INFO.companion}</p>}
            {view.players.find((p) => p.id === focus.owner)?.slowed && <p className="text-xs">{STATUS_INFO.slowed}</p>}
            {turn.steps != null && focusId === focus.id && <p className="text-xs font-bold">This move: {turn.steps} steps.</p>}
          </div>
        )}

        {tab === 'rules' && (
          <div data-guide-rules>
            <label className="relative mb-2 block">
              <span className="sr-only">Search the rules</span>
              <Search className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[#4a5374]" size={15} aria-hidden="true" />
              <input type="search" aria-label="Search guide rules" className="field py-1.5! pl-8 text-sm" placeholder="Search (e.g. dragon, cut, plate)" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {!sections.length && <p className="text-sm text-[#4a5374]">No rules match “{query}”.</p>}
            {sections.map((s) => (
              <details key={`${s.id}-${q ? 'q' : ''}`} className="mb-1 rounded-lg bg-white/80 px-2 py-1" open={!!q} data-guide-section={s.id}>
                <summary className="cursor-pointer text-sm font-bold">{s.title}</summary>
                {s.paragraphs.map((p, i) => (
                  <p key={i} className="mt-1 text-xs leading-snug text-[#2c3558]">
                    {p}
                  </p>
                ))}
                {s.bullets && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs leading-snug text-[#2c3558]">
                    {s.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}
              </details>
            ))}
          </div>
        )}

        {tab === 'events' && (
          <ul className="space-y-1 text-xs leading-snug" data-guide-events>
            {[...view.log]
              .reverse()
              .slice(0, 14)
              .map((l) => (
                <li key={l.id} className={`rounded-md px-1.5 py-0.5 ${l.kind === 'good' ? 'bg-[#e6f6ec]' : l.kind === 'bad' ? 'bg-[#ffe9e2]' : 'bg-white/70'}`}>
                  {l.text}
                </li>
              ))}
            <li className="pt-1 text-[11px] text-[#4a5374]">
              Carried gems at risk: {view.players.map((p) => `${p.id === me ? 'you' : p.name} ${Object.values(view.characters).filter((c) => c.owner === p.id).flatMap((c) => gemsOf(view, c)).map((g) => GEM_NAMES[g.kind]).join(', ') || 'none'}`).join(' · ')}
            </li>
          </ul>
        )}
      </div>
      {tab === 'progress' && <p className="mt-1.5 text-[11px] text-[#4a5374]">Gems are per house; plates are per piece. A cut resets the victim’s plates only. Every gem station supplies every house.</p>}
    </div>
  );
}
