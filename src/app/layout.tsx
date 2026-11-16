import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './globals.css';
import { SettingsProvider } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Kingdom Chaos: Crown Quest',
  description: 'A Ludo-inspired fantasy board game for 2–4 players: bank four gems, make a cut, touch all four house plates and claim the Crown Temple.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#8fd4ff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
