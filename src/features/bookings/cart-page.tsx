import { useMoney } from "@/features/currency/currency-provider";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessageCircle, Trash2, ShieldCheck, ArrowRight, CheckCircle2 } from "lucide-react";
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
    <section className="flex flex-col gap-6 max-w-4xl mx-auto pb-16">
      <div className="border-b border-border/80 pb-4">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          Shopping Cart
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your experience dates and traveler count before proceeding to checkout.
        </p>
      </div>

      <CartStorageNotice />

      {!items.length ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <NoResults
            title="Your cart is empty"
            description="Explore authentic tours, activities, and guides across Sri Lanka."
          />
          <Link to="/search" search={{}} className={buttonVariants({ size: "lg" })}>
            Explore Experiences
          </Link>
        </div>
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

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/80 pt-6 mt-2">
            <Link
              to="/search"
              search={{}}
              className={buttonVariants({ variant: "outline" })}
            >
              Keep exploring
            </Link>
            <Link
              to="/checkout"
              search={{ cart: true }}
              className={buttonVariants()}
            >
              Continue to checkout · {items.length}{" "}
              {items.length === 1 ? "experience" : "experiences"}
            </Link>
          </div>

          <div className="flex items-center gap-2 p-4 rounded-xl bg-muted/40 text-xs text-muted-foreground border border-border/60">
            <ShieldCheck className="size-4 text-emerald-600 shrink-0" />
            <span>
              Real-time availability is verified at checkout. Choose instant online payment or pay on arrival where available.
            </span>
          </div>
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
    <Card className="rounded-2xl border border-border/80 shadow-xs overflow-hidden">
      <CardHeader className="bg-muted/20 border-b border-border/60 pb-3">
        <CardTitle className="text-lg font-bold text-foreground">
          {query.data?.title ?? "Experience unavailable"}
        </CardTitle>
        <CardDescription className="text-xs">
          Date: <strong>{item.date}</strong> at <strong>{item.time}</strong> (Sri Lanka time) · <strong>{item.travelers}</strong> traveler{item.travelers === 1 ? "" : "s"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {query.data ? (
          <BookingSummary item={{ ...item, experience: query.data }} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            This experience could not be loaded. Remove it or try again before checkout.
          </p>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3 border-t border-border/60 bg-muted/10 py-3">
        <Link
          to="/experience/$id"
          params={{ id: item.experienceId }}
          search={bookingSearch(item, true)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Edit booking
        </Link>
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <Trash2 className="size-3.5 mr-1" />
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
      <div className="shrink-0 [&>span]:aspect-video [&>span]:w-full [&>span]:rounded-lg sm:[&>span]:w-40 [&>span>img]:size-full [&>span>img]:object-cover">
        <Media src={experience.image} alt={experience.title} />
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        <h3 className="text-base font-bold text-foreground">{experience.title}</h3>
        <p className="text-xs text-muted-foreground font-medium">
          Option: <span className="text-foreground">{experience.options[item.option]?.name ?? "Standard Option"}</span>
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{item.date} at {item.time}</span>
          <span>·</span>
          <span>{item.travelers} traveler{item.travelers === 1 ? "" : "s"}</span>
        </div>
        <div className="pt-1">
          <span className="text-xs text-muted-foreground">Total: </span>
          <strong className="text-base font-extrabold text-foreground">
            {experience.options[item.option]
              ? money(itemTotal(item), experience.currency ?? "LKR")
              : "Option unavailable"}
          </strong>
        </div>
        <div className="pt-2 text-xs">
          <BookingPolicy
            experience={experience}
            date={item.date}
            time={item.time}
          />
        </div>
        {experience.canChat ? (
          <Link
            to="/inbox"
            search={{
              packageId: item.experienceId,
              returnTo: bookingReturn(item, true),
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline mt-1"
          >
            <MessageCircle className="size-3.5" />
            Chat with provider
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground mt-1">
            Provider chat unavailable
          </span>
        )}
      </div>
    </div>
  );
}
