'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronRight, Heart, HelpCircle, Settings, Star, UserRound } from 'lucide-react';
import { safeReturn } from '@/lib/customer';
import { useCustomer } from './CustomerProvider';
import { useTheme } from './ThemeProvider';
import { LogoutButton } from './LogoutButton';
import { SocialSignIn } from './SocialSignIn';
import { EmailSignIn } from './EmailSignIn';
import { Back, Gate, PageHeading } from './UI';
export function AuthPage({ register = false }: { register?: boolean }) {
  const params = useSearchParams();
  const next = safeReturn(params.get('next'));
  return <div className="auth-discovery">
    <aside className="auth-landscape" aria-label="A world of discoveries">
      <div className="auth-landscape-art" aria-hidden="true"><div className="auth-landscape-night"/></div>
      <div className="auth-landscape-copy">
        <p className="auth-landscape-eyebrow">A little curiosity goes a long way</p>
        <h2>Find your next<br/><span>great story.</span></h2>
        <p>Good company. Great discoveries.<br/>And a world of experiences waiting for you.</p>
        <div className="auth-landscape-benefits"><span><Heart size={16} aria-hidden="true"/>Save your favourites</span><span><CalendarDays size={16} aria-hidden="true"/>Keep every plan together</span></div>
      </div>
    </aside>
    <section className="auth-welcome" aria-labelledby="auth-title"><div className="auth-welcome-inner">
      <h1 id="auth-title" className={register ? undefined : "auth-welcome-title"}>{register ? 'Let’s start somewhere.' : 'Welcome back.'}</h1>
      <p className="auth-welcome-description">{register ? 'A world of experiences. One place for all your plans.' : 'Sign in to your saved discoveries, upcoming adventures and everything in between.'}</p>
      <SocialSignIn registration={register} next={next}/>
      <div className="auth-method-divider"><span>or use your email</span></div>
      <EmailSignIn registration={register} next={next}/>
      <p className="auth-welcome-switch">{register ? 'Already part of the journey?' : 'New to UTrippers?'} <Link href={`${register ? '/login' : '/register'}?next=${encodeURIComponent(next)}`}>{register ? 'Sign in' : 'Create an account'}<ArrowRight size={14} aria-hidden="true"/></Link></p>
      <p className="auth-welcome-help">A little help along the way? <Link href="/support">We’re here for you.</Link></p>
    </div></section>
  </div>;
}
export function AccountPage() { return <Gate><AccountContent/></Gate>; }
function AccountContent() { const { user, data } = useCustomer(); const links = [{ href: '/bookings', icon: CalendarDays, label: 'Your bookings', detail: `${data.bookings.filter(b => b.owner === user!.id).length} bookings` }, { href: '/saved', icon: Heart, label: 'Saved experiences', detail: `${(data.saved[user!.id] ?? []).length} ideas for later` }, { href: '/reviews', icon: Star, label: 'Your reviews', detail: 'Stories from your completed experiences' }, { href: '/account/settings', icon: Settings, label: 'Account settings', detail: 'Your name and display preferences' }, { href: '/support', icon: HelpCircle, label: 'Help & policies', detail: 'Booking and cancellation support' }]; return <div className="page-width account-page"><PageHeading eyebrow="Your travel space" title={`Hello, ${user!.name.split(' ')[0]}.`} text="A little curiosity. Everything in one place."/><div className="account-profile"><div className="account-avatar">{user!.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div><h2>{user!.name}</h2><p>{user!.email}</p></div></div><div className="account-links">{links.map(({ icon: Icon, ...link }) => <Link key={link.href} href={link.href}><span className="account-link-icon"><Icon size={21}/></span><div><strong>{link.label}</strong><small>{link.detail}</small></div><ChevronRight size={19}/></Link>)}</div><LogoutButton/></div>; }
export function SettingsPage() { return <Gate><SettingsContent/></Gate>; }
function SettingsContent() {
  const { user, updateName } = useCustomer(); const [name, setName] = useState(user!.name); const { preference, setPreference } = useTheme(); const [message, setMessage] = useState('');
  return <div className="page-width settings-page standard-page"><Back href="/account" label="Your account"/><PageHeading title="A space that feels like you." text="Simple details for your customer account."/><form className="settings-panel" onSubmit={event => { event.preventDefault(); updateName(name); setMessage('Your name is saved.'); }}><h2>Personal details</h2><label className="field">Your name<input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={80} autoComplete="name"/></label><label className="field">Email address<input type="email" value={user!.email} readOnly/></label><button className="button button-primary">Save changes <Check size={17}/></button></form><section className="settings-panel"><h2>Display</h2><p>Choose a comfortable view for browsing.</p><div className="segmented">{(['system', 'light', 'dark'] as const).map(value => <button key={value} className={preference === value ? 'active' : ''} aria-pressed={preference === value} onClick={() => setPreference(value)}>{value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark'}</button>)}</div></section>{message && <p className="inline-note" role="status">{message}</p>}</div>;
}
export function SupportPage() { const answers = [{ title: 'How do I book an experience?', text: 'Choose an experience, select an option, date, time and traveler count, then add it to your cart. Review your details and cancellation policy before confirming.' }, { title: 'What can I find on Explore?', text: 'Search experiences by destination, category, date, price and duration. Use Live availability to find offers with an available next slot, or browse the map.' }, { title: 'Can I cancel a booking?', text: 'Experiences marked Free cancellation allow cancellation until 24 hours before the start. Check your booking details for the applicable policy.' }, { title: 'How can I write a review?', text: 'Open Your reviews to rate a completed booking and share your experience. Each booking can be reviewed once.' }, { title: 'How are prices calculated?', text: 'Prices are shown in USD per person. Your selected option and traveler count determine the total shown before confirmation.' }]; return <div className="page-width support-page standard-page"><Back/><PageHeading eyebrow="A little help along the way" title="Travel with a clearer picture." text="Answers about experiences, bookings and cancellation policies."/><div className="support-content"><p>Need more help? <Link href="/inbox?tab=support" className="text-link">Open customer care <ArrowRight size={16}/></Link></p>{answers.map(item => <details key={item.title}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div></div>; }
