import { describe, it, expect } from "vitest";
import {
  bookingReturn,
  cartStorageKey,
  checkCapacity,
  itemTotal,
  cartTotal,
  putCartItem,
  readCart,
  type CartItem,
  type ReviewedItem,
} from "./cart";
import type { Experience, Availability } from "@/features/catalog/types";
const item: CartItem = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  experienceId: "test",
  option: 0,
  date: "2026-10-20",
  time: "09:00",
  travelers: 2,
};
const reviewed: ReviewedItem = {
  ...item,
  experience: { title: "Tea walk", options: [{ price: 25.55 }] } as Experience,
};
const slots: Availability = {
  date: item.date,
  slots: [{ time: "09:00", capacity: 3, remaining: 3 }],
  next: null,
};
describe("cart", () => {
  it("restores valid selections and rejects corrupt or invalid storage", () => {
    expect(readCart(JSON.stringify([item]))).toEqual([item]);
    expect(readCart("broken")).toEqual([]);
    expect(readCart(JSON.stringify([{ ...item, date: "2026-02-30" }]))).toEqual(
      [],
    );
    expect(readCart(JSON.stringify([item, item]))).toEqual([]);
    expect(cartStorageKey("alice")).not.toBe(cartStorageKey("bob"));
  });
  it("replaces an edited entry without adding duplicates, including a full cart", () => {
    const cart = Array.from({ length: 20 }, () => ({
      ...item,
      id: crypto.randomUUID(),
    }));
    const edited = putCartItem(cart, { ...cart[0], travelers: 3 });
    expect(edited).toHaveLength(20);
    expect(edited[0].travelers).toBe(3);
    expect(() => putCartItem(cart, item)).toThrow(/20/);
  });
  it("checks combined demand only for entries sharing a package, option, date and time", () => {
    expect(() => checkCapacity([reviewed], [slots])).not.toThrow();
    expect(() =>
      checkCapacity(
        [reviewed, { ...reviewed, id: crypto.randomUUID() }],
        [slots, slots],
      ),
    ).toThrow(/enough places/);
    expect(() =>
      checkCapacity(
        [reviewed, { ...reviewed, date: "2026-10-21" }],
        [slots, slots],
      ),
    ).not.toThrow();
    expect(() => checkCapacity([reviewed], [{ ...slots, slots: [] }])).toThrow(
      /enough places/,
    );
    expect(() => checkCapacity([{ ...reviewed, option: 7 }], [slots])).toThrow(
      /enough places/,
    );
  });
  it("totals prices in cents and retains the editing context through chat", () => {
    expect(itemTotal(reviewed)).toBe(51.1);
    expect(cartTotal([reviewed, reviewed])).toBe(102.2);
    const url = new URL(bookingReturn(item, true), "https://travelbuddy.test");
    expect(url.searchParams.get("item")).toBe(item.id);
    expect(url.searchParams.get("travelers")).toBe("2");
    expect(url.searchParams.get("time")).toBe("09:00");
  });
});
