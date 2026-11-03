import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MessageCircle,
  PencilLine,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Media } from "@/features/catalog/media";
import { packageQuery } from "@/lib/queries";
import { useMoney } from "@/features/currency/currency-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loading, NoResults } from "@/components/custom-ui/feedback";
import { useCart } from "./cart-provider";
import { BookingPolicy } from "./policy";
import {
  bookingSearch,
  bookingReturn,
  cartTotal,
  itemTotal,
  type CartItem,
  type ReviewedItem,
} from "./cart";
import type { Experience } from "@/features/catalog/types";

type CartGroup = { items: CartItem[]; item: CartItem };

export function CartStorageNotice() {
  const { storageError } = useCart();
  return storageError ? (
    <Alert>
      <AlertDescription>
        Browser storage is unavailable. Keep this tab open to retain your cart.
      </AlertDescription>
    </Alert>
  ) : null;
}

export function CartPage() {
  const money = useMoney();
  const { items, remove } = useCart();
  const experienceIds = [...new Set(items.map((item) => item.experienceId))];
  const experienceQueries = useQueries({
    queries: experienceIds.map((id) => packageQuery(id)),
  });
  const experiences = new Map<string, Experience | undefined>(
    experienceIds.map((id, index) => [id, experienceQueries[index]?.data]),
  );
  const groups = groupCartItems(items);
  const reviewedItems = items.flatMap((item) => {
    const experience = experiences.get(item.experienceId);
    return experience?.options[item.option]
      ? [{ ...item, experience } satisfies ReviewedItem]
      : [];
  });
  const pricesLoading = experienceQueries.some((query) => query.isPending);
  const priceError = experienceQueries.some((query) => query.isError);
  const total = cartTotal(reviewedItems);
  const travelerCount = items.reduce((count, item) => count + item.travelers, 0);

  return (
    <section className="cart-page">
      <header className="cart-heading">
        <div>
          <p className="cart-eyebrow">YOUR TRIP PLAN</p>
          <h1>Your cart</h1>
          <p>Check your dates and details before you book.</p>
        </div>
        {!!items.length && <span className="cart-count">{items.length} {items.length === 1 ? "booking" : "bookings"}</span>}
      </header>

      <CartStorageNotice />

      {!items.length ? (
        <div className="cart-empty">
          <NoResults
            title="Your cart is ready for an adventure"
            description="Explore local experiences and save the ones you want to book."
          />
          <Link to="/search" search={{}} className={buttonVariants({ size: "lg" })}>
            Explore experiences <ArrowRight data-icon="inline-end" />
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-bookings">
            <div className="cart-section-heading">
              <h2>Experiences</h2>
              <span>{groups.length} {groups.length === 1 ? "plan" : "plans"}</span>
            </div>
            {groups.map((group) => (
              <CartEntry
                key={group.item.id}
                group={group}
                experience={experiences.get(group.item.experienceId)}
                loading={experienceQueries[experienceIds.indexOf(group.item.experienceId)]?.isPending ?? false}
                onRemove={() => remove(group.items.map((item) => item.id))}
              />
            ))}
          </div>

          <aside className="cart-summary">
            <div className="cart-summary-title">
              <h2>Trip summary</h2>
              <ShieldCheck aria-hidden="true" />
            </div>
            <div className="cart-summary-line">
              <span>{items.length} {items.length === 1 ? "booking" : "bookings"}</span>
              <strong>{travelerCount} {travelerCount === 1 ? "traveler" : "travelers"}</strong>
            </div>
            <div className="cart-summary-line cart-subtotal">
              <span>Experience subtotal</span>
              <strong>
                {pricesLoading
                  ? "Checking…"
                  : priceError || reviewedItems.length !== items.length
                    ? "Review items"
                    : formatMoney(total)}
              </strong>
            </div>
            <p className="cart-summary-note">
              Final availability and payment options are confirmed at checkout.
            </p>
            <Link to="/checkout" search={{ cart: true }} className={buttonVariants({ className: "cart-checkout-button" })}>
              Continue to checkout <ArrowRight data-icon="inline-end" />
            </Link>
            <Link to="/search" search={{}} className="cart-keep-exploring">
              Keep exploring
            </Link>
            <div className="cart-secure-note">
              <ShieldCheck aria-hidden="true" />
              <span>Secure checkout with PayHere. Payment details are confirmed before you pay.</span>
            </div>
          </aside>
        </div>
      )}
    </section>
  );

  function formatMoney(value: number) {
    const experience = reviewedItems[0]?.experience;
    return experience ? money(value, experience.currency ?? "LKR") : "—";
  }
}

