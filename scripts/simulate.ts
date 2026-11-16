/**
 * Developer balance simulator: AI vs AI matches on the real engine.
 *
 *   npm run sim -- --games 200 --players 4 --secondsPerTurn 20 [--carry 1]
 *
 * The simulated clock assumes `secondsPerTurn` of real play per turn. That is an assumption, not a
 * measurement of human play: use it to compare balance changes, not to claim a match length.
 */
import { applyAction, chooseAiAction, createGame, forceTimeout, toPlayerView, type GameState, type PlayerStats } from '../src/engine';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split('--')
    .filter(Boolean)
    .map((kv) => kv.trim().split(/\s+/))
    .map(([k, v]) => [k, v ?? 'true']),
);
const games = Number(args.games ?? 100);
const playerCounts = args.players ? [Number(args.players)] : [2, 3, 4];
const secondsPerTurn = Number(args.secondsPerTurn ?? 20);
const maxTurns = Number(args.maxTurns ?? 800);
const carryLimit = args.carry ? { carryLimit: Number(args.carry) } : {};

function runOne(players: number, seed: number) {
  let s: GameState = createGame({
    players: Array.from({ length: players }, (_, i) => ({ id: `ai${i}`, name: `AI ${i}`, isAI: true })),
    seed,
    now: 0,
    config: { matchDurationMs: 0, turnDurationMs: 0, ...carryLimit },
  });
  let rng = seed;
  const random = () => (rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let rejected = 0;
  for (let guard = 0; s.status === 'playing' && guard < 40_000 && s.turn.number <= maxTurns; guard++) {
    const actor = s.turn.playerId;
    const action = chooseAiAction(toPlayerView(s, actor), random);
    let r = action ? applyAction(s, { playerId: actor, action }, 0) : forceTimeout(s, 0);
    if (!r.ok) {
      rejected++;
      if (rejected < 5) console.warn(`AI action rejected: ${r.error}`, JSON.stringify(action));
      r = forceTimeout(s, 0);
    }
    if (r.ok) s = r.state;
  }
  return { s, rejected };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0;
};

for (const n of playerCounts) {
  const turns: number[] = [];
  const minutes: number[] = [];
  let finished = 0;
  let rejected = 0;
  const totals: Partial<Record<keyof PlayerStats, number>> = {};
  const seatWins: Record<number, number> = {};
  for (let g = 0; g < games; g++) {
    const { s, rejected: r } = runOne(n, 1000 + g);
    rejected += r;
    for (const st of Object.values(s.stats)) for (const [k, v] of Object.entries(st)) totals[k as keyof PlayerStats] = (totals[k as keyof PlayerStats] ?? 0) + v;
    if (s.status === 'finished' && s.result?.reason === 'temple') {
      finished++;
      turns.push(s.turn.number);
      minutes.push((s.turn.number * secondsPerTurn) / 60);
      const seat = s.players.find((p) => p.id === s.result!.winners[0])!.seat;
      seatWins[seat] = (seatWins[seat] ?? 0) + 1;
    }
  }
  const per = (k: keyof PlayerStats) => ((totals[k] ?? 0) / games).toFixed(1);
  console.log(`\n=== ${n} players · ${games} games ===`);
  console.log(`temple wins: ${finished}/${games} (${((finished / games) * 100).toFixed(0)}%), AI rejections: ${rejected}`);
  console.log(`turns to win: mean ${mean(turns).toFixed(0)}, median ${pct(turns, 0.5)}, p90 ${pct(turns, 0.9)}`);
  console.log(`estimated minutes at ${secondsPerTurn}s/turn (assumption): mean ${mean(minutes).toFixed(1)}, p90 ${pct(minutes, 0.9).toFixed(1)}`);
  console.log(`per game: gems banked ${per('gemsBanked')}, cuts ${per('cuts')}, laps ${per('laps')}, traps ${per('traps')}, shortcuts ${per('shortcuts')}, vehicles ${per('vehicleTrips')}`);
  console.log(`          discoveries ${per('discoveries')}, dungeon visits ${per('dungeonVisits')}, tames ${per('tames')}/${per('tameAttempts')}, fires ${per('dragonFires')}, slays ${per('slays')}/${per('slayAttempts')}, cards ${per('cardsPlayed')}`);
  console.log(`seat wins: ${JSON.stringify(seatWins)}`);
}
