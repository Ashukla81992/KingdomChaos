import { other } from './board';
import { openEdges } from './graph';
import {
  CARD_CATEGORY,
  CHAR_NAMES,
  aGem,
  announceUnlock,
  charLabel,
  finalUnlocked,
  log,
  playerName,
  playerOf,
  syncGems,
  bankGem,
  type Ctx,
} from './rules';
import { getBoard } from './board';
import {
  GEM_KINDS,
  type CardType,
  type GameAction,
  type GameState,
  type GemKind,
  type PlayerState,
  type PlayerView,
  type TradeOffer,
  type TradeView,
  type TradeWant,
} from './types';

/** [A2] Character powers and Queen's Diplomacy. Contract: docs/island-adventure/CONTRACTS.md. */

export type PowerAction = Extract<GameAction, { type: 'royalGuard' | 'alchemy' | 'offerTrade' | 'respondTrade' | 'cancelTrade' }>;

export const POWER_ACTIONS: PowerAction['type'][] = ['royalGuard', 'alchemy', 'offerTrade', 'respondTrade', 'cancelTrade'];

/** Actions a player may send while it is not their turn. */
export const OFF_TURN_ACTIONS: PowerAction['type'][] = ['respondTrade', 'cancelTrade'];

export type PowerView = Pick<
  PlayerView,
  'players' | 'characters' | 'gems' | 'turn' | 'config' | 'status' | 'boardId' | 'bridges' | 'blocks' | 'transforms'
> & {
  hand?: PlayerView['hand'];
  hands?: GameState['hands'];
};

export interface PowerOptionInfo {
  type: 'royalGuard' | 'alchemy' | 'offerTrade';
  usable: boolean;
  reason: string;
  /** Royal Guard: legal target character ids. */
  targets?: string[];
  /** Alchemy: convertible carried gems with missing kinds they may become. */
  alchemy?: { characterId: string; gemId: string; from: GemKind; to: GemKind[] }[];
  /** Diplomacy: rivals and spare gem kinds the offerer can give. */
  trade?: { recipients: string[]; give: GemKind[] };
}

/** Spare banked copies (`bank[kind] >= 2`) available for Diplomacy. */
export function spareGems(player: Pick<PlayerState, 'bank'>): GemKind[] {
  return GEM_KINDS.filter((k) => (player.bank[k] ?? 0) >= 2);
}

function emptyBank(): Record<GemKind, number> {
  return { ruby: 0, sapphire: 0, emerald: 0, diamond: 0 };
}

function ensureBank(p: PlayerState): Record<GemKind, number> {
  if (!p.bank) p.bank = emptyBank();
  return p.bank;
}

function adjacentOpen(s: Pick<GameState, 'boardId' | 'bridges' | 'blocks' | 'transforms'>, a: string, b: string): boolean {
  return openEdges(s, a).some((e) => other(e, a) === b);
}

function kingOf(s: Pick<GameState, 'characters'>, playerId: string) {
  return Object.values(s.characters).find((c) => c.owner === playerId && c.kind === 'king') ?? null;
}

function queenOf(s: Pick<GameState, 'characters'>, playerId: string) {
  return Object.values(s.characters).find((c) => c.owner === playerId && c.kind === 'queen') ?? null;
}

function witchOf(s: Pick<GameState, 'characters'>, playerId: string) {
  return Object.values(s.characters).find((c) => c.owner === playerId && c.kind === 'witch') ?? null;
}

function isPowerCard(type: CardType): boolean {
  return CARD_CATEGORY[type] === 'power';
}

function royalGuardTargets(s: PowerView, playerId: string): string[] {
  const king = kingOf(s, playerId);
  if (!king || king.finished) return [];
  const out: string[] = [king.id];
  for (const c of Object.values(s.characters)) {
    if (c.owner !== playerId || c.id === king.id || c.finished) continue;
    if (adjacentOpen(s as GameState, king.node, c.node)) out.push(c.id);
  }
  return out;
}

/** The Witch's palace: her own castle or her kingdom's gate (where gems are banked). */
function atPalace(s: PowerView, playerId: string, node: string): boolean {
  const p = playerOf(s, playerId);
  const house = getBoard(s.boardId).board.houses.find((h) => h.seat === p.seat);
  return node === p.castle || node === house?.entry;
}

