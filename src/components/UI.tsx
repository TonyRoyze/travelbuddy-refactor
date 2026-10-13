'use client';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronLeft, Compass, Heart, Home, ImageOff, MapPin, MessageCircle, Search, ShoppingBag, Star, UserRound, X } from 'lucide-react';
import type { Experience } from '@/lib/catalog';
import { localSearchSuggestions, type SearchSuggestion } from '@/lib/search-suggestions';
import { money } from '@/lib/customer';
import { useServerAuth } from './ServerAuthProvider';
import { useCustomer } from './CustomerProvider';

export function Brand() { return <Link href="/" className="brand" aria-label="TravelBuddy home"><img src="/brand/buddy-mark.svg" width="36" height="36" alt=""/><span>travelbuddy</span></Link>; }
const navigation = [{ href: '/', label: 'Home', icon: Home }, { href: '/nearby', label: 'Explore', icon: Compass }, { href: '/bookings', label: 'Bookings', icon: CalendarDays }, { href: '/inbox', label: 'Inbox', icon: MessageCircle }];
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname(); const params = useSearchParams(); const { account: googleAccount } = useServerAuth(); const { user, data, ready, notice, clearNotice, storageError } = useCustomer();
  const auth = pathname === '/login' || pathname === '/register' || pathname === '/register/google';
  const inboxConversation = pathname === '/inbox' && params.has('conversation');
  const focused = auth || pathname === '/checkout';
  const count = user ? (data.carts[user.id] ?? []).length : 0;
  const active = (href: string) => href === '/' ? pathname === '/' : href === '/nearby' ? ['/nearby', '/search', '/destinations'].includes(pathname) || pathname.startsWith('/experience/') : pathname.startsWith(href);
  useEffect(() => { if (!notice) return; const timer = setTimeout(clearNotice, 5000); return () => clearTimeout(timer); }, [notice, clearNotice]);
  return <div className={`app-shell ${focused ? 'focused-shell' : ''} ${inboxConversation ? 'inbox-chat-shell' : ''}`} data-auth={auth} data-ready={ready}><a className="skip-link" href="#main-content">Skip to content</a><header className="site-header"><div className="header-inner"><Brand/>{!focused && <nav className="desktop-nav" aria-label="Main navigation">{navigation.map(item => <Link key={item.href} href={item.href} className={active(item.href) ? 'active' : ''} aria-current={active(item.href) ? 'page' : undefined}>{item.label}</Link>)}</nav>}<div className="header-actions">{focused ? !inboxConversation && <Link href="/" className="text-link">Back to home <ArrowRight size={16}/></Link> : <><Link className="icon-button saved-shortcut" href="/saved" aria-label="Saved experiences"><Heart size={20}/></Link><Link className="icon-button cart-shortcut" href="/cart" aria-label={`Cart, ${count} experiences`}><ShoppingBag size={20}/>{count > 0 && <b>{count}</b>}</Link><Link className="profile-shortcut" href={googleAccount ? '/account/security' : user ? '/account' : '/login'} aria-label={googleAccount || user ? 'Your account' : 'Sign in'}><UserRound size={19}/><span>{googleAccount ? googleAccount.displayName.split(' ')[0] : user ? user.name.split(' ')[0] : 'Sign in'}</span></Link></>}</div></div></header>{storageError && <div className="storage-alert" role="alert">Browser storage is unavailable. Changes will last only while this page is open.</div>}<main id="main-content">{children}</main>{!auth && <SiteFooter/>}{(!focused || inboxConversation) && <><nav className="bottom-nav" aria-label="Mobile navigation">{navigation.map(({ icon: Icon, ...item }) => <Link href={item.href} key={item.href} className={active(item.href) ? 'active' : ''} aria-current={active(item.href) ? 'page' : undefined}><Icon size={22}/><span>{item.label}</span></Link>)}</nav></>}{notice && <div className="toast" role="status"><Check size={18}/><span>{notice}</span><button onClick={clearNotice} aria-label="Dismiss notification"><X size={16}/></button></div>}</div>;
}
function SiteFooter() {
  return <footer className="site-footer explore-footer">
    <div className="footer-intro">
      <Brand/>
      <h2>Good company.<br/>Great discoveries.</h2><p>Find the experience that feels right. Know what’s included. Keep every booking in one place.</p>
    </div>
    <div className="footer-meta"><div className="footer-details"><span>© 2026 TravelBuddy</span></div><div className="footer-utilities"><Link href="/support">Help & policies</Link><span>English · USD</span></div></div>
  </footer>;
}
export function Gate({ children }: { children: ReactNode }) {
  const { account, error, refresh } = useServerAuth(); const { user, ready } = useCustomer(); const router = useRouter(); const previouslySignedIn = useRef(false);
  useEffect(() => { if (user) previouslySignedIn.current = true; if (ready && !error && account?.onboarding === 'pending') { router.replace('/register/google'); return; } if (ready && !error && !user) router.replace(previouslySignedIn.current ? "/" : `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`); }, [ready, user, account, error, router]);
  if (error && !user) return <div className="loading-state"><p role="alert">{error}</p><button className="button button-secondary" onClick={() => void refresh()}>Try again</button></div>;
  if (!ready || !user) return <div className="loading-state" role="status">Opening your travel space…</div>;
  return <>{children}</>;
}
export function Photo({ src, alt, className = '', priority = false, sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw' }: { src: string; alt: string; className?: string; priority?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false); useEffect(() => setFailed(false), [src]);
  return failed ? <div className={`photo-fallback ${className}`} role="img" aria-label={alt || 'Photo unavailable'}><ImageOff size={24}/><span>Photo unavailable</span></div> : <Image src={src} alt={alt} className={className} width={1200} height={800} sizes={sizes} priority={priority} onError={() => setFailed(true)}/>;
}
export function ExperienceCard({ experience, compact = false, live = false }: { experience: Experience; compact?: boolean; live?: boolean }) {
  const { error: authError } = useServerAuth(); const { user, ready, data, toggleSaved } = useCustomer(); const router = useRouter();
  const saved = user && (data.saved[user.id] ?? []).includes(experience.id);
  const href = `/experience/${experience.id}${live ? '?live=1' : ''}`;
  return <article className={`experience-card ${compact ? 'compact-card' : ''}`}><div className="card-photo"><Link href={href}><Photo src={experience.image} alt={experience.title}/></Link><button className={`save-button ${saved ? 'saved' : ''}`} aria-label={`${saved ? 'Unsave' : 'Save'} ${experience.title}`} aria-pressed={Boolean(saved)} disabled={!ready || Boolean(authError)} onClick={() => user ? toggleSaved(experience.id) : router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)}><Heart size={19} fill={saved ? 'currentColor' : 'none'}/></button>{live && <span className="photo-label">Live availability</span>}</div><div className="card-copy"><p className="card-location"><MapPin size={12}/>{experience.destination}<span>· {experience.category}</span></p><h3><Link href={href}>{experience.title}</Link></h3><div className="card-rating"><Star size={13} fill="currentColor"/><strong>{experience.rating.toFixed(1)}</strong><span>({experience.reviews} reviews)</span></div><p className="card-duration">{experience.duration}</p><div className="card-price">From <strong>{money(experience.price)}</strong> <span>/ person</span></div>{experience.freeCancellation && <p className="free-cancel"><Check size={12}/>Free cancellation</p>}</div></article>;
}
export function SearchBar({ initial = '', compact = false }: { initial?: string; compact?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(initial);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputId = compact ? 'search-page' : 'search-home';

  useEffect(() => setValue(initial), [initial]);
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/packages/suggestions?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Suggestion service unavailable.');
          const payload = await response.json() as { suggestions?: SearchSuggestion[] };
          if (!Array.isArray(payload.suggestions)) throw new Error('Invalid suggestion response.');
          const next = payload.suggestions.length ? payload.suggestions : localSearchSuggestions(query);
          setSuggestions(next);
          setActiveIndex(-1);
          setOpen(next.length > 0);
        })
        .catch(error => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          const next = localSearchSuggestions(query);
          setSuggestions(next);
          setActiveIndex(-1);
          setOpen(next.length > 0);
        });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [value]);

  const choose = (item: SearchSuggestion) => {
    setValue(item.value);
    setOpen(false);
    const destination = item.kind === 'category'
      ? `/nearby?category=${encodeURIComponent(item.value)}`
      : `/nearby?q=${encodeURIComponent(item.value)}`;
    router.push(destination);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault(); setOpen(true);
      setActiveIndex(index => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault(); setOpen(true);
      setActiveIndex(index => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Escape') {
      setOpen(false); setActiveIndex(-1);
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault(); choose(suggestions[activeIndex]);
    }
  };

  return <div className="search-autocomplete"><form className={`search-form ${compact ? 'compact-search' : ''}`} action="/nearby" autoComplete="off">
    <Search size={20} aria-hidden="true"/>
    <label className="sr-only" htmlFor={inputId}>Destination or experience</label>
    <input id={inputId} name="q" value={value} onChange={event => { setValue(event.target.value); setSuggestions([]); setActiveIndex(-1); setOpen(false); }} onKeyDown={onKeyDown}
      onFocus={() => setOpen(suggestions.length > 0)} onBlur={() => window.setTimeout(() => setOpen(false), 120)} placeholder="Where would you like to go?" autoComplete="off"
      role="combobox" aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} aria-controls={listId}
      aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}/>
    <button className="search-submit" type="submit" aria-label="Search experiences"><ArrowRight size={20}/><span>Explore</span></button>
  </form>{open && suggestions.length > 0 && <div className="search-suggestions" id={listId} role="listbox" aria-label="Search suggestions">
    {suggestions.map((item, index) => <button key={`${item.kind}:${item.value}`} id={`${listId}-${index}`} className={`search-suggestion ${index === activeIndex ? 'active' : ''}`}
      type="button" role="option" aria-selected={index === activeIndex} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}>
      <span className="search-suggestion-icon" aria-hidden="true">{item.kind === 'destination' || item.kind === 'country' ? <MapPin size={17}/> : item.kind === 'category' ? <Compass size={17}/> : <Search size={17}/>}</span>
      <span className="search-suggestion-value">{item.value}</span><span className="search-suggestion-kind">{item.kind}</span>
    </button>)}
  </div>}</div>;
}
export function Empty({ icon = <Compass size={34}/>, title, text, href, action }: { icon?: ReactNode; title: string; text: string; href?: string; action?: string }) { return <div className="empty-state">{icon}<h2>{title}</h2><p>{text}</p>{href && <Link href={href} className="button button-primary">{action ?? 'Explore experiences'}<ArrowRight size={17}/></Link>}</div>; }
export function PageHeading({ eyebrow, title, text, action }: { eyebrow?: string; title: string; text?: string; action?: ReactNode }) { return <div className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{text && <p>{text}</p>}</div>{action}</div>; }
export function Back({ href = '/', label = 'Back to home' }: { href?: string; label?: string }) { return <Link className="back-link" href={href}><ChevronLeft size={17}/>{label}</Link>; }
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId();
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); else if (!open && dialog.open) dialog.close(); if (!open) return; const before = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = before; }; }, [open]);
  return <dialog ref={ref} className="sheet" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby={titleId}><div className="sheet-header"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="Close panel"><X size={20}/></button></div><div className="sheet-body">{children}</div></dialog>;
}
