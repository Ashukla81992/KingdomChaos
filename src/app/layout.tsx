import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './globals.css';
import { SettingsProvider } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'Kingdom Chaos',
  description: 'Race your King, Queen, Witch and Knight to grab treasure and bring it home — a quick, chaotic fantasy board game for 2–4 players.',
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
