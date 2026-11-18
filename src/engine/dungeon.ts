import { getBoard } from './board';
import { DEFAULT_CONFIG } from './config';
import { walkingDistances } from './graph';
import { randomInt } from './rng';
import { canArrive, charLabel, drawCard, isProtected, log, retreat, relocate, roll, type Ctx } from './rules';
import type { BoardState, Character, GameEvent, GameState, MonsterId, MonsterState } from './types';

/** [A3] Encounters, the dragon on the road, and the Dragon Slayer duel. Contract: docs/island-adventure/CONTRACTS.md. */

/** This kingdom beat the Golem on `node` and may use its shortcut freely. */
export function shortcutOpenFor(s: Pick<BoardState, 'shortcutsOpen'>, node: string, playerId: string): boolean {
  return !!s.shortcutsOpen?.[node]?.includes(playerId);
}

function holdsSlayer(s: BoardState, playerId: string): boolean {
  const hands = (s as GameState).hands;
  return !!hands?.[playerId]?.some((c) => c.type === 'dragon_slayer');
}

/**
 * How the dragon's space treats this mover. `block`: may end there (to tame) but never pass.
 * `pass`: may walk through and end there (the Witch, wild only). `slay`: the Queen holding Dragon
 * Slayer may end there to fight it.
 */
export function dragonSpaceRule(s: BoardState, characterId: string): 'block' | 'pass' | 'slay' {
  if (s.dragon.state !== 'wild' && s.dragon.state !== 'guarding') return 'block';
  const ch = s.characters[characterId];
  if (!ch) return 'block';
  if (s.dragon.state === 'wild' && ch.kind === 'witch') return 'pass';
  if (s.dragon.state === 'wild' && ch.kind === 'queen' && holdsSlayer(s, ch.owner)) return 'slay';
  return 'block';
}

/** What ending a move on `node` would trigger, for previews. Null when nothing happens there. */
export interface ArrivalPreview {
  kind: 'golem' | 'spider' | 'slay' | 'shortcut';
  name: string;
  /** Roll needed (after the Knight's bonus). */
  need: number;
  success: string;
  failure: string;
}

export function arrivalPreview(s: BoardState, characterId: string, node: string): ArrivalPreview | null {
  const ch = s.characters[characterId];
  if (!ch) return null;
  const { nodes } = getBoard(s.boardId);
  const def = nodes[node];
  const knightBonus = ch.kind === 'knight' ? s.config.knightBonus : 0;
  const need = s.config.encounterThreshold - knightBonus;

  if (def?.encounter) {
    const enc = def.encounter;
    const dest0 = enc.shortcutTo ? nodes[enc.shortcutTo]?.name ?? enc.shortcutTo : 'the shortcut';
    if (enc.monster === 'golem' && enc.shortcutTo && shortcutOpenFor(s, node, ch.owner))
      return { kind: 'shortcut', name: `${enc.name} shortcut`, need: 0, success: `Your kingdom beat the ${enc.name}: the shortcut carries you to ${dest0}, no fight.`, failure: '' };
    const m = monsterAt(s, node);
    if (m && monsterResting(s, m)) return null;
    if (enc.monster === 'golem') {
      const dest = enc.shortcutTo ? nodes[enc.shortcutTo]?.name ?? enc.shortcutTo : 'the shortcut';
      return {
        kind: 'golem',
        name: enc.name,
        need,
        success: `Beat the ${enc.name} (need ${need}+): take the shortcut to ${dest}, and it stays open for your whole kingdom.`,
        failure: `The ${enc.name} drives you to ${nodes[enc.safeRoom]?.name ?? enc.safeRoom}.`,
      };
    }
    return {
      kind: 'spider',
      name: enc.name,
      need,
      success: `Beat the ${enc.name} (need ${need}+) and draw a power card.`,
      failure: `The ${enc.name} drives you to ${nodes[enc.safeRoom]?.name ?? enc.safeRoom}.`,
    };
  }

  if (s.dragon.state === 'wild' && s.dragon.node === node && ch.kind === 'queen' && holdsSlayer(s, ch.owner)) {
    return {
      kind: 'slay',
      name: 'Dragon Slayer',
      need: s.config.encounterThreshold,
      success: `Roll ${s.config.encounterThreshold}+ to drive the dragon back to its lair to recover.`,
      failure: 'The dragon swats you away; Dragon Slayer is discarded.',
    };
  }
  return null;
}

