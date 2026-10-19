import { Checkbox } from "@/components/ui/checkbox";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "@tanstack/react-router";
import { accountQuery } from "@/lib/queries";
import { rpc, supabase } from "@/lib/supabase";
import { safeReturn } from "@/lib/validation";
import { broadcastLiveNowChange, useLiveNowUpdates } from "@/lib/live-now";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Problem, Loading } from "@/components/feedback";
export function AccountPage({
  onboarding = false,
  returnTo = "/",
}: {
  onboarding?: boolean;
  returnTo?: string;
}) {
  const query = useQuery(accountQuery());
  useLiveNowUpdates();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      await rpc("onboard", {
        display_name: String(f.get("name")),
        account_type: String(f.get("type")),
        expected_revision: query.data!.revision,
      });
      await client.invalidateQueries({ queryKey: ["account"] });
      window.location.assign(safeReturn(returnTo));
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  async function toggleLiveNow() {
    setPending(true);
    setError(undefined);
    try {
      await rpc("set_live_now", { live_now: !query.data!.liveNow });
      await client.invalidateQueries({ queryKey: ["account"] });
      await client.invalidateQueries({ queryKey: ["catalog"] });
      await client.invalidateQueries({ queryKey: ["package"] });
      broadcastLiveNowChange();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  if (query.isPending) return <Loading />;
  if (query.error) return <Problem error={query.error} />;
  const a = query.data;
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 rounded-xl border bg-card p-6 md:p-10">
      <h1>
        {onboarding && a.onboarding === "pending"
          ? "Make yourself at home"
          : "Your account"}
      </h1>
      {a.onboarding === "pending" ? (
        <form className="flex flex-col gap-6" onSubmit={submit}>
          <p>Tell us your name and how you’d like to use TravelBuddy.</p>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Display name</FieldLabel>
              <Input
                id="name"
                name="name"
                defaultValue={a.displayName === "Traveler" ? "" : a.displayName}
                required
                maxLength={120}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="type">I’m joining as a</FieldLabel>
              <NativeSelect id="type" name="type">
                <NativeSelectOption value="traveler">
                  Traveller — explore and book
                </NativeSelectOption>
                <NativeSelectOption value="buddy">
                  Buddy — host local experiences
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field orientation="horizontal">
              <Checkbox id="accept" required />
              <FieldLabel htmlFor="accept">
                I agree to create my TravelBuddy account.
              </FieldLabel>
            </Field>
          </FieldGroup>
          {error !== undefined && <Problem error={error} />}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Complete registration"}
          </Button>
        </form>
      ) : (
        <>
          <p className="text-xl">{a.displayName}</p>
          <p>{a.email}</p>
          <p>
            {a.roles.map((r) => (r === "provider" ? "Buddy" : r)).join(", ")}
          </p>
          {a.roles.some((role) => role === "provider" || role === "guide") && (
            <div className="flex flex-col gap-3 rounded-lg border p-4">
              <div>
                <h2 className="text-lg">Provider availability</h2>
                <p className="text-sm text-muted-foreground">
                  Let travellers know when you can host an experience right now.
                </p>
                <p className="mt-2 text-sm font-medium" role="status">
                  Currently {a.liveNow ? "live" : "offline"}
                </p>
              </div>
              <Button
                type="button"
                variant={a.liveNow ? "default" : "outline"}
                aria-pressed={a.liveNow}
                disabled={pending}
                onClick={toggleLiveNow}
              >
                {pending
                  ? "Updating…"
                  : a.liveNow
                    ? "Go Offline"
                    : "Go Live"}
              </Button>
            </div>
          )}
          <Link to="/bookings">View your bookings</Link>
          <Link to="/inbox" search={{}}>
            Open your inbox
          </Link>
          <Link to="/forgot-password">Reset password</Link>
        </>
      )}
      <Button
        variant="outline"
        onClick={async () => {
          const { error } = await supabase.auth.signOut();
          if (error) {
            setError(error);
            return;
          }
          client.clear();
          await navigate({ to: "/login", search: {} });
        }}
      >
        Sign out
      </Button>
      {error !== undefined && !pending && a.onboarding === "completed" && (
        <Problem error={error} />
      )}
    </section>
  );
}