/**
 * Alchemy sources: a carried gem of a kind already banked, or a spare banked copy (`bank:<kind>`). Each
 * kind may be transmuted once per match, and only into a kind the kingdom has not banked.
 */
function alchemyChoices(s: PowerView, playerId: string): PowerOptionInfo['alchemy'] {
  const witch = witchOf(s, playerId);
  if (!witch || witch.finished || !atPalace(s, playerId, witch.node)) return [];
  const player = playerOf(s, playerId);
  const bank = ensureBank(player);
  const used = new Set(player.alchemyUsed ?? []);
  const to = (from: GemKind) => GEM_KINDS.filter((k) => k !== from && (bank[k] ?? 0) === 0);
  const out: NonNullable<PowerOptionInfo['alchemy']> = [];
  for (const gemId of witch.carrying) {
    const gem = s.gems.find((g) => g.id === gemId);
    if (!gem || (bank[gem.kind] ?? 0) < 1 || used.has(gem.kind)) continue;
    if (to(gem.kind).length) out.push({ characterId: witch.id, gemId, from: gem.kind, to: to(gem.kind) });
  }
  for (const k of GEM_KINDS) {
    if ((bank[k] ?? 0) < 2 || used.has(k) || out.some((o) => o.from === k)) continue;
    if (to(k).length) out.push({ characterId: witch.id, gemId: `bank:${k}`, from: k, to: to(k) });
  }
  return out;
}

/**
 * Which free powers the viewer may use right now (pure; works on a PlayerView — no other hands).
 */
export function powerOptions(s: PowerView, playerId: string): PowerOptionInfo[] {
  const out: PowerOptionInfo[] = [];
  const ownTurn = s.status === 'playing' && s.turn.playerId === playerId;
  const player = s.players.find((p) => p.id === playerId);

  {
    const targets = royalGuardTargets(s, playerId);
    const king = kingOf(s, playerId);
    let reason = 'Royal Guard is ready.';
    let usable = false;
    if (!ownTurn) reason = 'Royal Guard is only available on your turn.';
    else if (!king) reason = 'You have no King.';
    else if (!s.turn.moved.includes(king.id)) reason = 'Move your King this turn before using Royal Guard.';
    else if (player?.royalGuardUsed) reason = 'Royal Guard has already been used this match.';
    else if (!targets.length) reason = 'No valid Royal Guard target.';
    else usable = true;
    out.push({ type: 'royalGuard', usable, reason, targets: usable ? targets : [] });
  }

  {
    const alchemy = alchemyChoices(s, playerId);
    let reason = 'Alchemy can convert a carried gem.';
    let usable = false;
    const witch = witchOf(s, playerId);
    if (!ownTurn) reason = 'Alchemy is only available on your turn.';
    else if (!witch || witch.finished) reason = 'You have no Witch on the board.';
    else if (!atPalace(s, playerId, witch.node)) reason = 'Alchemy works only in the Witch’s palace: her castle or your kingdom’s gate.';
    else if (!alchemy?.length)
      reason = 'She needs a spare: a second banked copy of a gem, or a carried gem of a kind you already banked. Each kind can be transmuted only once per match, into a kind you still lack.';
    else usable = true;
    out.push({ type: 'alchemy', usable, reason, alchemy: usable ? alchemy : [] });
  }

  {
    const give = player ? spareGems(player) : [];
    const recipients = s.players.filter((p) => p.id !== playerId).map((p) => p.id);
    const queen = queenOf(s, playerId);
    let reason = 'Diplomacy can offer a spare gem.';
    let usable = false;
    if (!ownTurn) reason = 'Diplomacy is only available on your turn.';
    else if (!queen) reason = 'You have no Queen.';
    else if (!s.turn.moved.includes(queen.id)) reason = 'Move your Queen this turn before offering a trade.';
    else if (s.turn.diplomacyUsed) reason = 'You already made a Diplomacy offer this turn.';
    else if (!give.length) reason = 'You need a spare banked gem (two copies of one kind) to offer.';
    else if (!recipients.length) reason = 'No rival to trade with.';
    else usable = true;
    out.push({ type: 'offerTrade', usable, reason, trade: usable ? { recipients, give } : undefined });
  }

  return out;
}

