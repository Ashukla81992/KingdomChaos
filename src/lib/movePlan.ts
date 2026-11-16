import {
  GEM_NAMES,
  getBoard,
  houseOf,
  isProtected,
  legalMoves,
  neededGems,
  nodeName,
  other,
  royalPathOpen,
  stepsFor,
  edgeOpen,
  type BoardState,
  type GemKind,
  type MoveOption,
  type PlayerStats,
  type TrailInfo,
} from '@/engine';

type S = BoardState & { stats: Record<string, Pick<PlayerStats, 'cuts'>> };

/**
 * Local, uncommitted movement preview for the board UI (Agent 4).
 *
 * API:
 * - `startPlan(s, characterId) → Plan | null` — after a roll; null when no legal exact routes.
 * - `destinations(plan) → Map<endId, MoveOption[]>` — every legal end with its routes.
 * - `choose(plan, end) → Plan | null` — pick/cycle a route to that end.
 * - `alternatives(plan)`, `consequences(s, id, option)`, `routeTrails`, `routeNote`, `whyNot`.
 *
 * Exact movement only: every option uses the full allowance (island and dungeon). There is no
 * "Stop here" or split-move. Knight options may list `routeTargets`; the UI sends `attack` with
 * 2–3 chosen ids (including any eligible rival on the final space).
 */
export interface Plan {
  characterId: string;
  steps: number;
  note: string;
  options: MoveOption[];
  /** The route being previewed, if an end has been picked. */
  choice: MoveOption | null;
}

const endOf = (o: MoveOption) => o.path[o.path.length - 1];

export function startPlan(s: BoardState, characterId: string): Plan | null {
  const ch = s.characters[characterId];
  if (!ch || ch.finished || !s.turn.move || s.turn.moveDone) return null;
  const options = legalMoves(s, characterId);
  if (!options.length) return null;
  const { steps, note } = stepsFor(s, characterId, s.turn.move.roll);
  return { characterId, steps, note, options, choice: null };
}

/** End spaces, each with its routes (shortest and portal-free first). */
export function destinations(plan: Plan): Map<string, MoveOption[]> {
  const out = new Map<string, MoveOption[]>();
  for (const o of plan.options) {
    const list = out.get(endOf(o)) ?? [];
    list.push(o);
    out.set(endOf(o), list);
  }
  for (const list of out.values()) list.sort((a, b) => Number(a.witchPortal) - Number(b.witchPortal) || a.path.length - b.path.length);
  return out;
}

/** Pick an end. Picking the same end again cycles through its alternative routes. */
export function choose(plan: Plan, end: string): Plan | null {
  const routes = destinations(plan).get(end);
  if (!routes) return null;
  const at = plan.choice && endOf(plan.choice) === end ? routes.findIndex((r) => r.path.join('>') === plan.choice!.path.join('>')) : -1;
  return { ...plan, choice: routes[(at + 1) % routes.length] };
}

export const alternatives = (plan: Plan) => (plan.choice ? (destinations(plan).get(endOf(plan.choice))?.length ?? 1) : 0);

/** What the route will do, in plain words (shown before committing). */
export function consequences(s: S, characterId: string, o: MoveOption): string[] {
  const { nodes, out } = getBoard(s.boardId);
  const ch = s.characters[characterId];
  const house = houseOf(s, ch.owner);
  const lines: string[] = [];
  const name = (id: string) => {
    const c = s.characters[id];
    const owner = s.players.find((p) => p.id === c.owner)?.name ?? 'Someone';
    return `${owner}'s ${c.kind[0].toUpperCase()}${c.kind.slice(1)}`;
  };
  const limit = Math.max(1, s.config.carryLimit ?? 1);
  let carrying = ch.carrying.map((id) => s.gems.find((g) => g.id === id)?.kind).filter((k): k is GemKind => !!k);
  let need = neededGems(s, ch.owner);
  const plates = new Set(ch.plates);
  for (let i = 1; i < o.path.length; i++) {
    const prev = o.path[i - 1];
    const node = o.path[i];
    const walked = out[prev].some((e) => other(e, prev) === node);
    if (!walked) lines.push(`Free portal hop to ${nodes[node].name}`);
    const plate = nodes[node].plate;
    if (walked && plate !== undefined && !plates.has(plate)) {
      plates.add(plate);
      const plateHouse = getBoard(s.boardId).board.houses.find((h) => h.seat === plate)!;
      lines.push(plates.size === 4 ? `Touches the ${plateHouse.name} plate — lap complete!` : `Touches the ${plateHouse.name} plate (${plates.size} of 4)`);
    }
    if (carrying.length && node === house.entry) {
      lines.push(`Banks the ${carrying.map((k) => GEM_NAMES[k]).join(' and the ')}`);
      carrying = [];
    }
    const st = nodes[node].station;
    if (carrying.length < limit && st && need.includes(st)) {
      lines.push(`Picks up the ${GEM_NAMES[st]}`);
      carrying = [...carrying, st];
      need = need.filter((k) => k !== st);
    }
    if (nodes[node].lane === 'final' && nodes[prev].lane !== 'final') lines.push('Turns onto your Royal Path');
  }
  if (o.routeTargets.length) {
    lines.push(`Route attack: choose ${s.config.knightAttackMin}–${s.config.knightAttackMax} of ${o.routeTargets.map(name).join(', ')}`);
  }
  for (const id of o.landingCuts) lines.push(`Cuts ${name(id)} — sent home, and you earn a bonus roll`);
  if (o.routeTargets.length || o.landingCuts.length) lines.push('A capture earns a bonus roll (one per roll)');
  if (o.arrival) lines.push(`${o.arrival.name}: roll ${o.arrival.need}+ — ${o.arrival.success} / ${o.arrival.failure}`);
  const end = nodes[endOf(o)];
  if (end.hazard) lines.push(`Trap risk: stopping at the ${end.name} springs a snare on a roll of 1–2`);
  if (end.teleport) lines.push(`${end.teleport.name}: ${end.teleport.type === 'trap' ? 'falls' : 'rides'} to ${nodeName(s.boardId, end.teleport.to)} (plates on the way do not count)`);
  if (end.dig && !end.station) lines.push('Dig site: dig here as your adventure action');
  if (o.finishes) lines.push('Enters the Crown Temple');
  if (end.safe && end.lane === 'circuit') lines.push('Safe space');
  return lines;
}

