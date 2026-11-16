export type Emblem = 'flame' | 'moon' | 'wave' | 'leaf';

export interface SeatTheme {
  kingdom: string;
  key: 'red' | 'blue' | 'purple' | 'green';
  color: string;
  light: string;
  dark: string;
  emblem: Emblem;
}

/**
 * Seat index = house, clockwise from the north-west: 0 Red, 1 Blue, 2 Purple, 3 Green. Colours match
 * the painted castles, and every house also has a crest shape so colour is never the only cue.
 */
export const SEATS: SeatTheme[] = [
  { kingdom: 'Red', key: 'red', color: '#E5484D', light: '#FFD5D6', dark: '#8E1F24', emblem: 'flame' },
  { kingdom: 'Blue', key: 'blue', color: '#2F7BF5', light: '#D3E4FF', dark: '#173E8C', emblem: 'wave' },
  { kingdom: 'Purple', key: 'purple', color: '#8E4EC6', light: '#EBDDF7', dark: '#4B2470', emblem: 'moon' },
  { kingdom: 'Green', key: 'green', color: '#2E9E62', light: '#CDF1DC', dark: '#155C36', emblem: 'leaf' },
];

export const seatTheme = (seat: number) => SEATS[seat] ?? SEATS[0];

/** Portrait art for a house and character. */
export const portrait = (seat: number, kind: string) => `/art/${seatTheme(seat).key}-${kind}.png`;
