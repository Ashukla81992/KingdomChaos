'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { CircleHelp, Dice5, Hourglass, LogOut, Settings, Timer, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_INFO,
  cardAvailability,
  CHARACTER_INFO,
  distinctRoutes,
  enumerateMoves,
  groupByTarget,
  legalMovesForTurn,
  legalTargets,
  type CardTarget,
  type GameAction,
  type MoveOption,
  type PlayerView,
} from '@/engine';
import { seatTheme } from '@/lib/seats';
import { useSettings } from '@/lib/settings';
import { Board, type BoardHighlights, type SpaceHighlight } from '../board/Board';
import { EmblemBadge } from '../art/art';
import { RulesPanel } from '../RulesPanel';
import { SettingsPanel } from '../SettingsPanel';
import { Modal } from '../ui/Modal';
import { CardView } from './CardView';
import { Die } from './Die';
import { EffectsPanel, LogPanel, PlayersPanel, type Presence } from './Panels';
import { ResultsOverlay } from './ResultsOverlay';
import { CONFIRM_LABEL, describeRoute, explainSpace, fieldValue, matchTargets, nextStep, type Field, type Picks } from './targeting';
import { formatClock, useNow } from './useNow';

export type SendResult = { ok: true } | { ok: false; error: string };

export interface GameController {
  view: PlayerView;
  mode: 'online' | 'practice' | 'hotseat' | 'tutorial';
  send: (action: GameAction) => Promise<SendResult>;
  connection?: 'connected' | 'reconnecting' | 'offline';
  presence?: Record<string, Presence>;
  /** serverTime - localTime, for accurate countdowns. */
  clockSkew?: number;
}

export interface TutorialHooks {
  coach?: string[];
  /** Return a message to block an action the current tutorial step does not want. */
  allow?: (a: GameAction) => string | null;
  overlay?: React.ReactNode;
  hideResults?: boolean;
  /** Leave scroll room on phones so a bottom overlay never hides the controls. */
  reserveBottom?: boolean;
}

interface Props {
  controller: GameController;
  onExit: () => void | Promise<void>;
  results?: { primary?: { label: string; onClick: () => void }; secondary?: { label: string; onClick: () => void } };
  tutorial?: TutorialHooks;
}

interface RouteChoice {
  options: MoveOption[];
  index: number;
  forCard: { cardId: string } | null;
}

interface UiState {
  v: number;
  selected: string | null;
  route: RouteChoice | null;
  cardId: string | null;
  picks: Picks;
  inspect: string | null;
}

const EMPTY = { selected: null, route: null, cardId: null, picks: {}, inspect: null };

type Tab = 'hand' | 'players' | 'effects' | 'log';

