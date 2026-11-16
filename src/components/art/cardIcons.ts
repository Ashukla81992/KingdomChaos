import type { CardCategory, CardType } from '@/engine';

/** Painted face for a deck card. The blank banner is where the name is drawn. */
export const cardArt = (type: CardType) => `/art/cards/${type}.png`;

export const CATEGORY_STYLE: Record<CardCategory, { bg: string; band: string; ink: string; soft: string; label: string }> = {
  map: { bg: '#e3f8f3', band: 'linear-gradient(135deg,#19b8a3,#0f8c7f)', ink: '#0b5c53', soft: '#bdeee4', label: 'MAP' },
  power: { bg: '#efe8ff', band: 'linear-gradient(135deg,#9a6cf0,#6a3fd0)', ink: '#45228f', soft: '#d9cbff', label: 'POWER' },
  special: { bg: '#ffece4', band: 'linear-gradient(135deg,#ff8a5c,#e0532d)', ink: '#8c2a10', soft: '#ffd2c0', label: 'SPECIAL' },
};
