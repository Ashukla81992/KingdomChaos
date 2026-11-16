'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Swords, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GameScreen } from '@/components/game/GameScreen';
import { RulesContent } from '@/components/RulesPanel';
import { Modal } from '@/components/ui/Modal';
import { applyAction, CHARACTER_INFO, CHARACTER_KINDS, toPlayerView, type GameAction, type GameState } from '@/engine';
import { portrait } from '@/lib/seats';
import { useSettings } from '@/lib/settings';
import { markTutorialDone } from '@/lib/storage';
import { runTutorialOpponent, TUTORIAL_STEPS, TUTORIAL_YOU, unlockFixture } from '@/tutorial/steps';

const isPhone = () => window.innerWidth < 640;

/** On phones the coach card covers the lower half of the screen, so keep the target in the top half. */
function revealAboveCard(el: Element | null) {
  if (!el || !isPhone()) return;
  const r = el.getBoundingClientRect();
  const limit = window.innerHeight * 0.48;
  if (r.bottom > limit || r.top < 56) window.scrollBy({ top: r.bottom - limit + 8, behavior: 'smooth' });
}

function Spotlight({ selectors, board }: { selectors: string[]; board: boolean }) {
  const [rects, setRects] = useState<DOMRect[]>([]);
  const key = selectors.join('|');
  useEffect(() => {
    if (!isPhone()) return;
    if (key) revealAboveCard(document.querySelector(key.split('|')[0]));
    else if (board) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [key, board]);
  useEffect(() => {
    if (!key) return;
    const measure = () =>
      setRects(
        key
          .split('|')
          .flatMap((sel) => Array.from(document.querySelectorAll(sel)))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0),
      );
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [key]);
  return (
    <>
      {(key ? rects : []).map((r, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="kc-pulse pointer-events-none fixed z-30 rounded-2xl"
          style={{ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12, boxShadow: '0 0 0 4px #ff4fa3, 0 0 24px 6px rgba(255,79,163,0.55)' }}
        />
      ))}
    </>
  );
}

export default function TutorialPage() {
  const router = useRouter();
  const { reducedMotion, play } = useSettings();
  const [index, setIndex] = useState(0);
  const [fixture, setFixture] = useState<string | null>(null);
  const [state, setState] = useState<GameState>(() => TUTORIAL_STEPS[0].setup());
  const [complete, setComplete] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const step = TUTORIAL_STEPS[index];
  const interactive = Boolean(step.done || step.selectDone);
  const canNext = !interactive || complete;

  const goTo = useCallback((i: number, forward = false) => {
    const next = TUTORIAL_STEPS[i];
    setIndex(i);
    setState((cur) => (forward && next.keep ? cur : next.setup()));
    setComplete(false);
    setCollapsed(false);
    if (next.finish) markTutorialDone();
  }, []);

  // `?step=N` opens the tutorial at step N (used by the Back-to-step links and the browser tests).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('fixture') === 'unlock') {
      const id = requestAnimationFrame(() => {
        setFixture('unlock');
        setState(unlockFixture());
      });
      return () => cancelAnimationFrame(id);
    }
    const n = Number(params.get('step'));
    if (!Number.isInteger(n) || n < 2 || n > TUTORIAL_STEPS.length) return;
    const id = requestAnimationFrame(() => goTo(n - 1));
    return () => cancelAnimationFrame(id);
  }, [goTo]);

  const skip = () => {
    markTutorialDone();
    router.push('/');
  };

  const send = useCallback(
    async (action: GameAction) => {
      const r = applyAction(state, { playerId: TUTORIAL_YOU, action, version: state.version }, Date.now());
      if (!r.ok) return { ok: false as const, error: r.error };
      setState(r.state);
      if (r.state.status === 'playing' && r.state.turn.playerId !== TUTORIAL_YOU) {
        const before = r.state;
        // Alex plays after a short pause so the hand-over is visible.
        setTimeout(() => setState((cur) => (cur === before ? runTutorialOpponent(cur, Date.now()).state : cur)), reducedMotion ? 300 : 1200);
      }
      if (step.done && !complete && step.done(state, r.state, r.events)) {
        setComplete(true);
        play('bank');
      }
      return { ok: true as const };
    },
    [state, step, complete, play, reducedMotion],
  );

  const allow = useCallback(
    (a: GameAction): string | null => {
      if (fixture === 'unlock') return a.type === 'roll' || a.type === 'move' || a.type === 'skipAdventure' ? null : 'Finish banking the last gem.';
      if (complete) return 'Step complete — press Next to continue.';
      if (!step.allowed) return 'Read the tip, then press Next.';
      if (!step.allowed.includes(a.type)) return 'Follow the tip for this step.';
      if (a.type === 'move' && step.allowCharacter && a.characterId !== step.allowCharacter) return 'Move the highlighted character for this step.';
      if (a.type === 'move' && step.allowEnd && a.path[a.path.length - 1] !== step.allowEnd) return 'For this step, move to the highlighted space.';
      if (a.type === 'playCard' && step.allowCard) {
        const card = state.hands[TUTORIAL_YOU].find((c) => c.id === a.cardId);
        if (card?.type !== step.allowCard) return 'Use the highlighted card for this step.';
      }
      return null;
    },
    [complete, step, state, fixture],
  );

  const onSelect = useCallback(
    (id: string) => {
      if (step.selectDone && id === step.selectDone && !complete) {
        setComplete(true);
        play('bank');
      }
    },
    [step, complete, play],
  );

  const coach = useMemo(() => (complete ? {} : (step.coach?.(state) ?? {})), [complete, step, state]);
  const view = useMemo(() => toPlayerView(state, TUTORIAL_YOU), [state]);

  const card = collapsed ? (
    <button className="btn btn-primary fixed right-2 bottom-2 z-40 shadow-[var(--shadow-pop)]" onClick={() => setCollapsed(false)} data-testid="tutorial-card">
      <ChevronUp size={18} aria-hidden="true" /> Show tip · Step {index + 1} of {TUTORIAL_STEPS.length}
      {complete && <Check size={18} aria-label="done" />}
    </button>
  ) : (
    <AnimatePresence mode="wait">
      <motion.section
        key={step.id}
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
        className="panel fixed inset-x-2 bottom-2 z-40 max-h-[45dvh] overflow-y-auto p-4 sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[380px] sm:max-h-[70dvh]"
        aria-labelledby="tutorial-title"
        aria-live="polite"
        data-testid="tutorial-card"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold tracking-wide text-[#7a5cff] uppercase">
            Step {index + 1} of {TUTORIAL_STEPS.length}
          </span>
          <span className="flex gap-1">
            <button className="btn btn-ghost px-2! py-1! text-sm sm:hidden" onClick={() => setCollapsed(true)}>
              <ChevronDown size={14} aria-hidden="true" /> Hide
            </button>
            <button className="btn btn-ghost px-2! py-1! text-sm" onClick={skip}>
              Skip tutorial <X size={14} aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="mt-1 flex gap-1" aria-hidden="true">
          {TUTORIAL_STEPS.map((s, i) => (
            <span key={s.id} className={`h-1.5 flex-1 rounded-full ${i < index || (i === index && canNext) ? 'bg-[#7a5cff]' : i === index ? 'bg-[#c9bcff]' : 'bg-[#e6e1f5]'}`} />
          ))}
        </div>
        <h2 id="tutorial-title" className="mt-2 text-xl font-bold">
          {step.title}
        </h2>
        <div className="mt-1 space-y-1.5 text-[15px] leading-snug text-[#3b4466]">
          {step.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {step.showCharacters && (
          <ul className="mt-2 grid grid-cols-2 gap-1.5">
            {CHARACTER_KINDS.map((k) => (
              <li key={k} className="flex items-center gap-1.5 rounded-xl bg-[#f5f2ff] p-1.5 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={portrait(0, k)} alt="" width={30} height={38} className="h-[38px] w-[30px] object-contain" />
                <span>
                  <b>{CHARACTER_INFO[k].name}</b> — {CHARACTER_INFO[k].abilityName}
                </span>
              </li>
            ))}
          </ul>
        )}
        {complete && step.after && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#e3f9e8] p-2 text-sm font-semibold text-[#1d6b34]" role="status">
            <Check size={18} className="shrink-0" aria-hidden="true" /> {step.after}
          </p>
        )}
        {step.finish ? (
          <div className="mt-3 grid gap-2">
            <button className="btn btn-primary" onClick={() => router.push('/practice')}>
              <Swords size={18} aria-hidden="true" /> Start Practice Game
            </button>
            <button className="btn btn-blue" onClick={() => router.push('/online')}>
              <Users size={18} aria-hidden="true" /> Create a Room
            </button>
            <button className="btn btn-ghost" onClick={() => setRulesOpen(true)}>
              <BookOpen size={18} aria-hidden="true" /> View Rules
            </button>
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button className="btn btn-ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
            <ChevronLeft size={18} aria-hidden="true" /> Back
          </button>
          {!step.finish && (
            <button className={`btn btn-primary ml-auto ${canNext && interactive ? 'kc-pulse' : ''}`} onClick={() => goTo(index + 1, true)} disabled={!canNext}>
              {canNext ? 'Next' : 'Try it on the board'} <ChevronRight size={18} aria-hidden="true" />
            </button>
          )}
          {step.finish && (
            <button className="btn btn-ghost ml-auto" onClick={() => router.push('/')}>
              Main menu
            </button>
          )}
        </div>
      </motion.section>
    </AnimatePresence>
  );

  return (
    <>
      <GameScreen
        controller={{ view, send, mode: 'tutorial' }}
        onExit={() => router.push('/')}
        tutorial={{
          coach: fixture ? undefined : coach.board,
          allow,
          onSelect,
          hideResults: true,
          reserveBottom: !fixture,
          overlay: fixture ? (
            <span className="sr-only" data-fixture={fixture} />
          ) : (
            <>
              <Spotlight selectors={coach.ui ?? []} board={Boolean(coach.board?.length)} />
              {card}
            </>
          ),
        }}
      />
      <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="Rules">
        <RulesContent query="" />
      </Modal>
    </>
  );
}
