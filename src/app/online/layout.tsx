import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Play Online with Friends',
  description:
    'Play Kingdom of Four Gems online with 2–4 friends. Create a private room, share the invite code, and race for the crown in this free browser board game.',
  alternates: { canonical: '/online' },
};

export default function OnlineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
