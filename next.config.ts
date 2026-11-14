import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Vercel cannot keep the Socket.IO process alive, so the hosted site runs local modes only.
  env: {
    NEXT_PUBLIC_REALTIME: process.env.VERCEL ? 'off' : 'on',
  },
};

export default nextConfig;
