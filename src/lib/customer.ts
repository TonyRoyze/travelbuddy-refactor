import { experiences, getExperience } from './catalog';

export type Account = { id: string; name: string; email: string };
export type CartItem = { id: string; experienceId: string; option: number; date: string; time: string; travelers: number };
export type Booking = CartItem & { owner: string; status: 'Upcoming' | 'Completed' | 'Cancelled'; reference: string; total: number; created: string; travelerName: string; travelerEmail: string };
export type Review = { id: string; owner: string; bookingId: string; experienceId: string; rating: number; text: string; date: string };
export type Message = { id: string; author: 'customer' | 'sample'; text: string; at: string };
export type Conversation = { id: string; owner: string; experienceId: string; messages: Message[] };
export type CustomerState = { version: 1; accounts: Account[]; saved: Record<string, string[]>; carts: Record<string, CartItem[]>; bookings: Booking[]; reviews: Review[]; conversations: Conversation[] };
export const DATA_KEY = 'travelbuddy-v1.1-customer-data';
export const SESSION_KEY = 'travelbuddy-v1.1-customer-session';
export const DEMO_EMAIL = 'traveler@travelbuddy.demo';
export const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
export function today(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}
export function addDays(date: string, days: number) { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function validDate(date: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const value = new Date(`${date}T12:00:00Z`); return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === date; }
export function formatDate(date: string, short = false) { return validDate(date) ? new Intl.DateTimeFormat('en-US', { month: short ? 'short' : 'long', day: 'numeric', year: short ? undefined : 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : date; }
export function safeReturn(path: string | null) { return path && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && !/^\/(login|register)(\/|\?|$)/.test(path) ? path : '/'; }
export function emptyState(now = new Date()): CustomerState {
  const date = addDays(today(now), -14);
  return { version: 1, accounts: [{ id: 'customer-demo', name: 'Alex Morgan', email: DEMO_EMAIL }], saved: { 'customer-demo': ['sigiriya-dawn', 'amalfi-cruise'] }, carts: {}, reviews: [], conversations: [], bookings: [{ id: 'sample-completed-food', owner: 'customer-demo', experienceId: 'colombo-food', option: 0, date, time: '17:30', travelers: 2, status: 'Completed', reference: 'TB-SAMPLE', total: 84, created: date, travelerName: 'Alex Morgan', travelerEmail: DEMO_EMAIL }] };
}
export function restoreState(raw: string | null): CustomerState {
  try { const data = raw && JSON.parse(raw); if (data?.version === 1 && Array.isArray(data.accounts) && Array.isArray(data.bookings) && Array.isArray(data.reviews) && Array.isArray(data.conversations) && data.saved && data.carts && data.accounts.every((a: Account) => typeof a.id === 'string' && typeof a.email === 'string' && typeof a.name === 'string')) return data; } catch { /* Recover a corrupted local fixture. */ }
  return emptyState();
}
export const itemPrice = (item: CartItem) => (getExperience(item.experienceId)?.options[item.option]?.price ?? 0) * item.travelers;
export function availableSlots(experienceId: string, date: string, option: number, travelers: number, bookings: Booking[] = [], now = new Date()): string[] {
  const experience = getExperience(experienceId);
  const selected = experience?.options[option];
  if (!selected || !validDate(date) || date < today(now) || date > addDays(today(now), 180) || !Number.isInteger(travelers) || travelers < 1 || travelers > Math.min(12, selected.capacity ?? 12)) return [];
  if (new Date(`${date}T12:00:00Z`).getUTCDay() === 0) return [];
  const current = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Colombo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  return selected.times.filter(time => (date > today(now) || time > current) && bookings.filter(b => b.experienceId === experienceId && b.date === date && b.time === time && b.option === option && b.status === 'Upcoming').reduce((count, b) => count + b.travelers, 0) + travelers <= (selected.capacity ?? 12)).sort();
}
export function nextAvailable(experienceId: string, option = 0, travelers = 1, bookings: Booking[] = [], now = new Date()) {
  for (let day = 0; day < 60; day++) { const date = addDays(today(now), day); const time = availableSlots(experienceId, date, option, travelers, bookings, now)[0]; if (time) return { date, time }; }
  return null;
}
export function validateCart(items: CartItem[], bookings: Booking[], now = new Date()) {
  if (!items.length) return 'Your cart is empty.';
  const reserved = [...bookings];
  for (const item of items) {
    if (!availableSlots(item.experienceId, item.date, item.option, item.travelers, reserved, now).includes(item.time)) return `The selected time for ${getExperience(item.experienceId)?.title ?? 'this experience'} is unavailable. Choose a new time.`;
    reserved.push({ ...item, owner: '', status: 'Upcoming', reference: '', total: 0, created: '', travelerName: '', travelerEmail: '' });
  }
  return '';
}
export function canReview(booking: Booking | undefined, owner: string | undefined, reviews: Review[]) { return Boolean(booking && owner && booking.owner === owner && booking.status === 'Completed' && !reviews.some(r => r.bookingId === booking.id)); }
export function validateReview(booking: Booking | undefined, owner: string | undefined, reviews: Review[], rating: number, text: string) {
  if (!canReview(booking, owner, reviews)) return 'Only your completed bookings without an existing review are eligible.';
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return 'Choose a rating from 1 to 5.';
  if (text.trim().length < 20 || text.trim().length > 1000) return 'Write between 20 and 1,000 characters.';
  return '';
}
export const liveIds = ['colombo-food', 'sigiriya-dawn', 'yala-safari'];
export const locationFor: Record<string, [number, number]> = { 'colombo-food': [6.932, 79.844], 'sigiriya-dawn': [7.956, 80.759], 'yala-safari': [6.276, 81.389], 'bali-temple': [-8.5069, 115.2625], 'kyoto-night': [35.003, 135.778], 'amalfi-cruise': [40.634, 14.6027], 'nyc-skyline': [40.758, -73.9855] };
export const sampleReviews = [
  { author: 'Sofia', rating: 5, text: 'A relaxed pace, thoughtful local stories, and a meeting point that was easy to find.' },
  { author: 'Marcus', rating: 4, text: 'A lovely introduction to the place. The host explained what to expect before we started.' },
];
export function scriptedReply(text: string, experienceId: string) {
  const experience = getExperience(experienceId)!;
  if (/where|meet|pickup|location/i.test(text)) return `We meet ${experience.meetingPoint.charAt(0).toLowerCase() + experience.meetingPoint.slice(1)}. Check your booking details before setting out.`;
  if (/cancel|refund/i.test(text)) return `${experience.freeCancellation ? 'This experience allows cancellation until 24 hours before the start.' : 'This experience is non-refundable.'} The policy is shown before checkout.`;
  if (/time|available|date/i.test(text)) return 'Use the date and time selector on the experience page to see the available schedule.';
  return 'Thanks for your question! The experience page has the inclusions, meeting point and schedule.';
}
export function cancelAllowed(booking: Booking, now = new Date()) { const experience = getExperience(booking.experienceId); return booking.status === 'Upcoming' && Boolean(experience?.freeCancellation) && new Date(`${booking.date}T${booking.time}:00+05:30`).getTime() - now.getTime() >= 24 * 60 * 60 * 1000; }
export function filteredExperiences({ query = '', category = '', minPrice = 0, maxPrice = 500, duration = '', cancellation = false, live = false, date = '', sort = 'recommended' }: { query?: string; category?: string; minPrice?: number; maxPrice?: number; duration?: string; cancellation?: boolean; live?: boolean; date?: string; sort?: string }, bookings: Booking[] = []) {
  const result = experiences.filter(e => `${e.title} ${e.destination} ${e.country} ${e.category}`.toLowerCase().includes(query.trim().toLowerCase()) && (!category || e.category === category) && e.price >= minPrice && e.price <= maxPrice && (!cancellation || e.freeCancellation) && (!live || liveIds.includes(e.id) && e.options.some((_, index) => nextAvailable(e.id, index, 1, bookings) !== null)) && (!duration || (duration === 'short' ? parseFloat(e.duration) <= 4 || e.duration.includes('minutes') : parseFloat(e.duration) > 4 && !e.duration.includes('minutes'))) && (!date || availableSlots(e.id, date, 0, 1, bookings).length > 0));
  return sort === 'price-low' ? result.sort((a, b) => a.price - b.price) : sort === 'rating' ? result.sort((a, b) => b.rating - a.rating) : result;
}
