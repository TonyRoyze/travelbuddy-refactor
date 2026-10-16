'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Account, Booking, CartItem, CustomerState, customerAccountFromSession, DATA_KEY, SESSION_KEY, canReview, emptyState, itemPrice, restoreState, today, validateCart, validateReview, cancelAllowed } from '@/lib/customer';
import { usePathname } from 'next/navigation';
import { useServerAuth } from './ServerAuthProvider';
type Context = { data: CustomerState; user: Account | undefined; ready: boolean; notice: string; clearNotice: () => void; storageError: boolean; logout: () => void; toggleSaved: (id: string) => void; addCart: (item: CartItem) => string; removeCart: (id: string) => void; checkout: (name: string, email: string) => Promise<{ error?: string; id?: string }>; submitReview: (bookingId: string, rating: number, text: string) => string; cancelBooking: (id: string) => Promise<string>; bookingError: string; updateName: (name: string) => void };
const CustomerContext = createContext<Context | null>(null);
export function CustomerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CustomerState>(() => emptyState());
  const { account, ready: authReady } = useServerAuth();
  const [ready, setReady] = useState(false);
  const pathname = usePathname();
  const [bookingsOwner, setBookingsOwner] = useState('');
  const [bookingError, setBookingError] = useState('');
  const checkoutAttempt = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    if (!account || account.onboarding !== 'completed') { setBookingsOwner(''); return; }
    const controller = new AbortController(); let sequence = 0;
    const load = async () => {
      const current = ++sequence;
      try {
        const response = await fetch('/api/bookings', { cache: 'no-store', signal: controller.signal });
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
        if (!controller.signal.aborted && current === sequence) { setData(data => ({ ...data, bookings: body.bookings })); setBookingError(''); }
      } catch (error) { if (!controller.signal.aborted && current === sequence) setBookingError('Your bookings could not be refreshed. Reload to try again.'); }
      finally { if (!controller.signal.aborted && current === sequence) setBookingsOwner(account.id); }
    };
    void load(); const interval = window.setInterval(() => void load(), 30000); const focus = () => void load(); window.addEventListener('focus', focus);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [account?.id, pathname]);
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState(false);
  useEffect(() => { try { setData(restoreState(localStorage.getItem(DATA_KEY))); sessionStorage.removeItem(SESSION_KEY); const theme = localStorage.getItem('travelbuddy-v1.1-theme'); document.documentElement.dataset.theme = theme === 'light' || theme === 'dark' ? theme : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { setStorageError(true); } setReady(true); }, []);
  const commit = useCallback((value: CustomerState) => { setData(value); try { localStorage.setItem(DATA_KEY, JSON.stringify(value)); } catch { setStorageError(true); } }, []);
  const user = customerAccountFromSession(account, data.accounts);
  useEffect(() => {
    if (!ready || !account || account.onboarding !== 'completed' || data.accounts.some(value => value.id === account.id)) return;
    commit({ ...data, accounts: [...data.accounts, { id: account.id, name: account.displayName, email: '' }] });
  }, [ready, account, data, commit]);
  const clearLegacySession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch { setStorageError(true); } };
  const toggleSaved = (id: string) => { if (!user) return; const saved = data.saved[user.id] ?? []; const removing = saved.includes(id); commit({ ...data, saved: { ...data.saved, [user.id]: removing ? saved.filter(value => value !== id) : [...saved, id] } }); setNotice(removing ? 'Removed from saved experiences.' : 'Saved for later.'); };
  const addCart = (item: CartItem) => { if (!user) return 'Sign in to book an experience.'; const cart = data.carts[user.id] ?? []; if (cart.length >= 20) return 'You can book up to 20 experiences at a time.'; commit({ ...data, carts: { ...data.carts, [user.id]: [...cart, item] } }); setNotice('Added to your cart. Places are reserved at checkout.'); return ''; };
  const removeCart = (id: string) => { if (user) commit({ ...data, carts: { ...data.carts, [user.id]: (data.carts[user.id] ?? []).filter(item => item.id !== id) } }); };
  const checkout = async (name: string, email: string): Promise<{ error?: string; id?: string }> => {
    if (!user) return { error: 'Sign in to continue.' };
    const cart = data.carts[user.id] ?? [];
    const items = cart.map(({ id, experienceId, option, date, time, travelers }) => ({ id, experienceId, option, date, time, travelers }));
    const payload = JSON.stringify({ travelerName: name, travelerEmail: email, items });
    const storageKey = `travelbuddy-checkout-${user.id}`;
    try {
      if (!checkoutAttempt.current) { try { checkoutAttempt.current = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); } catch {} }
      if (checkoutAttempt.current?.payload !== payload) checkoutAttempt.current = { payload, key: crypto.randomUUID() };
      try { sessionStorage.setItem(storageKey, JSON.stringify(checkoutAttempt.current)); } catch {}
      const response = await fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(payload), idempotencyKey: checkoutAttempt.current!.key }) });
      const body = await response.json();
      if (!response.ok) { if (response.status < 500) { checkoutAttempt.current = null; try { sessionStorage.removeItem(storageKey); } catch {} } return { error: body.error ?? 'Booking could not be confirmed.' }; }
      const bookings: Booking[] = body.bookings;
      commit({ ...data, bookings: [...bookings, ...data.bookings.filter(old => !bookings.some(row => row.id === old.id))], carts: { ...data.carts, [user.id]: [] } });
      checkoutAttempt.current = null; try { sessionStorage.removeItem(storageKey); } catch {}
      return { id: bookings[0].id };
    } catch { return { error: 'Your booking could not be confirmed. Try again; repeated attempts will not duplicate a reservation.' }; }
  };
  const submitReview = (bookingId: string, rating: number, text: string) => { const booking = data.bookings.find(b => b.id === bookingId); const error = validateReview(booking, user?.id, data.reviews, rating, text); if (error) return error; commit({ ...data, reviews: [...data.reviews, { id: crypto.randomUUID(), owner: user!.id, bookingId, experienceId: booking!.experienceId, rating, text: text.trim(), date: today() }] }); setNotice('Your review is saved on this device.'); return ''; };
  const cancelBooking = async (id: string) => {
    try {
      const response = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' }); const body = await response.json();
      if (!response.ok) return body.error ?? 'Booking could not be cancelled.';
      commit({ ...data, bookings: data.bookings.map(row => row.id === id ? body.booking : row) }); setNotice('Booking cancelled. Your places are available again.'); return '';
    } catch { return 'Cancellation could not be confirmed. Please try again.'; }
  };
  const updateName = (name: string) => { if (user && name.trim().length >= 2) { commit({ ...data, accounts: data.accounts.map(a => a.id === user.id ? { ...a, name: name.trim() } : a) }); setNotice('Your name has been updated.'); } };
  return <CustomerContext.Provider value={{ data, user, ready: ready && authReady && (!account || account.onboarding !== 'completed' || bookingsOwner === account.id), bookingError, notice, clearNotice: () => setNotice(''), storageError, logout: clearLegacySession, toggleSaved, addCart, removeCart, checkout, submitReview, cancelBooking, updateName }}>{children}</CustomerContext.Provider>;
}
export function useCustomer() { const value = useContext(CustomerContext); if (!value) throw new Error('CustomerProvider is required'); return value; }
