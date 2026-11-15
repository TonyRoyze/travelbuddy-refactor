import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Suspense } from 'react';
import { ServerAuthProvider } from '@/components/ServerAuthProvider';
import './account-auth.css';
import { CustomerProvider } from '@/components/CustomerProvider';
import { Shell } from '@/components/UI';
import { ThemeProvider } from '@/components/ThemeProvider';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './customer.css';
import './responsive.css';
import './inbox.css';
import './theme.css';
export const metadata: Metadata = { title: { default: 'UTrippers · Good company. Great discoveries.', template: '%s · UTrippers' }, description: 'Discover local experiences, book with confidence and keep your bookings together.', icons: { icon: '/brand/utrippers-symbol-blue.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#003B95' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" suppressHydrationWarning><head><script nonce={headers().get('x-nonce') ?? undefined} dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('travelbuddy-v1.1-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}})()` }}/></head><body><ThemeProvider><ServerAuthProvider><CustomerProvider><Suspense fallback={<div className="loading-state">Opening UTrippers…</div>}><Shell>{children}</Shell></Suspense></CustomerProvider></ServerAuthProvider></ThemeProvider></body></html>; }
