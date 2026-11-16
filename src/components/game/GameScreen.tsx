'use client';

import { motion } from 'framer-motion';
import { BookOpen, ChevronDown, Compass, Hourglass, LogOut, Map as MapIcon, Repeat, Settings, SkipForward, Timer, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_INFO,
  CHARACTER_INFO,
  FEATURE_INFO,
  LOCATION_INFO,
  STATUS_INFO,
  adventureOptions,
  aGem,
  gemList,
  gemsOf,
  charLabel,
  describeTarget,
  dragonNode,
  finalUnlocked,
  getBoard,
  movableCharacters,
  nodeName,
  noMoveReason,
  objectiveText,
  playableCards,
  type CardTarget,
  type CharacterKind,
  type GemKind,
  type Character,
  type GameAction,
  type MapId,
  type NodeDef,
  type PlayerView,
} from '@/engine';
import { alternatives, choose, consequences, destinations, routeNote, startPlan, whyNot } from '@/lib/movePlan';
import { royalPlaySeat, TEMPLE_UNLOCK_TITLE } from '@/lib/royalPath';
import { portrait, seatTheme } from '@/lib/seats';
import { useSettings } from '@/lib/settings';
import { EmblemBadge } from '../art/art';
import { GEM_NAMES, GemIcon } from '../art/gems';
import { TokenIcon } from '../art/token';
import { GameBoard, type BoardEffect, type BoardPlan, type BoardTargets } from '../board/GameBoard';
import { RulesPanel } from '../RulesPanel';
import { SettingsPanel } from '../SettingsPanel';
import { Modal } from '../ui/Modal';
import { CardView } from './CardView';
import { Die } from './Die';
import { GuidePanel, PlateDots, RulesRail, plateLine } from './GuidePanel';
import { MapGuide } from './MapGuide';
import { ObjectiveStrip } from './ObjectiveStrip';
import { ResultsOverlay } from './ResultsOverlay';
import { formatClock, useNow } from './useNow';

export type SendResult = { ok: true } | { ok: false; error: string };

export interface Presence {
  connected: boolean;
  left: boolean;
  isHost: boolean;
}

export interface GameController {
  view: PlayerView;
  mode: 'online' | 'practice' | 'hotseat' | 'tutorial';
  send: (action: GameAction) => Promise<SendResult>;
  connection?: 'connected' | 'reconnecting' | 'offline';
  presence?: Record<string, Presence>;
  clockSkew?: number;
}

export interface TutorialHooks {
  coach?: string[];
  allow?: (a: GameAction) => string | null;
  onSelect?: (characterId: string) => void;
  overlay?: React.ReactNode;
  hideResults?: boolean;
  reserveBottom?: boolean;
}

interface Props {
  controller: GameController;
  onExit: () => void | Promise<void>;
  results?: { primary?: { label: string; onClick: () => void }; secondary?: { label: string; onClick: () => void } };
  tutorial?: TutorialHooks;
}

const STALE = /out of date/i;

const PRONOUN: Record<CharacterKind, string> = { king: 'He', queen: 'She', witch: 'She', knight: 'He' };

interface Banner {
  id: number;
  title: string;
  sub: string;
  tone: 'gem' | 'good' | 'bad' | 'gold';
  gem?: GemKind;
}

function targetLabel(view: PlayerView, t: CardTarget): string {
  const who = (id: string) => (view.characters[id] ? charLabel(view, id) : 'character');
  switch (t.kind) {
    case 'edge':
      return describeTarget(view.boardId, t.edgeId);
    case 'node':
      return nodeName(view.boardId, t.node);
    case 'character':
      return who(t.characterId);
    case 'path':
      return `${who(t.characterId)} → ${nodeName(view.boardId, t.path[t.path.length - 1])}`;
    case 'swap':
      return `Swap ${who(t.characterId)} with ${who(t.targetId)}`;
    case 'dragonTo':
      return `Roar the dragon to ${nodeName(view.boardId, t.node)}`;
    case 'player':
      return view.players.find((p) => p.id === t.playerId)?.name ?? 'player';
  }
}

/** One choice per destination: the shortest Magic Boots route. */
function shortestPaths(targets: CardTarget[]): CardTarget[] {
  const best = new Map<string, Extract<CardTarget, { kind: 'path' }>>();
  const rest: CardTarget[] = [];
  for (const t of targets) {
    if (t.kind !== 'path') {
      rest.push(t);
      continue;
    }
    const key = `${t.characterId}:${t.path[t.path.length - 1]}`;
    const cur = best.get(key);
    if (!cur || t.path.length < cur.path.length) best.set(key, t);
  }
  return [...rest, ...best.values()];
}

function locationTip(node: NodeDef, view: PlayerView): string {
  const { board } = getBoard(view.boardId);
  const parts = [node.name + '.'];
  const over = view.transforms[node.id];
  if (over) parts.push(over === 'mountain' ? 'Now a mountain: its paths are closed.' : 'Now a river: its paths are closed.');
  const entry = board.houses.find((h) => h.entry === node.id);
  const fork = board.houses.find((h) => h.branch === node.id);
  const trail = node.trail && node.trail !== 'main' ? board.trails.find((t) => t.id === node.trail) : null;
  if (entry) parts.push(`The ${entry.name} plate. ${FEATURE_INFO.entry}`);
  else if (fork) parts.push(`${fork.name} ${FEATURE_INFO.fork}`);
  else if (trail) parts.push(`${trail.name}: ${trail.perk} Risk: ${trail.risk}`);
  else parts.push(LOCATION_INFO[node.type]?.rule ?? '');
  if (node.hazard) parts.push(FEATURE_INFO.hazard);
  if (node.safe && node.type === 'circuit') parts.push(FEATURE_INFO.safe);
  if (node.station) parts.push(`${GEM_NAMES[node.station]} — ${FEATURE_INFO.station}`);
  if (node.dig && node.type !== 'gemChamber') parts.push(FEATURE_INFO.dig);
  if (node.dungeonGate) parts.push(FEATURE_INFO.dungeonGate);
  if (node.dock) parts.push(`${FEATURE_INFO.dock} ${view.vehicles.boat === node.id ? 'The boat is here.' : 'The boat is at the other dock.'}`);
  if (node.airfield) parts.push(`${FEATURE_INFO.airfield} ${view.vehicles.plane === node.id ? 'The plane is here.' : 'The plane is at the other airfield.'}`);
  if (node.portal) parts.push(FEATURE_INFO.portal);
  if (node.terrainSite && !over) parts.push(FEATURE_INFO.terrainSite);
  if (node.teleport) parts.push(`${node.teleport.type === 'trap' ? 'Trap' : 'Shortcut'} — ${node.teleport.name}: ${node.teleport.text} Ending a move here sends the piece to ${nodeName(view.boardId, node.teleport.to)}.`);
  if (node.type === 'temple' && view.viewerId) parts.push(finalUnlocked(view, view.viewerId) ? 'Your Royal Path is open: land here exactly to win.' : objectiveText(view, view.viewerId));
  if (node.lane === 'final') parts.push('Not a shortcut. A piece can enter only after that house has banked four gems and made a cut, and that piece has touched all four house plates.');
  const here = Object.values(view.characters).filter((c) => c.node === node.id);
  if (here.length) parts.push(`Here: ${here.map((c) => charLabel(view, c.id)).join(', ')}.`);
  return parts.filter(Boolean).join(' ');
}

