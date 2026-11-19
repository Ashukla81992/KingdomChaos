'use client';

import { motion } from 'framer-motion';
import { BookOpen, ChevronDown, PanelLeftClose, PanelLeftOpen, Compass, Hourglass, LogOut, Map as MapIcon, Maximize, Minimize, Repeat, Settings, SkipForward, Timer, Volume2, VolumeX, WifiOff, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CARD_INFO,
  edgeRefusal,
  CHARACTER_INFO,
  FEATURE_INFO,
  LOCATION_INFO,
  STATUS_INFO,
  adventureOptions,
  protectionLabel,
  companionOf,
  dragonFireBlock,
  DUNGEON_GUIDE,
  monstersOf,
  templeBlockers,
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
  other,
  playableCards,
  whyStuck,
  type CardTarget,
  type CardType,
  type CharacterKind,
  type GemKind,
  type Character,
  type GameAction,
  type MapId,
  type MonsterId,
  type NodeDef,
  type PlayerView,
} from '@/engine';
import { arrivalFor, captureTargets, chooseRoute, templeBlockersFor } from '@/lib/boardPreview';
import { alternatives, choose, consequences, destinations, routeNote, startPlan, whyNot } from '@/lib/movePlan';
import { royalPlaySeat, TEMPLE_UNLOCK_TITLE } from '@/lib/royalPath';
import { portrait, seatTheme } from '@/lib/seats';
import { useSettings } from '@/lib/settings';
import { markBatch, recapLines, seenBatch, soundsFor, strikesFor, type Strike } from '@/lib/eventFeed';
import { EmblemBadge } from '../art/art';
import { GEM_NAMES, GemIcon } from '../art/gems';
import { TokenIcon } from '../art/token';
import { GameBoard, type BoardEffect, type BoardPlan, type BoardTargets } from '../board/GameBoard';
import { RulesPanel } from '../RulesPanel';
import { SettingsPanel } from '../SettingsPanel';
import { Modal } from '../ui/Modal';
import { CardView } from './CardView';
import { Die } from './Die';
import { EventCard } from './EventCard';
import { BattlePanel } from './BattlePanel';
import { GuidePanel, PlateDots, RulesRail, plateLine } from './GuidePanel';
import { KingdomProgress } from './KingdomProgress';
import { MapGuide } from './MapGuide';
import { ObjectiveStrip } from './ObjectiveStrip';
import { ResultsOverlay } from './ResultsOverlay';
import { TradePanel } from './TradePanel';
import { formatClock, useNow } from './useNow';
import { useUiScale } from '@/lib/useUiScale';

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
  /** [A5] Host-only control to end an online match early (confirmed by the caller). */
  hostEndMatch?: { label: string; onClick: () => void; busy?: boolean };
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
  else if (!(node.dungeonGate || node.dock || node.airfield || node.station || node.dig || node.teleport || node.hazard || node.safe || node.portal)) parts.push(LOCATION_INFO[node.type]?.rule ?? '');
  if (node.hazard) parts.push(FEATURE_INFO.hazard);
  if (node.safe && (node.type === 'circuit' || entry)) parts.push('Safe space: pieces may share it and nobody is captured here.');
  if (node.station) parts.push(`${GEM_NAMES[node.station]} — ${FEATURE_INFO.station}`);
  if (node.dig && node.type !== 'gemChamber') parts.push(FEATURE_INFO.dig);
  if (node.dungeonGate) parts.push(FEATURE_INFO.dungeonGate);
  if (node.dock) parts.push(`${FEATURE_INFO.dock} ${view.vehicles.boat === node.id ? 'The boat is here.' : 'The boat is at the other dock.'}`);
  if (node.airfield) parts.push(`${FEATURE_INFO.airfield} ${view.vehicles.plane === node.id ? 'The plane is here.' : 'The plane is at the other airfield.'}`);
  if (node.portal) parts.push(FEATURE_INFO.portal);
  if (node.terrainSite && !over) parts.push(FEATURE_INFO.terrainSite);
  if (node.teleport) parts.push(`${node.teleport.type === 'trap' ? 'Trap' : 'Shortcut'} — ${node.teleport.name}: ${node.teleport.text} Ending a move here sends the piece to ${nodeName(view.boardId, node.teleport.to)}.`);
  if (node.type === 'temple' && view.viewerId) {
    const pid = view.viewerId;
    // The temple gate explains exactly what is missing, kingdom-wide and for each piece.
    if (!finalUnlocked(view, pid)) parts.push(`Gate locked: your Royal Path opens once you bank one of each gem (${view.players.find((p) => p.id === pid)?.gems.length ?? 0} of 4 banked).`);
    else parts.push('Your Royal Path is open.');
    const pieces = Object.values(view.characters).filter((c) => c.owner === pid && !c.finished);
    for (const c of pieces) {
      const why = templeBlockers(view, c.id);
      parts.push(`${CHARACTER_INFO[c.kind].name}: ${why.length ? why.join(', ') : 'ready to enter (land here exactly)'}.`);
    }
  }
  const guide = DUNGEON_GUIDE.find((g) => g.node === node.id);
  if (guide) {
    parts.length = 1;
    parts.push(guide.rule);
    const m = view.monsters?.find((x) => x.home === node.id);
    if (m?.slain) parts.push(`The ${m.name} is slain: no fight here any more.`);
    else if (m) parts.push(`${m.hp ?? view.config.monsterHearts ?? 2} of ${view.config.monsterHearts ?? 2} hearts left. Attack it from 1 step away, burn it with Dragon Fire, or win its fight here: each hit takes a heart and knocks it out for a round; at 0 it is slain.`);
    if (m && !m.slain && m.restUntilRound > 0 && m.restUntilRound >= view.turn.round) parts.push(`The ${m.name} is resting after a defeat until the end of round ${m.restUntilRound}: no fight here for now.`);
    if (node.encounter?.monster === 'golem' && view.viewerId && view.shortcutsOpen?.[node.id]?.includes(view.viewerId)) parts.push('Your kingdom beat the Golem: your pieces take the shortcut here without a fight.');
  }
  if (node.lane === 'final') parts.push('Not a shortcut. A piece can enter only after that house has banked four gems and made a cut, and that piece has touched all four house plates.');
  const here = Object.values(view.characters).filter((c) => c.node === node.id);
  if (here.length) parts.push(`Here: ${here.map((c) => charLabel(view, c.id)).join(', ')}.`);
  return parts.filter(Boolean).join(' ');
}

