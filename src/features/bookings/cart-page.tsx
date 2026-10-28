import { useMoney } from "@/features/currency/currency-provider";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageCircle, Trash2 } from "lucide-react";
import { packageQuery } from "@/lib/queries";
import { Media } from "@/features/catalog/media";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loading, NoResults } from "@/components/custom-ui/feedback";
import { useCart } from "./cart-provider";
import { BookingPolicy } from "./policy";
import {
  bookingSearch,
  bookingReturn,
  itemTotal,
  type CartItem,
  type ReviewedItem,
} from "./cart";

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
  const { items, remove } = useCart();
  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1>Your next discoveries.</h1>
        <p className="mt-3 text-muted-foreground">
          Review your dates and travelers before checkout. Places are reserved
          only when you confirm.
        </p>
      </div>
      <CartStorageNotice />
      {!items.length ? (
        <>
          <NoResults
            title="Your cart is ready for an adventure"
            description="Choose an experience and add a date and time."
          />
          <Link to="/search" search={{}} className={buttonVariants()}>
            Explore experiences
          </Link>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-5">
            {items.map((item) => (
              <CartEntry
                key={item.id}
                item={item}
                onRemove={() => remove([item.id])}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link
              to="/search"
              search={{}}
              className={buttonVariants({ variant: "outline" })}
            >
              Keep exploring
            </Link>
            <Link to="/checkout" search={{}} className={buttonVariants()}>
              Continue to checkout · {items.length}{" "}
              {items.length === 1 ? "experience" : "experiences"}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Checkout checks current prices and availability for every booking.
            Choose online payment or pay on arrival where your Buddy offers it.
          </p>
        </>
      )}
    </section>
  );
}
function CartEntry({
  item,
  onRemove,
}: {
  item: CartItem;
  onRemove: () => void;
}) {
  const query = useQuery(packageQuery(item.experienceId));
  if (query.isPending) return <Loading />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{query.data?.title ?? "Experience unavailable"}</CardTitle>
        <CardDescription>
          {item.date} at {item.time} · Sri Lanka time · {item.travelers}{" "}
          travelers
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.data ? (
          <BookingSummary item={{ ...item, experience: query.data }} />
        ) : (
          <p role="alert">
            This experience could not be loaded. Remove it or try again before
            checkout.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        <Link
          to="/experience/$id"
          params={{ id: item.experienceId }}
          search={bookingSearch(item, true)}
          className={buttonVariants({ variant: "outline" })}
        >
          Edit booking
        </Link>
        <Button variant="ghost" onClick={onRemove}>
          <Trash2 data-icon="inline-start" />
          Remove
        </Button>
      </CardFooter>
    </Card>
  );
}
export function BookingSummary({ item }: { item: ReviewedItem }) {
  const money = useMoney();
  const { experience } = item;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="shrink-0 [&>img]:aspect-video [&>img]:w-full [&>img]:rounded-lg [&>img]:object-cover sm:[&>img]:w-40">
        <Media src={experience.image} alt={experience.title} />
      </div>
      <div className="flex flex-col gap-2">
        <h3>{experience.title}</h3>
        <p>
          {experience.options[item.option]?.name ??
            "Option no longer available"}
        </p>
        <p>
          {item.date} at {item.time} · Sri Lanka time
        </p>
        <p>{item.travelers} travelers</p>
        <strong>
          {experience.options[item.option]
            ? money(itemTotal(item), experience.currency ?? "LKR")
            : "Choose another option"}
        </strong>
        <BookingPolicy
          experience={experience}
          date={item.date}
          time={item.time}
        />
        {experience.canChat ? (
          <Link
            to="/inbox"
            search={{
              packageId: item.experienceId,
              returnTo: bookingReturn(item, true),
            }}
            className="inline-flex min-h-11 items-center gap-2 text-primary"
          >
            <MessageCircle className="size-4" />
            Chat with provider
          </Link>
        ) : (
          <span className="text-sm text-muted-foreground">
            Provider chat unavailable
          </span>
        )}
      </div>
    </div>
  );
}
