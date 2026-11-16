import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Play on One Device',
  description:
    'Play Kingdom of Four Gems on one device with 2–4 people. Pass the phone or laptop around the table for a free board game night, no account and no internet needed.',
  alternates: { canonical: '/hotseat' },
};

export default function HotseatLayout({ children }: { children: React.ReactNode }) {
  return children;
}
