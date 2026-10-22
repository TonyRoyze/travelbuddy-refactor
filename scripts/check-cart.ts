import assert from 'node:assert/strict';
import { checkCart } from '../src/lib/cart';
import { experiences } from '../src/lib/catalog';
import type { CartItem } from '../src/lib/customer';
import { itemPrice, money } from '../src/lib/customer';

async function main() {
  const experience = experiences[0];
  const item: CartItem = { id: 'first', experienceId: experience.id, option: 0, date: '2026-10-20', time: '09:00', travelers: 2 };
  const request = ((url: string) => Promise.resolve(Response.json(url.includes('/availability?')
    ? { slots: [{ time: '09:00', remaining: 3 }], next: null }
    : { experience: { ...experience, options: [{ ...experience.options[0], price: 25.5 }] } }))) as typeof fetch;
  const refreshed = await checkCart([item], request);
  assert.equal(refreshed[0].experience?.options[0].price, 25.5, 'Review uses the latest server price');
  assert.equal(refreshed[0].id, item.id, 'Refresh preserves cart identity');
  assert.equal(itemPrice(refreshed[0]), 51);
  assert.equal(money(25.5), '$25.50', 'Displayed prices retain cents');
  await assert.rejects(checkCart([item, { ...item, id: 'second' }], request), /insufficient places/, 'Combined demand cannot exceed slot capacity');
  await assert.rejects(checkCart([{ ...item, time: '10:00' }], request), /insufficient places/, 'Removed slots cannot reach review');
  await assert.rejects(checkCart([], request), /empty/);
  await assert.rejects(checkCart([item], (() => Promise.resolve(new Response(null, { status: 404 }))) as typeof fetch), /could not be checked/);
  console.log('Cart checks passed: current prices, stable identity, combined capacity, removed slots, empty cart and unavailable packages.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
