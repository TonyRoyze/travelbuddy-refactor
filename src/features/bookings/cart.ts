import { z } from "zod";
import { date } from "@/lib/validation";
import type { Experience, Availability } from "@/features/catalog/types";

export const cartItemSchema = z.object({
  id: z.uuid(),
  experienceId: z.string().min(1).max(80),
  option: z.number().int().min(0).max(7),
  date,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  travelers: z.number().int().min(1).max(12),
});
export type CartItem = z.infer<typeof cartItemSchema>;
export type ReviewedItem = CartItem & { experience: Experience };
const cartSchema = z
  .array(cartItemSchema)
  .max(20)
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
  );
export const cartStorageKey = (userId: string) => `travelbuddy:cart:${userId}`;
export function readCart(raw: string | null): CartItem[] {
  try {
    return cartSchema.parse(JSON.parse(raw ?? "[]"));
  } catch {
    return [];
  }
}
export function putCartItem(items: CartItem[], item: CartItem) {
  const parsed = cartItemSchema.parse(item);
  const exists = items.some((value) => value.id === parsed.id);
  if (!exists && items.length >= 20)
    throw new Error("You can book up to 20 experiences at a time.");
  return exists
    ? items.map((value) => (value.id === parsed.id ? parsed : value))
    : [...items, parsed];
}
export const itemTotal = (item: ReviewedItem) =>
  (Math.round(item.experience.options[item.option].price * 100) *
    item.travelers) /
  100;
export const cartTotal = (items: ReviewedItem[]) =>
  items.reduce((cents, item) => cents + Math.round(itemTotal(item) * 100), 0) /
  100;
export function checkCapacity(
  items: ReviewedItem[],
  availability: Availability[],
) {
  const demand = new Map<string, number>();
  items.forEach((item, index) => {
    const key = JSON.stringify([
      item.experienceId,
      item.option,
      item.date,
      item.time,
    ]);
    const count = (demand.get(key) ?? 0) + item.travelers;
    demand.set(key, count);
    const slot = availability[index]?.slots.find(
      (value) => value.time === item.time,
    );
    if (
      !slot ||
      count > slot.remaining ||
      !item.experience.options[item.option]
    )
      throw new Error(
        `${item.experience.title}: this time no longer has enough places. Edit or remove the booking in your cart.`,
      );
  });
}
export const bookingSearch = (item: CartItem, editing = false) => ({
  date: item.date,
  time: item.time,
  option: item.option,
  travelers: item.travelers,
  ...(editing ? { item: item.id } : {}),
});
export function bookingReturn(item: CartItem, editing = false) {
  const search = bookingSearch(item, editing);
  return `/experience/${encodeURIComponent(item.experienceId)}?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`;
}
