import {
  CARD_INFO,
  CHARACTER_INFO,
  GEM_NAMES,
  aGem,
  charLabel,
  getBoard,
  nodeName,
  type GameEvent,
  type PlayerView,
} from '@/engine';

export type EventTone = 'info' | 'good' | 'bad' | 'gold' | 'warn';

/** One translucent board card: what happened, why, what you can do now. */
export interface EventCardModel {
  /** Stable key for help-frequency tracking (event type + optional subtype). */
  kind: string;
  title: string;
  why: string;
  now: string;
  tone: EventTone;
}

const who = (view: PlayerView, playerId: string) =>
  playerId === view.viewerId ? 'You' : (view.players.find((p) => p.id === playerId)?.name ?? 'Someone');

const piece = (view: PlayerView, id: string) => {
  const c = view.characters[id];
  if (!c) return 'A piece';
  if (c.owner === view.viewerId) return `Your ${CHARACTER_INFO[c.kind].name}`;
  return charLabel(view, id);
};

/** Map recent engine facts into short event cards for the board overlay. */
export function explainEvents(view: PlayerView, events: GameEvent[] = view.lastEvents): EventCardModel[] {
  const me = view.viewerId;
  const cards: EventCardModel[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'rolled': {
        const steps = e.steps ?? e.value;
        const mine = me === e.playerId;
        const penalty =
          e.penalty === 'dragon'
            ? `The dragon leaves ${mine ? 'you' : 'them'} ${steps} step${steps === 1 ? '' : 's'}`
            : e.penalty === 'slowed'
              ? `Slow Down caps the roll at ${steps}`
              : null;
        cards.push({
          kind: e.bonus ? 'rolled-bonus' : 'rolled',
          title: `${mine ? 'You' : who(view, e.playerId)} rolled ${e.value}`,
          why: penalty ?? (e.bonus ? 'This is a bonus roll' : 'Movement allowance for this roll'),
          now: mine ? 'Choose a piece that can use the full allowance, then tap a glowing space.' : 'Watch the board.',
          tone: 'info',
        });
        break;
      }
      case 'extraTurn':
        cards.push({
          kind: `bonus-${e.reason}`,
          title: 'Bonus roll earned',
          why: e.reason === 'six' ? 'You rolled a 6' : 'You captured on this move',
          now: me === e.playerId ? 'Finish this move, then roll again in the same turn.' : `${who(view, e.playerId)} will roll again.`,
          tone: 'good',
        });
        break;
      case 'noMove':
        cards.push({
          kind: 'noMove',
          title: 'No legal move',
          why: `Nothing can use all ${e.steps} step${e.steps === 1 ? '' : 's'}`,
          now: me === e.playerId ? 'Movement is skipped. Any pending bonus still resolves.' : `${who(view, e.playerId)} skips movement.`,
          tone: 'warn',
        });
        break;
      case 'routeAttack':
        cards.push({
          kind: 'routeAttack',
          title: 'Route attack',
          why: `${piece(view, e.characterId)} chose ${e.targets.length} targets along the path`,
          now: 'Those rivals go home. Unchosen rivals were passed safely.',
          tone: 'good',
        });
        break;
      case 'encounter':
        cards.push({
          kind: `encounter-${e.monster}`,
          title: e.monster === 'golem' ? 'Stone Golem' : 'Cave Spider',
          why: `Rolled ${e.roll}${e.total !== e.roll ? ` (total ${e.total})` : ''} — ${e.success ? 'success' : 'failure'}`,
          now: e.success
            ? e.monster === 'golem'
              ? `Carried along the shortcut to ${nodeName(view.boardId, e.to)}.`
              : 'A power card is waiting in your hand (or you declined a full hand).'
            : `Sent to the safe room at ${nodeName(view.boardId, e.to)}.`,
          tone: e.success ? 'good' : 'bad',
        });
        break;
      case 'dragonFire':
        cards.push(
          e.hit === false
            ? {
                kind: 'dragonFire-miss',
                title: `Dragon Fire missed (attack die ${e.roll})`,
                why: `${piece(view, e.characterId)}'s dragon aimed at ${piece(view, e.targetId)} but needed ${view.config.dragonFireHit ?? 4}+`,
                now: 'The Adventure action is spent. Nothing else happens.',
                tone: 'warn',
              }
            : {
                kind: 'dragonFire',
                title: e.roll ? `Dragon Fire hit (attack die ${e.roll})` : 'Dragon Fire',
                why: `${piece(view, e.characterId)} scorched ${piece(view, e.targetId)}`,
                now: 'They return home. Carried gems drop where they stood. No capture credit, no bonus roll.',
                tone: 'bad',
              },
        );
        break;
      case 'monsterEvent': {
        const name = e.monster === 'golem' ? 'Stone Golem' : e.monster === 'spider' ? 'Cave Spider' : 'Monsters';
        if (e.kind === 'quiet') {
          cards.push({ kind: 'monster-quiet', title: `Round ${e.round}: the dungeon is quiet`, why: `Monster die ${e.die} (1–${view.config.monsterQuietMax ?? 3} means no attack)`, now: 'Play on.', tone: 'info' });
        } else if (e.kind === 'patrol') {
          // Idle: nobody was in its territory. No attack notice at all.
        } else if (e.characterId) {
          const target = piece(view, e.characterId);
          cards.push({
            kind: `monster-${e.effect}`,
            title: e.outcome === 'blocked' ? `${name} attack blocked` : e.counter ? `${name} strikes back!` : `${name} hit ${target}`,
            why: e.counter ? `${target} attacked it and missed` : `Monster die ${e.die}: ${target} was within ${view.config.monsterRange ?? 3} connected steps${e.outside ? ' of the Dragon Gate' : ''}`,
            now:
              e.outcome === 'blocked'
                ? `${target}'s Shield absorbed it and broke. No other effect.`
                : e.effect === 'push'
                ? e.to && e.to !== e.from
                  ? `${target} is pushed back from ${nodeName(view.boardId, e.from!)} to ${nodeName(view.boardId, e.to)}.`
                  : `${target} had no legal space behind them and stays put.`
                : `${target} is webbed: their next move is ${view.config.webPenalty ?? 2} shorter (minimum 1).`,
            tone: 'bad',
          });
        }
        break;
      }
      case 'battleEnded': {
        const who = piece(view, e.characterId);
        cards.push(
          e.outcome === 'won'
            ? { kind: 'battle-won', title: 'Stone Golem defeated!', why: `${who} won the battle`, now: 'The stone gate is open: this kingdom takes the shortcut for the rest of the match.', tone: 'gold' }
            : e.outcome === 'lost'
              ? { kind: 'battle-lost', title: 'Battle lost', why: `${who} ran out of stamina`, now: `Carried gems dropped in the Golem's chamber. ${who} limps to ${nodeName(view.boardId, e.to)}.`, tone: 'bad' }
              : { kind: 'battle-retreat', title: 'Retreat', why: `${who} backed away from the Golem`, now: `Back at ${nodeName(view.boardId, e.to)}. No reward.`, tone: 'info' },
        );
        break;
      }
      case 'protectionEnded': {
        if (e.reason !== 'expired') break;
        const ward = e.ward === 'shield' ? 'Shield' : e.ward === 'immune' ? 'Immunity' : 'Royal Guard';
        cards.push({ kind: 'protection-expired', title: `${ward} expired`, why: `${piece(view, e.characterId)} has had its ${view.config.protectionMoves ?? 2} enemy moves`, now: 'It can be captured and attacked again.', tone: 'info' });
        break;
      }
      case 'monsterHit': {
        const name = e.monster === 'golem' ? 'Stone Golem' : 'Cave Spider';
        const how = e.how === 'fire' ? 'Dragon Fire' : e.how === 'attack' ? 'an attack' : 'winning its fight';
        if (!e.hit) {
          if (e.how === 'fire') cards.push({ kind: 'monster-miss', title: `Dragon Fire missed the ${name}`, why: `Attack die ${e.roll}, needed ${view.config.dragonFireHit ?? 4}+`, now: 'The Adventure action is spent.', tone: 'warn' });
          break;
        }
        cards.push(
          e.slain
            ? { kind: 'monster-slain', title: `${name} slain!`, why: `${piece(view, e.characterId)} landed the last hit with ${how}`, now: e.monster === 'golem' ? 'It is gone for the match. Its shortcut is open to every kingdom.' : 'It is gone for the match. The slayer takes a power card from its hoard.', tone: 'gold' }
            : { kind: 'monster-hit', title: `${name} wounded`, why: `${piece(view, e.characterId)} hit it with ${how}`, now: `${e.hp} ${e.hp === 1 ? 'heart' : 'hearts'} left. It is knocked out until the end of next round: no attacks, no fight.`, tone: 'good' },
        );
        break;
      }
      case 'monsterRecovered':
        cards.push({ kind: 'monster-recovered', title: `${e.monster === 'golem' ? 'Stone Golem' : 'Cave Spider'} recovered`, why: 'Its rest after a defeat is over', now: 'Ending a move on its space means a fight again.', tone: 'warn' });
        break;
      case 'slay':
        cards.push({
          kind: 'slay',
          title: e.success ? 'Dragon Slayer!' : 'Slay failed',
          why: `Rolled ${e.roll}`,
          now: e.success ? 'The wild dragon clears and recovers in its lair for a round.' : 'Retreat to a safe space.',
          tone: e.success ? 'gold' : 'bad',
        });
        break;
      case 'tradeOffered':
        cards.push({
          kind: 'tradeOffered',
          title: 'Trade offered',
          why: `${who(view, e.from)} offered a deal to ${who(view, e.to)}`,
          now: me === e.to ? 'Open Diplomacy to accept or decline.' : me === e.from ? 'Waiting on their answer. You may cancel.' : `${who(view, e.from)} and ${who(view, e.to)} are trading.`,
          tone: 'info',
        });
        break;
      case 'tradeResolved': {
        const outcome =
          e.outcome === 'accepted' ? 'accepted' : e.outcome === 'declined' ? 'declined' : e.outcome === 'cancelled' ? 'cancelled' : 'expired';
        cards.push({
          kind: `trade-${e.outcome}`,
          title: `Trade ${outcome}`,
          why: `${who(view, e.from)} ↔ ${who(view, e.to)}`,
          now: e.outcome === 'accepted' ? 'Gems and cards swapped as offered.' : 'The offer is closed.',
          tone: e.outcome === 'accepted' ? 'good' : 'info',
        });
        break;
      }
      case 'finished':
        cards.push({
          kind: 'finished',
          title: 'Piece finished!',
          why: `${piece(view, e.characterId)} entered the Crown Temple (${e.count} of ${view.config.finishersToWin})`,
          now: e.count >= view.config.finishersToWin ? 'That kingdom wins the match.' : 'Get the rest of the house into the temple.',
          tone: 'gold',
        });
        break;
      case 'edgeChanged': {
        const by = e.by ? who(view, e.by) : 'Someone';
        const change = e.change === 'closed' || e.change === 'blocked' ? 'destroyed' : e.change === 'opened' || e.change === 'cleared' ? 'opened' : 'changed';
        const name = getBoard(view.boardId).board.edges.find((x) => x.id === e.edgeId)?.name ?? 'a crossing';
        cards.push({
          kind: 'edgeChanged',
          title: `${by} ${change} the ${name.replace(/ \(.*\)$/, '')}`,
          why: e.card ? CARD_INFO[e.card]?.name ?? 'A map card' : 'The roads shifted',
          now: me === view.turn.playerId ? 'Take the highlighted detour if your route closed.' : 'Routes will update on the next roll.',
          tone: change === 'destroyed' ? 'warn' : 'info',
        });
        break;
      }
      case 'terrainChanged': {
        const by = e.by ? who(view, e.by) : 'Someone';
        cards.push({
          kind: 'terrainChanged',
          title: e.to ? `${by} raised a ${e.to}` : `${by} repaired the land`,
          why: `At ${nodeName(view.boardId, e.node)}`,
          now: 'Paths through that space close until repaired.',
          tone: 'warn',
        });
        break;
      }
      case 'finalUnlocked':
        cards.push({
          kind: 'finalUnlocked',
          title: me === e.playerId ? 'Royal Path open' : `${who(view, e.playerId)} opened their Royal Path`,
          why: 'One of each gem kind is banked',
          now:
            me === e.playerId
              ? 'A piece that has touched all four markers may turn in at your fork.'
              : 'Cut their ready pieces before they finish.',
          tone: me === e.playerId ? 'gold' : 'warn',
        });
        break;
      case 'cut': {
        const mover = view.characters[e.characterId];
        const mine = mover?.owner === me;
        cards.push({
          kind: 'cut',
          title: mine ? 'Capture!' : `${piece(view, e.targetId)} was captured`,
          why: `${piece(view, e.characterId)} landed the cut`,
          now: e.stole.length ? `Took ${e.stole.map((k) => GEM_NAMES[k]).join(' and ')}.` : 'They return to their castle with their markers.',
          tone: mine ? 'good' : 'bad',
        });
        break;
      }
      case 'banked':
        if (e.playerId === me) {
          cards.push({
            kind: e.duplicate ? 'bank-spare' : 'banked',
            title: e.duplicate ? 'Spare gem banked' : `${GEM_NAMES[e.gem]} banked`,
            why: e.duplicate ? `You already had ${aGem(e.gem)}` : 'Carried home to your gate',
            now: e.duplicate ? 'Spares fuel Diplomacy and Alchemy.' : 'Keep banking every kind to open the Royal Path.',
            tone: 'good',
          });
        }
        break;
      case 'royalGuard':
        cards.push({
          kind: 'royalGuard',
          title: 'Royal Guard',
          why: `${piece(view, e.characterId)} guards ${piece(view, e.targetId)}`,
          now: 'That piece cannot be captured until their next turn.',
          tone: 'good',
        });
        break;
      case 'alchemy':
        cards.push({
          kind: 'alchemy',
          title: 'Alchemy',
          why: `${piece(view, e.characterId)} turned ${GEM_NAMES[e.from]} into ${GEM_NAMES[e.to]}`,
          now: 'Carry the new gem home to bank it.',
          tone: 'good',
        });
        break;
      case 'lap': {
        const c = view.characters[e.characterId];
        if (c?.owner === me) {
          const house = getBoard(view.boardId).board.houses.find((h) => h.seat === e.plate);
          cards.push({
            kind: 'lap',
            title: e.checkpoint === 4 ? 'All markers touched' : `${house?.name ?? 'House'} marker`,
            why: `${CHARACTER_INFO[c.kind].name} now has ${e.checkpoint} of 4`,
            now: e.checkpoint === 4 ? 'Ready for the temple gate once the path is open.' : 'Touch the remaining house markers.',
            tone: 'good',
          });
        }
        break;
      }
      default:
        break;
    }
  }
  // Prefer the newest actionable card; keep a short stack.
  return cards.slice(-3);
}

/** Shorter copy after the player has seen the full help twice. */
export function shortenCard(card: EventCardModel, seen: number): EventCardModel {
  if (seen < 2) return card;
  return { ...card, why: card.why.split('.')[0]!, now: card.now.split('.')[0]! };
}