/**
 * Forced encounter at the end of a move, called by the movement code after landing captures and
 * pickups, before traps and the temple. Rolls once and moves the piece as needed.
 *
 * Failure on a Dragon Slayer arrival duel uses `retreat` (nearest safe space, else castle) and
 * discards the Dragon Slayer card. Success keeps the card.
 */
export function resolveArrival(ctx: Ctx, ch: Character, discardCardId?: string | null): void {
  const s = ctx.state;
  const { nodes, board } = getBoard(s.boardId);
  const node = nodes[ch.node];
  if (!node) return;

  if (node.encounter) {
    const enc = node.encounter;
    if (enc.monster === 'golem' && enc.shortcutTo && shortcutOpenFor(s, ch.node, ch.owner)) {
      const to = enc.shortcutTo;
      log(ctx, `${charLabel(s, ch.id)} uses their kingdom's ${enc.name} shortcut to ${nodes[to]?.name ?? to}.`, 'good', ch.owner);
      relocate(ctx, ch, to, 'shortcut', `${enc.name} shortcut`, discardCardId);
      return;
    }
    const resting = monsterAt(s, ch.node);
    if (resting && monsterResting(s, resting)) {
      log(ctx, `The ${enc.name} is still recovering from its defeat; ${charLabel(s, ch.id)} passes unchallenged.`, 'info', ch.owner);
      return;
    }
    const value = roll(s);
    const bonus = ch.kind === 'knight' ? s.config.knightBonus : 0;
    const total = value + bonus;
    const success = total >= s.config.encounterThreshold;
    const who = charLabel(s, ch.id);
    const bonusNote = bonus ? ` (+${bonus} Knight)` : '';

    if (success && enc.monster === 'golem' && enc.shortcutTo) {
      const to = enc.shortcutTo;
      const open = (s.shortcutsOpen ??= {});
      open[ch.node] = [...new Set([...(open[ch.node] ?? []), ch.owner])];
      defeatMonster(s, ch.node);
      ctx.events.push({ type: 'encounter', characterId: ch.id, monster: 'golem', roll: value, total, success: true, to });
      log(ctx, `${who} rolls ${value}${bonusNote} = ${total} and beats the ${enc.name}! The shortcut carries them to ${nodes[to]?.name ?? to}, and it stays open for their kingdom.`, 'good', ch.owner);
      relocate(ctx, ch, to, 'encounter', enc.name, discardCardId);
      return;
    }
    if (success && enc.monster === 'spider') {
      defeatMonster(s, ch.node);
      ctx.events.push({ type: 'encounter', characterId: ch.id, monster: 'spider', roll: value, total, success: true, to: ch.node });
      log(ctx, `${who} rolls ${value}${bonusNote} = ${total} and beats the ${enc.name}! A power card waits in the chest.`, 'good', ch.owner);
      drawCard(ctx, ch.owner, { category: 'power', discardCardId });
      return;
    }
    const to = enc.safeRoom;
    ctx.events.push({ type: 'encounter', characterId: ch.id, monster: enc.monster, roll: value, total, success: false, to });
    log(ctx, `${who} rolls ${value}${bonusNote} = ${total} (needs ${s.config.encounterThreshold}+) — the ${enc.name} drives them to ${nodes[to]?.name ?? to}.`, 'bad', ch.owner);
    relocate(ctx, ch, to, 'encounter', enc.name, discardCardId);
    return;
  }

  if (s.dragon.state === 'wild' && s.dragon.node === ch.node && ch.kind === 'queen') {
    const hand = s.hands[ch.owner];
    const idx = hand.findIndex((c) => c.type === 'dragon_slayer');
    if (idx < 0) return;
    const value = roll(s);
    const success = value >= s.config.encounterThreshold;
    s.stats[ch.owner].slayAttempts++;
    ctx.events.push({ type: 'slay', characterId: ch.id, roll: value, success });
    if (success) {
      s.stats[ch.owner].slays++;
      s.dragon = {
        state: 'recovering',
        node: board.dragonHome,
        companion: null,
        recoverUntilTurn: s.turn.number + s.players.length - 1,
        releasedBy: null,
      };
      log(ctx, `${charLabel(s, ch.id)} rolls ${value} and drives the dragon back to its lair to recover for a round!`, 'dragon', ch.owner);
    } else {
      const card = hand.splice(idx, 1)[0];
      s.discard.push(card);
      log(ctx, `${charLabel(s, ch.id)} rolls ${value} — the dragon swats them away. Dragon Slayer is lost.`, 'bad', ch.owner);
      retreat(ctx, ch);
    }
  }
}