/**
 * Validate and apply a power or trade action on the cloned state in `ctx`. Returns an error message,
 * or null once applied. These are free actions: they never set `moveDone` or `adventureDone`.
 */
export function applyPower(ctx: Ctx, playerId: string, action: PowerAction): string | null {
  switch (action.type) {
    case 'royalGuard':
      return applyRoyalGuard(ctx, playerId, action.targetId);
    case 'alchemy':
      return applyAlchemy(ctx, playerId, action.characterId, action.gemId, action.to);
    case 'offerTrade':
      return applyOfferTrade(ctx, playerId, action.to, action.give, action.want);
    case 'respondTrade':
      return applyRespondTrade(ctx, playerId, action.offerId, action.accept, action.cardId);
    case 'cancelTrade':
      return applyCancelTrade(ctx, playerId, action.offerId);
  }
}

function applyRoyalGuard(ctx: Ctx, playerId: string, targetId: string): string | null {
  const s = ctx.state;
  if (s.turn.playerId !== playerId) return 'Royal Guard is only available on your turn.';
  const player = playerOf(s, playerId);
  const king = kingOf(s, playerId);
  if (!king) return 'You have no King.';
  if (!s.turn.moved.includes(king.id)) return 'Move your King this turn before using Royal Guard.';
  if (player.royalGuardUsed) return 'Royal Guard has already been used this match.';
  const target = s.characters[targetId];
  if (!target || target.owner !== playerId) return 'Royal Guard can only protect your own character.';
  if (target.finished) return 'A finished character cannot be guarded.';
  if (target.id !== king.id && !adjacentOpen(s, king.node, target.node)) {
    return 'Royal Guard can protect the King or an unfinished ally on a space sharing an open edge with the King.';
  }
  target.guarded = true;
  player.royalGuardUsed = true;
  ctx.events.push({ type: 'royalGuard', characterId: king.id, targetId });
  log(
    ctx,
    target.id === king.id
      ? `${charLabel(s, king.id)} raises the Royal Guard — protected until their next turn.`
      : `${charLabel(s, king.id)} raises the Royal Guard over ${CHAR_NAMES[target.kind]} — protected until ${player.name}'s next turn.`,
    'good',
    playerId,
  );
  return null;
}

function applyAlchemy(ctx: Ctx, playerId: string, characterId: string, gemId: string, to: GemKind): string | null {
  const s = ctx.state;
  if (s.turn.playerId !== playerId) return 'Alchemy is only available on your turn.';
  const ch = s.characters[characterId];
  if (!ch || ch.owner !== playerId || ch.kind !== 'witch') return 'Alchemy requires your Witch.';
  if (ch.finished) return 'A finished Witch cannot use Alchemy.';
  if (!atPalace(s, playerId, ch.node)) return 'Alchemy works only in the Witch’s palace: her castle or your kingdom’s gate.';
  const player = playerOf(s, playerId);
  const bank = ensureBank(player);
  const fromBank = gemId.startsWith('bank:') ? (gemId.slice(5) as GemKind) : null;
  const gem = fromBank ? null : s.gems.find((g) => g.id === gemId);
  if (!fromBank && (!gem || gem.carriedBy !== ch.id)) return 'That gem is not carried by this Witch.';
  const from = fromBank ?? gem!.kind;
  if (!GEM_KINDS.includes(from)) return 'Choose a gem to transmute.';
  if (fromBank ? (bank[from] ?? 0) < 2 : (bank[from] ?? 0) < 1) return fromBank ? 'Alchemy needs a spare: a second banked copy of that gem.' : 'Alchemy needs a banked copy of the gem your Witch carries.';
  if ((player.alchemyUsed ?? []).includes(from)) return `Your Witch has already transmuted ${aGem(from)} this match. Each kind only once.`;
  if (!GEM_KINDS.includes(to)) return 'Choose a gem kind to convert into.';
  if (to === from) return 'Alchemy converts a gem into a different kind.';
  if ((bank[to] ?? 0) >= 1) return 'Alchemy only creates a kind your kingdom has not banked yet.';
  player.alchemyUsed = [...(player.alchemyUsed ?? []), from];
  ctx.events.push({ type: 'alchemy', characterId: ch.id, from, to });
  if (fromBank) {
    const was = finalUnlocked(s, playerId);
    bank[from] -= 1;
    bank[to] = (bank[to] ?? 0) + 1;
    syncGems(player);
    log(ctx, `${charLabel(s, ch.id)} transmutes a spare ${aGem(from).replace(/^an? /, '')} in the treasury into ${aGem(to)}. It is banked at once.`, 'good', playerId);
    announceUnlock(ctx, playerId, was);
  } else {
    gem!.kind = to;
    log(ctx, `${charLabel(s, ch.id)} transmutes ${aGem(from)} into ${aGem(to)} and banks it.`, 'good', playerId);
    bankGem(ctx, ch, gem!);
  }
  return null;
}

