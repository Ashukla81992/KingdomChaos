import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Practice vs the Computer',
  description:
    'Practice Kingdom of Four Gems against the computer. Learn the board, try every character, and sharpen your Ludo-style race and Chess-like choices before playing friends.',
  alternates: { canonical: '/practice' },
};

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