export function GameScreen({ controller, onExit, results, tutorial }: Props) {
  const { view, send, mode } = controller;
  const { reducedMotion, play, settings, update } = useSettings();
  const me = view.viewerId;
  const [ui, setUi] = useState<UiState>({ v: -1, ...EMPTY });
  const cur: UiState = ui.v === view.version ? ui : { v: view.version, ...EMPTY, inspect: ui.inspect };
  const set = useCallback((patch: Partial<UiState>) => setUi((u) => ({ ...(u.v === view.version ? u : { v: view.version, ...EMPTY, inspect: u.inspect }), ...patch, v: view.version })), [view.version]);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('hand');
  const now = useNow(250, controller.clockSkew ?? 0);

  const say = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  // Sound effects for new events.
  const lastVersion = useRef(view.version);
  useEffect(() => {
    if (view.version === lastVersion.current) return;
    lastVersion.current = view.version;
    const types = new Set(view.lastEvents.map((e) => e.type));
    if (types.has('gameOver')) play('win');
    else if (types.has('banked')) play('bank');
    else if (types.has('captured') || types.has('trapped') || types.has('shieldBlocked')) play('capture');
    else if (types.has('pickedUp')) play('pickup');
    else if (types.has('cardPlayed')) play('card');
    else if (types.has('rolled')) play('roll');
    else if (types.has('moved')) play('step');
    if (view.lastEvents.some((e) => e.type === 'turnStarted' && e.playerId === me)) setTimeout(() => play('turn'), 250);
  }, [view.version, view.lastEvents, me, play]);

  const playing = view.status === 'playing';
  const myTurn = playing && view.turn.playerId === me;
  const phase = view.turn.phase;
  const current = view.players.find((p) => p.id === view.turn.playerId)!;
  const currentTheme = seatTheme(current.seat);

  const moves = useMemo(() => (myTurn && phase === 'move' && me ? legalMovesForTurn(view, me) : []), [view, myTurn, phase, me]);
  const movable = useMemo(() => new Set(moves.map((m) => m.characterId)), [moves]);
  const selectedMoves = useMemo(() => (cur.selected ? moves.filter((m) => m.characterId === cur.selected) : []), [moves, cur.selected]);
  const byTarget = useMemo(() => groupByTarget(selectedMoves), [selectedMoves]);

  const selectedCard = cur.cardId ? view.hand.find((c) => c.id === cur.cardId) ?? null : null;
  const availability = selectedCard && me ? cardAvailability(view, me, selectedCard) : null;
  const targets = useMemo(
    () => (selectedCard && me && availability?.playable ? legalTargets(view, me, selectedCard.type) : []),
    [selectedCard, me, availability?.playable, view],
  );
  const matching = useMemo(() => matchTargets(targets, cur.picks), [targets, cur.picks]);
  const candidates = useMemo(() => {
    const out = { space: new Set<string>(), character: new Set<string>(), connection: new Set<string>(), player: new Set<string>(), confirm: false, prompts: new Set<string>() };
    for (const t of matching) {
      const st = nextStep(t, cur.picks);
      if (!st) continue;
      const v = fieldValue(t, st.field);
      out.prompts.add(st.prompt);
      if (st.pick === 'confirm') out.confirm = true;
      else if (v) out[st.pick].add(v);
    }
    return out;
  }, [matching, cur.picks]);

  const run = useCallback(
    async (action: GameAction) => {
      const blocked = tutorial?.allow?.(action);
      if (blocked) {
        say(blocked);
        play('error');
        return false;
      }
      setBusy(true);
      const r = await send(action);
      setBusy(false);
      if (!r.ok) {
        say(r.error);
        play('error');
        return false;
      }
      return true;
    },
    [send, say, play, tutorial],
  );

  const doMove = (o: MoveOption) => run({ type: 'move', characterId: o.characterId, path: o.path });

  const playCardTarget = (cardId: string, target: CardTarget) => run({ type: 'playCard', cardId, target });

  const pick = (field: Field, value: string) => {
    if (!selectedCard) return;
    const picks = { ...cur.picks, [field]: value };
    const m = matchTargets(targets, picks);
    const complete = m.filter((t) => !nextStep(t, picks));
    if (complete.length === 1 && m.length === 1) return void playCardTarget(selectedCard.id, complete[0]);
    if (complete.length > 1 && complete.every((t) => t.kind === 'characterPath')) {
      const t0 = complete[0] as Extract<CardTarget, { kind: 'characterPath' }>;
      const keys = new Set(complete.map((t) => (t as typeof t0).path.join('>')));
      const opts = enumerateMoves(view, t0.characterId, view.config.speedBoostSteps, false).filter((o) => keys.has(o.path.join('>')));
      const routes = distinctRoutes(opts);
      if (routes.length === 1) return void playCardTarget(selectedCard.id, { kind: 'characterPath', characterId: t0.characterId, path: routes[0].path });
      return set({ picks, route: { options: routes, index: 0, forCard: { cardId: selectedCard.id } } });
    }
    if (complete.length >= 1 && m.length === complete.length) return void playCardTarget(selectedCard.id, complete[0]);
    set({ picks });
  };

  const confirmRoute = () => {
    const r = cur.route;
    if (!r) return;
    const o = r.options[r.index];
    if (r.forCard) void playCardTarget(r.forCard.cardId, { kind: 'characterPath', characterId: o.characterId, path: o.path });
    else void doMove(o);
  };

  const onCharacter = (id: string) => {
    const c = view.characters[id];
    if (selectedCard && candidates.character.has(id)) {
      const st = matching.map((t) => nextStep(t, cur.picks)).find((s) => s && s.pick === 'character');
      if (st) return pick(st.field, id);
    }
    if (selectedCard && !candidates.character.size && candidates.space.has(c.space)) return onSpace(c.space);
    if (cur.selected && byTarget[c.space]) return onSpace(c.space);
    if (myTurn && phase === 'move' && c.owner === me) {
      if (c.recovering) {
        say(`${CHARACTER_INFO[c.kind].name} is recovering from a capture and can't move this turn.`);
        return set({ inspect: id });
      }
      if (!movable.has(id)) {
        say(`${CHARACTER_INFO[c.kind].name} has no legal move with this roll.`);
        return set({ inspect: id });
      }
      return set({ selected: cur.selected === id ? null : id, inspect: id, route: null });
    }
    set({ inspect: id });
  };

  const onSpace = (id: string) => {
    if (selectedCard) {
      if (candidates.space.has(id)) {
        const st = matching.map((t) => nextStep(t, cur.picks)).find((s) => s && s.pick === 'space');
        if (st) return pick(st.field, id);
      }
      return say(Array.from(candidates.prompts)[0] ?? 'Choose one of the highlighted targets.');
    }
    if (cur.selected) {
      const opts = byTarget[id];
      if (opts) {
        const routes = distinctRoutes(opts);
        if (routes.length === 1) return void doMove(routes[0]);
        return set({ route: { options: routes, index: 0, forCard: null } });
      }
      const ownHere = Object.values(view.characters).filter((c) => c.space === id && c.owner === me && movable.has(c.id));
      if (ownHere.length) {
        const i = ownHere.findIndex((c) => c.id === cur.selected);
        return set({ selected: ownHere[(i + 1) % ownHere.length].id, route: null });
      }
      return say(explainSpace(view, cur.selected, id, view.turn.steps ?? 0));
    }
    if (myTurn && phase === 'move') {
      const ownHere = Object.values(view.characters).filter((c) => c.space === id && c.owner === me && movable.has(c.id));
      if (ownHere.length) return set({ selected: ownHere[0].id, inspect: ownHere[0].id });
      return say('First tap one of your glowing characters.');
    }
  };

  const onConnection = (id: string) => {
    if (selectedCard && candidates.connection.has(id)) pick('connectionId', id);
  };

  const chooseCard = (cardId: string) => {
    if (cur.cardId === cardId) return set({ cardId: null, picks: {}, route: null });
    const card = view.hand.find((c) => c.id === cardId)!;
    const a = me ? cardAvailability(view, me, card) : { playable: false as const, reason: 'Spectating.' };
    if (!a.playable) say(`${CARD_INFO[card.type].name}: ${a.reason}`);
    set({ cardId, picks: {}, route: null, selected: null });
  };

  // Keyboard shortcuts: R = roll, E = end turn, Esc = cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (rulesOpen || settingsOpen || leaveOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') set({ selected: null, cardId: null, picks: {}, route: null });
      if (!myTurn || busy) return;
      if ((e.key === 'r' || e.key === 'R') && phase === 'roll') void run({ type: 'roll' });
      if ((e.key === 'e' || e.key === 'E') && phase === 'action') void run({ type: 'endTurn' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [myTurn, busy, phase, run, set, rulesOpen, settingsOpen, leaveOpen]);

  // ------------------------------------------------------------- board highlights
  const highlights: BoardHighlights = useMemo(() => {
    const h: BoardHighlights = { spaces: {}, connections: {}, characters: {}, coach: tutorial?.coach };
    if (cur.route) {
      h.route = cur.route.options[cur.route.index].path;
      const o = cur.route.options[cur.route.index];
      h.spaces![o.target] = o.captures.length || o.shieldBlocked ? 'capture' : o.bank ? 'bank' : 'move';
      return h;
    }
    if (selectedCard && availability?.playable) {
      for (const s of candidates.space) h.spaces![s] = 'target';
      for (const c of candidates.connection) h.connections![c] = true;
      for (const c of candidates.character) h.characters![c] = 'target';
      return h;
    }
    if (myTurn && phase === 'move') {
      for (const id of movable) h.characters![id] = 'select';
      for (const [target, opts] of Object.entries(byTarget)) {
        const kind: SpaceHighlight = opts.some((o) => o.captures.length || o.shieldBlocked)
          ? 'capture'
          : opts.some((o) => o.bank)
            ? 'bank'
            : opts.some((o) => o.pickup)
              ? 'pickup'
              : 'move';
        h.spaces![target] = kind;
      }
    }
    return h;
  }, [cur.route, selectedCard, availability?.playable, candidates, myTurn, phase, movable, byTarget, tutorial?.coach]);

  // ------------------------------------------------------------- prompts
  const turnLeft = view.turn.deadline ? view.turn.deadline - now : null;
  const matchLeft = view.endsAt ? view.endsAt - now : null;
  const steps = view.turn.steps ?? 0;

  let prompt: string;
  if (!playing) prompt = 'Match over!';
  else if (!myTurn) prompt = `Waiting for ${current.name}${current.isAI ? ' (AI is thinking…)' : ''}`;
  else if (phase === 'roll') prompt = 'Your turn! Roll the die.';
  else if (phase === 'move')
    prompt = cur.route
      ? 'Several routes lead there — pick one.'
      : cur.selected
        ? `Tap a glowing space up to ${steps} step${steps === 1 ? '' : 's'} away. You may stop early.`
        : `You can move ${steps}${view.turn.slowed ? ' (slowed)' : ''}. Tap a glowing character.`;
  else if (phase === 'action')
    prompt = selectedCard
      ? availability?.playable
        ? Array.from(candidates.prompts)[0] ?? 'Choose a target.'
        : `${CARD_INFO[selectedCard.type].name}: ${availability?.reason}`
      : view.turn.cardPlayed
        ? 'Card played. End your turn when ready.'
        : 'Play one card (optional), then end your turn.';
  else prompt = 'Your hand is full — choose what to do with the new card.';

  const inspectChar = cur.inspect ? view.characters[cur.inspect] : null;
  const isLocal = mode !== 'online';

  // ------------------------------------------------------------- pieces of layout
  const actionPanel = (
    <div className="panel p-3" data-tutorial="actions">
      <div className="flex items-center gap-3">
        <div data-tutorial="die">
          <Die value={view.turn.roll} rollId={view.turn.number} size={56} reducedMotion={reducedMotion} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#4a5374] uppercase">
            <EmblemBadge theme={currentTheme} size={18} />
            {myTurn ? 'Your turn' : `${current.name}'s turn`}
            {turnLeft !== null && playing && (
              <span className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums ${turnLeft < 8000 ? 'bg-[#ffe0d6] text-[#a3300b]' : 'bg-white text-[#2c3558]'}`} aria-label={`Turn time left ${formatClock(turnLeft)}`}>
                <Hourglass size={12} aria-hidden="true" /> {formatClock(turnLeft)}
              </span>
            )}
          </div>
          <p className="font-display mt-1 text-[17px] leading-snug font-semibold" aria-live="polite">
            {prompt}
          </p>
        </div>
      </div>
      {turnLeft !== null && playing && view.config.turnDurationMs > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#efe5cf]" aria-hidden="true">
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, (turnLeft / view.config.turnDurationMs) * 100))}%`, background: currentTheme.color }} />
        </div>
      )}

      {cur.route && (
        <div className="mt-3 space-y-1.5" role="radiogroup" aria-label="Choose a route">
          {cur.route.options.map((o, i) => (
            <button
              key={o.path.join('>')}
              role="radio"
              aria-checked={cur.route!.index === i}
              onClick={() => set({ route: { ...cur.route!, index: i } })}
              onMouseEnter={() => set({ route: { ...cur.route!, index: i } })}
              className={`w-full rounded-xl border-2 px-3 py-2 text-left text-sm ${cur.route!.index === i ? 'border-[#f4a81d] bg-[#fff4d6]' : 'border-transparent bg-white/80'}`}
            >
              <span className="font-display font-semibold">Route {i + 1}</span> — {describeRoute(view, o)}
            </button>
          ))}
          <div className="flex gap-2 pt-1">
            <button className="btn btn-primary flex-1" onClick={confirmRoute} disabled={busy}>
              Go this way
            </button>
            <button className="btn btn-ghost" onClick={() => set({ route: null, picks: {} })}>
              Back
            </button>
          </div>
        </div>
      )}

      {!cur.route && myTurn && (
        <div className="mt-3 flex flex-wrap gap-2">
          {phase === 'roll' && (
            <button className="btn btn-primary flex-1 text-lg" onClick={() => void run({ type: 'roll' })} disabled={busy} data-tutorial="roll" aria-keyshortcuts="R">
              <Dice5 size={22} aria-hidden="true" /> Roll the die
            </button>
          )}
          {phase === 'move' && cur.selected && (
            <button className="btn btn-ghost" onClick={() => set({ selected: null })}>
              Choose another character
            </button>
          )}
          {phase === 'action' && selectedCard && availability?.playable && (
            <>
              {candidates.player.size > 0 &&
                view.players
                  .filter((p) => candidates.player.has(p.id))
                  .map((p) => (
                    <button key={p.id} className="btn btn-ghost" onClick={() => pick('playerId', p.id)}>
                      <EmblemBadge theme={seatTheme(p.seat)} size={20} /> {p.name}
                    </button>
                  ))}
              {candidates.confirm && (
                <button className="btn btn-green" onClick={() => pick('confirm', 'yes')} disabled={busy}>
                  {CONFIRM_LABEL[selectedCard.type] ?? `Play ${CARD_INFO[selectedCard.type].name}`}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => set({ cardId: null, picks: {} })}>
                Cancel card
              </button>
            </>
          )}
          {phase === 'action' && (
            <button className="btn btn-blue ml-auto" onClick={() => void run({ type: 'endTurn' })} disabled={busy} data-tutorial="end-turn" aria-keyshortcuts="E">
              End turn
            </button>
          )}
        </div>
      )}

      {inspectChar && (
        <div className="mt-3 rounded-xl bg-white/80 p-2.5 text-sm" aria-live="polite">
          <div className="font-display font-semibold">
            {inspectChar.owner === me ? 'Your' : `${view.players.find((p) => p.id === inspectChar.owner)?.name}'s`} {CHARACTER_INFO[inspectChar.kind].name} ·{' '}
            <span className="text-[#6a3fd0]">{CHARACTER_INFO[inspectChar.kind].abilityName}</span>
          </div>
          <p className="leading-snug text-[#3b4366]">{CHARACTER_INFO[inspectChar.kind].ability}</p>
          <p className="mt-1 text-xs text-[#4a5374]">
            {[
              inspectChar.carrying && 'Carrying treasure.',
              inspectChar.power?.type === 'shield' && 'Shield: blocks the next capture.',
              inspectChar.power?.type === 'attack_boost' && 'Attack Boost: can capture while passing through on its next move.',
              inspectChar.immune && 'Immune until its owner’s next turn.',
              inspectChar.recovering && 'Recovering: cannot move during its owner’s next turn.',
            ]
              .filter(Boolean)
              .join(' ') || 'No active effects.'}
          </p>
        </div>
      )}
    </div>
  );

  const hand = (
    <div data-tutorial="hand">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="text-base font-semibold">Your cards</h2>
        <span className="text-xs text-[#4a5374]">
          {view.hand.length}/{view.config.handLimit} · deck {view.deckCount}
        </span>
      </div>
      {view.hand.length === 0 ? (
        <p className="text-sm text-[#4a5374]">No cards. Land on a scroll space to draw one.</p>
      ) : (
        <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pt-3 pb-2 lg:grid lg:grid-cols-2 lg:overflow-visible">
          {view.hand.map((c) => {
            const a = me ? cardAvailability(view, me, c) : null;
            return (
              <CardView
                key={c.id}
                fluid
                type={c.type}
                selected={cur.cardId === c.id}
                disabled={!a?.playable}
                reason={a && !a.playable ? a.reason : null}
                onClick={() => chooseCard(c.id)}
                reducedMotion={reducedMotion}
              />
            );
          })}
        </div>
      )}
    </div>
  );

  const finished = view.status === 'finished' && view.result && !tutorial?.hideResults;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center gap-2 px-2 py-2 sm:px-4">
        <button className="btn btn-ghost icon-btn" onClick={() => setLeaveOpen(true)} aria-label="Leave game">
          <LogOut size={20} />
        </button>
        <div className="font-display hidden text-xl font-bold tracking-tight sm:block">
          Kingdom <span className="text-[#e0532d]">Chaos</span>
        </div>
        <div className="mx-auto flex items-center gap-2">
          {matchLeft !== null && (
            <div className="panel flex items-center gap-1.5 rounded-full! px-3 py-1.5 text-sm font-bold tabular-nums" aria-label={`Match time left ${formatClock(matchLeft)}`} data-tutorial="match-timer">
              <Timer size={16} aria-hidden="true" /> {formatClock(matchLeft)}
            </div>
          )}
          {controller.connection && controller.connection !== 'connected' && (
            <div className="flex items-center gap-1.5 rounded-full bg-[#ffe0d6] px-3 py-1.5 text-sm font-bold text-[#8c2a10]" role="status">
              <WifiOff size={16} aria-hidden="true" /> {controller.connection === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
            </div>
          )}
        </div>
        <button className="btn btn-primary icon-btn" onClick={() => setRulesOpen(true)} aria-label="Rules" data-tutorial="rules">
          <CircleHelp size={22} />
          <span className="hidden sm:inline">Rules</span>
        </button>
        <button className="btn btn-ghost icon-btn" onClick={() => update({ muted: !settings.muted })} aria-label={settings.muted ? 'Unmute' : 'Mute'} aria-pressed={settings.muted}>
          {settings.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <button className="btn btn-ghost icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          <Settings size={20} />
        </button>
      </header>

      <main className={`mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-3 px-2 pb-3 sm:px-4 lg:grid-cols-[270px_minmax(0,1fr)_340px] ${tutorial?.reserveBottom ? 'max-sm:pb-[50dvh]' : ''}`}>
        <aside className="hidden lg:block" aria-label="Players">
          <div className="panel scrollbar-thin max-h-[calc(100dvh-90px)] overflow-y-auto p-2.5">
            <PlayersPanel view={view} presence={controller.presence} onInspect={(id) => set({ inspect: id })} />
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-col items-center" aria-label="Board">
          <div className="relative aspect-square w-full max-w-[min(100%,calc(100dvh-90px))]" data-tutorial="board">
            <Board
              state={view}
              highlights={highlights}
              selectedCharacter={cur.selected}
              viewerId={me}
              reducedMotion={reducedMotion}
              onSpace={onSpace}
              onCharacter={onCharacter}
              onConnection={onConnection}
            />
            <AnimatePresence>
              {toast && (
                <motion.div
                  key={toast.id}
                  role="status"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-x-4 bottom-3 mx-auto max-w-md rounded-2xl bg-[#1d2440]/92 px-4 py-2.5 text-center text-[15px] font-semibold text-white shadow-[var(--shadow-pop)]"
                >
                  {toast.text}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        <aside className="scrollbar-thin flex min-w-0 flex-col gap-3 lg:max-h-[calc(100dvh-76px)] lg:overflow-y-auto lg:pb-2" aria-label="Actions and cards">
          {actionPanel}
          <div className="panel hidden p-3 lg:block">{hand}</div>
          <div className="panel hidden p-3 lg:block">
            <h2 className="mb-1.5 text-base font-semibold">Active effects</h2>
            <EffectsPanel view={view} />
          </div>
          <div className="panel scrollbar-thin hidden max-h-64 overflow-y-auto p-3 lg:block">
            <h2 className="mb-1.5 text-base font-semibold">Recent actions</h2>
            <LogPanel view={view} />
          </div>

          {/* Mobile tabs */}
          <div className="panel p-2 lg:hidden">
            <div role="tablist" aria-label="Game panels" className="mb-2 grid grid-cols-4 gap-1">
              {(['hand', 'players', 'effects', 'log'] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`min-h-11 rounded-xl text-sm font-bold capitalize ${tab === t ? 'bg-[#1d2440] text-white' : 'bg-white/70'}`}
                >
                  {t === 'hand' ? `Cards (${view.hand.length})` : t}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="px-1">
              {tab === 'hand' && hand}
              {tab === 'players' && <PlayersPanel view={view} presence={controller.presence} onInspect={(id) => set({ inspect: id })} />}
              {tab === 'effects' && <EffectsPanel view={view} />}
              {tab === 'log' && <LogPanel view={view} />}
            </div>
          </div>
        </aside>
      </main>

      {tutorial?.overlay}

      <Modal open={myTurn && phase === 'drawChoice'} onClose={() => {}} title="Your hand is full" dismissible={false}>
        <p className="mb-3">You earned a card, but you can only hold {view.config.handLimit}. Discard one to draw a new card, or keep your hand.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {view.hand.map((c) => (
            <div key={c.id} className="flex flex-col items-center gap-1.5">
              <CardView type={c.type} compact reducedMotion={reducedMotion} />
              <button className="btn btn-ghost text-sm" onClick={() => void run({ type: 'resolveDraw', discardCardId: c.id })}>
                Discard
              </button>
            </div>
          ))}
        </div>
        <button className="btn btn-blue mt-4 w-full" onClick={() => void run({ type: 'resolveDraw', discardCardId: null })} data-autofocus>
          Keep my hand (decline the draw)
        </button>
      </Modal>

      <RulesPanel
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        activeMatch={playing && mode !== 'tutorial' ? (isLocal ? 'local' : 'online') : null}
        onLeaveMatch={onExit}
      />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title={mode === 'online' && playing ? 'Leave this match?' : 'Leave the game?'}>
        <p className="mb-4">
          {mode === 'online' && playing
            ? 'The match continues without you — your turns will be played automatically with basic moves.'
            : mode === 'tutorial'
              ? 'Your tutorial progress for this session will be lost.'
              : 'This local game will end.'}
        </p>
        <div className="flex gap-2">
          <button className="btn btn-danger flex-1" onClick={onExit}>
            Leave
          </button>
          <button className="btn btn-ghost flex-1" onClick={() => setLeaveOpen(false)} data-autofocus>
            Stay
          </button>
        </div>
      </Modal>
      {finished && <ResultsOverlay view={view} primary={results?.primary} secondary={results?.secondary ?? { label: 'Main menu', onClick: onExit }} />}
      <div className="sr-only" aria-live="polite">
        {view.log.at(-1)?.text}
      </div>
    </div>
  );
}
