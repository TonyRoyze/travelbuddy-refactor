import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { ServerAuthProvider } from '@/components/ServerAuthProvider';
import './account-auth.css';
import { CustomerProvider } from '@/components/CustomerProvider';
import { Shell } from '@/components/UI';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import './customer.css';
import './responsive.css';
import './inbox.css';
export const metadata: Metadata = { title: { default: 'TravelBuddy · Good company. Great discoveries.', template: '%s · TravelBuddy' }, description: 'Discover local experiences, book with confidence and keep your bookings together.', icons: { icon: '/brand/buddy-mark-micro.svg', apple: '/brand/app-icon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0B6258' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><ServerAuthProvider><CustomerProvider><Suspense fallback={<div className="loading-state">Opening TravelBuddy…</div>}><Shell>{children}</Shell></Suspense></CustomerProvider></ServerAuthProvider></body></html>; }
