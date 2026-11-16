import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Learn to Play',
  description:
    'Learn Kingdom of Four Gems in one guided game: rolling and exact moves, the King, Queen, Witch and Knight, gems, captures, and the race to the crown.',
  alternates: { canonical: '/tutorial' },
};

export default function TutorialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
