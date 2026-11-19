import { getBoard } from './board';
import { damageMonster, monstersOf } from './dungeon';
import { charLabel, log, playerOf, relocate, roll, type Ctx } from './rules';
import type { BattleIntent, BattleState, BoardState, Character, GameState } from './types';

/**
 * [Prototype] Stone Golem battle: a short Strike/Guard fight that replaces the single encounter
 * roll when a piece ends its move on the Golem's space (`config.golemBattle`).
 *
 * - The Golem has `battleMonsterHp` health marks; the visiting piece has `battleStamina` temporary
 *   stamina marks, used only for this fight.
 * - Before each exchange the Golem announces its next attack, alternating a light blow (1 damage)
 *   and a telegraphed heavy slam (2 damage), starting light.
 * - Strike: roll the battle die, `encounterThreshold`+ hits for 1 (Knight +`knightBonus` to the
 *   roll). If the Golem is still standing it then makes its announced attack.
 * - Guard: block the announced attack. Guarding a heavy slam exposes the Golem: the next Strike that
 *   hits deals 2.
 * - Retreat (before any exchange): back to the Dungeon Entrance, no reward.
 * - Win: the Golem's shortcut opens for the kingdom for the rest of the match (claimable once per
 *   kingdom) and carries the piece through; the Golem loses a heart and rests, as with any win.
 * - Lose (stamina 0): carried gems drop in the chamber and the piece goes to the safe room.
 * The fight resolves inside the current turn: nothing else may happen until it ends.
 */
export const GOLEM_REWARD = 'golem-shortcut';

export const BATTLE_DAMAGE: Record<BattleIntent, number> = { light: 1, heavy: 2 };

export const intentText = (m: 'golem' | 'spider', intent: BattleIntent) =>
  m === 'golem'
    ? intent === 'heavy'
      ? `Heavy slam next · ${BATTLE_DAMAGE.heavy} damage`
      : `Fist swipe next · ${BATTLE_DAMAGE.light} damage`
    : intent === 'heavy'
      ? `Web bundle next · ${BATTLE_DAMAGE.heavy} damage`
      : `Leg strike next · ${BATTLE_DAMAGE.light} damage`;

export const battleOn = (s: Pick<BoardState, 'config'>) => s.config.golemBattle !== false;

export function rewardClaimed(s: Pick<BoardState, 'rewardsClaimed'>, reward: string, playerId: string): boolean {
  return !!s.rewardsClaimed?.[reward]?.includes(playerId);
}

/** Start a battle when `ch` ends its move on the Golem's space. */
export function startBattle(ctx: Ctx, ch: Character): void {
  const s = ctx.state;
  const cfg = s.config;
  const id = s.version + 1;
  const b: BattleState = {
    id,
    monster: 'golem',
    characterId: ch.id,
    playerId: ch.owner,
    node: ch.node,
    monsterHp: cfg.battleMonsterHp ?? 3,
    stamina: cfg.battleStamina ?? 3,
    intent: 'light',
    exchange: 0,
    exposed: false,
  };
  s.battle = b;
  ctx.events.push({ type: 'battleStarted', battleId: id, monster: 'golem', characterId: ch.id, intent: b.intent, reward: GOLEM_REWARD });
  log(
    ctx,
    `The Stone Golem rises to block ${charLabel(s, ch.id)}! Battle: it has ${b.monsterHp} health, you have ${b.stamina} stamina. Win and the shortcut stays open for your kingdom. ${intentText('golem', b.intent)}.`,
    'bad',
    ch.owner,
  );
}

