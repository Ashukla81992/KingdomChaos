import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import './globals.css';
import { SettingsProvider } from '@/lib/settings';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kingdom-chaos.vercel.app';
const TITLE = 'Kingdom of Four Gems — Free Online Board Game';
const DESCRIPTION =
  'Kingdom of Four Gems is a free online board game for 2–4 players. Roll like Ludo, think like Chess, and race for the crown: move your King, Queen, Witch and Knight, bank four gems, and reach the temple before your rivals.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: '%s · Kingdom of Four Gems',
  },
  description: DESCRIPTION,
  applicationName: 'Kingdom of Four Gems',
  keywords: [
    'online board game',
    'free online board game',
    'multiplayer board game',
    'board game online',
    'Kingdom of Four Gems',
    'kingdom',
    'ludo',
    'ludo online',
    'play ludo online',
    'chess',
    'strategy board game',
    'race game',
    'family board game',
    'browser board game',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Kingdom of Four Gems',
    title: 'Kingdom of Four Gems — Roll like Ludo. Think like Chess.',
    description: DESCRIPTION,
    images: [{ url: '/island.jpg', width: 1024, height: 1024, alt: 'The Kingdom of Four Gems island board' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kingdom of Four Gems — Free Online Board Game',
    description: 'Roll like Ludo. Think like Chess. Race for the crown. A free board game for 2–4 players, right in your browser.',
    images: ['/island.jpg'],
  },
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#8fd4ff',
};

/** Structured data so search engines understand the game and its free-to-play offer. */
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'Kingdom of Four Gems',
  alternateName: ['Kingdom Chaos', 'Crown Quest'],
  url: SITE_URL,
  image: `${SITE_URL}/island.jpg`,
  description: DESCRIPTION,
  genre: ['Board game', 'Strategy', 'Race'],
  gamePlatform: 'Web browser',
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 4 },
  playMode: ['MultiPlayer', 'SinglePlayer'],
  keywords: 'online board game, ludo, chess, kingdom, strategy, race',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
