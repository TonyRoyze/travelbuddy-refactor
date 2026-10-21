import { createFileRoute } from "@tanstack/react-router";
import { CartPage } from "@/features/bookings/cart-page";
export const Route = createFileRoute("/_authenticated/cart")({
  component: CartPage,
});
