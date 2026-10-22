import { useState, type FormEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { rpc, supabase } from "@/lib/supabase";
import { money } from "@/lib/validation";
import type { Booking } from "@/features/bookings/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading, Problem } from "@/components/feedback";
interface PaymentOrder {
  id: string;
  method: "online" | "pay_later";
  status: "paid" | "pending" | "due" | "expired" | "disputed";
  amount: number;
  currency: string;
  expiresAt: string | null;
  bookings: Booking[];
}
export function PaymentPage({
  orderId,
  returned = false,
}: {
  orderId: string;
  returned?: boolean;
}) {
  const [redirecting, setRedirecting] = useState(false);
  const [retry, setRetry] = useState(false);
  const order = useQuery({
    queryKey: ["payment-order", orderId],
    queryFn: async () =>
      (await rpc("payment_order", {
        order_id: orderId,
      })) as unknown as PaymentOrder,
    refetchInterval: 5000,
  });
  const config = useQuery({
    queryKey: ["payment-config"],
    queryFn: async () => {
      const response = await fetch("/payments-api/config");
      if (!response.ok)
        throw new Error(
          "Payment service is unavailable. Your booking status remains available below.",
        );
      return response.json() as Promise<{ configured: boolean; mode: string }>;
    },
    retry: false,
  });
  const start = useMutation({
    mutationFn: async (billing: Record<string, string>) => {
      const session = await supabase.auth.getSession();
      if (!session.data.session) throw new Error("Sign in before paying.");
      const response = await fetch("/payments-api/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session.access_token}`,
        },
        body: JSON.stringify({ orderId, billing }),
      });
      const data = (await response.json()) as {
        error?: string;
        action: string;
        fields: Record<string, string>;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not open PayHere. Try again.");
      if (
        ![
          "https://sandbox.payhere.lk/pay/checkout",
          "https://www.payhere.lk/pay/checkout",
        ].includes(data.action)
      )
        throw new Error("Unexpected payment destination.");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.action;
      for (const [name, value] of Object.entries(data.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.append(input);
      }
      document.body.append(form);
      setRedirecting(true);
      form.submit();
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    start.mutate(
      Object.fromEntries(new FormData(e.currentTarget)) as Record<
        string,
        string
      >,
    );
  }
  if (order.isPending) return <Loading />;
  if (order.error) return <Problem error={order.error} />;
  const pay = order.data;
  const allCancelled = pay.bookings.every((b) => b.status === "Cancelled");
  const due =
    pay.method === "pay_later"
      ? pay.bookings
          .filter((b) => b.status !== "Cancelled")
          .reduce((sum, b) => sum + b.total, 0)
      : 0;
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1>
        {allCancelled
          ? "Reservations cancelled"
          : pay.amount === 0
            ? "Booking confirmed"
            : pay.status === "disputed"
              ? "Payment disputed"
              : pay.status === "paid"
                ? "Payment received"
                : pay.status === "expired"
                  ? "Payment window ended"
                  : pay.method === "pay_later"
                    ? "Pay your Buddy on arrival"
                    : "Complete your payment"}
      </h1>
      <p className="text-muted-foreground">
        {pay.status === "disputed"
          ? "PayHere reported a chargeback. Contact your Buddy before travelling; this payment is under review."
          : allCancelled && pay.status !== "expired"
            ? "These reservations are cancelled. No arrival payment is due for cancelled bookings. Any online refund status is shown below."
            : pay.status === "pending"
              ? "Your places are held temporarily. We are waiting for PayHere to confirm payment. This page updates automatically."
              : pay.status === "expired"
                ? "Your places have been released. Any payment received after release is queued for refund. Choose a new available time to book again."
                : pay.status === "due"
                  ? "No online charge has been made. Pay the full balance directly to your Buddy at the meeting or pickup point."
                  : pay.amount === 0
                    ? "No payment is due for this order."
                    : "PayHere has verified your payment."}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>{money(pay.amount, pay.currency)}</CardTitle>
          <CardDescription>Order {pay.id}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Badge variant="secondary">
            {pay.status === "due" ? "Due on arrival" : pay.status}
          </Badge>
          {pay.method === "pay_later" && (
            <p>Balance due on arrival: {money(due, pay.currency)}.</p>
          )}
          {pay.status === "pending" && pay.expiresAt && (
            <p>
              Complete payment before{" "}
              {new Date(pay.expiresAt).toLocaleString("en-GB", {
                timeZone: "Asia/Colombo",
              })}{" "}
              (Sri Lanka time).
            </p>
          )}
          {pay.bookings.map((b) => (
            <div key={b.id} className="flex flex-col gap-1">
              <strong>{b.experience.title}</strong>
              <p>
                {b.date} at {b.time} · {b.travelers} guests · {b.reference}
              </p>
              {b.refundStatus && <p>Refund: {b.refundStatus}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
      {pay.status === "pending" && returned && !retry && (
        <Card>
          <CardHeader>
            <CardTitle>Waiting for payment confirmation</CardTitle>
            <CardDescription>
              If you completed payment, check its status before trying again.
              Contact your Buddy if the confirmation does not arrive.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={order.isFetching}
              onClick={() => void order.refetch()}
            >
              Check payment status
            </Button>
            <Button variant="ghost" onClick={() => setRetry(true)}>
              Try payment again
            </Button>
          </CardContent>
        </Card>
      )}
      {pay.status === "pending" && (!returned || retry) && (
        <Card>
          <CardHeader>
            <CardTitle>Billing details</CardTitle>
            <CardDescription>
              Card details are entered securely on PayHere.
              {config.data?.mode === "sandbox"
                ? " Sandbox mode: test payments only."
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {config.error ? (
              <Problem error={config.error} />
            ) : config.data && !config.data.configured ? (
              <Problem
                error={
                  new Error(
                    "Online payments are not configured yet. Contact your Buddy before making another reservation.",
                  )
                }
              />
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-5">
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["first_name", "First name"],
                    ["last_name", "Last name"],
                    ["phone", "Phone"],
                    ["address", "Address"],
                    ["city", "City"],
                    ["country", "Country"],
                  ].map(([name, label]) => (
                    <Field key={name}>
                      <FieldLabel htmlFor={`billing-${name}`}>
                        {label}
                      </FieldLabel>
                      <Input
                        id={`billing-${name}`}
                        name={name}
                        type={name === "phone" ? "tel" : "text"}
                        maxLength={name === "phone" ? 30 : 200}
                        defaultValue={
                          name === "country" ? "Sri Lanka" : undefined
                        }
                        required
                      />
                    </Field>
                  ))}
                </FieldGroup>
                {start.error && <Problem error={start.error} />}
                <Button
                  type="submit"
                  disabled={
                    start.isPending || redirecting || !config.data?.configured
                  }
                >
                  {redirecting
                    ? "Opening PayHere…"
                    : start.isPending
                      ? "Preparing payment…"
                      : `Pay ${money(pay.amount, pay.currency)} with PayHere`}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-3">
        <Link to="/bookings" className={buttonVariants({ variant: "outline" })}>
          View bookings
        </Link>
        <Link
          to="/search"
          search={{}}
          className={buttonVariants({ variant: "outline" })}
        >
          Explore experiences
        </Link>
      </div>
    </section>
  );
}
