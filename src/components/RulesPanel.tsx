'use client';

import { GraduationCap, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CARD_INFO, CATEGORY_INFO, type CardType, CHARACTER_INFO, RULE_SECTIONS, type CardCategory, type CharacterKind } from '@/engine';
import { portrait } from '@/lib/seats';

import { cardArt, CATEGORY_STYLE } from './art/cardIcons';
import { Modal } from './ui/Modal';

interface RulesPanelProps {
  open: boolean;
  onClose: () => void;
  /** When set, replaying the tutorial requires confirming that the match will be left. */
  activeMatch?: 'online' | 'local' | null;
  onLeaveMatch?: () => void | Promise<void>;
}

const CARD_CATEGORIES: CardCategory[] = ['map', 'power', 'special'];
const cardText = (t: CardType) => `${CARD_INFO[t].name} ${CARD_INFO[t].full} ${CARD_INFO[t].targets} ${CARD_INFO[t].restrictions}`;
const GEMS = ['ruby', 'sapphire', 'emerald', 'diamond'] as const;

const WIN_STEPS = [
  { n: '1', title: 'Bank four gem kinds', body: 'Pass a gem mine to pick one up. Reach your own gate to bank it. One of each kind opens your Royal Path.' },
  { n: '2', title: 'Touch four checkpoints', body: 'Each character you send to the temple must pass or land on every house gate — Red, Blue, Purple, Green.' },
  { n: '3', title: 'Earn a capture', body: 'A movement capture credits your kingdom for the temple gate. A 6 or a capture also earns one bonus roll.' },
  { n: '4', title: 'Finish all four', body: 'Walk each character up your Royal Path into the Crown Temple. The first house with all four inside wins.' },
];

const TURN_STEPS = [
  { title: 'Roll', body: 'One die. Then pick which of your four characters uses the exact allowance.' },
  { title: 'Move', body: 'Use every step on one route. Roads run both ways, so several spaces glow. Tap one, then Move here.' },
  { title: 'Adventure', body: 'Play a card, dig, or press End turn. You can do this before the move. Bonus rolls stay in the same turn.' },
];