/** The roads a route uses, in order: main road and inner routes, with their trade-offs. */
export function routeTrails(s: Pick<BoardState, 'boardId'>, o: MoveOption): TrailInfo[] {
  const { out, board } = getBoard(s.boardId);
  const seen: string[] = [];
  for (let i = 1; i < o.path.length; i++) {
    const e = out[o.path[i - 1]]?.find((x) => other(x, o.path[i - 1]) === o.path[i]);
    if (e?.trail && !seen.includes(e.trail)) seen.push(e.trail);
  }
  return seen.map((id) => board.trails.find((t) => t.id === id)!).filter(Boolean);
}

/** One line describing the inner route a preview uses (the main road needs no explanation). */
export function routeNote(s: Pick<BoardState, 'boardId'>, o: MoveOption): string | null {
  const inner = routeTrails(s, o).filter((t) => t.kind !== 'main');
  if (!inner.length) return null;
  return inner.map((t) => `${t.name}: ${t.perk} Risk: ${t.risk}`).join(' ');
}

/** Plain-language reason a space is not a legal end for this roll. */
export function whyNot(s: S, plan: Plan, node: string): string {
  const { nodes, out } = getBoard(s.boardId);
  const ch = s.characters[plan.characterId];
  const target = nodes[node];
  const here = nodes[ch.node];
  const name = target?.name ?? node;
  if (!target) return 'That is not a space on the board.';
  if (target.map !== here.map) return `${name} is on the other map.`;
  if (target.type === 'castle') return target.house === s.players.find((p) => p.id === ch.owner)?.seat ? 'Pieces come home only when cut or rescued.' : 'Opponent castles are closed to you.';
  if (target.lane === 'final' && target.house !== s.players.find((p) => p.id === ch.owner)?.seat) return `That is another house's Royal Path.`;
  if (target.lane === 'final' || target.lane === 'temple') {
    if (!royalPathOpen(s, ch.owner)) return 'Royal Path locked: bank all four gem kinds first.';
    if (target.lane === 'temple' && here.lane === 'final') return 'The temple gate needs all four markers and a kingdom capture, plus the exact roll.';
    if (target.lane === 'temple') return 'You need the exact roll to land on the temple.';
  }
  const others = Object.values(s.characters).filter((c) => !c.finished && c.node === node && c.id !== ch.id);
  if (ch.kind === 'queen' && others.length) return 'The Queen must end on an empty space.';
  if (!target.safe && others.some((c) => c.owner === ch.owner)) return 'Your own piece is there, and it is not a safe space.';
  const prot = others.find((c) => c.owner !== ch.owner && isProtected(c));
  if (!target.safe && prot) return `That piece is protected by ${prot.guarded ? 'Royal Guard' : prot.immune ? 'Immunity' : 'a Shield'}: you cannot land on it.`;
  if (here.map === 'island') {
    const route = shortestOpen(s, ch.node, node);
    if (!route) return `No open road leads to ${name} right now (a bridge, tunnel or road on the way is closed).`;
    const d = route.length - 1;
    if (d > plan.steps) return `A move must use the whole roll: ${name} is ${d} ${d === 1 ? 'space' : 'spaces'} away, and you move ${plan.steps}.`;
    if (d === plan.steps) {
      const dragonAt = s.dragon.state === 'guarding' || s.dragon.state === 'wild' ? s.dragon.node : null;
      for (const id of route.slice(1, -1)) {
        if (id === dragonAt) return `The dragon at ${nodes[id].name} blocks the way.`;
        const opp = Object.values(s.characters).filter((c) => !c.finished && c.node === id && c.owner !== ch.owner);
        if (opp.length && !nodes[id].safe && ch.kind !== 'queen' && ch.kind !== 'knight') return `An opponent at ${nodes[id].name} blocks the way.`;
      }
    }
    if (d < plan.steps) return `${name} is only ${d} ${d === 1 ? 'space' : 'spaces'} away. A move must use all ${plan.steps} steps without stepping on any space twice, and no such route ends there.`;
  }
  if (!out[ch.node]) return 'This piece cannot reach there.';
  return `${name} is not reachable with exactly ${plan.steps} ${plan.steps === 1 ? 'step' : 'steps'}. Pick a glowing space.`;
}

/** Shortest walk over open roads, ignoring pieces (castles may only be left), as a list of spaces. */
function shortestOpen(s: S, from: string, to: string): string[] | null {
  const { nodes, out } = getBoard(s.boardId);
  const prev = new Map<string, string>([[from, from]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === to) break;
    for (const e of out[cur] ?? []) {
      const nx = other(e, cur);
      if (prev.has(nx) || !edgeOpen(s, e) || nodes[nx].type === 'castle') continue;
      prev.set(nx, cur);
      queue.push(nx);
    }
  }
  if (!prev.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}
