'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw, ShoppingBag } from 'lucide-react';
import type { Experience } from '@/lib/catalog';
import type { LiveAvailability } from '@/lib/availability';
import { addDays, money, today, validDate } from '@/lib/customer';
import { useCustomer } from './CustomerProvider';
import { ProviderChatButton } from './ProviderChatButton';
import { DatePicker } from './DatePicker';
export function LiveBookingPanel({ experience, initialQuery, onSelectionChange }: { experience: Experience; initialQuery?: string; onSelectionChange?: (query: string) => void }) {
  const routeParams = useSearchParams(); const params = new URLSearchParams(initialQuery ?? routeParams.toString()); const router = useRouter(); const { user, ready, data, addCart } = useCustomer();
  const [option, setOption] = useState(() => experience.options[Number(params.get('option'))] ? Number(params.get('option')) : 0);
  const [date, setDate] = useState(() => validDate(params.get('date') ?? '') && params.get('date')! >= today() ? params.get('date')! : today());
  const [travelers, setTravelers] = useState(() => Math.min(12, Math.max(1, Math.floor(Number(params.get('travelers'))) || 1)));
  const [time, setTime] = useState(params.get('time') ?? ''); const [availability, setAvailability] = useState<LiveAvailability | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [added, setAdded] = useState(false); const [attempt, setAttempt] = useState(0);
  const adding = useRef(false);
  const editing = user ? (data.carts[user.id] ?? []).find(item => item.id === params.get('item') && item.experienceId === experience.id) : undefined;
  const first = useRef(!validDate(params.get('date') ?? '') || params.get('date')! < today());
  const [defaultNotice, setDefaultNotice] = useState('');
  const bookingQuery = new URLSearchParams({ date, time, option: String(option), travelers: String(travelers), ...(editing ? { item: editing.id } : {}) }).toString();
  useEffect(() => { onSelectionChange?.(bookingQuery); }, [bookingQuery, onSelectionChange]);
  useEffect(() => {
    const controller = new AbortController(); let sequence = 0; setAvailability(null); setAdded(false); setLoading(true); setError('');
    const load = async () => {
      const current = ++sequence;
      try {
        const query = new URLSearchParams({ date, option: String(option), travelers: String(travelers) });
        const response = await fetch(`/api/packages/${experience.id}/availability?${query}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json(); if (!response.ok) throw new Error(body.error);
        if (controller.signal.aborted || current !== sequence) return;
        if (first.current && !body.slots.some((slot: { remaining: number }) => slot.remaining >= travelers) && body.next) { first.current = false; setDefaultNotice('No places remain today. We selected the next available date and time.'); setDate(body.next.date); setTime(body.next.time); setLoading(true); return; }
        first.current = false; setAvailability(body); setError('');
        setTime(previous => body.slots.some((slot: { time: string; remaining: number }) => slot.time === previous && slot.remaining >= travelers) ? previous : body.slots.find((slot: { remaining: number }) => slot.remaining >= travelers)?.time ?? '');
      } catch (error) { if (!controller.signal.aborted && current === sequence) { setAvailability(null); setError(error instanceof Error ? error.message : 'Availability could not be checked.'); } }
      finally { if (!controller.signal.aborted && current === sequence) setLoading(false); }
    };
    void load(); const interval = window.setInterval(() => void load(), 15000); const focus = () => void load(); window.addEventListener('focus', focus);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [experience.id, date, option, travelers, attempt]);
  const selected = experience.options[option];
  const slot = availability?.slots.find(slot => slot.time === time);
  function add(bookNow = false) {
    if (adding.current || !ready || !slot || slot.remaining < travelers || loading) return;
    if (!user) { router.push(`/login?next=${encodeURIComponent(`/experience/${experience.id}?${bookingQuery}`)}`); return; }
    adding.current = true;
    const result = addCart({ id: editing?.id ?? crypto.randomUUID(), experienceId: experience.id, experience, option, date, time, travelers });
    if (result) setError(result); else { setAdded(true); setError(''); if (bookNow) router.push('/checkout'); else if (editing) router.push('/cart'); }
    if (!bookNow || result) adding.current = false;
  }
  return <div className="live-booking-panel"><div className="booking-price"><span>From</span><strong>{money(selected.price)}</strong><span>/ person</span></div>
    {defaultNotice && <p className="field-help" role="status">{defaultNotice}</p>}
    <label className="field">Experience option<select value={option} onChange={event => setOption(Number(event.target.value))}>{experience.options.map((option, index) => <option key={index} value={index}>{option.name}</option>)}</select></label>
    <label className="field">Choose your date<DatePicker min={today()} max={addDays(today(), 180)} value={date} onChange={value => { first.current = false; setDefaultNotice(''); setDate(value); }} /></label>
    <label className="field">Travellers<input type="number" min={1} max={12} value={travelers} onChange={event => setTravelers(Math.min(12, Math.max(1, Math.floor(Number(event.target.value)) || 1)))} /></label>
    <fieldset className="time-field"><legend>Available start times · Sri Lanka time</legend>{loading ? <p role="status">Checking live availability…</p> : availability?.slots.length ? <div className="time-slots">{availability.slots.map(slot => <button type="button" key={slot.time} disabled={slot.remaining < travelers} className={time === slot.time ? 'active' : ''} aria-pressed={time === slot.time} onClick={() => { setTime(slot.time); setAdded(false); }}>{slot.time}<small>{slot.remaining ? `${slot.remaining} places left` : 'Sold out'}</small></button>)}</div> : !error && <p>No bookable start times on this date.</p>}</fieldset>
    {!loading && availability?.next && !availability.slots.some(slot => slot.remaining >= travelers) && <button type="button" className="text-link" onClick={() => { setDate(availability.next!.date); setTime(availability.next!.time); }}>Next available: {availability.next.date} at {availability.next.time}</button>}
    <div className="booking-total"><span>{money(selected.price)} × {travelers} travellers</span><strong>{money(Math.round(selected.price * 100) * travelers / 100)}</strong></div>
    {error && <p role="alert" className="error-message">{error}<button type="button" className="text-link" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={14} />Check again</button></p>}
    <button type="button" className="button button-primary button-wide" disabled={!ready || loading || !slot || slot.remaining < travelers} onClick={() => add(true)}>Book Now</button>
    <button type="button" className="button button-secondary button-wide" disabled={!ready || loading || !slot || slot.remaining < travelers} onClick={() => add()}><ShoppingBag size={18} />{editing ? 'Update cart' : added ? 'Add another booking' : 'Add to cart'}</button>
    <ProviderChatButton packageId={experience.id} bookingQuery={bookingQuery}/>
    {added && <Link className="button button-secondary button-wide" href="/cart">View your cart</Link>}
    <p className="field-help">Places are reserved when you confirm checkout. Availability refreshes automatically.</p>
  </div>;
}
