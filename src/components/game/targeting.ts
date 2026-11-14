import {
  CHARACTER_INFO,
  distancesFrom,
  getGraph,
  isLand,
  isWater,
  TERRAIN_INFO,
  terrainOf,
  type CardTarget,
  type CardType,
  type MoveOption,
  type PlayerView,
} from '@/engine';

export type PickKind = 'connection' | 'space' | 'character' | 'player' | 'confirm';
export type Field = 'connectionId' | 'space' | 'linkedTo' | 'characterId' | 'targetCharacterId' | 'dest' | 'playerId' | 'confirm';

interface Step {
  field: Field;
  pick: PickKind;
  prompt: string;
}

/** How each target kind is picked in the UI, one board/button choice at a time. */
export const TARGET_STEPS: Record<CardTarget['kind'], Step[]> = {
  connection: [{ field: 'connectionId', pick: 'connection', prompt: 'Tap a highlighted path on the board.' }],
  portal: [
    { field: 'space', pick: 'space', prompt: 'Tap an empty portal site (dotted pink ring).' },
    { field: 'linkedTo', pick: 'space', prompt: 'Tap the fixed portal to link it to.' },
  ],
  space: [{ field: 'space', pick: 'space', prompt: 'Tap a highlighted square on the map.' }],
  character: [{ field: 'characterId', pick: 'character', prompt: 'Tap one of your highlighted characters.' }],
  characterPath: [
    { field: 'characterId', pick: 'character', prompt: 'Tap the character to boost.' },
    { field: 'dest', pick: 'space', prompt: 'Tap where it should dash to.' },
  ],
  characterSpace: [
    { field: 'characterId', pick: 'character', prompt: 'Tap the character to teleport.' },
    { field: 'space', pick: 'space', prompt: 'Tap an empty fixed portal.' },
  ],
  swap: [
    { field: 'characterId', pick: 'character', prompt: 'Tap your character to swap.' },
    { field: 'targetCharacterId', pick: 'character', prompt: 'Tap the opponent to swap with.' },
  ],
  player: [{ field: 'playerId', pick: 'player', prompt: 'Choose an opponent.' }],
  none: [{ field: 'confirm', pick: 'confirm', prompt: 'Confirm to play this card.' }],
};

export function fieldValue(t: CardTarget, f: Field): string | undefined {
  if (f === 'dest') return t.kind === 'characterPath' ? t.path[t.path.length - 1] : undefined;
  if (f === 'confirm') return t.kind === 'none' ? 'yes' : undefined;
  return (t as unknown as Record<string, string | undefined>)[f];
}

export type Picks = Partial<Record<Field, string>>;

export function matchTargets(targets: CardTarget[], picks: Picks) {
  return targets.filter((t) => {
    const fields = TARGET_STEPS[t.kind].map((s) => s.field);
    return (Object.keys(picks) as Field[]).every((f) => fields.includes(f) && fieldValue(t, f) === picks[f]);
  });
}

export function nextStep(t: CardTarget, picks: Picks): Step | undefined {
  return TARGET_STEPS[t.kind].find((s) => picks[s.field] === undefined);
}

export const CONFIRM_LABEL: Partial<Record<CardType, string>> = {
  royal_guard: 'Post the Royal Guard',
  repair: 'Repair my castle',
};

export function describeRoute(view: PlayerView, o: MoveOption): string {
  const name = (id: string) => {
    const c = view.characters[id];
    const owner = view.players.find((p) => p.id === c.owner)?.name;
    return `${owner}'s ${CHARACTER_INFO[c.kind].name}`;
  };
  const bits = [`${o.path.length - 1} step${o.path.length === 2 ? '' : 's'}`];
  const over = o.path.slice(1, -1).map((s) => terrainOf(view, s));
  if (over.some(isWater)) bits.push('sails across water');
  if (over.includes('mountain')) bits.push('flies over the mountains');
  if (o.path.some((s, i) => i > 0 && terrainOf(view, s) === 'airfield' && terrainOf(view, o.path[i - 1]) === 'airfield'))
    bits.push('takes a flight');
  if (o.usesPortal) bits.push('through a portal');
  if (o.passedOpponents.length) bits.push(`slips past ${o.passedOpponents.length} opponent${o.passedOpponents.length > 1 ? 's' : ''}`);
  if (o.captures.length) bits.push(`captures ${o.captures.map(name).join(' & ')}`);
  if (o.shieldBlocked) bits.push(`${name(o.shieldBlocked)}'s Shield stops you`);
  if (o.trapped) bits.push('springs a trap!');
  if (o.pickup) bits.push('picks up treasure');
  if (o.bank) bits.push('banks treasure');
  if (o.drawsCard) bits.push('draws a card');
  return bits.join(' · ');
}

/** Human explanation for why a space is not a legal destination. */
export function explainSpace(view: PlayerView, characterId: string, spaceId: string, steps: number): string {
  const graph = getGraph(view.boardId);
  const sp = graph.space[spaceId];
  const mover = view.characters[characterId];
  const castle = view.castles[spaceId];
  if (sp.type === 'castle' && (!castle || castle.owner !== mover.owner)) return 'Only a castle’s own kingdom may enter it.';
  if (spaceId === mover.space) return 'Your character is already here.';
  const terrain = terrainOf(view, spaceId);
  if (!isLand(terrain))
    return `${TERRAIN_INFO[terrain].name}: characters can never stop here. ${TERRAIN_INFO[terrain].rule}`;
  const occupant = Object.values(view.characters).find((c) => c.space === spaceId && sp.type !== 'castle');
  if (occupant?.owner === mover.owner) return 'You can pass through your own characters, but not stop on them.';
  if (occupant?.immune) return 'That character is Immune and cannot be captured.';
  const d = distancesFrom(view, mover.space, { allowCastles: [view.players.find((p) => p.id === mover.owner)!.castle] })[spaceId];
  if (d === undefined) return 'No open route reaches that space right now.';
  if (d > steps) return `Too far — that space is ${d} steps away and you can move ${steps}.`;
  return 'An opponent, a blocked path, water or a mountain is in the way on every route.';
}
