import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { NoResults } from "@/components/custom-ui/feedback";

export function SignedOutBookingEmpty({ page }: { page: "cart" | "bookings" }) {
  const cart = page === "cart";
  return (
    <section className="cart-page">
      <header className="cart-heading">
        <div>
          <h1>{cart ? "Your cart" : "My bookings"}</h1>
        </div>
      </header>
      <div className="cart-empty">
        <NoResults
          title={cart ? "Log in to view your cart" : "Log in to view your bookings"}
          description={cart ? "Please log in to add experiences to your cart and plan your trip." : "Please log in to see and manage your bookings."}
        />
        <Link to="/login" search={{ returnTo: cart ? "/cart" : "/bookings" }} className={buttonVariants({ size: "lg" })}>
          Log in
        </Link>
      </div>
    </section>
  );
}
