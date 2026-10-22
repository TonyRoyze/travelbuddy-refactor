import type { CartItem } from './customer';
import type { Experience } from './catalog';
import type { LiveAvailability } from './availability';

/** Refresh prices and check combined demand when several entries share a slot. */
export async function checkCart(items: CartItem[], request: typeof fetch = fetch): Promise<CartItem[]> {
  if (!items.length) throw new Error('Your cart is empty.');
  const demand = new Map<string, number>();
  const refreshed: CartItem[] = [];
  for (const item of items) {
    const query = new URLSearchParams({ date: item.date, option: String(item.option), travelers: String(item.travelers) });
    const [detailsResponse, slotsResponse] = await Promise.all([
      request(`/api/packages/${encodeURIComponent(item.experienceId)}`, { cache: 'no-store' }),
      request(`/api/packages/${encodeURIComponent(item.experienceId)}/availability?${query}`, { cache: 'no-store' }),
    ]);
    if (!detailsResponse.ok || !slotsResponse.ok) throw new Error('An experience could not be checked. Edit or remove it from your cart, then try again.');
    const { experience } = await detailsResponse.json() as { experience: Experience };
    const availability = await slotsResponse.json() as LiveAvailability;
    const key = JSON.stringify([item.experienceId, item.option, item.date, item.time]);
    const travelers = (demand.get(key) ?? 0) + item.travelers;
    demand.set(key, travelers);
    const slot = availability.slots.find(slot => slot.time === item.time);
    if (!experience.options[item.option] || !slot || slot.remaining < travelers) throw new Error(`${experience.title}: the selected time has insufficient places. Edit or remove this booking in your cart.`);
    refreshed.push({ ...item, experience });
  }
  return refreshed;
}