function groupCartItems(items: CartItem[]): CartGroup[] {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const key = JSON.stringify([item.experienceId, item.option, item.date, item.time]);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].map((group) => ({ items: group, item: group[0] }));
}

export function BookingSummary({ item }: { item: ReviewedItem }) {
  const money = useMoney();
  const { experience } = item;
  return (
    <div className="checkout-booking-summary">
      <div className="checkout-booking-image">
        <Media src={experience.image} alt={experience.title} />
      </div>
      <div>
        <p className="cart-entry-kicker">{experience.destination}</p>
        <h3>{experience.title}</h3>
        <p>{experience.options[item.option]?.name ?? "Option unavailable"}</p>
        <span>{formatDate(item.date)} · {item.time} · {item.travelers} {item.travelers === 1 ? "traveler" : "travelers"}</span>
      </div>
      <strong>{money(itemTotal(item), experience.currency ?? "LKR")}</strong>
    </div>
  );
}

function CartEntry({
  group,
  experience,
  loading,
  onRemove,
}: {
  group: CartGroup;
  experience?: Experience;
  loading: boolean;
  onRemove: () => void;
}) {
  const money = useMoney();
  const { item, items } = group;
  if (loading) return <div className="cart-entry-loading"><Loading /></div>;
  if (!experience) {
    return (
      <article className="cart-entry cart-entry-unavailable">
        <div>
          <span className="cart-unavailable-icon"><CalendarDays aria-hidden="true" /></span>
          <h3>Experience unavailable</h3>
          <p>This experience could not be loaded. Remove it or try again before checkout.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove} className="cart-remove-button">
          <Trash2 data-icon="inline-start" /> Remove
        </Button>
      </article>
    );
  }

  const reviewed = items.flatMap((cartItem) =>
    experience.options[cartItem.option]
      ? [{ ...cartItem, experience } satisfies ReviewedItem]
      : [],
  );
  const subtotal = cartTotal(reviewed);
  const option = experience.options[item.option];
  const travelers = items.reduce((count, cartItem) => count + cartItem.travelers, 0);

  return (
    <article className="cart-entry">
      <Link
        to="/experience/$id"
        params={{ id: item.experienceId }}
        search={bookingSearch(item)}
        className="cart-entry-cover"
        aria-label={`View ${experience.title}`}
      >
        <Media src={experience.image} alt={experience.title} />
      </Link>
      <div className="cart-entry-body">
        <div className="cart-entry-heading">
          <div>
            <p className="cart-entry-kicker">{experience.destination}</p>
            <Link to="/experience/$id" params={{ id: item.experienceId }} search={bookingSearch(item)}>
              <h3>{experience.title}</h3>
            </Link>
            <p className="cart-option">{option?.name ?? "Option unavailable"}</p>
          </div>
          <strong className="cart-entry-price">
            {reviewed.length === items.length
              ? money(subtotal, experience.currency ?? "LKR")
              : "Option unavailable"}
          </strong>
        </div>
        <div className="cart-entry-facts">
          <span><CalendarDays aria-hidden="true" /> {formatDate(item.date)}</span>
          <span><Clock3 aria-hidden="true" /> {item.time} · Sri Lanka time</span>
          <span><UsersRound aria-hidden="true" /> {travelers} {travelers === 1 ? "traveler" : "travelers"}</span>
          {items.length > 1 && <span className="cart-group-count">{items.length} matching reservations</span>}
        </div>
        <details className="cart-policy-details">
          <summary>Cancellation and payment terms</summary>
          <BookingPolicy experience={experience} date={item.date} time={item.time} />
        </details>
        <div className="cart-entry-actions">
          {experience.canChat ? (
            <Link
              to="/inbox"
              search={{ packageId: item.experienceId, returnTo: bookingReturn(item, true) }}
              className="cart-chat-link"
            >
              <MessageCircle aria-hidden="true" /> Chat with provider
            </Link>
          ) : <span className="cart-chat-unavailable">Provider chat unavailable</span>}
          <div>
            <Link
              to="/experience/$id"
              params={{ id: item.experienceId }}
              search={bookingSearch(item, true)}
              className="cart-edit-link"
            >
              <PencilLine aria-hidden="true" /> Edit
            </Link>
            <Button variant="ghost" size="sm" onClick={onRemove} className="cart-remove-button">
              <Trash2 aria-hidden="true" /> Remove
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
