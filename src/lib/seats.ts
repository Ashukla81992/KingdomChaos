export type Emblem = 'flame' | 'sun' | 'wave' | 'leaf';

export interface SeatTheme {
  kingdom: string;
  color: string;
  light: string;
  dark: string;
  emblem: Emblem;
}

/** Seat index = castle position (0 north, 1 east, 2 south, 3 west). Each has a colour AND an emblem. */
export const SEATS: SeatTheme[] = [
  { kingdom: 'Emberhold', color: '#E5484D', light: '#FFD5D6', dark: '#8E1F24', emblem: 'flame' },
  { kingdom: 'Sunspire', color: '#E9A214', light: '#FFEDB8', dark: '#8A5A00', emblem: 'sun' },
  { kingdom: 'Tidemark', color: '#2F7BF5', light: '#D3E4FF', dark: '#173E8C', emblem: 'wave' },
  { kingdom: 'Greenvale', color: '#2E9E62', light: '#CDF1DC', dark: '#155C36', emblem: 'leaf' },
];

export const seatTheme = (seat: number) => SEATS[seat] ?? SEATS[0];