export type EncounterEvent = Extract<GameEvent, { type: 'encounter' | 'slay' }>;


// ---------------------------------------------------------------- roaming monsters

/** The board's monsters, one per encounter space, all active. */
export function initialMonsters(boardId: string): MonsterState[] {
  return getBoard(boardId).board.nodes
    .filter((n) => n.encounter)
    .map((n) => ({ id: n.encounter!.monster, name: n.encounter!.name, home: n.id, node: n.id, restUntilRound: 0 }));
}

/** Monsters for any state, including matches saved before monsters existed. */
export function monstersOf(s: Pick<BoardState, 'boardId' | 'monsters'>): MonsterState[] {
  return s.monsters ?? initialMonsters(s.boardId);
}

export function monsterAt(s: Pick<BoardState, 'boardId' | 'monsters'>, node: string): MonsterState | null {
  return monstersOf(s).find((m) => m.home === node) ?? null;
}

/** Beaten and resting: it neither attacks nor fights. */
export const monsterResting = (s: Pick<BoardState, 'turn'>, m: MonsterState) => m.restUntilRound >= s.turn.round && m.restUntilRound > 0;

/** Monster settings, with defaults for matches created before they existed. */
export function monsterConfig(s: Pick<BoardState, 'config'>) {
  const c = s.config;
  const d = DEFAULT_CONFIG;
  return {
    on: c.monsterEvents ?? d.monsterEvents,
    range: c.monsterRange ?? d.monsterRange,
    quietMax: c.monsterQuietMax ?? d.monsterQuietMax,
    outsideRoll: c.monsterOutsideRoll ?? d.monsterOutsideRoll,
    push: c.golemPush ?? d.golemPush,
    web: c.webPenalty ?? d.webPenalty,
    rest: c.monsterRestRounds ?? d.monsterRestRounds,
  };
}

/** A piece a monster may attack: on the board, unprotected, not on a safe space, castle, Royal Path or the temple. */
function attackable(s: BoardState, c: Character): boolean {
  const n = getBoard(s.boardId).nodes[c.node];
  return !!n && !c.finished && !isProtected(c) && !n.safe && n.type !== 'castle' && n.lane !== 'home' && n.lane !== 'final' && n.lane !== 'temple';
}

/**
 * Spaces each monster can reach: within `monsterRange` connected steps of its space along open roads
 * (blocked or unbuilt roads stop it). `outside`: the island road within range of the Dragon Gate.
 */
export function monsterReach(s: BoardState): { inside: Record<MonsterId, Set<string>>; outside: Set<string> } {
  const cfg = monsterConfig(s);
  const inside = { golem: new Set<string>(), spider: new Set<string>() } as Record<MonsterId, Set<string>>;
  for (const m of monstersOf(s)) for (const n of Object.keys(walkingDistances(s, m.home, cfg.range))) inside[m.id].add(n);
  const gate = getBoard(s.boardId).board.transitions[0]?.island;
  const outside = new Set<string>(gate ? Object.keys(walkingDistances(s, gate, cfg.range)) : []);
  return { inside, outside };
}

