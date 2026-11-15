import type { MetadataRoute } from 'next';
import { authConfig } from '@/lib/backend/auth-security';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/account', '/auth/', '/register/complete', '/inbox', '/checkout', '/cart', '/bookings', '/booking/', '/confirmation/', '/saved', '/test-accounts'] },
    sitemap: `${authConfig().origin}/sitemap.xml`,
  };
}