function validateWantAgainstRecipient(s: GameState, recipientId: string, give: GemKind, want: TradeWant, forAccept: boolean, cardId?: string): string | null {
  const recipient = playerOf(s, recipientId);
  ensureBank(recipient);
  if (want.kind === 'gem') {
    if (want.gem === give) return 'Ask for a different gem kind than the one you offer.';
    if ((recipient.bank[want.gem] ?? 0) < 2) {
      return forAccept ? 'That kingdom no longer has a spare of the requested gem.' : 'That kingdom needs a spare of that gem to trade.';
    }
    return null;
  }
  if (!isPowerCard(want.cardType)) return 'Diplomacy can only request a power card.';
  if (!forAccept) return null;
  const hand = s.hands[recipientId] ?? [];
  const idx = cardId ? hand.findIndex((c) => c.id === cardId && c.type === want.cardType) : hand.findIndex((c) => c.type === want.cardType);
  if (idx < 0) return cardId ? 'That card is not available for this trade.' : 'That kingdom does not hold the requested power card.';
  return null;
}

function applyOfferTrade(ctx: Ctx, playerId: string, to: string, give: GemKind, want: TradeWant): string | null {
  const s = ctx.state;
  if (s.turn.playerId !== playerId) return 'Diplomacy is only available on your turn.';
  const queen = queenOf(s, playerId);
  if (!queen) return 'You have no Queen.';
  if (!s.turn.moved.includes(queen.id)) return 'Move your Queen this turn before offering a trade.';
  if (s.turn.diplomacyUsed) return 'You already made a Diplomacy offer this turn.';
  if (to === playerId) return 'Offer Diplomacy to another kingdom.';
  if (!s.players.some((p) => p.id === to)) return 'That kingdom is not in this match.';
  const offerer = playerOf(s, playerId);
  ensureBank(offerer);
  if ((offerer.bank[give] ?? 0) < 2) return 'You need a spare banked gem to offer (two copies of that kind).';
  const wantErr = validateWantAgainstRecipient(s, to, give, want, false);
  if (wantErr) return wantErr;
  const offer: TradeOffer = {
    id: `t${++s.tradeCounter}`,
    from: playerId,
    to,
    give,
    want,
    turn: s.turn.number,
  };
  s.trades.push(offer);
  s.turn.diplomacyUsed = true;
  ctx.events.push({ type: 'tradeOffered', offerId: offer.id, from: playerId, to });
  const wantText =
    want.kind === 'gem' ? aGem(want.gem) : `a ${want.cardType.replace(/_/g, ' ')} card`;
  log(ctx, `${playerName(s, playerId)}'s Queen offers ${aGem(give)} to ${playerName(s, to)} for ${wantText}.`, 'info', playerId);
  return null;
}

function removeOffer(s: GameState, offerId: string): TradeOffer | null {
  const i = s.trades.findIndex((t) => t.id === offerId);
  if (i < 0) return null;
  return s.trades.splice(i, 1)[0];
}

