import type { MetadataRoute } from 'next';
import { authConfig } from '@/lib/backend/auth-security';

export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/search', '/destinations', '/nearby', '/support'].map(path => ({
    url: new URL(path, authConfig().origin).toString(),
  }));
}