export function GameScreen({ controller, onExit, results, tutorial }: Props) {
  const { view, send, mode } = controller;
  const { reducedMotion, play, settings, update } = useSettings();
  const me = view.viewerId;
  const { nodes } = getBoard(view.boardId);
  const [cardId, setCardId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ kind: 'character' | 'node' | 'text'; id: string } | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [inspectPaths, setInspectPaths] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [busy, setBusy] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [crowd, setCrowd] = useState<string | null>(null);
  const [map, setMap] = useState<MapId>('island');
  const [sel, setSel] = useState<{ characterId: string; path: string[] | null } | null>(null);
  /** Card given up if a draw lands in a full hand (null: keep the hand and decline the new card). */
  const [replace, setReplace] = useState<string | null>(null);
  const [effects, setEffects] = useState<BoardEffect[]>([]);
  const [invalid, setInvalid] = useState<{ node: string; at: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fxId = useRef(0);
  const now = useNow(250, controller.clockSkew ?? 0);
  const fast = settings.pace === 'fast';

  const say = useCallback((text: string) => {
    setToast(text);
    setAnnounce(text);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!banners.length) return;
    const t = setTimeout(() => setBanners((list) => list.slice(1)), reducedMotion ? 3600 : 2900);
    return () => clearTimeout(t);
  }, [banners, reducedMotion]);

  const playing = view.status === 'playing';
  const myTurn = playing && view.turn.playerId === me;
  const current = view.players.find((p) => p.id === view.turn.playerId)!;
  const theme = seatTheme(current.seat);
  const mySeat = view.players.find((p) => p.id === me)?.seat ?? 0;
  const mine = useMemo(() => Object.values(view.characters).filter((c) => c.owner === me), [view.characters, me]);
  const label = useCallback((c: Character) => (c.owner === me ? `Your ${CHARACTER_INFO[c.kind].name}` : charLabel(view, c.id)), [me, view]);
  const handCards = view.hand;
  const handFull = handCards.length >= view.config.handLimit;
  const discardId = handFull && replace && handCards.some((c) => c.id === replace) ? replace : null;
  const options = useMemo(() => (me && myTurn ? adventureOptions(view, me, handCards) : []), [view, me, myTurn, handCards]);
  const cards = useMemo(() => (me ? playableCards(view, me, handCards) : []), [view, me, handCards]);
  const selected = cards.find((c) => c.card.id === cardId) ?? null;
  const shownTargets = useMemo(() => shortestPaths(selected?.targets ?? []), [selected]);
  const rolled = view.turn.move;
  const canPlan = myTurn && !!rolled && !view.turn.moveDone;
  const canRoll = myTurn && !rolled && !view.turn.moveDone;
  const movers = useMemo(() => (canPlan ? movableCharacters(view) : []), [canPlan, view]);
  const movable = useMemo(() => new Set(movers.map((m) => m.characterId)), [movers]);

  /** The preview, rebuilt from the latest view so it never drifts from the engine's options. */
  const plan = useMemo(() => {
    if (!sel || !canPlan) return null;
    const base = startPlan(view, sel.characterId);
    if (!base) return null;
    if (!sel.path) return base;
    const key = sel.path.join('>');
    const choice = base.options.find((o) => o.path.join('>') === key);
    return choice ? { ...base, choice } : null;
  }, [sel, canPlan, view]);
  const ends = useMemo(() => (plan ? destinations(plan) : new Map()), [plan]);

  useEffect(() => {
    if (sel && !plan) {
      // A selection the board no longer supports (the state moved on) is dropped with an explanation.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSel(null);
      if (canPlan) say('The board changed, so your preview was cleared. Choose your move again.');
    }
  }, [sel, plan, canPlan, say]);

  // ---------------------------------------------------------------- reacting to new states
  const lastVersion = useRef(view.version);
  const lastLog = useRef(view.log.length ? view.log[view.log.length - 1].id : 0);
  useEffect(() => {
    if (view.version === lastVersion.current) return;
    // A lower version is a fresh board (tutorial steps, rematches): drop announcements for the old one.
    if (view.version < lastVersion.current) setBanners([]);
    lastVersion.current = view.version;
    const ev = view.lastEvents;
    const types = new Set(ev.map((e) => e.type));
    if (types.has('gameOver')) play('win');
    else if (types.has('banked') || types.has('slay') || types.has('finalUnlocked')) play('bank');
    else if (types.has('cut') || types.has('defeated') || types.has('dragonFire')) play('capture');
    else if (types.has('pickedUp') || types.has('tame') || types.has('discovery')) play('pickup');
    else if (types.has('cardPlayed') || types.has('cardDrawn')) play('card');
    else if (types.has('rolled') || types.has('monster')) play('roll');
    else if (types.has('moved') || types.has('teleported')) play('step');
    if (ev.some((e) => e.type === 'turnStarted' && e.playerId === me)) setTimeout(() => play('turn'), 250);

    const fx: BoardEffect[] = [];
    const lines: string[] = [];
    const nm = (id: string) => (view.characters[id] ? label(view.characters[id]) : 'A character');
    const who = (pid: string) => (pid === me ? 'You' : (view.players.find((p) => p.id === pid)?.name ?? 'Someone'));
    const news: Omit<Banner, 'id'>[] = [];
    for (const e of ev) {
      if (e.type === 'pickedUp') {
        const c = view.characters[e.characterId];
        if (!e.from) fx.push({ id: ++fxId.current, node: c.node, text: `${GEM_NAMES[e.gem]} picked up`, tone: 'good' });
        lines.push(`${nm(e.characterId)} ${e.from ? 'took' : 'picked up'} ${aGem(e.gem)}.`);
        if (c.owner === me && !e.from) news.push({ title: `${GEM_NAMES[e.gem].toUpperCase()}!`, sub: `Your ${CHARACTER_INFO[c.kind].name} carries it. Bank it by passing or landing on your gate.`, tone: 'gem', gem: e.gem });
      } else if (e.type === 'banked') {
        const n = view.players.find((p) => p.id === e.playerId)?.gems.length ?? 0;
        fx.push({ id: ++fxId.current, node: view.characters[e.characterId].node, text: e.duplicate ? 'Spare gem returned' : `${GEM_NAMES[e.gem]} banked!`, tone: 'good' });
        lines.push(e.duplicate ? `${who(e.playerId)} already had ${aGem(e.gem)}.` : `${who(e.playerId)} banked ${aGem(e.gem)} (${n} of ${view.config.gemsRequired}).`);
        if (e.playerId === me && !e.duplicate) news.push({ title: `${GEM_NAMES[e.gem].toUpperCase()} BANKED!`, sub: `${n} of ${view.config.gemsRequired} gems banked.`, tone: 'gem', gem: e.gem });
      } else if (e.type === 'lap') {
        const c = view.characters[e.characterId];
        const plate = getBoard(view.boardId).board.houses.find((h) => h.seat === e.plate);
        if (c && plate) fx.push({ id: ++fxId.current, node: plate.plate, text: `${plate.name} plate ✓ (${e.checkpoint}/4)`, tone: 'good' });
        if (c?.owner === me && e.checkpoint === 4) news.push({ title: 'LAP COMPLETE!', sub: `Your ${CHARACTER_INFO[c.kind].name} has touched all four house plates. It may turn onto your Royal Path once it is open.`, tone: 'good' });
        lines.push(`${nm(e.characterId)} visited the ${plate?.name ?? ''} plate (${e.checkpoint} of 4).`);
      } else if (e.type === 'extraTurn') {
        const why = e.reason === 'six' ? 'rolled a 6' : 'made a cut';
        lines.push(`${who(e.playerId)} ${why} and earned an extra turn.`);
        if (e.playerId === me) news.push({ title: 'EXTRA TURN!', sub: `You ${why}. Finish this turn, then you go again.`, tone: 'good' });
      } else if (e.type === 'hazard') {
        fx.push({ id: ++fxId.current, node: e.node, text: e.sprung ? `Snare! (rolled ${e.roll})` : `Slipped past (rolled ${e.roll})`, tone: e.sprung ? 'bad' : 'good' });
        lines.push(`${nm(e.characterId)} rolled ${e.roll} at a trap-risk stone${e.sprung ? ' and was dragged back to the main road' : ' and slipped past'}.`);
      } else if (e.type === 'finalUnlocked') {
        lines.push(`${who(e.playerId)} opened their Royal Path.`);
        news.push(
          e.playerId === me
            ? { title: TEMPLE_UNLOCK_TITLE, sub: 'A piece that has touched all four plates can turn in at your fork. Land exactly on the temple to win.', tone: 'gold' }
            : { title: `${who(e.playerId).toUpperCase()} IS CLOSE!`, sub: 'Their Royal Path is open. Cut their pieces that have touched all four plates before they turn in!', tone: 'bad' },
        );
      } else if (e.type === 'defeated' && e.cause === 'fire') {
        const c = view.characters[e.characterId];
        fx.push({ id: ++fxId.current, node: c.node, text: 'Dragon Fire!', tone: 'cut' });
        lines.push(`${nm(e.characterId)} was burned by Dragon Fire and sent home.`);
        if (c.owner === me) news.push({ title: `YOUR ${CHARACTER_INFO[c.kind].name.toUpperCase()} WAS BURNED!`, sub: `${PRONOUN[c.kind]} returns to your castle.`, tone: 'bad' });
      } else if (e.type === 'cut') {
        fx.push({ id: ++fxId.current, node: e.node, text: 'Cut! Sent home', tone: 'cut' });
        lines.push(`${nm(e.characterId)} cut ${nm(e.targetId)} — sent home.`);
        const victim = view.characters[e.targetId];
        const mover = view.characters[e.characterId];
        const gem = e.stole.length ? e.stole.map((k) => GEM_NAMES[k]).join(' and the ') : null;
        if (victim.owner === me) news.push({ title: `YOUR ${CHARACTER_INFO[victim.kind].name.toUpperCase()} WAS CUT!`, sub: `${PRONOUN[victim.kind]} returns to your castle.${gem ? ` ${charLabel(view, mover.id)} takes the ${gem}.` : ''}`, tone: 'bad' });
        else if (mover.owner === me) news.push({ title: 'CUT!', sub: `${charLabel(view, victim.id)} goes home.${gem ? ` You take the ${gem}!` : ''}${view.stats[me]?.cuts === 1 ? ' Cut objective complete.' : ''}`, tone: 'good' });
      } else if (e.type === 'teleported' && (e.reason === 'trap' || e.reason === 'shortcut')) {
        fx.push({ id: ++fxId.current, node: e.from, text: e.name ?? (e.reason === 'trap' ? 'Trap!' : 'Shortcut!'), tone: e.reason === 'trap' ? 'bad' : 'good' });
        lines.push(`${nm(e.characterId)}: ${e.name} — to ${nodeName(view.boardId, e.to)}.`);
      } else if (e.type === 'discovery') lines.push(`${nm(e.characterId)} dug up ${e.found === 'gem' && e.gem ? aGem(e.gem) : e.found.replace('_', ' ')}.`);
      else if (e.type === 'rolled') lines.push(`${who(e.playerId)} rolled ${e.value}.`);
      else if (e.type === 'moved') {
        const end = e.path[e.path.length - 1];
        lines.push(`${nm(e.characterId)} moved to ${nodeName(view.boardId, end)}.`);
        const mover = view.characters[e.characterId];
        const branch = getBoard(view.boardId).board.houses.find((h) => h.seat === view.players.find((p) => p.id === me)?.seat)?.branch;
        if (mover && mover.owner === me && end === branch && !finalUnlocked(view, me)) {
          news.push({ title: 'Royal Path closed', sub: 'Bank all four gems and make a cut before a piece can turn in.', tone: 'bad' });
        } else if (mover && mover.owner === me && end === branch && mover.lap < 4) {
          news.push({ title: 'Lap not finished', sub: `Your ${CHARACTER_INFO[mover.kind].name} has touched ${mover.lap} of 4 plates (${plateLine(view, mover)}). It needs all four before entering the Royal Path.`, tone: 'bad' });
        }
      }
      else if (e.type === 'turnStarted') lines.push(e.playerId === me ? 'Your turn.' : `${view.players.find((p) => p.id === e.playerId)?.name}'s turn.`);
    }
    if (view.log.some((l) => l.id > lastLog.current && l.playerId === me && /No legal move/.test(l.text))) {
      const why = [...view.log].reverse().find((l) => /No legal move/.test(l.text));
      say(`${why?.text ?? 'No legal move.'} Your movement is skipped.`);
    }
    if (view.log.length) lastLog.current = view.log[view.log.length - 1].id;
    // Announcements and board effects react to game events; they are not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lines.length) setAnnounce(lines.join(' '));
    if (news.length) {
      let n = fxId.current;
      const ordered = [...news.filter((b) => b.title === TEMPLE_UNLOCK_TITLE), ...news.filter((b) => b.title !== TEMPLE_UNLOCK_TITLE)];
      setBanners((list) => [...list, ...ordered.map((b) => ({ ...b, id: ++n }))].slice(-3));
      fxId.current = n;
    }
    if (fx.length) {
      setEffects((list) => [...list, ...fx]);
      const ids = new Set(fx.map((f) => f.id));
      setTimeout(() => setEffects((list) => list.filter((f) => !ids.has(f.id))), reducedMotion ? 2600 : 1900);
    }
    const hop = [...ev].reverse().find((e) => e.type === 'teleported' && e.reason === 'dungeon' && view.characters[e.characterId]?.owner === me);
    if (hop && hop.type === 'teleported') setMap(nodes[hop.to]?.map ?? 'island');
  }, [view, me, play, label, say, reducedMotion, nodes]);

  // After rolling with exactly one piece able to move, select it; with one end, preview it.
  useEffect(() => {
    if (canPlan && !sel && movers.length === 1 && !cardId) {
      const m = movers[0];
      const endsOf = new Set(m.options.map((o) => o.path[o.path.length - 1]));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSel({ characterId: m.characterId, path: endsOf.size === 1 ? m.options[0].path : null });
    }
  }, [canPlan, sel, movers, cardId]);

  // The board follows the selected piece to its map.
  useEffect(() => {
    const at = sel ? view.characters[sel.characterId]?.node : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (at && nodes[at] && nodes[at].map !== map) setMap(nodes[at].map);
  }, [sel, view.characters, nodes, map]);

  // ---------------------------------------------------------------- actions
  const run = useCallback(
    async (action: GameAction): Promise<SendResult> => {
      const blocked = tutorial?.allow?.(action);
      if (blocked) {
        say(blocked);
        play('error');
        return { ok: false, error: blocked };
      }
      setBusy(true);
      const r = await send(action);
      setBusy(false);
      if (!r.ok) {
        say(STALE.test(r.error) ? 'The game moved on before your action arrived. The board is up to date now — try again.' : r.error);
        play('error');
      } else setCardId(null);
      return r;
    },
    [send, say, play, tutorial],
  );

  const committing = useRef<string | null>(null);
  const commit = useCallback(
    async (characterId: string, path: string[]) => {
      const key = `${view.version}:${characterId}:${path.join('>')}`;
      if (committing.current === key) return;
      committing.current = key;
      const r = await run({ type: 'move', characterId, path, discardCardId: discardId });
      committing.current = null;
      if (r.ok || STALE.test(r.error)) setSel(null);
      else setSel({ characterId, path: null });
    },
    [run, view.version, discardId],
  );

  const select = (c: Character) => {
    setCardId(null);
    setInspect(null);
    setCrowd(null);
    const m = movers.find((x) => x.characterId === c.id);
    const endsOf = new Set(m?.options.map((o) => o.path[o.path.length - 1]));
    setSel({ characterId: c.id, path: m && endsOf.size === 1 ? m.options[0].path : null });
    tutorial?.onSelect?.(c.id);
    setAnnounce(`${label(c)} selected. ${m?.note ?? ''}. ${endsOf.size === 1 ? 'One place to go: confirm with Move here.' : `${endsOf.size} places to go. Tap a glowing space to preview.`}`);
  };

  const flash = (node: string, message: string) => {
    setInvalid({ node, at: Date.now() });
    say(message);
    play('error');
  };

  const playTarget = (t: CardTarget) => {
    if (!selected) return;
    void run({ type: 'playCard', cardId: selected.card.id, target: t, discardCardId: discardId });
  };

  const preview = (node: string, quiet = false) => {
    if (!plan) return false;
    const next = choose(plan, node);
    if (!next?.choice) return false;
    setSel({ characterId: plan.characterId, path: next.choice.path });
    if (!quiet) {
      const what = consequences(view, plan.characterId, next.choice);
      setAnnounce(`Preview: ${nodeName(view.boardId, node)}. ${what.join('. ')}. Tap Move here to confirm.`);
      play('step');
    }
    return true;
  };

  const onPiece = (id: string) => {
    const c = view.characters[id];
    if (!c) return;
    const aimed = shownTargets.find((t) => (t.kind === 'character' && t.characterId === id) || (t.kind === 'swap' && t.targetId === id));
    if (aimed) return playTarget(aimed);
    if (plan && c.owner !== me && ends.has(c.node)) return void onNode(c.node);
    if (canPlan && movable.has(id)) {
      if (plan?.characterId === id) {
        if (plan.choice && ends.size > 1) {
          setSel({ characterId: id, path: null });
          setAnnounce('Preview cleared. Your roll is kept.');
        }
        return;
      }
      return select(c);
    }
    if (c.owner === me && canPlan) return say(`${label(c)} has no legal move with this roll.`);
    if (c.owner === me && canRoll) {
      setInspect({ kind: 'character', id });
      return say('Roll the die first, then choose who moves.');
    }
    if (c.owner !== me && plan) return flash(c.node, whyNot(view, plan, c.node));
    setInspect({ kind: 'character', id });
  };

  const onNode = (id: string) => {
    if (plan) {
      if (ends.has(id)) {
        const end = plan.choice?.path[plan.choice.path.length - 1];
        if (end === id) return void commit(plan.characterId, plan.choice!.path);
        return void preview(id);
      }
      const here = mine.filter((c) => c.node === id && movable.has(c.id));
      if (here.length === 1) return select(here[0]);
      if (here.length > 1) return setCrowd(id);
      if (id === view.characters[plan.characterId].node) return;
      return flash(id, whyNot(view, plan, id));
    }
    const path = shownTargets.find((t) => t.kind === 'path' && t.path[t.path.length - 1] === id);
    if (path) return playTarget(path);
    const at = shownTargets.find((t) => (t.kind === 'dragonTo' || t.kind === 'node') && t.node === id);
    if (at) return playTarget(at);
    const standing = mine.filter((c) => c.node === id && movable.has(c.id));
    if (standing.length === 1) return select(standing[0]);
    if (standing.length > 1) return setCrowd(id);
    setInspect({ kind: 'node', id });
  };

  const onEdge = (edgeId: string) => {
    const e = getBoard(view.boardId).board.edges.find((x) => x.id === edgeId);
    const t = shownTargets.find((x) => x.kind === 'edge' && (x.edgeId === edgeId || (!!e?.gate && getBoard(view.boardId).board.edges.find((y) => y.id === x.edgeId)?.gate === e.gate)));
    if (t) playTarget(t);
  };

  const onDragStart = (id: string) => {
    setDragging(true);
    if (!plan || plan.characterId !== id) select(view.characters[id]);
  };
  const onDragOver = (node: string) => {
    if (plan && ends.has(node) && plan.choice?.path[plan.choice.path.length - 1] !== node) preview(node, true);
  };
  const onDrop = (node: string | null) => {
    setDragging(false);
    if (!plan) return;
    if (node && ends.has(node)) {
      const route = plan.choice && plan.choice.path[plan.choice.path.length - 1] === node ? plan.choice : ends.get(node)![0];
      return void commit(plan.characterId, route.path);
    }
    if (node && node !== view.characters[plan.characterId].node) flash(node, `${whyNot(view, plan, node)} The piece went back.`);
    else if (!node) say('Drop the piece on a glowing space. It went back to where it was.');
  };

  // Keyboard shortcuts for the turn (the board itself is reachable with Tab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,select,[role="dialog"]')) return;
      if (e.key === 'r' && canRoll && !busy) void run({ type: 'roll' });
      else if ((e.key === 'm' || e.key === 'Enter') && plan?.choice && !busy && !t.closest('button,[role="button"]')) void commit(plan.characterId, plan.choice.path);
      else if (e.key === 'e' && myTurn && view.turn.moveDone && !view.turn.adventureDone && !busy) void run({ type: 'skipAdventure' });
      else if (e.key === 'Escape' && (sel || cardId)) {
        setSel(null);
        setCardId(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------------------------------------------------------------- board inputs
  const targets = useMemo<BoardTargets>(() => {
    const t: BoardTargets = { nodes: new Set(), edges: new Set(), characters: new Set() };
    for (const x of shownTargets) {
      if (x.kind === 'edge') t.edges.add(x.edgeId);
      else if (x.kind === 'node' || x.kind === 'dragonTo') t.nodes.add(x.node);
      else if (x.kind === 'character') t.characters.add(x.characterId);
      else if (x.kind === 'swap') t.characters.add(x.targetId);
      else if (x.kind === 'path') t.nodes.add(x.path[x.path.length - 1]);
    }
    return t;
  }, [shownTargets]);
  const coach = useMemo(() => new Set(tutorial?.coach ?? []), [tutorial?.coach]);
  const what = plan?.choice ? consequences(view, plan.characterId, plan.choice) : [];
  const boardPlan: BoardPlan | null = plan ? { characterId: plan.characterId, ends: [...ends.keys()], choice: plan.choice?.path ?? null, summary: what.join(' · ') } : null;
  const playSeat = royalPlaySeat(view, boardPlan?.characterId ?? null, boardPlan?.ends ?? []);
  const explainSeat = boardPlan && playSeat == null ? (view.players.find((p) => p.id === me)?.seat ?? null) : null;

  const turnLeft = view.turn.deadline ? view.turn.deadline - now : null;
  const matchLeft = view.endsAt ? view.endsAt - now : null;
  const companion = view.dragon.state === 'companion' ? view.characters[view.dragon.companion ?? ''] : null;
  const canRelease = myTurn && !view.turn.acted && companion?.owner === me;
  const planChar = plan ? view.characters[plan.characterId] : null;
  const mayAdventure = myTurn && !view.turn.adventureDone && !plan?.choice;
  const playableCount = cards.filter((c) => c.targets.length > 0).length;

  let headline: string;
  let sub = '';
  if (!playing) headline = 'Match over';
  else if (!myTurn) {
    headline = `${current.name}'s turn`;
    sub = current.isAI ? 'Thinking…' : 'Watch the board. Their moves appear below.';
  } else if (selected) {
    headline = `${CARD_INFO[selected.card.type].name}: choose a target`;
    sub = selected.targets.length ? 'Valid targets glow blue on the board and are listed below.' : (selected.reason ?? 'That card has no target right now.');
  } else if (canRoll) {
    headline = view.turn.bonus ? 'EXTRA TURN — Roll again' : 'YOUR TURN — Roll the die';
    sub = `${me ? objectiveText(view, me) : ''}${!view.turn.adventureDone && (options.length || playableCount) ? ' You may use your adventure action before or after moving.' : ''}`;
  } else if (plan?.choice && planChar) {
    const end = plan.choice.path[plan.choice.path.length - 1];
    const note = routeNote(view, plan.choice);
    headline = `Move your ${CHARACTER_INFO[planChar.kind].name} to ${nodeName(view.boardId, end)}?`;
    sub = `${what.length ? what.join(' · ') + '. ' : ''}${note ? note + ' ' : ''}Tap “Move here”, tap the space again, or pick another glowing space.`;
  } else if (plan && planChar) {
    headline = `${CHARACTER_INFO[planChar.kind].name.toUpperCase()} — ${plan.note}`;
    sub = `${ends.size} ${ends.size === 1 ? 'place' : 'places'} to go — the whole roll must be used. Tap a glowing space to preview the route and its trade-offs, or drag the piece there.`;
  } else if (canPlan) {
    headline = `You rolled ${rolled!.roll} — choose a piece`;
    sub = movers.length ? 'Pieces that can move have a dashed gold ring. Tap one on the board or below.' : me ? noMoveReason(view, me) : '';
  } else if (!view.turn.adventureDone) {
    headline = 'Adventure action (optional)';
    sub = options.length || playableCount ? 'Use a place, play a card, or end your turn.' : 'Nothing to do here. End your turn.';
  } else headline = 'Finishing the turn…';
  const feed = !myTurn && playing ? view.log.slice(-4).reverse() : [];

  const inspectedChar = inspect?.kind === 'character' ? view.characters[inspect.id] : null;
  const inspectedNode = inspect?.kind === 'node' ? nodes[inspect.id] : null;
  const focusChar = planChar ?? inspectedChar;
  const guideTurn = { headline, sub, steps: plan?.steps ?? null };
  const finished = view.status === 'finished' && view.result && !tutorial?.hideResults;
  const crowdPieces = crowd ? Object.values(view.characters).filter((c) => c.node === crowd) : [];

  return (
    <div className={`flex min-h-[100dvh] flex-col ${tutorial?.reserveBottom ? 'pb-[46dvh] sm:pb-0' : ''}`}>
      <header className="sticky top-0 z-30 flex min-h-12 flex-wrap items-center gap-1.5 bg-[#fffaf0]/85 px-2 py-1.5 backdrop-blur sm:px-4">
        <button className="btn btn-ghost icon-btn" onClick={() => setLeaveOpen(true)} aria-label="Leave game">
          <LogOut size={20} />
        </button>
        <div className="font-display hidden text-lg font-bold tracking-tight md:block">
          Kingdom <span className="text-[#e0532d]">Chaos</span> <span className="text-sm font-semibold text-[#6a3fd0]">Crown Quest</span>
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
          {matchLeft !== null && (
            <div className="panel flex items-center gap-1 rounded-full! px-2.5 py-1 text-sm font-bold tabular-nums" aria-label={`Match time left ${formatClock(matchLeft)}`} data-match-clock>
              <Timer size={15} aria-hidden="true" /> {formatClock(matchLeft)}
            </div>
          )}
          {view.config.roundLimit > 0 && (
            <div className="panel rounded-full! px-2.5 py-1 text-sm font-bold" aria-label={`Round ${view.turn.round} of ${view.config.roundLimit}`}>
              Round {view.turn.round}/{view.config.roundLimit}
            </div>
          )}
          {controller.connection && controller.connection !== 'connected' && (
            <div className="flex items-center gap-1 rounded-full bg-[#ffe0d6] px-2.5 py-1 text-sm font-bold text-[#8c2a10]" role="status">
              <WifiOff size={15} aria-hidden="true" /> {controller.connection === 'reconnecting' ? 'Reconnecting…' : 'Offline'}
            </div>
          )}
          <button className="btn btn-ghost icon-btn" onClick={() => update({ muted: !settings.muted })} aria-label={settings.muted ? 'Unmute' : 'Mute'} aria-pressed={settings.muted}>
            {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button className="btn btn-ghost px-3! py-1.5! lg:hidden!" onClick={() => setDrawerOpen(true)} data-guide-open>
            <BookOpen size={18} aria-hidden="true" /> Rules &amp; Guide
          </button>
          <button className="btn btn-ghost hidden! px-3! py-1.5! lg:inline-flex!" onClick={() => setRulesOpen(true)}>
            <BookOpen size={18} aria-hidden="true" /> Rules
          </button>
          <button className="btn btn-ghost icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <ObjectiveStrip view={view} me={me} presence={controller.presence} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2 px-2 pb-2 lg:grid-cols-[280px_minmax(0,1fr)_340px] lg:px-4">
        <aside className="hidden min-h-0 lg:block lg:h-[calc(100dvh-7.25rem)]" data-play-column="rules">
          <RulesRail />
        </aside>
        <section
          className="panel relative mx-auto aspect-square w-full max-w-[min(100%,calc(100dvh-7.5rem))] overflow-hidden p-0! lg:max-w-none lg:aspect-auto lg:h-[calc(100dvh-7.25rem)]"
          data-tutorial="board"
          data-play-column="board"
          aria-label={map === 'dungeon' ? 'Dungeon map' : 'Island map'}
        >
          <div className="absolute top-2 left-2 z-10 flex gap-1.5">
            <button className={`btn px-3! py-1! text-sm ${map === 'island' ? 'btn-primary' : 'btn-ghost bg-white/90!'}`} aria-pressed={map === 'island'} onClick={() => setMap('island')}>
              <MapIcon size={14} aria-hidden="true" /> Island
            </button>
            <button className={`btn px-3! py-1! text-sm ${map === 'dungeon' ? 'btn-primary' : 'btn-ghost bg-white/90!'}`} aria-pressed={map === 'dungeon'} onClick={() => setMap('dungeon')}>
              Dungeon
            </button>
            <button className="btn btn-ghost bg-white/90! px-3! py-1! text-sm" onClick={() => setGuideOpen(true)}>
              <Compass size={14} aria-hidden="true" /> Legend
            </button>
            {inspectPaths && (
              <button className="btn btn-ghost bg-white/90! px-3! py-1! text-sm" onClick={() => setInspectPaths(false)}>
                Hide Royal Paths
              </button>
            )}
          </div>
          <GameBoard
            view={view}
            map={map}
            me={me}
            movable={movable}
            plan={boardPlan}
            targets={targets}
            coach={coach}
            effects={effects}
            invalid={invalid}
            reduced={reducedMotion}
            fast={fast}
            resetKey={0}
            onPiece={onPiece}
            onNode={onNode}
            onEdge={onEdge}
            onConfirm={() => plan?.choice && void commit(plan.characterId, plan.choice.path)}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onCrowd={setCrowd}
            onExplain={(text) => setInspect({ kind: 'text', id: text })}
            royal={{ playSeat, inspect: inspectPaths, explainSeat }}
            platesDone={focusChar?.plates ?? null}
          />
          {dragging && <div className="sr-only">Dragging</div>}
          <BannerView banner={banners[0] ?? null} reduced={reducedMotion} />
          {(inspectedChar || inspectedNode || inspect?.kind === 'text') && (
            <div className="absolute bottom-2 left-2 z-10 max-w-[min(22rem,calc(100%-4.5rem))] rounded-2xl bg-white/95 p-3 shadow-lg" role="region" aria-label="Details">
              <div className="flex items-start gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {inspectedChar && <img src={portrait(view.players.find((p) => p.id === inspectedChar.owner)!.seat, inspectedChar.kind)} alt="" className="h-14 w-12 shrink-0 object-contain" />}
                <div className="min-w-0 flex-1">
                  {inspectedChar ? (
                    <>
                      <div className="font-display font-bold">{label(inspectedChar)}</div>
                      <div className="text-xs text-[#6a3fd0]">{CHARACTER_INFO[inspectedChar.kind].abilityName}</div>
                      <p className="mt-1 text-sm leading-snug">{CHARACTER_INFO[inspectedChar.kind].ability}</p>
                      <p className="mt-1 text-xs text-[#4a5374]">
                        At {nodeName(view.boardId, inspectedChar.node)} · plates {plateLine(view, inspectedChar)}
                        {(() => {
                          const gs = gemsOf(view, inspectedChar);
                          return gs.length ? ` · carrying ${gemList(gs.map((g) => g.kind))} — bank at the gate` : '';
                        })()}
                      </p>
                      {inspectedChar.shield && <p className="text-xs text-[#173e8c]">{STATUS_INFO.shield}</p>}
                      {inspectedChar.immune && <p className="text-xs text-[#5a3d00]">{STATUS_INFO.immune}</p>}
                      {companion?.id === inspectedChar.id && <p className="text-xs text-[#a3300b]">{STATUS_INFO.companion}</p>}
                    </>
                  ) : (
                    <p className="text-sm leading-snug">{inspectedNode ? locationTip(inspectedNode, view) : inspect?.id}</p>
                  )}
                </div>
                <button className="btn btn-ghost icon-btn" aria-label="Close details" onClick={() => setInspect(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-2 lg:h-[calc(100dvh-7.25rem)] lg:overflow-y-auto" data-play-column="turn" aria-label="Your turn and cards">
          <div className="panel p-3" data-tutorial="actions">
            <div className="flex items-center gap-2 rounded-xl px-2 py-1 text-sm font-extrabold tracking-wide uppercase" style={{ background: theme.light, color: theme.dark }} data-turn-banner>
              <EmblemBadge theme={theme} size={20} />
              <span>{!playing ? 'Match over' : myTurn ? 'Your turn' : `${current.name}'s turn`}</span>
              {turnLeft !== null && playing && (
                <span className={`ml-auto flex items-center gap-1 rounded-full px-2 py-0.5 tabular-nums normal-case ${turnLeft < 8000 ? 'bg-[#ffe0d6] text-[#a3300b]' : 'bg-white text-[#2c3558]'}`} aria-label={`Turn time left ${formatClock(turnLeft)}`} data-turn-clock>
                  <Hourglass size={12} aria-hidden="true" /> {formatClock(turnLeft)}
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                className={`relative shrink-0 rounded-2xl p-1 transition ${canRoll ? 'ring-4 ring-[#ffcf33] hover:scale-105' : 'opacity-90'}`}
                disabled={!canRoll || busy}
                onClick={() => void run({ type: 'roll' })}
                aria-label={canRoll ? 'Roll the die' : rolled ? `Die shows ${rolled.roll}` : 'Die'}
                data-dice
              >
                <Die value={rolled?.roll ?? null} rollId={view.version} size={52} reducedMotion={reducedMotion} fast={fast} />
                {canRoll && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#1d2440] px-2 py-0.5 text-[11px] font-bold text-white">Roll</span>}
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[17px] leading-tight font-bold" data-status>
                  {headline}
                </p>
                {sub && (
                  <p className="mt-0.5 text-sm leading-snug text-[#2c3558]" data-status-sub>
                    {sub}
                  </p>
                )}
                {myTurn && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold" aria-label="Actions this turn">
                    <span className={`rounded-full px-2 py-0.5 ${view.turn.moveDone ? 'bg-[#e6f6ec] text-[#155c36]' : 'bg-[#fff1c7] text-[#6b4a00]'}`}>Move: {view.turn.moveDone ? 'done' : rolled ? `rolled ${rolled.roll}` : 'to do'}</span>
                    <span className={`rounded-full px-2 py-0.5 ${view.turn.adventureDone ? 'bg-[#e6f6ec] text-[#155c36]' : 'bg-[#fff1c7] text-[#6b4a00]'}`}>Adventure: {view.turn.adventureDone ? 'done' : 'optional'}</span>
                    {(view.turn.extra || view.turn.bonus) && (
                      <span className="rounded-full bg-[#2e9e62] px-2 py-0.5 text-white" data-extra-status>
                        {view.turn.extra ? `Extra turn earned (${view.turn.extra === 'six' ? 'a 6' : 'a cut'})` : 'Extra turn'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {plan?.choice && (
              <div className="mt-2.5 flex flex-wrap gap-1.5" data-move-preview>
                <button className="btn btn-green flex-1 text-base" disabled={busy} onClick={() => void commit(plan.characterId, plan.choice!.path)} data-confirm>
                  Move here
                </button>
                {alternatives(plan) > 1 && (
                  <button className="btn btn-ghost text-sm" onClick={() => preview(plan.choice!.path[plan.choice!.path.length - 1])}>
                    <Repeat size={15} aria-hidden="true" /> Other route
                  </button>
                )}
                {ends.size > 1 && (
                  <button className="btn btn-ghost text-sm" onClick={() => setSel({ characterId: plan.characterId, path: null })}>
                    Change
                  </button>
                )}
              </div>
            )}

            {feed.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-xl bg-[#f6efdf] p-2 text-sm" aria-label="What just happened" data-feed>
                {feed.map((l) => (
                  <li key={l.id} className="leading-snug">
                    {l.text}
                  </li>
                ))}
              </ul>
            )}

            {myTurn && !view.turn.moveDone && (
              <div className="mt-2.5">
                <div className="mb-1 text-xs font-bold text-[#4a5374]">{rolled ? 'Who moves? (tap on the board or here)' : 'Your pieces'}</div>
                <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Choose a piece">
                  {mine.map((c) => {
                    const can = movable.has(c.id);
                    const on = plan?.characterId === c.id;
                    const gems = gemsOf(view, c);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`relative flex flex-col items-center rounded-xl border-2 px-1 pt-1 pb-0.5 text-[11px] font-bold transition ${on ? 'border-[#1d2440] bg-white' : can ? 'border-[#ffcf33] bg-[#fffbe8]' : 'border-transparent bg-white/60 text-[#6b7086]'}`}
                        aria-pressed={on}
                        aria-label={`${label(c)}, ${c.lap} of 4 plates${gems.length ? `, carrying ${gemList(gems.map((g) => g.kind))}` : ''}${can ? ', can move' : rolled ? ', cannot move' : ''}`}
                        data-character={c.id}
                        disabled={busy || (!!rolled && !can)}
                        onClick={() => (rolled ? onPiece(c.id) : say('Roll the die first, then choose who moves.'))}
                      >
                        <TokenIcon kind={c.kind} theme={seatTheme(mySeat)} size={30} />
                        {CHARACTER_INFO[c.kind].name}
                        <PlateDots view={view} ch={c} size={7} />
                        {gems.length > 0 && (
                          <span className="absolute top-0.5 right-0.5 flex flex-col">
                            {gems.map((g) => (
                              <GemIcon key={g.id} kind={g.kind} size={14} title={`Carrying ${aGem(g.kind)}`} />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mayAdventure && (options.length > 0 || canRelease || shownTargets.length > 0) && (
              <div className="mt-2.5" data-adventure>
                <div className="mb-1 text-xs font-bold text-[#4a5374]">Adventure action</div>
                <div className="flex flex-wrap gap-1.5">
                  {canRelease && (
                    <button className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run({ type: 'release' })} title="Free: release before you act. The dragon becomes wild where it is.">
                      Release the dragon (free)
                    </button>
                  )}
                  {options.map((o) => {
                    const a = o.action;
                    const withDiscard = o.mayDraw && a.type === 'dig' ? { ...a, discardCardId: discardId } : a;
                    const gem = a.type === 'dig' ? a.gem : undefined;
                    return (
                      <button key={o.label + o.characterId} className="btn btn-green text-sm" disabled={busy} title={o.detail} onClick={() => void run(withDiscard)} data-adventure-option={a.type}>
                        {gem && <GemIcon kind={gem} size={16} />}
                        {o.label}
                      </button>
                    );
                  })}
                  {shownTargets.map((t) => (
                    <button key={targetLabel(view, t)} className="btn btn-blue text-sm" disabled={busy} data-highlight="target" onClick={() => playTarget(t)}>
                      {targetLabel(view, t)}
                    </button>
                  ))}
                </div>
                {options.length > 0 && <p className="mt-1 text-xs text-[#4a5374]">{options[0].detail}</p>}
              </div>
            )}

            {myTurn && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {view.turn.moveDone && !view.turn.adventureDone && (
                  <button className="btn btn-primary text-sm" disabled={busy} onClick={() => void run({ type: 'skipAdventure' })} data-end-turn>
                    <SkipForward size={15} aria-hidden="true" /> End turn
                  </button>
                )}
                {selected && (
                  <button className="btn btn-ghost text-sm" onClick={() => setCardId(null)}>
                    Cancel card
                  </button>
                )}
              </div>
            )}
          </div>

          <details className="panel group p-3" data-tutorial="hand" open={handCards.length > 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <h2 className="text-base font-semibold">Your cards</h2>
              <span className="flex items-center gap-1 text-xs text-[#4a5374]">
                {handCards.length}/{view.config.handLimit} · deck {view.deckCount}
                <ChevronDown size={14} className="transition group-open:rotate-180" aria-hidden="true" />
              </span>
            </summary>
            {handCards.length === 0 ? (
              <p className="mt-1 text-sm text-[#4a5374]">No cards. The King draws one when he banks a gem, and dig sites can turn up cards.</p>
            ) : (
              <div className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pt-3 pb-1">
                {handCards.map((c) => {
                  const info = cards.find((p) => p.card.id === c.id);
                  return (
                    <CardView
                      key={c.id}
                      type={c.type}
                      compact
                      selected={cardId === c.id}
                      disabled={!info?.targets.length}
                      reason={info?.reason}
                      onClick={() => {
                        setSel(null);
                        setCardId(cardId === c.id ? null : c.id);
                      }}
                      reducedMotion={reducedMotion}
                    />
                  );
                })}
              </div>
            )}
            {handFull && (
              <label className="mt-2 block text-xs text-[#2c3558]">
                <span className="font-bold">Hand full ({view.config.handLimit}).</span> If you draw a card this turn:
                <select className="mt-1 block w-full rounded-lg border border-[#d8cdb4] bg-white px-2 py-1 text-sm" value={discardId ?? ''} onChange={(e) => setReplace(e.target.value || null)} data-discard-choice>
                  <option value="">Keep my hand (decline the new card)</option>
                  {handCards.map((c) => (
                    <option key={c.id} value={c.id}>
                      Discard {CARD_INFO[c.type].name} to keep the new card
                    </option>
                  ))}
                </select>
              </label>
            )}
          </details>

          <details className="panel p-3" aria-label="Game log" data-log>
            <summary className="flex cursor-pointer list-none items-center justify-between">
              <h2 className="text-base font-semibold">Event log</h2>
              <span className="max-w-[70%] truncate text-xs text-[#4a5374]">{view.log[view.log.length - 1]?.text}</span>
            </summary>
            <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto text-sm">
              {[...view.log].reverse().slice(0, 20).map((l) => (
                <li key={l.id}>{l.text}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[#4a5374]">
              Dragon: {view.dragon.state}
              {view.dragon.state !== 'companion' ? ` at ${nodeName(view.boardId, dragonNode(view))}` : companion ? ` with ${charLabel(view, companion.id)}` : ''} · Boat at {nodeName(view.boardId, view.vehicles.boat)} · Plane at{' '}
              {nodeName(view.boardId, view.vehicles.plane)}
            </p>
          </details>

          <p className="px-1 text-xs text-[#4a5374]">
            Keys: <kbd>R</kbd> roll · <kbd>Tab</kbd> to a piece or glowing space · <kbd>Enter</kbd> preview / choose · <kbd>M</kbd> move here · <kbd>E</kbd> end turn · <kbd>Esc</kbd> cancel · <kbd>+</kbd>/<kbd>−</kbd> zoom
          </p>
        </aside>
      </div>

      <div className="sr-only" aria-live="polite" data-announcer>
        {announce}
      </div>
      <AnimateToast text={toast} />
      {finished && view.result && <ResultsOverlay view={view} primary={results?.primary} secondary={results?.secondary} />}
      <RulesPanel open={rulesOpen} onClose={() => setRulesOpen(false)} activeMatch={mode === 'tutorial' ? null : mode === 'online' ? 'online' : 'local'} onLeaveMatch={onExit} />
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Modal open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Rules & Guide">
        <GuidePanel view={view} me={me} focusId={focusChar?.id ?? null} turn={guideTurn} compact />
        <button
          className="btn btn-ghost mt-2 w-full text-sm"
          onClick={() => {
            setDrawerOpen(false);
            setRulesOpen(true);
          }}
        >
          <BookOpen size={16} aria-hidden="true" /> Full rules with card pictures
        </button>
      </Modal>
      <MapGuide open={guideOpen} onClose={() => setGuideOpen(false)} showPaths={inspectPaths} onShowPaths={setInspectPaths} />
      <Modal open={!!crowd} onClose={() => setCrowd(null)} title={crowd ? `Pieces at ${nodeName(view.boardId, crowd)}` : 'Pieces'}>
        <ul className="space-y-1.5" data-crowd-picker>
          {crowdPieces.map((c) => {
            const can = movable.has(c.id) || targets.characters.has(c.id);
            return (
              <li key={c.id}>
                <button
                  className={`flex w-full items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left text-sm font-semibold ${can ? 'border-[#ffcf33] bg-[#fffbe8]' : 'border-transparent bg-[#f6efdf]'}`}
                  onClick={() => {
                    setCrowd(null);
                    onPiece(c.id);
                  }}
                >
                  <TokenIcon kind={c.kind} theme={seatTheme(view.players.find((p) => p.id === c.owner)!.seat)} size={30} />
                  <span className="flex-1">{label(c)}</span>
                  <span className="text-xs text-[#4a5374]">{can ? (movable.has(c.id) ? 'can move' : 'target') : 'details'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Leave this match?">
        <p className="mb-4">You can come back to an online room from the same tab. A local game stays on this screen until you leave.</p>
        <div className="flex gap-2">
          <button
            className="btn btn-danger"
            onClick={() => {
              setLeaveOpen(false);
              void onExit();
            }}
          >
            Leave
          </button>
          <button className="btn btn-ghost" onClick={() => setLeaveOpen(false)}>
            Stay
          </button>
        </div>
      </Modal>
      {tutorial?.overlay}
    </div>
  );
}

function AnimateToast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <motion.div role="status" className="fixed bottom-4 left-1/2 z-50 max-w-md -translate-x-1/2 rounded-2xl bg-[#1d2440] px-4 py-2 text-sm font-semibold text-white" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} data-toast>
      {text}
    </motion.div>
  );
}

const BANNER_TONE: Record<Banner['tone'], string> = {
  gem: 'bg-[#1d2440] text-white',
  good: 'bg-[#2e9e62] text-white',
  bad: 'bg-[#c8281e] text-white',
  gold: 'bg-gradient-to-r from-[#ffcf33] to-[#ffe38a] text-[#5a3d00]',
};

/** A short, big announcement over the board for the moments that change the objective. */
function BannerView({ banner, reduced }: { banner: Banner | null; reduced: boolean }) {
  if (!banner) return null;
  return (
    <motion.div
      key={banner.id}
      className={`pointer-events-none absolute top-12 left-1/2 z-20 w-[min(26rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl px-4 py-3 text-center shadow-xl ${BANNER_TONE[banner.tone]}`}
      initial={reduced ? false : { y: -16, opacity: 0, scale: 0.92 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      role="status"
      data-banner={banner.tone}
    >
      <div className="font-display flex items-center justify-center gap-2 text-2xl font-extrabold tracking-wide">
        {banner.gem && <GemIcon kind={banner.gem} size={30} />}
        {banner.title}
      </div>
      <p className="mt-0.5 text-sm font-semibold opacity-95">{banner.sub}</p>
    </motion.div>
  );
}
