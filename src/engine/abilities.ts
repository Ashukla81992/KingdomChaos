import type { Character, CharacterKind, PowerEffect } from './types';

/** Movement capabilities consulted by the movement engine. */
export interface MovementTraits {
  /** Move through opponent-occupied spaces without stopping (Queen). */
  passThroughOpponents: boolean;
  /** Capture by entering an opponent's space and keep moving (Knight, Attack Boost). Max one capture. */
  captureAndContinue: boolean;
  /** May travel between the two fixed portals for one step (Witch). */
  useFixedPortalLink: boolean;
}

export interface AbilityDefinition {
  traits?: Partial<MovementTraits>;
  /** Extra cards drawn when this character banks a treasure (King). */
  bankBonusDraws?: number;
  /** Return false to make a power card an invalid target for this character. */
  acceptsPower?: (power: PowerEffect['type']) => boolean;
}

/**
 * Ability registry. To add a character or ability, add an entry here (and its text in rulesText.ts).
 * The movement engine only reads the combined traits, so it never needs to know character names.
 */
export const ABILITIES: Record<CharacterKind, AbilityDefinition> = {
  king: { bankBonusDraws: 1 },
  queen: { traits: { passThroughOpponents: true } },
  witch: { traits: { useFixedPortalLink: true } },
  knight: {
    traits: { captureAndContinue: true },
    // Attack Boost would duplicate the Knight's ability; stacking is not allowed.
    acceptsPower: (power) => power !== 'attack_boost',
  },
};

/** Power effects that modify movement, applied only to regular (die) movement where noted. */
const POWER_TRAITS: Partial<Record<PowerEffect['type'], { traits: Partial<MovementTraits>; regularOnly: boolean }>> = {
  attack_boost: { traits: { captureAndContinue: true }, regularOnly: true },
};

export function movementTraits(character: Character, regular: boolean): MovementTraits {
  const base: MovementTraits = { passThroughOpponents: false, captureAndContinue: false, useFixedPortalLink: false };
  Object.assign(base, ABILITIES[character.kind].traits);
  const power = character.power ? POWER_TRAITS[character.power.type] : undefined;
  if (power && (!power.regularOnly || regular)) {
    for (const [k, v] of Object.entries(power.traits)) if (v) base[k as keyof MovementTraits] = true;
  }
  return base;
}

export function bankBonusDraws(kind: CharacterKind): number {
  return ABILITIES[kind].bankBonusDraws ?? 0;
}

export function acceptsPower(kind: CharacterKind, power: PowerEffect['type']): boolean {
  return ABILITIES[kind].acceptsPower?.(power) ?? true;
}