/** Pieces a monster could attack in the next event (inside its reach, or along the gate road when it climbs out). */
export function monsterTargets(s: BoardState, monster: MonsterId, outside = false): Character[] {
  const reach = monsterReach(s);
  const area = outside ? reach.outside : reach.inside[monster];
  return Object.values(s.characters)
    .filter((c) => area.has(c.node) && attackable(s, c))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Where the Stone Golem throws a piece: a legal space exactly `push` connected steps from it (falling back
 * to fewer), farthest from the golem, ties broken by space id so the result is deterministic. Never onto
 * a castle, Royal Path, the temple, a trap, hazard or encounter space, or a space it could not share.
 */
export function golemPushTarget(s: BoardState, c: Character, from: string): string {
  const { nodes } = getBoard(s.boardId);
  const cfg = monsterConfig(s);
  const away = walkingDistances(s, from);
  const near = walkingDistances(s, c.node, cfg.push);
  for (let d = cfg.push; d >= 1; d--) {
    const spots = Object.keys(near).filter((n) => {
      const def = nodes[n];
      if (near[n] !== d || !def || def.map !== nodes[c.node].map) return false;
      if (def.type === 'castle' || def.lane === 'final' || def.lane === 'temple' || def.lane === 'home') return false;
      if (def.teleport || def.hazard || def.encounter || s.transforms[n]) return false;
      if (s.dragon.state !== 'companion' && s.dragon.node === n) return false;
      return canArrive(s, n, c.id);
    });
    if (spots.length) return spots.sort((a, b) => (away[b] ?? 0) - (away[a] ?? 0) || (a < b ? -1 : 1))[0];
  }
  return c.node;
}

/**
 * After every full round (bonus rolls are part of a turn, so they never count), resolve one monster
 * event, exactly once per round. Event die: 1–`quietMax` nothing; up to `outsideRoll − 1` a random active
 * monster attacks a random piece within its reach in the dungeon; `outsideRoll` a random active monster
 * climbs out to the Dragon Gate road and attacks there, then returns inside. No eligible piece: it patrols.
 * Golem: push back `golemPush` legal spaces. Spider: web (next move −`webPenalty`, minimum 1, no stacking).
 */
export function monsterPhase(ctx: Ctx, round: number): void {
  const s = ctx.state;
  const cfg = monsterConfig(s);
  if (!cfg.on || s.status !== 'playing' || (s.monsterRound ?? 0) >= round) return;
  s.monsterRound = round;
  s.monsters = monstersOf(s).map((m) => ({ ...m, node: m.home }));
  const die = roll(s);
  const active = s.monsters.filter((m) => !(m.restUntilRound >= round && m.restUntilRound > 0));
  const outside = die === cfg.outsideRoll;
  if (die <= cfg.quietMax || !active.length) {
    ctx.events.push({ type: 'monsterEvent', round, die, kind: 'quiet' });
    log(ctx, `End of round ${round}: monster die ${die}. ${active.length ? 'The dungeon is quiet.' : 'Every monster is resting.'}`, 'info');
  } else {
    const m = active[randomInt(s, active.length)];
    const { nodes, board } = getBoard(s.boardId);
    const at = outside ? board.transitions[0].island : m.home;
    const pool = monsterTargets(s, m.id, outside);
    if (!pool.length) {
      ctx.events.push({ type: 'monsterEvent', round, die, kind: 'patrol', monster: m.id, outside, at });
      log(ctx, `End of round ${round}: monster die ${die}. The ${m.name} ${outside ? 'prowls the Dragon Gate road' : 'patrols its tunnels'} but finds nobody within ${cfg.range} steps.`, 'info');
    } else {
      const c = pool[randomInt(s, pool.length)];
      const who = charLabel(s, c.id);
      const where = nodes[c.node]?.name ?? c.node;
      const lead = `End of round ${round}: monster die ${die}. The ${m.name} ${outside ? 'climbs out of the Dragon Gate and ' : ''}attacks ${who} at ${where}`;
      if (m.id === 'golem') {
        const from = c.node;
        const to = golemPushTarget(s, c, at);
        ctx.events.push({ type: 'monsterEvent', round, die, kind: 'attack', monster: m.id, outside, at, characterId: c.id, effect: 'push', from, to });
        if (to === from) log(ctx, `${lead}, but there is no legal space to throw them to.`, 'bad', c.owner);
        else {
          log(ctx, `${lead} and hurls them back to ${nodes[to]?.name ?? to}.`, 'bad', c.owner);
          relocate(ctx, c, to, 'monster', m.name);
        }
      } else {
        ctx.events.push({ type: 'monsterEvent', round, die, kind: 'attack', monster: m.id, outside, at, characterId: c.id, effect: 'web' });
        log(ctx, `${lead}${c.webbed ? ': already webbed, the web does not stack.' : ` and webs them: their next move is ${cfg.web} shorter (minimum 1).`}`, 'bad', c.owner);
        c.webbed = true;
      }
    }
  }
  // Beaten monsters that have rested long enough take their posts again.
  for (const mm of s.monsters) {
    if (mm.restUntilRound > 0 && mm.restUntilRound <= round) {
      mm.restUntilRound = 0;
      ctx.events.push({ type: 'monsterRecovered', monster: mm.id });
      log(ctx, `The ${mm.name} has recovered and guards its space again.`, 'info');
    }
  }
}

/** Mark the monster on `node` beaten: it rests through the rest of this round and `monsterRestRounds` more. */
export function defeatMonster(s: GameState, node: string): void {
  s.monsters = monstersOf(s).map((m) => (m.home === node ? { ...m, restUntilRound: s.turn.round + monsterConfig(s).rest } : m));
}
