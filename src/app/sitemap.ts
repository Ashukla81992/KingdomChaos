import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kingdom-chaos.vercel.app';

/** Public, indexable pages. Private rooms stay out of the sitemap. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ['', '/online', '/practice', '/tutorial', '/hotseat', '/privacy'].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : 0.7,
  }));
}