function applyRespondTrade(ctx: Ctx, playerId: string, offerId: string, accept: boolean, cardId?: string): string | null {
  const s = ctx.state;
  const offer = s.trades.find((t) => t.id === offerId);
  if (!offer) return 'That trade offer is no longer open.';
  if (offer.to !== playerId) return 'Only the recipient may answer this offer.';
  if (!accept) {
    removeOffer(s, offerId);
    ctx.events.push({ type: 'tradeResolved', offerId, from: offer.from, to: offer.to, outcome: 'declined' });
    log(ctx, `${playerName(s, playerId)} declines ${playerName(s, offer.from)}'s Diplomacy offer.`, 'info', playerId);
    return null;
  }

  const offerer = playerOf(s, offer.from);
  const recipient = playerOf(s, offer.to);
  ensureBank(offerer);
  ensureBank(recipient);
  if ((offerer.bank[offer.give] ?? 0) < 2) return 'The offered spare gem is no longer available.';
  const wantErr = validateWantAgainstRecipient(s, offer.to, offer.give, offer.want, true, cardId);
  if (wantErr) return wantErr;

  let cardIdx = -1;
  if (offer.want.kind === 'card') {
    const offererHand = s.hands[offer.from] ?? [];
    if (offererHand.length >= s.config.handLimit) return "The offering kingdom's hand is full — they cannot receive a card.";
    const wantType = offer.want.cardType;
    const hand = s.hands[offer.to] ?? [];
    cardIdx = cardId ? hand.findIndex((c) => c.id === cardId && c.type === wantType) : hand.findIndex((c) => c.type === wantType);
    if (cardIdx < 0) return 'That kingdom does not hold the requested power card.';
  }

  const wasFrom = finalUnlocked(s, offer.from);
  const wasTo = finalUnlocked(s, offer.to);

  offerer.bank[offer.give]--;
  recipient.bank[offer.give] = (recipient.bank[offer.give] ?? 0) + 1;

  if (offer.want.kind === 'gem') {
    recipient.bank[offer.want.gem]--;
    offerer.bank[offer.want.gem] = (offerer.bank[offer.want.gem] ?? 0) + 1;
  } else {
    const card = s.hands[offer.to].splice(cardIdx, 1)[0];
    s.hands[offer.from].push(card);
  }

  syncGems(offerer);
  syncGems(recipient);
  removeOffer(s, offerId);
  ctx.events.push({ type: 'tradeResolved', offerId, from: offer.from, to: offer.to, outcome: 'accepted' });
  log(ctx, `${playerName(s, offer.to)} accepts ${playerName(s, offer.from)}'s Diplomacy offer.`, 'good', offer.to);
  announceUnlock(ctx, offer.from, wasFrom);
  announceUnlock(ctx, offer.to, wasTo);
  return null;
}

function applyCancelTrade(ctx: Ctx, playerId: string, offerId: string): string | null {
  const s = ctx.state;
  const offer = s.trades.find((t) => t.id === offerId);
  if (!offer) return 'That trade offer is no longer open.';
  if (offer.from !== playerId) return 'Only the offering kingdom may cancel this trade.';
  removeOffer(s, offerId);
  ctx.events.push({ type: 'tradeResolved', offerId, from: offer.from, to: offer.to, outcome: 'cancelled' });
  log(ctx, `${playerName(s, playerId)} withdraws their Diplomacy offer to ${playerName(s, offer.to)}.`, 'info', playerId);
  return null;
}

/** Called by the turn flow at `playerId`'s `turnStarted`: their Royal Guard ends. */
export function clearGuards(ctx: Ctx, playerId: string): void {
  for (const c of Object.values(ctx.state.characters)) {
    if (c.owner === playerId && c.guarded) c.guarded = false;
  }
}

/** Called by the turn flow just before `playerId`'s turn ends: their open offers expire. */
export function expireTrades(ctx: Ctx, playerId: string): void {
  const s = ctx.state;
  const doomed = s.trades.filter((t) => t.from === playerId);
  if (!doomed.length) return;
  s.trades = s.trades.filter((t) => t.from !== playerId);
  for (const offer of doomed) {
    ctx.events.push({ type: 'tradeResolved', offerId: offer.id, from: offer.from, to: offer.to, outcome: 'expired' });
    log(ctx, `${playerName(s, playerId)}'s Diplomacy offer to ${playerName(s, offer.to)} expires.`, 'info', playerId);
  }
}

/** Open offers as `viewerId` may see them (third parties learn only who is trading). */
export function tradesFor(s: Pick<GameState, 'trades'>, viewerId: string | null): TradeView[] {
  return (s.trades ?? []).map((t) => {
    if (viewerId && (t.from === viewerId || t.to === viewerId)) {
      return { id: t.id, from: t.from, to: t.to, give: t.give, want: t.want };
    }
    return { id: t.id, from: t.from, to: t.to };
  });
}
