import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loading, Problem } from "@/components/feedback";
import { cartQuery } from "@/lib/queries";
import { money } from "@/lib/validation";
import { rpc } from "@/lib/supabase";
import { Media } from "@/features/catalog/media";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function CartPage() {
  const query = useQuery(cartQuery());
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();

  async function changeTravelers(id: string, travelers: number) {
    if (travelers < 1 || travelers > 12) return;
    setPending(true);
    setError(undefined);
    try {
      await rpc("cart_update", { cart_item_id: id, travelers });
      await client.invalidateQueries({ queryKey: ["cart"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  async function removeItem(id: string) {
    setPending(true);
    setError(undefined);
    try {
      await rpc("cart_remove", { cart_item_id: id });
      await client.invalidateQueries({ queryKey: ["cart"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;
  const cart = query.data;

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Your selections</p>
        <h1>Cart</h1>
      </div>
      {error !== undefined && <Problem error={error} />}
      {!cart.items.length ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 p-6">
            <h2>Your cart is empty</h2>
            <p className="text-muted-foreground">
              Choose an experience and add a date and time to keep it here.
            </p>
            <Link to="/search" search={{}} className={buttonVariants()}>
              Explore experiences
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-4">
            {cart.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="grid gap-4 p-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:p-5">
                  <Media
                    src={item.experience.image}
                    alt={item.experience.title}
                    className="aspect-video w-full rounded-lg object-cover sm:aspect-square"
                  />
                  <div className="flex flex-col gap-3">
                    <div>
                      <h2 className="text-lg">{item.experience.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {item.optionName ?? item.experience.options[item.option]?.name}
                        {" · "}
                        {item.date} at {item.time} (Sri Lanka time)
                      </p>
                    </div>
                    {!item.available && (
                      <p className="text-sm text-destructive">
                        This experience is no longer available. Remove it to
                        continue.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Travelers</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Remove one traveler"
                          disabled={pending || item.travelers <= 1}
                          onClick={() =>
                            void changeTravelers(item.id, item.travelers - 1)
                          }
                        >
                          <Minus />
                        </Button>
                        <span className="min-w-6 text-center">
                          {item.travelers}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Add one traveler"
                          disabled={pending || item.travelers >= 12}
                          onClick={() =>
                            void changeTravelers(item.id, item.travelers + 1)
                          }
                        >
                          <Plus />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => void removeItem(item.id)}
                      >
                        <Trash2 data-icon="inline-start" />
                        Remove
                      </Button>
                    </div>
                    <p className="font-semibold">
                      {money(item.lineTotal)}
                      <span className="ml-1 text-sm font-normal text-muted-foreground">
                        ({money(item.unitPrice)} per traveler)
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="h-fit lg:sticky lg:top-24">
            <CardContent className="flex flex-col gap-4 p-5">
              <h2 className="text-lg">Order summary</h2>
              <p className="flex justify-between text-sm">
                <span>{cart.itemCount} experience selections</span>
                <strong>{money(cart.total)}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Prices and availability are checked again when you confirm.
                No payment is collected at checkout.
              </p>
              {cart.items.every((item) => item.available) ? (
                <Link
                  to="/checkout"
                  search={{ cart: true }}
                  className={buttonVariants({ size: "lg" }) + " w-full"}
                >
                  Continue to checkout
                </Link>
              ) : (
                <Button className="w-full" size="lg" disabled>
                  Remove unavailable items to continue
                </Button>
              )}
              <Link
                to="/search"
                search={{}}
                className="text-center text-sm text-primary"
              >
                Continue exploring
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  );
}