export function GameScreen({ controller, onExit, results, tutorial, hostEndMatch }: Props) {
  const { view, send, mode } = controller;
  const { reducedMotion, play, settings, update } = useSettings();
  const uiScale = useUiScale();
  const railOpen = settings.rulesRail === 'open';
  const me = view.viewerId;
  const { nodes } = getBoard(view.boardId);
  const [cardId, setCardId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ kind: 'character' | 'node' | 'text'; id: string } | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  /** A tapped road waiting for confirmation: which card, which segment, what it would do. */
  const [edgePick, setEdgePick] = useState<{ cardId: string; target: CardTarget; edgeId: string; change: 'open' | 'close'; label: string } | null>(null);
  /** Dragon Fire: the chosen target, before the attack die is rolled. */
  const [fireTarget, setFireTarget] = useState<string | null>(null);
  /** Dragon Fire aiming mode: eligible rivals glow; tapping one previews the attack. */
  const [fireMode, setFireMode] = useState(false);
  /** One Dragon Fire request at a time: repeated taps never send a second attack. */
  const firing = useRef(false);
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
  const [strikes, setStrikes] = useState<Strike[]>([]);
  const [invalid, setInvalid] = useState<{ node: string; at: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeRival, setTradeRival] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'turn' | 'progress' | null>(null);
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
  const fireOptions = useMemo(() => options.filter((o) => o.action.type === 'dragonFire'), [options]);
  const fireChoice = fireTarget ? (fireOptions.find((o) => o.action.type === 'dragonFire' && o.action.targetId === fireTarget) ?? null) : null;
  /** Spaces where one of my pieces can act right now: those landmarks glow green. */
  const actionNodes = useMemo(() => new Set(options.filter((o) => o.action.type !== 'dragonFire').map((o) => view.characters[o.characterId]?.node).filter(Boolean) as string[]), [options, view.characters]);
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
  const ends = useMemo(() => (plan ? destinations(plan) : new Map<string, import('@/engine').MoveOption[]>()), [plan]);

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
  // Each resolved event batch is handled once per device and match, whatever order polls arrive in.
  const matchKey = `${view.startedAt}:${me ?? 'watch'}`;
  const handled = useRef(view.eventSeq ?? 0);
  const [recap, setRecap] = useState<string[] | null>(null);
  useEffect(() => {
    // Restoring a match (reload, reconnect, resume): no replay of old events, just a short recap.
    const seq = view.eventSeq ?? 0;
    const seen = seenBatch(matchKey);
    handled.current = Math.max(seq, seen);
    markBatch(matchKey, handled.current);
    const lines = recapLines(view.log);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (view.turn.number > 1 && lines.length && view.status === 'playing') setRecap(lines);
    // Only on mount and when a different match is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey]);
  useEffect(() => {
    if (!recap) return;
    const t = setTimeout(() => setRecap(null), 9000);
    return () => clearTimeout(t);
  }, [recap]);
  useEffect(() => {
    if (view.version === lastVersion.current) return;
    // A lower version is a fresh board (tutorial steps, rematches): drop announcements for the old one.
    if (view.version < lastVersion.current) {
      setBanners([]);
      handled.current = 0;
    }
    lastVersion.current = view.version;
    // Any new board state invalidates a pending road preview or fire target.
    setEdgePick(null);
    setFireTarget(null);
    setFireMode(false);
    const seq = view.eventSeq;
    // Already handled (a repeated poll, a retry, a stale instance): no sounds, effects or notices again.
    if (seq !== undefined && seq > 0 && seq <= handled.current) return;
    if (seq) {
      handled.current = seq;
      markBatch(matchKey, seq);
    }
    const ev = view.lastEvents;
    soundsFor(ev).forEach((s, i) => (i === 0 ? play(s) : setTimeout(() => play(s), i * 260)));
    const homeOf = (m: MonsterId) => monstersOf(view).find((x) => x.id === m)?.home;
    const hits = strikesFor(ev, homeOf, () => ++fxId.current);
    if (hits.length) {
      setStrikes((list) => [...list, ...hits].slice(-4));
      const ids = new Set(hits.map((h) => h.id));
      setTimeout(() => setStrikes((list) => list.filter((h) => !ids.has(h.id))), reducedMotion ? 2400 : 2200);
    }
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
        const why = e.reason === 'six' ? 'rolled a 6' : e.reason === 'temple' ? 'reached the Crown Temple' : 'made a cut';
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
      } else if (e.type === 'dragonFire' && e.hit === false) {
        const t = view.characters[e.targetId];
        if (t) fx.push({ id: ++fxId.current, node: t.node, text: `Fire missed (rolled ${e.roll})`, tone: 'blocked' });
        lines.push(`Dragon Fire at ${nm(e.targetId)}: attack die ${e.roll}, a miss.`);
      } else if (e.type === 'defeated' && e.cause === 'fire') {
        const c = view.characters[e.characterId];
        const burnt = ev.find((x) => x.type === 'dragonFire' && x.targetId === e.characterId);
        fx.push({ id: ++fxId.current, node: (burnt?.type === 'dragonFire' && burnt.at) || c.node, text: 'Dragon Fire!', tone: 'cut' });
        lines.push(`${nm(e.characterId)} was burned by Dragon Fire and sent home.`);
        if (c.owner === me) news.push({ title: `YOUR ${CHARACTER_INFO[c.kind].name.toUpperCase()} WAS BURNED!`, sub: `${PRONOUN[c.kind]} returns to your castle.`, tone: 'bad' });
      } else if (e.type === 'monsterHit') {
        const mName = e.monster === 'golem' ? 'Stone Golem' : 'Cave Spider';
        const home = monstersOf(view).find((m) => m.id === e.monster)?.home;
        if (home) fx.push({ id: ++fxId.current, node: home, text: !e.hit ? 'Missed!' : e.slain ? `${mName} slain!` : `Hit! ${e.hp} ♥ left`, tone: !e.hit ? 'blocked' : 'good' });
        lines.push(!e.hit ? `${nm(e.characterId)} missed the ${mName} (rolled ${e.roll}).` : e.slain ? `${nm(e.characterId)} slew the ${mName}!` : `${nm(e.characterId)} wounded the ${mName}: ${e.hp} heart${e.hp === 1 ? '' : 's'} left.`);
        if (e.slain) news.push({ title: `${mName.toUpperCase()} SLAIN!`, sub: e.monster === 'golem' ? 'Its shortcut is open to everyone.' : 'The slayer takes a power card.', tone: 'gold' });
      } else if (e.type === 'monsterEvent') {
        const c = e.characterId ? view.characters[e.characterId] : null;
        const mName = e.monster === 'golem' ? 'Stone Golem' : e.monster === 'spider' ? 'Cave Spider' : 'Monster';
        if (e.kind === 'attack' && c) {
          const what = e.outcome === 'blocked' ? 'protected: the Shield blocked it and broke' : e.effect === 'push' ? (e.to && e.to !== e.from ? `pushed back to ${nodeName(view.boardId, e.to)}` : 'shoved, but had nowhere to go') : `webbed: next move −${view.config.webPenalty ?? 2} (min 1)`;
          if (e.from) fx.push({ id: ++fxId.current, node: e.from, text: `${mName}!`, tone: 'bad' });
          if (e.to && e.to !== e.from) fx.push({ id: ++fxId.current, node: e.to, text: 'Pushed here', tone: 'bad' });
          if (e.effect === 'web' && e.outcome !== 'blocked') fx.push({ id: ++fxId.current, node: c.node, text: `Webbed! Next move −${view.config.webPenalty ?? 2}`, tone: 'bad' });
          lines.push(`Monster die ${e.die}: the ${mName}${e.outside ? ' climbed out of the Dragon Gate and' : ''} attacked ${nm(c.id)} — ${what}.`);
          if (c.owner === me) news.push({ title: `${mName.toUpperCase()} ATTACKS!`, sub: `Your ${CHARACTER_INFO[c.kind].name} was ${what}.`, tone: 'bad' });
        } else lines.push(`Monster die ${e.die}: ${e.kind === 'quiet' ? 'the dungeon is quiet' : `the ${mName} stays idle, nobody is in reach`}.`);
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
      else if (e.type === 'battleStarted') lines.push(`${nm(e.characterId)} faces the Stone Golem. Fist swipe next, 1 damage.`);
      else if (e.type === 'battleExchange')
        lines.push(
          `${e.choice === 'strike' ? (e.hit ? `Strike hit for ${e.damage}` : 'Strike deflected') : 'Guard up'}. ${e.monsterAttack ? (e.blocked ? 'Golem attack blocked.' : `Golem hit for ${e.taken}.`) : ''} Golem ${e.monsterHp}, stamina ${e.stamina}.${e.nextIntent ? ` Next: ${e.nextIntent === 'heavy' ? 'heavy slam, 2 damage' : 'swipe, 1 damage'}.` : ''}`,
        );
      else if (e.type === 'battleEnded') lines.push(e.outcome === 'won' ? 'The Stone Golem crumbles: the shortcut is open for your kingdom.' : e.outcome === 'lost' ? `${nm(e.characterId)} is out of stamina and limps to ${nodeName(view.boardId, e.to)}.` : `${nm(e.characterId)} retreats to ${nodeName(view.boardId, e.to)}.`);
      else if (e.type === 'protectionEnded') lines.push(`${nm(e.characterId)}'s ${e.ward === 'shield' ? 'Shield' : e.ward === 'immune' ? 'Immunity' : 'Royal Guard'} ${e.reason === 'consumed' ? 'blocked an attack and broke' : 'expired'}.`);
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
      const r = await run({
        type: 'move',
        characterId,
        path,
        discardCardId: discardId,
      });
      committing.current = null;
      if (r.ok || STALE.test(r.error)) {
        setSel(null);
      } else setSel({ characterId, path: null });
    },
    [run, view.version, discardId],
  );


  // After rolling with exactly one piece able to move, select it; with one end, preview it.
  useEffect(() => {
    if (canPlan && !sel && movers.length === 1 && !cardId) {
      const m = movers[0];
      const endsOf = new Set(m.options.map((o) => o.path[o.path.length - 1]));
      const path = endsOf.size === 1 ? m.options[0].path : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSel({ characterId: m.characterId, path });
    }
  }, [canPlan, sel, movers, cardId]);

  const select = (c: Character) => {
    setCardId(null);
    setInspect(null);
    setCrowd(null);
    const m = movers.find((x) => x.characterId === c.id);
    const endsOf = new Set(m?.options.map((o) => o.path[o.path.length - 1]));
    const path = m && endsOf.size === 1 ? m.options[0].path : null;
    setSel({ characterId: c.id, path });
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

  // A Knight charge needs no choice: the server captures every eligible rival on the route.
  const tryCommit = (characterId: string, path: string[]) => void commit(characterId, path);

  /** Every rival with the reason Dragon Fire cannot reach it (for the empty-target explanation). */
  const fireBlocks = () =>
    me
      ? Object.values(view.characters)
          .filter((c) => c.owner !== me && !c.finished)
          .map((c) => ({ c, why: dragonFireBlock(view, me, c.id) }))
      : [];

  const startFire = () => {
    if (!me) return;
    setSel(null);
    setCardId(null);
    setFireTarget(null);
    setFireMode(true);
    const n = fireOptions.filter((o) => o.action.type === 'dragonFire' && o.action.targetId).length;
    if (n) return say(`Dragon Fire: ${n === 1 ? 'one rival glows' : `${n} rivals glow`} within ${view.config.dragonFireRange} steps. Tap one to preview the attack.`);
    const blocked = fireBlocks().filter((b) => b.why);
    say(`No rival can be burned right now. ${blocked.slice(0, 3).map((b) => `${label(b.c)}: ${b.why}`).join(' ')}`);
  };

  const confirmFire = (action: GameAction) => {
    if (firing.current || busy) return;
    firing.current = true;
    setToast(null);
    setFireTarget(null);
    setFireMode(false);
    void run(action).finally(() => {
      firing.current = false;
    });
  };

  const onPiece = (id: string) => {
    const c = view.characters[id];
    if (!c || c.finished) return;
    const aimed = shownTargets.find((t) => (t.kind === 'character' && t.characterId === id) || (t.kind === 'swap' && t.targetId === id));
    if (aimed) return playTarget(aimed);
    // A rival on a space the planned move can end on is a capture: that always wins over Dragon Fire.
    if (plan && c.owner !== me && ends.has(c.node) && !fireMode) return void onNode(c.node);
    const myDragon = me ? companionOf(view, me) : null;
    if (fireMode && me) {
      if (c.id === myDragon?.id) {
        setFireMode(false);
        setFireTarget(null);
        return say('Dragon Fire cancelled.');
      }
      if (c.owner === me) return say('Dragon Fire targets rival pieces. Tap a glowing rival.');
      const why = dragonFireBlock(view, me, c.id);
      if (why) return flash(c.node, `${label(c)}: ${why}`);
      setFireTarget(id);
      return say(`Dragon Fire at ${label(c)}. Check the preview, then confirm to roll the attack die.`);
    }
    // Tapping your dragon's rider (when it is not choosing a move) arms Dragon Fire.
    if (myDragon && c.id === myDragon.id && mayAdventure && !(canPlan && movable.has(id))) return startFire();
    const fire = !selected && !plan && !canPlan ? fireOptions.find((o) => o.action.type === 'dragonFire' && o.action.targetId === id) : undefined;
    if (fire) {
      setFireMode(true);
      setFireTarget(id);
      return say(`Dragon Fire at ${label(c)}. Check the preview, then confirm to roll the attack die.`);
    }
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
    if (c.owner === me && canPlan) return say(`${label(c)} cannot move: ${whyStuck(view, c.id)}.`);
    if (c.owner === me && canRoll) {
      setInspect({ kind: 'character', id });
      return say('Roll the die first, then choose who moves.');
    }
    if (c.owner !== me && plan) return flash(c.node, whyNot(view, plan, c.node));
    // Queen diplomacy: tap a rival castle piece's house via character standing there is awkward —
    // castle taps go through onNode.
    setInspect({ kind: 'character', id });
  };

  const onNode = (id: string) => {
    const node = nodes[id];
    // Diplomacy: tap a rival castle after the Queen moved.
    if (
      me &&
      node?.type === 'castle' &&
      node.house !== undefined &&
      Object.values(view.characters).some((c) => c.owner === me && c.kind === 'queen' && view.turn.moved.includes(c.id))
    ) {
      const rival = view.players.find((p) => p.seat === node.house && p.id !== me);
      if (rival) {
        setTradeRival(rival.id);
        setTradeOpen(true);
        return;
      }
    }
    if (plan) {
      if (ends.has(id)) {
        const end = plan.choice?.path[plan.choice.path.length - 1];
        if (end === id) return void tryCommit(plan.characterId, plan.choice!.path);
        return void preview(id);
      }
      // Dragging along an intermediate space: pick a route that visits it.
      if (plan.choice === null || plan.choice.path[plan.choice.path.length - 1] !== id) {
        const via = plan.options.find((o) => o.path.includes(id) && o.path[o.path.length - 1] !== plan.characterId);
        if (via && via.path.slice(1, -1).includes(id)) {
          const next = chooseRoute(plan, via.path);
          if (next?.choice) {
            setSel({ characterId: plan.characterId, path: next.choice.path });
            return;
          }
        }
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

  /** What a map card would do to a segment: open (build, repair) or close (collapse, landslide). */
  const changeOf = (type: CardType): 'open' | 'close' => (type === 'collapse_bridge' || type === 'landslide' ? 'close' : 'open');
  const VERB: Partial<Record<CardType, string>> = { build_bridge: 'Build bridge', collapse_bridge: 'Collapse bridge', dig_tunnel: 'Dig tunnel', build_road: 'Build road', landslide: 'Drop landslide', repair: 'Repair' };

  /**
   * Tap a road segment to build or break it. With a map card selected, an eligible (glowing) segment
   * shows a preview with Confirm beside it; an ineligible one explains why beside the road. Without a
   * card, the tap picks the card in your hand that can change it, or explains the road.
   */
  const onEdge = (edgeId: string, explain?: string) => {
    const { board } = getBoard(view.boardId);
    const e = board.edges.find((x) => x.id === edgeId);
    const sameSegment = (x: string) => x === edgeId || (!!e?.gate && board.edges.find((y) => y.id === x)?.gate === e.gate);
    const beside = (text: string) => {
      if (e) setEffects((fx) => [...fx, { id: ++fxId.current, node: e.a, at: e.route[Math.floor(e.route.length / 2)], text, tone: 'blocked' as const }].slice(-6));
      say(text);
      play('error');
    };
    const pick = (card: (typeof cards)[number]) => {
      const t = card.targets.find((x) => x.kind === 'edge' && sameSegment(x.edgeId));
      if (!t || t.kind !== 'edge') return false;
      setSel(null);
      setCardId(card.card.id);
      const change = changeOf(card.card.type);
      setEdgePick({ cardId: card.card.id, target: t, edgeId: t.edgeId, change, label: VERB[card.card.type] ?? CARD_INFO[card.card.type].name });
      say(`${CARD_INFO[card.card.type].name} on ${e?.name ?? 'this road'}: the road ${change === 'open' ? 'opens' : 'closes'} for every house. Confirm beside the road.`);
      return true;
    };
    if (selected) {
      if (pick(selected)) return;
      return beside(edgeRefusal(view, me ?? '', selected.card.type, edgeId) ?? `${CARD_INFO[selected.card.type].name} cannot be used on ${e?.name ?? 'this road'}.`);
    }
    if (!myTurn) return setInspect({ kind: 'text', id: explain ?? `${e?.name ?? 'This road'}. Wait for your turn to build or break it.` });
    if (view.turn.adventureDone) return setInspect({ kind: 'text', id: `${explain ?? e?.name ?? 'This road'} You already used your Adventure action this turn.` });
    const fits = cards.filter((c) => c.targets.some((x) => x.kind === 'edge' && sameSegment(x.edgeId)));
    if (fits.length && pick(fits[0])) return;
    setInspect({ kind: 'text', id: `${explain ?? e?.name ?? 'This road.'} None of your cards can change it right now.` });
  };
  const confirmEdge = () => {
    if (!edgePick) return;
    const pickNow = edgePick;
    setEdgePick(null);
    void run({ type: 'playCard', cardId: pickNow.cardId, target: pickNow.target, discardCardId: discardId });
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
      setSel({ characterId: plan.characterId, path: route.path });
      return void tryCommit(plan.characterId, route.path);
    }
    if (node && plan.options.some((o) => o.path.includes(node))) {
      const route = plan.options.find((o) => o.path.includes(node) && ends.has(o.path[o.path.length - 1])) ?? plan.options.find((o) => o.path.includes(node));
      if (route) {
        setSel({ characterId: plan.characterId, path: route.path });
        if (ends.has(route.path[route.path.length - 1]) && route.path[route.path.length - 1] === node) return void tryCommit(plan.characterId, route.path);
        return;
      }
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
      else if ((e.key === 'm' || e.key === 'Enter') && plan?.choice && !busy && !t.closest('button,[role="button"]')) tryCommit(plan.characterId, plan.choice.path);
      else if (e.key === 'e' && myTurn && view.turn.moveDone && !view.turn.adventureDone && !busy) void run({ type: 'skipAdventure' });
      else if (e.key === 'Escape' && (sel || cardId || tradeOpen)) {
        setSel(null);
        setCardId(null);
        setTradeOpen(false);
        setEdgePick(null);
        setFireTarget(null);
        setFireMode(false);
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
    if (!shownTargets.length && !plan?.choice && (fireMode || fireTarget)) for (const o of fireOptions) if (o.action.type === 'dragonFire' && o.action.targetId) t.characters.add(o.action.targetId);
    return t;
  }, [shownTargets, fireOptions, plan?.choice, fireMode, fireTarget]);
  const coach = useMemo(() => new Set(tutorial?.coach ?? []), [tutorial?.coach]);
  const what = plan?.choice ? consequences(view, plan.characterId, plan.choice) : [];
  const previewCaptures = plan?.choice ? captureTargets(view, plan.characterId, plan.choice) : [];
  const previewHazards = plan?.choice
    ? plan.choice.path.filter((n) => {
        const nd = nodes[n];
        return !!(nd?.hazard || nd?.teleport);
      })
    : [];
  const previewPortals = plan?.choice
    ? plan.choice.path.flatMap((n, i) => {
        if (i === 0) return [];
        const prev = plan.choice!.path[i - 1];
        const { out } = getBoard(view.boardId);
        const walked = out[prev]?.some((e) => other(e, prev) === n);
        if (walked === false) return [n];
        return nodes[n]?.portal ? [nodes[n].portal!] : [];
      })
    : [];
  const boardPlan: BoardPlan | null = plan
    ? {
        characterId: plan.characterId,
        ends: [...ends.keys()],
        choice: plan.choice?.path ?? null,
        summary: what.join(' · '),
        captures: previewCaptures,
        attackChoices: [],
        attackSelected: [],
        hazards: previewHazards,
        portalExits: previewPortals,
      }
    : null;
  const playSeat = royalPlaySeat(view, boardPlan?.characterId ?? null, boardPlan?.ends ?? []);
  const explainSeat = boardPlan && playSeat == null ? (view.players.find((p) => p.id === me)?.seat ?? null) : null;
  const royalReach = (() => {
    if (!plan || playSeat == null) return null;
    const set = new Set<string>();
    const here = view.characters[plan.characterId]?.node;
    if (here) set.add(here);
    for (const o of plan.options) for (const n of o.path) if (nodes[n]?.lane === 'final' || n === 'temple') set.add(n);
    return set;
  })();
  const showDiplomacy = !!me && playing && ((view.trades?.length ?? 0) > 0 || myTurn);

  const turnLeft = view.turn.deadline ? view.turn.deadline - now : null;
  const matchLeft = view.endsAt ? view.endsAt - now : null;
  const companion = view.dragon.state === 'companion' ? view.characters[view.dragon.companion ?? ''] : null;
  const canRelease = myTurn && !view.turn.acted && companion?.owner === me;
  const planChar = plan ? view.characters[plan.characterId] : null;
  const mayAdventure = myTurn && !view.turn.adventureDone && !plan?.choice && !view.battle;
  const playableCount = cards.filter((c) => c.targets.length > 0).length;

  let headline: string;
  let sub = '';
  if (!playing) headline = 'Match over';
  else if (!myTurn) {
    headline = `${current.name}'s turn`;
    sub = current.isAI ? 'Thinking…' : 'Watch the board. Their moves appear below.';
  } else if (selected) {
    headline = `${CARD_INFO[selected.card.type].name}: choose a target`;
    sub = selected.targets.length
      ? selected.targets.every((t) => t.kind === 'edge')
        ? 'Tap a glowing blue path on the board to use the card on it.'
        : 'Valid targets glow blue on the board and are listed below.'
      : (selected.reason ?? 'That card has no target right now.');
  } else if (canRoll) {
    headline = view.turn.bonus ? 'EXTRA TURN — Roll again' : 'YOUR TURN — Roll the die';
    sub = `${me ? objectiveText(view, me) : ''}${!view.turn.adventureDone && (options.length || playableCount) ? ' You may use your adventure action before or after moving.' : ''}`;
  } else if (plan?.choice && planChar) {
    const end = plan.choice.path[plan.choice.path.length - 1];
    const note = routeNote(view, plan.choice);
    const arrival = arrivalFor(view, plan.characterId, end, plan.choice);
    const blockers = end === 'temple' || plan.choice.finishes ? templeBlockersFor(view, plan.characterId) : [];
    headline = `Move your ${CHARACTER_INFO[planChar.kind].name} to ${nodeName(view.boardId, end)}?`;
    sub = [
      what.length ? what.join(' · ') : '',
      note,
      arrival ? `${arrival.name}: win — ${arrival.success}; lose — ${arrival.failure}` : '',
      blockers.length ? `Temple gate: ${blockers.join('; ')}` : '',
      'Tap Move here, tap the space again, or pick another glowing space.',
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (plan && planChar) {
    headline = `${CHARACTER_INFO[planChar.kind].name.toUpperCase()} — ${plan.note}`;
    sub = `${ends.size} ${ends.size === 1 ? 'place' : 'places'} to go — the whole roll must be used. Tap a glowing space to preview the route and its trade-offs, or drag the piece there.`;
  } else if (canPlan) {
    headline = `You rolled ${rolled!.roll} — choose a piece`;
    sub = movers.length ? 'Pieces that can move have a dashed gold ring. Tap one on the board or below.' : me ? noMoveReason(view, me) : '';
  } else if (view.battle && view.battle.playerId === me) {
    headline = 'Battle the Stone Golem';
    sub = 'Strike, Guard or Retreat below. Watch its announced attack: guard a heavy slam to expose it.';
  } else if (fireChoice) {
    headline = 'Dragon Fire: confirm the attack';
    sub = fireChoice.detail;
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
    <div className={`flex min-h-[100dvh] flex-col pb-16 lg:h-[100dvh] lg:pb-0! ${tutorial?.reserveBottom ? 'pb-[46dvh] sm:pb-0' : ''}`}>
      <header className="sticky top-0 z-30 flex min-h-12 flex-wrap items-center gap-1.5 bg-[#fffaf0]/85 px-2 py-1.5 backdrop-blur sm:px-4">
        <button className="btn btn-ghost icon-btn" onClick={() => setLeaveOpen(true)} aria-label="Leave game">
          <LogOut size={20} />
        </button>
        {hostEndMatch && view.status === 'playing' && (
          <button className="btn btn-ghost text-sm" onClick={hostEndMatch.onClick} disabled={hostEndMatch.busy} aria-label={hostEndMatch.label}>
            {hostEndMatch.busy ? 'Ending…' : hostEndMatch.label}
          </button>
        )}
        <div className="font-display hidden text-lg font-bold tracking-tight md:block">
          Kingdom of <span className="text-[#e0532d]">Four Gems</span>
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
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.muted ? 0 : settings.volume}
            onChange={(e) => update({ volume: Number(e.target.value), muted: Number(e.target.value) === 0 })}
            onPointerUp={() => play('pickup')}
            className="hidden w-20 accent-[#f4a81d] sm:block"
            aria-label="Volume"
            aria-valuetext={`${Math.round((settings.muted ? 0 : settings.volume) * 100)}%`}
            data-volume
          />
          <button className="btn btn-ghost icon-btn" onClick={() => update({ muted: !settings.muted })} aria-label={settings.muted ? 'Unmute' : 'Mute'} aria-pressed={settings.muted}>
            {settings.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button className="btn btn-ghost px-3! py-1.5! lg:hidden!" onClick={() => setDrawerOpen(true)} data-guide-open>
            <BookOpen size={18} aria-hidden="true" /> Rules &amp; Guide
          </button>
          <button className="btn btn-ghost hidden! px-3! py-1.5! lg:inline-flex!" onClick={() => setRulesOpen(true)}>
            <BookOpen size={18} aria-hidden="true" /> Rules
          </button>
          <FullscreenButton />
          <button className="btn btn-ghost icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <ObjectiveStrip view={view} me={me} presence={controller.presence} />

      <div
        className={`grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-2 px-2 pb-2 lg:grid-rows-[minmax(0,1fr)] lg:px-3 ${
          railOpen ? 'lg:grid-cols-[16.25rem_minmax(0,1fr)_18.75rem] 2xl:grid-cols-[17.5rem_minmax(0,1fr)_21.25rem]' : 'lg:grid-cols-[2.5rem_minmax(0,1fr)_18.75rem] 2xl:grid-cols-[2.5rem_minmax(0,1fr)_21.25rem]'
        }`}
        data-play-grid
      >
        <aside className="hidden min-h-0 lg:flex lg:h-full lg:flex-col lg:gap-1.5" data-play-column="rules" data-rail={railOpen ? 'open' : 'folded'}>
          <button
            type="button"
            className={`btn btn-ghost shrink-0 text-sm ${railOpen ? 'self-end px-2! py-1!' : 'h-full w-10 flex-col justify-start gap-2 px-0! py-3!'}`}
            onClick={() => update({ rulesRail: railOpen ? 'folded' : 'open' })}
            aria-expanded={railOpen}
            aria-label={railOpen ? 'Fold the rules panel' : 'Show the rules panel'}
            data-rail-toggle
          >
            {railOpen ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
            {railOpen ? 'Fold' : <span className="[writing-mode:vertical-rl] font-bold tracking-wide">Rules</span>}
          </button>
          {railOpen && (
            <div className="min-h-0 flex-1">
              <RulesRail />
            </div>
          )}
        </aside>
        <section
          className="panel relative h-[clamp(18rem,calc(100dvh-9rem),125vw)] w-full overflow-hidden p-0! lg:h-full"
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
          </div>
          <GameBoard
            view={view}
            markerStyle={settings.markers ?? 'minimal'}
            describeNode={(id) => {
              const n = getBoard(view.boardId).nodes[id];
              return n ? locationTip(n, view) : '';
            }}
            map={map}
            me={me}
            movable={movable}
            plan={boardPlan}
            targets={targets}
            coach={coach}
            effects={effects}
            strikes={strikes}
            invalid={invalid}
            reduced={reducedMotion}
            fast={fast}
            resetKey={0}
            onPiece={onPiece}
            onNode={onNode}
            onEdge={onEdge}
            onConfirm={() => plan?.choice && void tryCommit(plan.characterId, plan.choice.path)}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onCrowd={setCrowd}
            onExplain={(text) => setInspect({ kind: 'text', id: text })}
            onMarker={(_id, text) => setInspect({ kind: 'text', id: text })}
            royal={{ playSeat, inspect: true, explainSeat, reachNodes: royalReach }}
            edgePreview={edgePick && edgePick.cardId === cardId ? { edgeId: edgePick.edgeId, change: edgePick.change, label: edgePick.label } : null}
            onConfirmEdge={confirmEdge}
            onCancelEdge={() => setEdgePick(null)}
            fireTarget={fireChoice ? fireTarget : null}
            actionNodes={actionNodes}
            platesDone={focusChar?.plates ?? null}
          />
          {dragging && <div className="sr-only">Dragging</div>}
          <EventCard view={view} reduced={reducedMotion} />
          {recap && (
            <div className="absolute top-2 left-1/2 z-20 w-[min(92%,26rem)] -translate-x-1/2 rounded-2xl border border-white/30 bg-[#1d2440]/88 p-2.5 text-white shadow-lg" role="status" data-recap>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold tracking-wide uppercase">Welcome back · recent events</span>
                <button type="button" className="btn btn-ghost icon-btn min-h-8! min-w-8! bg-white/10! text-white!" aria-label="Close recap" onClick={() => setRecap(null)}>
                  <X size={14} />
                </button>
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-xs leading-snug">
                {recap.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          )}
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
                      {protectionLabel(view, inspectedChar) && <p className="text-xs font-bold text-[#173e8c]" data-protection-label>{protectionLabel(view, inspectedChar)}</p>}
                      {inspectedChar.shield && <p className="text-xs text-[#173e8c]">{STATUS_INFO.shield}</p>}
                      {inspectedChar.guarded && <p className="text-xs text-[#173e8c]">{STATUS_INFO.guarded}</p>}
                      {inspectedChar.immune && <p className="text-xs text-[#5a3d00]">{STATUS_INFO.immune}</p>}
                      {companion?.id === inspectedChar.id && <p className="text-xs text-[#a3300b]">{STATUS_INFO.companion}</p>}
                    </>
                  ) : (
                    <>
                      <p className="text-sm leading-snug">{inspectedNode ? locationTip(inspectedNode, view) : inspect?.id}</p>
                      {inspectedNode && mayAdventure && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5" data-landmark-actions>
                          {options
                            .filter((o) => o.action.type !== 'dragonFire' && view.characters[o.characterId]?.node === inspectedNode.id)
                            .map((o) => (
                              <button
                                key={o.label}
                                className="btn btn-green min-h-11 text-sm"
                                disabled={busy}
                                title={o.detail}
                                onClick={() => {
                                  setInspect(null);
                                  void run(o.mayDraw && o.action.type === 'dig' ? { ...o.action, discardCardId: discardId } : o.action);
                                }}
                              >
                                {o.label}
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <button className="btn btn-ghost icon-btn" aria-label="Close details" onClick={() => setInspect(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="flex min-h-0 flex-col gap-2 lg:h-full lg:overflow-y-auto" data-play-column="turn" aria-label="Your turn and cards">
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
                <Die value={rolled?.roll ?? null} rollId={view.version} size={Math.round(52 * uiScale)} reducedMotion={reducedMotion} fast={fast} />
                {canRoll && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#1d2440] px-2 py-0.5 text-[0.6875rem] font-bold text-white">Roll</span>}
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[1.0625rem] leading-tight font-bold" data-status>
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
                      <span className="rounded-full bg-[#2e9e62] px-2 py-0.5 text-white" data-extra-status data-bonus-reason={view.turn.extra ?? (view.turn.bonus ? 'pending' : undefined)}>
                        {view.turn.extra === 'six'
                          ? 'Bonus roll earned (rolled a 6)'
                          : view.turn.extra === 'capture'
                            ? 'Bonus roll earned (capture)'
                            : view.turn.bonus
                              ? 'Bonus roll — roll again'
                              : 'Bonus roll'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {(view.turn.extra || view.turn.bonus) && myTurn && (
              <div className="mt-2 rounded-xl bg-[#e6f6ec] px-3 py-2 text-sm font-bold text-[#155c36]" data-bonus-banner role="status">
                {view.turn.bonus
                  ? 'Bonus roll: roll again this turn. Your Adventure action is still once per turn.'
                  : view.turn.extra === 'six'
                    ? 'You rolled a 6 — a bonus roll is waiting after this move.'
                    : 'A capture earned a bonus roll after this move.'}
              </div>
            )}

            {plan?.choice && (
              <div className="mt-2.5 flex flex-wrap gap-1.5" data-move-preview>
                <button className="btn btn-green min-h-11 flex-1 text-base" disabled={busy} onClick={() => void tryCommit(plan.characterId, plan.choice!.path)} data-confirm>
                  Move here
                </button>
                {alternatives(plan) > 1 && (
                  <button
                    className="btn btn-ghost min-h-11 text-sm"
                    data-route-cycle
                    onClick={() => preview(plan.choice!.path[plan.choice!.path.length - 1])}
                  >
                    <Repeat size={15} aria-hidden="true" /> Other route
                  </button>
                )}
                {ends.size > 1 && (
                  <button
                    className="btn btn-ghost min-h-11 text-sm"
                    onClick={() => {
                      setSel({ characterId: plan.characterId, path: null });
                    }}
                  >
                    Change
                  </button>
                )}
              </div>
            )}

            {plan?.choice && alternatives(plan) > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5" data-route-chips role="group" aria-label="Routes to this space">
                {(ends.get(plan.choice.path[plan.choice.path.length - 1]) ?? []).map((o, i) => {
                  const on = o.path.join('>') === plan.choice!.path.join('>');
                  return (
                    <button
                      key={o.path.join('>')}
                      type="button"
                      className={`btn min-h-11 text-sm ${on ? 'btn-primary' : 'btn-ghost'}`}
                      aria-pressed={on}
                      data-route-chip={i}
                      onClick={() => {
                        setSel({ characterId: plan.characterId, path: o.path });
                      }}
                    >
                      Route {i + 1}
                      {o.witchPortal ? ' · portal' : ''}
                      {o.landingCuts.length ? ' · capture' : ''}
                    </button>
                  );
                })}
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
                  {mine.filter((c) => !c.finished).map((c) => {
                    const can = movable.has(c.id);
                    const on = plan?.characterId === c.id;
                    const gems = gemsOf(view, c);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`relative flex min-h-11 flex-col items-center rounded-xl border-2 px-1 pt-1 pb-0.5 text-[0.6875rem] font-bold transition ${on ? 'border-[#1d2440] bg-white' : can ? 'border-[#ffcf33] bg-[#fffbe8]' : 'border-transparent bg-white/60 text-[#6b7086]'}`}
                        aria-pressed={on}
                        aria-label={`${label(c)}, ${c.lap} of 4 plates${gems.length ? `, carrying ${gemList(gems.map((g) => g.kind))}` : ''}${can ? ', can move' : rolled ? `, cannot move: ${whyStuck(view, c.id)}` : ''}`}
                        data-character={c.id}
                        data-stuck={rolled && !can ? 'true' : undefined}
                        disabled={busy}
                        onClick={() => {
                          if (!rolled) return say('Roll the die first, then choose who moves.');
                          if (!can) return say(`${label(c)} cannot move: ${whyStuck(view, c.id)}.`);
                          onPiece(c.id);
                        }}
                      >
                        <TokenIcon kind={c.kind} theme={seatTheme(mySeat)} size={Math.round(30 * uiScale)} />
                        {CHARACTER_INFO[c.kind].name}
                        <PlateDots view={view} ch={c} size={Math.round(7 * uiScale)} />
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
                {canPlan && movers.length === 0 && (
                  <button className="btn btn-primary mt-2 min-h-11 w-full text-sm" disabled={busy} data-skip-move onClick={() => void run({ type: 'skipMove' })}>
                    Skip movement
                  </button>
                )}
              </div>
            )}

            {mine.length > 0 && !(myTurn && !view.turn.moveDone) && (
              <div className="mt-2.5" data-piece-roster>
                <div className="mb-1 text-xs font-bold text-[#4a5374]">Your pieces</div>
                <ul className="grid grid-cols-2 gap-1.5">
                  {mine.map((c) => {
                    const gems = gemsOf(view, c);
                    const where = c.finished ? 'In the Crown Temple' : nodeName(view.boardId, c.node);
                    const notes = [protectionLabel(view, c), c.webbed && 'Webbed'].filter(Boolean) as string[];
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 rounded-xl bg-white/70 px-1.5 py-1 text-left text-[0.6875rem] leading-tight"
                          data-roster={c.id}
                          aria-label={`${label(c)} at ${where}: ${c.lap} of 4 plates${gems.length ? `, carrying ${gemList(gems.map((g) => g.kind))}` : ', carrying nothing'}${notes.length ? `, ${notes.join(', ')}` : ''}`}
                          onClick={() => onPiece(c.id)}
                        >
                          <TokenIcon kind={c.kind} theme={seatTheme(mySeat)} size={Math.round(24 * uiScale)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold">{CHARACTER_INFO[c.kind].name}</span>
                            <span className="block truncate text-[#6b7086]">{where}</span>
                            {notes.length > 0 && <span className="block truncate text-[#173e8c]">{notes.join(' · ')}</span>}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-0.5" data-carrying={gems.map((g) => g.kind).join(',')}>
                            {gems.length ? gems.map((g) => <GemIcon key={g.id} kind={g.kind} size={16} title={`Carrying ${aGem(g.kind)}`} />) : <span className="text-[0.625rem] text-[#9aa0b5]">no gems</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {view.battle && <BattlePanel view={view} me={me} busy={busy} reduced={reducedMotion} onChoose={(a) => run(a)} />}

            {fireMode && !fireChoice && mayAdventure && (
              <div className="mt-2.5 rounded-xl bg-[#fff1e6] p-2" data-dragon-fire="aiming">
                <div className="mb-1 text-xs font-bold text-[#a3300b]">Dragon Fire · tap a glowing rival</div>
                {fireOptions.some((o) => o.action.type === 'dragonFire' && o.action.targetId) ? (
                  <p className="text-xs text-[#4a5374]">Rivals within {view.config.dragonFireRange} connected steps of your dragon glow. Tap any other piece to see why it cannot be burned.</p>
                ) : (
                  <p className="text-xs text-[#4a5374]" data-fire-empty>
                    No rival can be burned right now.{' '}
                    {fireBlocks()
                      .filter((b) => b.why)
                      .slice(0, 4)
                      .map((b) => `${label(b.c)}: ${b.why}`)
                      .join(' ')}
                  </p>
                )}
              </div>
            )}

            {fireChoice && mayAdventure && (
              <div className="mt-2.5 rounded-xl bg-[#fff1e6] p-2" data-dragon-fire="armed">
                <div className="mb-1 text-xs font-bold text-[#a3300b]">Dragon Fire preview · no card needed · uses your Adventure action</div>
                <p className="text-xs text-[#4a5374]">
                  Target: <b>{label(view.characters[fireTarget!])}</b> at {nodeName(view.boardId, view.characters[fireTarget!].node)}. Confirm and the attack die rolls at once: {view.config.dragonFireHit ?? 4}–{view.config.dieSides} hits (
                  {Math.round(((view.config.dieSides - (view.config.dragonFireHit ?? 4) + 1) / view.config.dieSides) * 100)}%), 1–{(view.config.dragonFireHit ?? 4) - 1} misses and the action is still spent. A hit sends them home and drops their gems. No capture credit, no bonus roll.
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <button className="btn btn-danger min-h-11 text-sm" disabled={busy} data-fire-roll onClick={() => confirmFire(fireChoice.action)}>
                    🔥 Breathe fire
                  </button>
                  <button className="btn btn-ghost min-h-11 text-sm" onClick={() => setFireTarget(null)}>
                    Choose another
                  </button>
                </div>
              </div>
            )}

            {mayAdventure && (options.length > 0 || canRelease || shownTargets.length > 0 || !!(me && companionOf(view, me))) && (
              <div className="mt-2.5" data-adventure>
                <div className="mb-1 text-xs font-bold text-[#4a5374]">Adventure action</div>
                <div className="flex flex-wrap gap-1.5">
                  {canRelease && (
                    <button className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run({ type: 'release' })} title="Free: release before you act. The dragon becomes wild where it is.">
                      Release the dragon (free)
                    </button>
                  )}
                  {companionOf(view, me ?? '') && (
                    <button
                      className={`btn text-sm ${fireMode ? 'btn-primary' : 'btn-danger'}`}
                      disabled={busy}
                      aria-pressed={fireMode}
                      data-adventure-option="dragonFire"
                      data-fire-mode={fireMode ? 'on' : 'off'}
                      title={`No card needed. Uses your Adventure action. Targets within ${view.config.dragonFireRange} connected steps; ${view.config.dragonFireHit ?? 4}–${view.config.dieSides} on the attack die hits.`}
                      onClick={() => (fireMode ? (setFireMode(false), setFireTarget(null)) : startFire())}
                    >
                      🔥 {fireMode ? 'Cancel Dragon Fire' : 'Dragon Fire'}
                    </button>
                  )}
                  {options.filter((o) => !(o.action.type === 'dragonFire' && o.action.targetId)).map((o) => {
                    const a = o.action;
                    const withDiscard = o.mayDraw && a.type === 'dig' ? { ...a, discardCardId: discardId } : a;
                    const gem = a.type === 'dig' ? a.gem : undefined;
                    return (
                      <button
                        key={o.label + o.characterId}
                        className={`btn text-sm ${a.type === 'dragonFire' ? 'btn-danger' : 'btn-green'}`}
                        disabled={busy}
                        title={o.detail}
                        onClick={() => (a.type === 'dragonFire' ? confirmFire(a) : void run(withDiscard))}
                        data-adventure-option={a.type}
                      >
                        {gem && <GemIcon kind={gem} size={16} />}
                        {o.label}
                      </button>
                    );
                  })}
                  {shownTargets
                    .filter((t) => t.kind !== 'edge')
                    .map((t) => (
                      <button key={targetLabel(view, t)} className="btn btn-blue text-sm" disabled={busy} data-highlight="target" onClick={() => playTarget(t)}>
                        {targetLabel(view, t)}
                      </button>
                    ))}
                </div>
                {shownTargets.some((t) => t.kind === 'edge') && (
                  <p className="mt-1 text-xs font-semibold text-[#173e8c]" data-edge-hint>
                    Tap a glowing blue path on the board to {selected && /collapse|landslide|raise|river/.test(selected.card.type) ? 'break' : 'build'} it.
                  </p>
                )}
                {options.length > 0 && <p className="mt-1 text-xs text-[#4a5374]">{options[0].detail}</p>}
              </div>
            )}

            {myTurn && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {view.turn.moveDone && !view.turn.adventureDone && !view.battle && (
                  <button className="btn btn-primary min-h-11 text-sm" disabled={busy} onClick={() => void run({ type: 'skipAdventure' })} data-end-turn>
                    <SkipForward size={15} aria-hidden="true" /> End turn
                  </button>
                )}
                {showDiplomacy && (
                  <button
                    className="btn btn-ghost min-h-11 text-sm"
                    data-diplomacy-open
                    onClick={() => {
                      setTradeRival(null);
                      setTradeOpen(true);
                    }}
                  >
                    Diplomacy &amp; powers
                  </button>
                )}
                {selected && (
                  <button className="btn btn-ghost min-h-11 text-sm" onClick={() => setCardId(null)}>
                    Cancel card
                  </button>
                )}
              </div>
            )}
            {!myTurn && (view.trades?.some((t) => t.to === me || t.from === me) ?? false) && (
              <button className="btn btn-primary mt-2 min-h-11 w-full text-sm" data-diplomacy-open onClick={() => setTradeOpen(true)}>
                Open Diplomacy
              </button>
            )}
          </div>

          <div className="hidden lg:block">
            <KingdomProgress view={view} me={me} focusId={focusChar?.id ?? null} />
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
      <MapGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
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
      <TradePanel
        view={view}
        me={me}
        busy={busy}
        open={tradeOpen}
        rivalId={tradeRival}
        onClose={() => {
          setTradeOpen(false);
          setTradeRival(null);
        }}
        onSend={(action) => void run(action)}
      />
      {/* Mobile: progress + turn drawer */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-[#e6dcc6] bg-[#fffaf0]/95 p-2 backdrop-blur lg:hidden!" data-mobile-dock>
        <button type="button" className="btn btn-ghost min-h-11 flex-1 text-sm" data-mobile-progress onClick={() => setSheet(sheet === 'progress' ? null : 'progress')}>
          Progress
        </button>
        <button type="button" className="btn btn-ghost min-h-11 flex-1 text-sm" data-mobile-turn onClick={() => setSheet(sheet === 'turn' ? null : 'turn')}>
          Turn
        </button>
        {showDiplomacy && (
          <button type="button" className="btn btn-ghost min-h-11 flex-1 text-sm" data-diplomacy-open onClick={() => setTradeOpen(true)}>
            Trade
          </button>
        )}
      </div>
      {sheet && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[70dvh] overflow-y-auto rounded-t-3xl bg-[#fffaf0] p-3 shadow-xl lg:hidden!" data-mobile-sheet={sheet}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">{sheet === 'progress' ? 'Kingdom progress' : 'Your turn'}</h2>
            <button type="button" className="btn btn-ghost min-h-11 px-3!" onClick={() => setSheet(null)}>
              Close
            </button>
          </div>
          {sheet === 'progress' ? <KingdomProgress view={view} me={me} focusId={focusChar?.id ?? null} compact /> : <p className="text-sm text-[#4a5374]">Use the turn column above, or scroll the board controls.</p>}
        </div>
      )}
      {tutorial?.overlay}
    </div>
  );
}

/** Full screen hides the browser bars so only the game shows. Hidden where the browser can't do it (iPhone Safari). */
function FullscreenButton() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(!!document.fullscreenElement);
    // Feature detection has to wait for the browser; the server render shows no button.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!document.fullscreenEnabled);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!supported) return null;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  };
  return (
    <button className="btn btn-ghost icon-btn" onClick={toggle} aria-label={on ? 'Exit full screen' : 'Full screen'} aria-pressed={on} title={on ? 'Exit full screen' : 'Full screen'} data-fullscreen>
      {on ? <Minimize size={18} /> : <Maximize size={18} />}
    </button>
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