/** One battle choice. Returns an error message, or null when applied. */
export function applyBattle(ctx: Ctx, playerId: string, choice: 'strike' | 'guard' | 'retreat'): string | null {
  const s = ctx.state;
  const b = s.battle;
  if (!b) return 'There is no battle to fight.';
  if (b.playerId !== playerId) return 'Only the fighting kingdom chooses battle actions.';
  const ch = s.characters[b.characterId];
  if (!ch || ch.node !== b.node) {
    s.battle = null;
    return 'The battle is over.';
  }
  const { nodes, board } = getBoard(s.boardId);
  const enc = nodes[b.node].encounter;
  if (choice === 'retreat') {
    const to = board.transitions.find((t) => nodes[t.dungeon])?.dungeon ?? 'd-entrance';
    endBattle(ctx, b, 'retreated', to);
    log(ctx, `${charLabel(s, ch.id)} retreats from the Stone Golem to the ${nodes[to]?.name ?? to}. No reward.`, 'info', playerId);
    relocate(ctx, ch, to, 'retreat', 'Retreat');
    return null;
  }

  const exchange = b.exchange + 1;
  const attack = b.intent;
  let damage = 0;
  let value: number | undefined;
  let total: number | undefined;
  let hit: boolean | undefined;
  let blocked = false;
  let exposed = b.exposed;
  if (choice === 'strike') {
    value = roll(s);
    const bonus = ch.kind === 'knight' ? s.config.knightBonus : 0;
    total = value + bonus;
    hit = total >= s.config.encounterThreshold;
    damage = hit ? (b.exposed ? 2 : 1) : 0;
    exposed = false;
  } else {
    blocked = true;
    exposed = attack === 'heavy';
  }
  const monsterHp = Math.max(0, b.monsterHp - damage);
  const alive = monsterHp > 0;
  const taken = alive && !blocked ? BATTLE_DAMAGE[attack] : 0;
  const stamina = Math.max(0, b.stamina - taken);
  const nextIntent: BattleIntent = attack === 'light' ? 'heavy' : 'light';
  const over = !alive || stamina === 0;
  ctx.events.push({
    type: 'battleExchange',
    battleId: b.id,
    monster: b.monster,
    characterId: ch.id,
    exchange,
    choice,
    roll: value,
    total,
    hit,
    damage,
    monsterAttack: alive ? attack : null,
    blocked: alive && blocked,
    taken,
    exposed: exposed && alive,
    monsterHp,
    stamina,
    nextIntent: over ? null : nextIntent,
  });
  const who = charLabel(s, ch.id);
  const strikeText = choice === 'strike' ? `${who} strikes: ${value}${total !== value ? ` (+${(total ?? 0) - (value ?? 0)} Knight)` : ''} — ${hit ? `a hit for ${damage}!` : 'deflected.'}` : `${who} raises a guard.`;
  const golemText = !alive ? '' : blocked ? ` The Golem's ${attack === 'heavy' ? 'heavy slam' : 'swipe'} is blocked${exposed ? ', and it staggers, exposed: the next hit deals 2' : ''}.` : ` The Golem lands a ${attack === 'heavy' ? 'heavy slam' : 'swipe'} for ${taken}.`;
  log(ctx, `Exchange ${exchange}: ${strikeText}${golemText} Golem ${monsterHp} health · stamina ${stamina}.`, hit || blocked ? 'good' : 'bad', playerId);

  if (!alive) {
    const to = enc?.shortcutTo ?? b.node;
    const open = (s.shortcutsOpen ??= {});
    open[b.node] = [...new Set([...(open[b.node] ?? []), ch.owner])];
    const claimed = (s.rewardsClaimed ??= {});
    claimed[GOLEM_REWARD] = [...new Set([...(claimed[GOLEM_REWARD] ?? []), ch.owner])];
    endBattle(ctx, b, 'won', to, GOLEM_REWARD);
    damageMonster(ctx, 'golem', ch, 'encounter', value, total);
    ctx.events.push({ type: 'encounter', characterId: ch.id, monster: 'golem', roll: value ?? 0, total: total ?? 0, success: true, to });
    log(ctx, `The Stone Golem crumbles! The stone gate grinds open: the shortcut to ${nodes[to]?.name ?? to} stays open for ${playerOf(s, ch.owner).name}'s kingdom for the rest of the match.`, 'good', playerId);
    relocate(ctx, ch, to, 'encounter', 'Stone Golem shortcut');
    return null;
  }
  if (stamina === 0) {
    const to = enc?.safeRoom ?? b.node;
    // Carried gems fall in the chamber; the piece limps to the safe room.
    const dropped: string[] = [];
    for (const gid of ch.carrying) {
      const g = s.gems.find((x) => x.id === gid);
      if (g) {
        g.carriedBy = null;
        g.node = b.node;
        dropped.push(g.kind);
      }
    }
    ch.carrying = [];
    endBattle(ctx, b, 'lost', to);
    ctx.events.push({ type: 'encounter', characterId: ch.id, monster: 'golem', roll: value ?? 0, total: total ?? 0, success: false, to });
    log(ctx, `${who} is out of stamina and staggers to the ${nodes[to]?.name ?? to}.${dropped.length ? ` Their gems drop in the Golem's chamber.` : ''}`, 'bad', playerId);
    relocate(ctx, ch, to, 'encounter', 'Stone Golem');
    return null;
  }
  s.battle = { ...b, exchange, monsterHp, stamina, intent: nextIntent, exposed };
  return null;
}

function endBattle(ctx: Ctx, b: BattleState, outcome: 'won' | 'lost' | 'retreated', to: string, reward?: string) {
  ctx.state.battle = null;
  ctx.events.push({ type: 'battleEnded', battleId: b.id, monster: b.monster, characterId: b.characterId, outcome, to, reward });
}

/** The AI's battle choice: guard a heavy slam (and counter), strike otherwise; retreat when one blow from defeat against a fresh Golem. */
export function aiBattleChoice(s: Pick<GameState, 'battle'> | Pick<BoardState, 'battle'>): 'strike' | 'guard' | 'retreat' {
  const b = s.battle;
  if (!b) return 'strike';
  if (b.intent === 'heavy') return 'guard';
  if (b.stamina <= 1 && b.monsterHp >= 3) return 'retreat';
  return 'strike';
}

/** Is the Golem able to fight right now (not slain, not resting)? Used by previews. */
export function golemReady(s: BoardState): boolean {
  const g = monstersOf(s).find((m) => m.id === 'golem');
  return !!g && !g.slain && !(g.restUntilRound >= s.turn.round && g.restUntilRound > 0);
}
