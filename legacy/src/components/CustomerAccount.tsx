'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { CalendarDays, Check, ChevronRight, Heart, HelpCircle, Settings, Star, UserRound } from 'lucide-react';
import { safeReturn } from '@/lib/customer';
import { experiences } from '@/lib/catalog';
import { useCustomer } from './CustomerProvider';
import { LogoutButton } from './LogoutButton';
import { SocialSignIn } from './SocialSignIn';
import { EmailSignIn } from './EmailSignIn';
import { Back, Gate, PageHeading, Photo } from './UI';
import { useServerAuth } from './ServerAuthProvider';
import { Avatar, ProfilePhoto } from './ProfilePhoto';
import { ProfileVideos } from './ProfileVideos';
export function AuthPage({ register = false }: { register?: boolean }) {
  const params = useSearchParams();
  const next = safeReturn(params.get('next') ?? '/account');
  return <div className="auth-layout"><aside className="auth-story"><Photo src={experiences[1].image} alt="Explore the green landscape around Sigiriya" sizes="(max-width: 900px) 100vw, 50vw" priority/><div><img src="/brand/buddy-mark.svg" alt="" width="76" height="76"/><h2>Good company.<br/>Great discoveries.</h2><p>A little curiosity can lead somewhere wonderful.</p><span>TravelBuddy · Your next story starts here.</span></div></aside><section className="auth-form-section"><div className="auth-form-inner"><p className="eyebrow">Your travel space</p><h1>{register ? 'Let’s start somewhere.' : 'Good to see you again.'}</h1><p>{register ? 'Save your discoveries, book your experiences and keep it all together.' : 'Your saved ideas and next adventures are waiting.'}</p><SocialSignIn registration={register} next={next} /><EmailSignIn registration={register} next={next} /><p className="auth-switch">{register ? 'Already have an account?' : 'New to TravelBuddy?'} <Link href={`${register ? '/login' : '/register'}?next=${encodeURIComponent(next)}`}>{register ? 'Sign in' : 'Create an account'}</Link></p></div></section></div>;
}
export function AccountPage() { return <Gate><AccountContent/></Gate>; }
function AccountContent() { const { user, data } = useCustomer(); const { account } = useServerAuth(); const links = [...(account?.roles.includes('provider') ? [{ href: '/account/packages', icon: CalendarDays, label: 'My packages', detail: 'Create experiences, add clips and manage your listings' }] : []), { href: '/bookings', icon: CalendarDays, label: 'Your bookings', detail: `${data.bookings.filter(b => b.owner === user!.id).length} bookings` }, { href: '/saved', icon: Heart, label: 'Saved experiences', detail: `${(data.saved[user!.id] ?? []).length} ideas for later` }, { href: '/reviews', icon: Star, label: 'Your reviews', detail: 'Stories from your completed experiences' }, { href: '/account/settings', icon: Settings, label: 'Account settings', detail: 'Edit your profile, video clips and display preferences' }, { href: '/support', icon: HelpCircle, label: 'Help & policies', detail: 'Booking and cancellation support' }]; return <div className="page-width account-page"><PageHeading eyebrow="Your travel space" title={`Hello, ${user!.name.split(' ')[0]}.`} text="A little curiosity. Everything in one place."/><div className="account-profile"><Avatar name={user!.name} mediaId={account?.avatarMediaId} /><div><h2>{user!.name}</h2><p>{user!.email}</p></div></div><div className="account-links">{links.map(({ icon: Icon, ...link }) => <Link key={link.href} href={link.href}><span className="account-link-icon"><Icon size={21}/></span><div><strong>{link.label}</strong><small>{link.detail}</small></div><ChevronRight size={19}/></Link>)}</div><LogoutButton/></div>; }
export function SettingsPage() { return <Gate><SettingsContent/></Gate>; }
function SettingsContent() {
  const { user, updateName } = useCustomer();
  const { account, refresh } = useServerAuth();
  const [name, setName] = useState(account?.displayName ?? user!.name);
  const [details, setDetails] = useState({ bio: '', homeBase: '', languages: '', interests: '', travelStyle: '', specialties: '', yearsExperience: '' });
  const [theme, setTheme] = useState('light');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const buddy = account?.roles.includes('provider') ?? false;

  useEffect(() => {
    if (!account) return;
    setName(account.displayName);
    setDetails({ ...account.profileDetails, yearsExperience: account.profileDetails.yearsExperience?.toString() ?? '' });
  }, [account]);
  useEffect(() => { setTheme(document.documentElement.dataset.theme ?? 'light'); }, []);

  const changeTheme = (value: string) => {
    setTheme(value);
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('travelbuddy-v1.1-theme', value); }
    catch { setMessage('Display preference will last only while this page is open.'); }
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: name, profileDetails: { ...details, yearsExperience: details.yearsExperience ? Number(details.yearsExperience) : null } }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Profile could not be saved.');
      updateName(name);
      await refresh();
      setMessage('Your profile is saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Profile could not be saved.');
    } finally { setBusy(false); }
  };

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <div className="page-width settings-page standard-page profile-edit-page">
    <Back href="/account" label="Your account" />
    <PageHeading eyebrow={buddy ? 'Buddy profile' : 'Traveller profile'} title="Make it easier to meet." text={buddy ? 'Show travellers what you know and the places you love.' : 'Share what you enjoy so the right buddy can find you.'} />
    <div className="profile-edit-layout">
      <aside className="profile-edit-aside">
        <div className="profile-edit-identity">
          <Avatar name={name} mediaId={account?.avatarMediaId} />
          <div><strong>{name || 'Your name'}</strong><span>{buddy ? 'Local buddy' : 'Traveller'}</span></div>
        </div>
        <p>Your profile helps people understand who they’ll be exploring with.</p>
        <div className="profile-edit-aside-note"><span aria-hidden="true">✦</span><p>{buddy ? 'A few personal details can help travellers choose an experience that feels right.' : 'Add your interests and travel style to help buddies suggest a better fit.'}</p></div>
      </aside>

      <div className="profile-edit-main">
        <ProfilePhoto />
        <form className="settings-panel profile-form" onSubmit={saveProfile}>
          <section className="profile-form-section">
            <div className="profile-section-heading"><div><h2>About you</h2><p>These details help people put a face to your plans.</p></div></div>
            <label className="field">Your name<input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} autoComplete="name" /></label>
            <label className="field">Email address<input type="email" value={user!.email} readOnly /></label>
            <label className="field">A little about you<textarea rows={4} maxLength={500} value={details.bio} onChange={event => setDetails({ ...details, bio: event.target.value })} placeholder="A few lines about yourself…" /><small>Up to 500 characters</small></label>
          </section>
          <section className="profile-form-section">
            <div className="profile-section-heading"><div><h2>{buddy ? 'Your local knowledge' : 'Your way of travelling'}</h2><p>{buddy ? 'Help travellers discover what makes your area special.' : 'Give a local buddy a sense of what you enjoy.'}</p></div></div>
            <label className="field">{buddy ? 'Your local area' : 'Where are you based?'}<input maxLength={120} value={details.homeBase} onChange={event => setDetails({ ...details, homeBase: event.target.value })} placeholder="City or region" /></label>
            <label className="field">Languages<input maxLength={160} value={details.languages} onChange={event => setDetails({ ...details, languages: event.target.value })} placeholder="For example, English, Sinhala" /></label>
            {buddy ? <><label className="field">Specialties<input maxLength={240} value={details.specialties} onChange={event => setDetails({ ...details, specialties: event.target.value })} placeholder="Food, hiking, culture…" /></label><label className="field">Years of experience<input type="number" min="0" max="80" value={details.yearsExperience} onChange={event => setDetails({ ...details, yearsExperience: event.target.value })} placeholder="Optional" /></label></> : <><label className="field">Interests<input maxLength={240} value={details.interests} onChange={event => setDetails({ ...details, interests: event.target.value })} placeholder="Nature, food, history…" /></label><label className="field">Travel style<input maxLength={120} value={details.travelStyle} onChange={event => setDetails({ ...details, travelStyle: event.target.value })} placeholder="Slow travel, adventure…" /></label></>}
          </section>
          <div className="profile-form-actions"><span>Only share what you’re comfortable sharing.</span><button className="button button-primary" disabled={busy}>{busy ? 'Saving profile…' : 'Save profile'} <Check size={17} /></button></div>
        </form>
        <ProfileVideos /><section className="settings-panel profile-display-panel"><div><h2>Display</h2><p>Choose a comfortable view for browsing.</p></div><div className="segmented"><button type="button" className={theme === 'light' ? 'active' : ''} aria-pressed={theme === 'light'} onClick={() => changeTheme('light')}>Light</button><button type="button" className={theme === 'dark' ? 'active' : ''} aria-pressed={theme === 'dark'} onClick={() => changeTheme('dark')}>Dark</button></div></section>
        {message && <p className="inline-note" role="status">{message}</p>}
      </div>
    </div>
  </div>;
}
export function SupportPage() { const answers = [{ title: 'How do I book an experience?', text: 'Choose an experience, select an option, date, time and traveler count, then add it to your cart. Review your details and cancellation policy before confirming.' }, { title: 'What can I find on Explore?', text: 'Search experiences by destination, category, date, price and duration. Use Live availability to find offers with an available next slot, or browse the map.' }, { title: 'Can I cancel a booking?', text: 'Experiences marked Free cancellation allow cancellation until 24 hours before the start. Check your booking details for the applicable policy.' }, { title: 'How can I write a review?', text: 'Open Your reviews to rate a completed booking and share your experience. Each booking can be reviewed once.' }, { title: 'How are prices calculated?', text: 'Prices are shown in USD per person. Your selected option and traveler count determine the total shown before confirmation.' }]; return <div className="page-width support-page standard-page"><Back/><PageHeading eyebrow="A little help along the way" title="Travel with a clearer picture." text="Answers about experiences, bookings and cancellation policies."/><div className="support-content">{answers.map(item => <details key={item.title}><summary>{item.title}</summary><p>{item.text}</p></details>)}</div></div>; }
