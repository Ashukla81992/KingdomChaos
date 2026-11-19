import type { GameEvent, LogEntry, MonsterId } from '@/engine';
import type { SoundName } from './sound';

/**
 * Turning resolved game events into sounds and board animations.
 *
 * Everything here reads the server's resolved events (`lastEvents`), never a local guess, so every
 * device animates the same outcome. Each batch carries `eventSeq`; a client handles a batch once and
 * remembers the id per match, so polls, retries, reconnects and state refreshes never replay it.
 */

/** A short board animation in map coordinates (so zoom and resizing keep it on the right spaces). */
export interface Strike {
  id: number;
  kind: 'fire' | 'fireMiss' | 'slam' | 'web' | 'blocked' | 'expire' | 'shield';
  /** Space the effect starts from (the dragon's rider, the monster). */
  from: string;
  /** Space it lands on. */
  to: string;
  monster?: MonsterId;
  /** Short caption shown at the target once the effect lands. */
  caption?: string;
}

/** The sounds one batch should play, most important first, at most three, no repeats. */
export function soundsFor(events: GameEvent[]): SoundName[] {
  const out: SoundName[] = [];
  const add = (s: SoundName) => {
    if (!out.includes(s)) out.push(s);
  };
  for (const e of events) {
    switch (e.type) {
      case 'gameOver':
        add('win');
        break;
      case 'dragonFire':
        add(e.hit === false ? 'fireMiss' : 'dragonFire');
        break;
      case 'monsterEvent':
        if (e.kind === 'attack') {
          if (e.outcome === 'blocked') add('shieldBlock');
          else add(e.effect === 'web' ? 'spiderWeb' : 'golemSlam');
        }
        break;
      case 'battleExchange':
        add(e.choice === 'guard' ? 'guard' : 'strike');
        if (e.blocked) add('shieldBlock');
        else if (e.taken) add(e.monster === 'spider' ? 'spiderWeb' : 'golemSlam');
        break;
      case 'battleStarted':
        add('monsterAlert');
        break;
      case 'cut':
      case 'defeated':
        add('capture');
        break;
      case 'protectionEnded':
        add(e.reason === 'consumed' ? 'shieldBlock' : 'shieldExpire');
        break;
      case 'protectionGranted':
        add('shieldUp');
        break;
      case 'banked':
      case 'finalUnlocked':
      case 'slay':
        add('bank');
        break;
      case 'pickedUp':
      case 'discovery':
      case 'tame':
        add('pickup');
        break;
      case 'teleported':
        add(e.reason === 'portal' ? 'portal' : 'step');
        break;
      case 'edgeChanged':
      case 'terrainChanged':
        add('bridge');
        break;
      case 'cardPlayed':
      case 'cardDrawn':
        add('card');
        break;
      case 'rolled':
        add('roll');
        break;
      case 'moved':
        add('step');
        break;
      case 'monsterHit':
        add(e.hit ? 'strike' : 'error');
        break;
      default:
        break;
    }
  }
  // Big moments first; footsteps and dice are only heard when nothing bigger happened.
  const rank: SoundName[] = ['win', 'dragonFire', 'fireMiss', 'golemSlam', 'spiderWeb', 'shieldBlock', 'capture', 'bank', 'monsterAlert', 'strike', 'guard', 'shieldExpire', 'shieldUp', 'portal', 'bridge', 'pickup', 'card', 'roll', 'step', 'error'];
  return out.sort((a, b) => rank.indexOf(a) - rank.indexOf(b)).slice(0, 3);
}

/** Board animations for one batch. `homeOf` gives a monster's space. */
export function strikesFor(events: GameEvent[], homeOf: (m: MonsterId) => string | undefined, nextId: () => number): Strike[] {
  const out: Strike[] = [];
  for (const e of events) {
    if (e.type === 'dragonFire' && e.from && e.at) {
      out.push({ id: nextId(), kind: e.hit === false ? 'fireMiss' : 'fire', from: e.from, to: e.at, caption: e.hit === false ? `Missed (rolled ${e.roll})` : `Burned! (rolled ${e.roll})` });
    } else if (e.type === 'monsterEvent' && e.kind === 'attack' && e.monster && e.from) {
      const origin = e.origin ?? e.at ?? homeOf(e.monster) ?? e.from;
      const kind = e.outcome === 'blocked' ? 'blocked' : e.effect === 'web' ? 'web' : 'slam';
      const caption = e.outcome === 'blocked' ? 'Shield blocked it' : e.outcome === 'pushed' ? 'Pushed back' : e.outcome === 'stuck' ? 'Nowhere to fall' : e.outcome === 'alreadyWebbed' ? 'Already webbed' : e.effect === 'web' ? 'Webbed: next move shorter' : 'Slammed';
      out.push({ id: nextId(), kind, from: origin, to: e.from, monster: e.monster, caption });
    } else if (e.type === 'battleExchange' && e.taken + e.damage > 0) {
      const home = homeOf(e.monster);
      if (home) out.push({ id: nextId(), kind: e.blocked ? 'blocked' : e.monster === 'spider' ? 'web' : 'slam', from: home, to: home, monster: e.monster });
    }
  }
  return out;
}

// ---------------------------------------------------------------- dedupe

const SEEN = 'kc:seen:';

/** The last event batch this device handled for a match (0 when none or storage is unavailable). */
export function seenBatch(matchKey: string): number {
  try {
    return Number(sessionStorage.getItem(SEEN + matchKey) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function markBatch(matchKey: string, seq: number): void {
  try {
    sessionStorage.setItem(SEEN + matchKey, String(seq));
  } catch {
    /* storage blocked: in-memory refs still dedupe within this page */
  }
}

/** A concise recap for a restored match: the last few meaningful log lines. */
export function recapLines(log: LogEntry[], max = 4): string[] {
  return log
    .filter((l) => l.kind !== 'system' && !/ rolled \d|moves to /.test(l.text))
    .slice(-max)
    .map((l) => l.text);
}
