'use client';

import { Check, Dices, Layers, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';

const OFF_KEY = 'kc:howto:off';
const seenKey = (matchKey: string) => `kc:howto:seen:${matchKey}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

/**
 * "How a turn works", shown over the game as a match starts (first round), once per match and viewer:
 * roll the die, optionally play a card or use a place, then End turn.
 */
export function TurnHowTo({ matchKey, starting }: { matchKey: string; starting: boolean }) {
  const [open, setOpen] = useState(false);
  const [never, setNever] = useState(false);
  useEffect(() => {
    // Reads the viewer's browser storage, which only exists after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(starting && read(OFF_KEY) !== '1' && read(seenKey(matchKey)) !== '1');
  }, [matchKey, starting]);
  if (!open) return null;
  const close = () => {
    write(seenKey(matchKey), '1');
    if (never) write(OFF_KEY, '1');
    setOpen(false);
  };
  const steps = [
    { icon: <Dices size={22} aria-hidden="true" />, title: 'Roll the die', text: 'Then move one of your pieces the full number of spaces.' },
    { icon: <Layers size={22} aria-hidden="true" />, title: 'Play a card or use a place', text: 'Optional. One adventure action per turn, before or after you move.' },
    { icon: <SkipForward size={22} aria-hidden="true" />, title: 'Tap End turn', text: 'That finishes your turn and passes play to the next kingdom.' },
  ];
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#1d2440]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="howto-title" data-turn-howto onClick={close}>
      <div className="w-[min(100%,26rem)] rounded-3xl border-2 border-[#f2a11a] bg-[#fffaf0] p-5 text-[#1d2440] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="howto-title" className="font-display text-xl font-bold">
          How a turn works
        </h2>
        <ol className="mt-3 space-y-2.5">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffe7b8] text-[#a35f00]">{s.icon}</span>
              <div className="min-w-0">
                <div className="font-bold">
                  {i + 1}. {s.title}
                </div>
                <p className="text-sm leading-snug text-[#4a5374]">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-[#4a5374]">Stuck for 2 minutes on your turn? A reminder will pop up.</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} data-howto-never /> Don&apos;t show again
          </label>
          <button type="button" className="btn btn-primary min-h-11" onClick={close} autoFocus data-howto-close>
            Let&apos;s play
          </button>
        </div>
      </div>
    </div>
  );
}

export type TurnStep = 'roll' | 'card' | 'end';

/**
 * Slim banner over the top of the map on the viewer's turn: Roll the dice → Play a card (optional) → End turn.
 * `step` is where the turn is now; earlier steps show a tick.
 */
export function TurnSteps({ step, cardDone }: { step: TurnStep; cardDone: boolean }) {
  const order: TurnStep[] = ['roll', 'card', 'end'];
  const at = order.indexOf(step);
  const items: { id: TurnStep; icon: React.ReactNode; label: string; sub?: string }[] = [
    { id: 'roll', icon: <Dices size={14} aria-hidden="true" />, label: 'Roll the dice' },
    { id: 'card', icon: <Layers size={14} aria-hidden="true" />, label: 'Play a card', sub: 'if you like' },
    { id: 'end', icon: <SkipForward size={14} aria-hidden="true" />, label: 'End turn' },
  ];
  return (
    <ol
      className="pointer-events-none flex max-w-full items-center gap-0.5 rounded-full border border-[#f2a11a]/70 bg-[#fffaf0]/92 px-1 py-0.5 text-[0.72rem] leading-tight font-semibold whitespace-nowrap text-[#1d2440] shadow-md sm:text-xs"
      aria-label="Your turn: roll the dice, play a card if you like, then end turn"
      data-turn-steps={step}
    >
      {items.map((it, i) => {
        const idx = order.indexOf(it.id);
        // After moving, both "play a card" and "End turn" are open choices.
        const active = idx === at || (step === 'card' && it.id === 'end');
        const done = idx < at || (it.id === 'card' && cardDone);
        return (
          <li key={it.id} className="flex items-center gap-0.5">
            {i > 0 && <span className="px-0.5 text-[#c27a0e]" aria-hidden="true">›</span>}
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-1 ${active && !done ? 'bg-[#f2a11a] text-[#1d2440]' : done ? 'text-[#2e7d4f]' : 'text-[#6b7393]'}`}
              aria-current={active && !done ? 'step' : undefined}
              data-step={it.id}
            >
              {done ? <Check size={14} aria-hidden="true" /> : it.icon}
              <span>
                {it.label}
                {it.sub && <span className="hidden font-normal sm:inline"> {it.sub}</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
