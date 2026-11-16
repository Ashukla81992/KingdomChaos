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
    <div className="space-y-5">
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
          <section key={s.id} id={`rules-${s.id}`} aria-labelledby={`rules-h-${s.id}`}>
            <h3 id={`rules-h-${s.id}`} className="mb-1.5 text-lg font-semibold">
              {s.title}
            </h3>
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
          </section>
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