/** The first thing in How to play: the goal and a turn, before the full rule book. */
function HowToPlay() {
  return (
    <div className="mb-5 space-y-3" data-how-to-play>
      <div>
        <h3 className="font-display text-lg font-semibold">Win in four steps</h3>
        <p className="text-sm text-[#4a5374]">Every house has the same goal. The roads in between are your choice. The main road stays open.</p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2">
        {WIN_STEPS.map((step) => (
          <li key={step.n} className="flex gap-3 rounded-2xl bg-white/80 p-3">
            <span className="font-display grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#ffcf33] text-sm font-extrabold text-[#5a3d00]" aria-hidden="true">
              {step.n}
            </span>
            <div>
              <div className="font-display font-semibold">{step.title}</div>
              {step.n === '1' && (
                <div className="mt-1 flex gap-1" aria-hidden="true">
                  {GEMS.map((gem) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={gem} src={`/art/gem-${gem}.png`} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
                  ))}
                </div>
              )}
              <p className="mt-0.5 text-sm leading-snug text-[#3b4366]">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl bg-white/80 p-3">
        <h3 className="font-display font-semibold">On your turn</h3>
        <ol className="mt-2 grid gap-2 sm:grid-cols-3">
          {TURN_STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl bg-[#fff6df] px-3 py-2">
              <div className="font-display text-sm font-semibold">
                <span className="text-[#8a6a3b]">{i + 1}. </span>
                {step.title}
              </div>
              <p className="text-sm leading-snug text-[#3b4366]">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-[#2c3558]">Each house plays these four</p>
        <div className="flex items-center gap-2 overflow-x-auto">
          {(['king', 'queen', 'witch', 'knight'] as CharacterKind[]).map((kind) => (
            <div key={kind} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 py-1 pr-3 pl-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portrait(0, kind)} alt="" width={28} height={36} className="h-9 w-7 object-contain" />
              <span className="text-sm font-semibold">{CHARACTER_INFO[kind].name}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-sm text-[#4a5374]">The sections below are the full rules. Open one when you need it, or search.</p>
    </div>
  );
}

/** Every searchable string of a rules section (character abilities and card texts included). */
export function sectionText(s: (typeof RULE_SECTIONS)[number]): string[] {
  const extra =
    s.id === 'characters' ? Object.values(CHARACTER_INFO).flatMap((c) => [c.name, c.abilityName, c.ability]) : s.id === 'cards' ? (Object.keys(CARD_INFO) as CardType[]).map(cardText) : [];
  return [s.title, ...s.paragraphs, ...(s.bullets ?? []), ...extra];
}

export function RulesContent({ query }: { query: string }) {
  const q = query.trim().toLowerCase();
  const sections = useMemo(() => RULE_SECTIONS.filter((s) => !q || sectionText(s).some((t) => t.toLowerCase().includes(q))), [q]);
  if (!sections.length) return <p className="py-6 text-center text-[#4a5374]">No rules match “{query}”.</p>;
  return (
    <div className="space-y-3">
      {!q && <HowToPlay />}
      {sections.map((s) => {
        const bullets = s.bullets && s.id !== 'characters' && (
          <ul className="ml-1 space-y-1">
            {s.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 leading-snug text-[#2c3558]">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f4a81d]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        );
        return (
          <details key={`${q}-${s.id}`} id={`rules-${s.id}`} open={!!q || s.id === 'objective'} className="group rounded-2xl bg-white/45 px-3 py-2" aria-labelledby={`rules-h-${s.id}`}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 [&::-webkit-details-marker]:hidden">
              <h3 id={`rules-h-${s.id}`} className="text-lg font-semibold">
                {s.title}
              </h3>
              <span aria-hidden="true" className="text-[#8a6a3b] transition group-open:rotate-180">▾</span>
            </summary>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mb-1.5 leading-relaxed text-[#2c3558]">
                {p}
              </p>
            ))}
            {s.id === 'characters' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(CHARACTER_INFO) as CharacterKind[]).map((k) => (
                  <div key={k} className="flex items-start gap-3 rounded-2xl bg-white/80 p-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={portrait(2, k)} alt="" width={48} height={60} className="h-[60px] w-12 shrink-0 object-contain" />
                    <div>
                      <div className="font-display font-semibold">
                        {CHARACTER_INFO[k].name} · <span className="text-[#6a3fd0]">{CHARACTER_INFO[k].abilityName}</span>
                      </div>
                      <div className="text-sm leading-snug text-[#3b4366]">{CHARACTER_INFO[k].ability}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : s.id === 'cards' ? (
              <>
                {bullets}
                {CARD_CATEGORIES.map((cat) => (
              <div key={cat} className="mt-2 grid gap-2 sm:grid-cols-2">
                {(Object.keys(CARD_INFO) as CardType[]).filter((t) => CARD_INFO[t].category === cat)
                  .filter((t) => !q || cardText(t).toLowerCase().includes(q) || [s.title, ...s.paragraphs, ...(s.bullets ?? [])].some((x) => x.toLowerCase().includes(q)))
                  .map((t) => {
                    const st = CATEGORY_STYLE[cat];
                    return (
                      <div key={t} className="flex gap-3 rounded-2xl p-2.5" style={{ background: st.bg }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cardArt(t)} alt="" width={72} height={90} className="h-[90px] w-[72px] shrink-0 object-contain" />
                        <div>
                          <div className="font-display font-semibold" style={{ color: st.ink }}>
                            {CARD_INFO[t].name} <span className="text-xs font-bold opacity-70">· {CARD_INFO[t].duration}</span>
                          </div>
                          <div className="text-sm leading-snug text-[#3b4366]">{CARD_INFO[t].full}</div>
                          <div className="mt-0.5 text-xs font-bold text-[#4a5374]">Targets: {CARD_INFO[t].targets}. {CARD_INFO[t].restrictions}</div>
                        </div>
                      </div>
                    );
                  })}
              </div>
                ))}
              </>
            ) : (
              bullets
            )}
          </details>
        );
      })}
    </div>
  );
}

export function RulesPanel({ open, onClose, activeMatch, onLeaveMatch }: RulesPanelProps) {
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState(false);
  const replay = async () => {
    if (activeMatch && !confirming) return setConfirming(true);
    onClose();
    await onLeaveMatch?.();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a full load restarts the tutorial even when already on /tutorial
    window.location.assign('/tutorial');
  };

  return (
    <Modal open={open} onClose={() => (setConfirming(false), onClose())} title="How to play" wide>
      <div className="sticky -top-4 z-10 -mx-5 -mt-4 mb-3 bg-[#fffaf0]/95 px-5 pt-4 pb-3 backdrop-blur">
        <label className="relative block">
          <span className="sr-only">Search the rules</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#4a5374]" size={18} aria-hidden="true" />
          <input type="search" aria-label="Search rules" className="field pl-10" placeholder="Search rules (e.g. shield, bridge, timer)" value={query} onChange={(e) => setQuery(e.target.value)} data-autofocus />
        </label>
        <nav aria-label="Rule sections" className="mt-2 flex flex-wrap gap-1.5">
          {RULE_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#rules-${s.id}`}
              onClick={() => setQuery('')}
              className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#2c3558] shadow-sm hover:bg-[#fff1c7]"
            >
              {s.title}
            </a>
          ))}
        </nav>
      </div>
      <RulesContent query={query} />
      <div className="mt-6 rounded-2xl border-2 border-dashed border-[#e3d6b6] p-3">
        {confirming ? (
          <div role="alert">
            <p className="mb-2 font-semibold">
              {activeMatch === 'online'
                ? 'Replaying the tutorial leaves this online match. Your seat will be auto-played. Leave the match?'
                : 'Replaying the tutorial ends this local game. Continue?'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-danger" onClick={replay}>
                Leave and start tutorial
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Stay in match
              </button>
            </div>
          </div>
        ) : (
          <button className="btn btn-blue" onClick={replay}>
            <GraduationCap size={18} aria-hidden="true" /> Replay Tutorial
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-[#4a5374]">{CATEGORY_INFO.map.name}, {CATEGORY_INFO.power.name} and {CATEGORY_INFO.special.name} cards are colour-coded teal, violet and coral, and each has its own icon.</p>
    </Modal>
  );
}
