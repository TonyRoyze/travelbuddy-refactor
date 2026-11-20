export function authConfig() {
  const value = process.env.AUTH_APP_URL;
  if (!value) throw new Error('AUTH_APP_URL is required.');
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('AUTH_APP_URL must be an HTTPS origin (HTTP localhost is allowed).');
  }
  return { origin: url.origin, secure: url.protocol === 'https:' };
}

export function sameOrigin(request: Request) {
  return request.headers.get('origin') === authConfig().origin;
}

export const socialProviders = ['google', 'facebook', 'apple'] as const;
export type SocialProvider = typeof socialProviders[number];

export function safeAuthReturn(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/account/security';
  const origin = authConfig().origin;
  const url = new URL(value, origin);
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/account/security';
}
