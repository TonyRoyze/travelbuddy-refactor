'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Account, Booking, CartItem, CustomerState, customerAccountFromSession, DATA_KEY, SESSION_KEY, canReview, emptyState, itemPrice, restoreState, today, validateCart, validateReview, cancelAllowed } from '@/lib/customer';
import { useServerAuth } from './ServerAuthProvider';
type Context = { data: CustomerState; user: Account | undefined; ready: boolean; notice: string; clearNotice: () => void; storageError: boolean; logout: () => void; toggleSaved: (id: string) => void; addCart: (item: CartItem) => string; removeCart: (id: string) => void; checkout: (name: string, email: string) => { error?: string; id?: string }; submitReview: (bookingId: string, rating: number, text: string) => string; cancelBooking: (id: string) => string; updateName: (name: string) => void };
const CustomerContext = createContext<Context | null>(null);
export function CustomerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CustomerState>(() => emptyState());
  const { account, ready: authReady } = useServerAuth();
  const [ready, setReady] = useState(false);
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
  const addCart = (item: CartItem) => { if (!user) return 'Sign in to book an experience.'; const cart = data.carts[user.id] ?? []; const error = validateCart([...cart, item], data.bookings); if (error) return error; commit({ ...data, carts: { ...data.carts, [user.id]: [...cart, item] } }); setNotice('Added to your cart.'); return ''; };
  const removeCart = (id: string) => { if (user) commit({ ...data, carts: { ...data.carts, [user.id]: (data.carts[user.id] ?? []).filter(item => item.id !== id) } }); };
  const checkout = (name: string, email: string) => { if (!user) return { error: 'Sign in to continue.' }; if (name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid traveler name and email.' }; const cart = data.carts[user.id] ?? []; const error = validateCart(cart, data.bookings); if (error) return { error }; const created = new Date().toISOString(); const bookings: Booking[] = cart.map(item => ({ ...item, id: crypto.randomUUID(), owner: user.id, status: 'Upcoming', reference: `TB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, total: itemPrice(item), created, travelerName: name.trim(), travelerEmail: email.trim() })); commit({ ...data, bookings: [...bookings, ...data.bookings], carts: { ...data.carts, [user.id]: [] } }); return { id: bookings[0].id }; };
  const submitReview = (bookingId: string, rating: number, text: string) => { const booking = data.bookings.find(b => b.id === bookingId); const error = validateReview(booking, user?.id, data.reviews, rating, text); if (error) return error; commit({ ...data, reviews: [...data.reviews, { id: crypto.randomUUID(), owner: user!.id, bookingId, experienceId: booking!.experienceId, rating, text: text.trim(), date: today() }] }); setNotice('Your review is saved on this device.'); return ''; };
  const cancelBooking = (id: string) => { const booking = data.bookings.find(b => b.id === id && b.owner === user?.id); if (!booking || !cancelAllowed(booking)) return 'This booking is not eligible for free cancellation.'; commit({ ...data, bookings: data.bookings.map(b => b.id === id ? { ...b, status: 'Cancelled' } : b) }); setNotice('Booking cancelled.'); return ''; };
  const updateName = (name: string) => { if (user && name.trim().length >= 2) { commit({ ...data, accounts: data.accounts.map(a => a.id === user.id ? { ...a, name: name.trim() } : a) }); setNotice('Your name has been updated.'); } };
  return <CustomerContext.Provider value={{ data, user, ready: ready && authReady, notice, clearNotice: () => setNotice(''), storageError, logout: clearLegacySession, toggleSaved, addCart, removeCart, checkout, submitReview, cancelBooking, updateName }}>{children}</CustomerContext.Provider>;
}
export function useCustomer() { const value = useContext(CustomerContext); if (!value) throw new Error('CustomerProvider is required'); return value; }
